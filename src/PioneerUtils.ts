const { classes: Cc, interfaces: Ci, utils: Cu } = Components;
const { XPCOMUtils } = Cu.import("resource://gre/modules/XPCOMUtils.jsm", {}) as XPCOMUtils;

XPCOMUtils.defineLazyModuleGetter(this, "AddonManager", "resource://gre/modules/AddonManager.jsm");
declare var AddonManager: AddonManager;
XPCOMUtils.defineLazyModuleGetter(this, "Services", "resource://gre/modules/Services.jsm");
declare var Services: Services;
XPCOMUtils.defineLazyModuleGetter(this, "Log", "resource://gre/modules/Log.jsm");
declare var Log: Log;

const { TelemetryController } = Cu.import("resource://gre/modules/TelemetryController.jsm", {}) as TelemetryControllerType;
const { generateUUID } = Cc["@mozilla.org/uuid-generator;1"].getService(Ci.nsIUUIDGenerator) as UUIDGeneratorType;

import { setCrypto as joseSetCrypto, Jose, JoseJWE } from "jose-jwe-jws";

import sampling, { WeightedBranch } from "./sampling";

// The public keys used for encryption
import publicKeys, { Key } from "./publicKeys";

const PIONEER_ID_PREF = "extensions.pioneer.cachedClientID";

const EVENTS = {
  INELIGIBLE: "ineligible",
  EXPIRED: "expired",
  USER_DISABLE: "user-disable",
  ENDED_POSITIVE: "ended-positive",
  ENDED_NEUTRAL: "ended-neutral",
  ENDED_NEGATIVE: "ended-negative",
};

// Make crypto available and make jose use it.
Cu.importGlobalProperties(["crypto"]);
declare var crypto: Crypto;
joseSetCrypto(crypto);

export interface Config {
  /** Unique name of the study. */
  studyName: string;

  /** Optional. Which telemetry environment to send data to. */
  telemetryEnv?: "prod" | "stage";

  /**
   * Branches of the experiment. If useful, you may store extra
   * data on each branch. It will be included when choosing a branch
   */
  branches: Array<WeightedBranch>;

  /**
   * If this is set to true, PioneerUtils enables extra logging and
   * other settings for developers.
   */
  devMode?: boolean;
}

export interface SubmitEncryptedPingOptions {
  /** Force submission of pings, even if otherwise ineligible. */
  force?: boolean;
}

/**
 * Utilities for making Pioneer Studies.
 */
export class PioneerUtils {
  private config: Config;
  private encrypter: IEncrypter | null;
  private _logger: Logger | null;
  private bootstrapData: BootstrapData;

  constructor(reason: number, data: BootstrapData, config: Config) {
    this.config = config;
    this.encrypter = null;
    this._logger = null;
    this.bootstrapData = data;
  }

  /**
   * Gets the public key used to encrypt telemetry data.
   */
  getPublicKey(): Key {
    const env = this.config.telemetryEnv || "prod";
    return publicKeys[env];
  }

  setupEncrypter() {
    if (this.encrypter === null) {
      const pk = this.getPublicKey();
      const rsa_key = Jose.Utils.importRsaPublicKey(pk.key, "RSA-OAEP");
      const cryptographer = new Jose.WebCryptographer();
      this.encrypter = new JoseJWE.Encrypter(cryptographer, rsa_key);
    }
  }

  /**
   * Gets the unique ID for a Pioneer user.
   */
  getPioneerId() {
    let id = Services.prefs.getCharPref(PIONEER_ID_PREF, "");

    if (!id) {
      // generateUUID adds leading and trailing "{" and "}". strip them off.
      id = generateUUID().toString().slice(1, -1);
      Services.prefs.setCharPref(PIONEER_ID_PREF, id);
    }

    return id;
  }

  /**
   * Checks to see if Shield is enabled for a user.
   */
  isShieldEnabled(): boolean {
    return Services.prefs.getBoolPref("app.shield.optoutstudies.enabled", true);
  }

  /**
   * Checks to see if the user has opted in to Pioneer.
   *
   * This is done by checking that the opt-in addon is installed and active.
   */
  async isUserOptedIn() {
    const addon = await AddonManager.getAddonByID("pioneer-opt-in@mozilla.org");
    return this.isShieldEnabled() && addon !== null && addon.isActive;
  }

  /**
   * Calculate the size of a ping.
   *
   * @param payload
   *   The data payload of the ping.
   *
   * @returns The total size of the ping.
   */
  getPingSize(payload: object): number {
    const converter = Cc["@mozilla.org/intl/scriptableunicodeconverter"]
      .createInstance(Ci.nsIScriptableUnicodeConverter);
    converter.charset = "UTF-8";
    let utf8Payload = converter.ConvertFromUnicode(JSON.stringify(payload));
    utf8Payload += converter.Finish();
    return utf8Payload.length;
  }

  /**
   * Encrypt data in preparation to send to Telemetry.
   */
  private async encryptData(data: string) {
    this.setupEncrypter();
    return await this.encrypter.encrypt(data);
  }

  /**
   * Constructs a payload object with encrypted data.
   *
   * @param schemaName
   *   The name of the schema to be used for validation.
   *
   * @param schemaVersion
   *   The version of the schema to be used for validation.
   *
   * @param data
   *   An object containing data to be encrypted and submitted.
   *
   * @returns A Telemetry payload object with the encrypted data.
   */
  private async buildEncryptedPayload(
      schemaName: string,
      schemaVersion: number,
      data: object
  ): Promise<object> {
    const pk = this.getPublicKey();

    return {
      encryptedData: await this.encryptData(JSON.stringify(data)),
      encryptionKeyId: pk.id,
      pioneerId: this.getPioneerId(),
      studyName: this.config.studyName,
      schemaName,
      schemaVersion,
    };
  }

  /**
   * Calculate the size of a ping that has Pioneer encrypted data.
   *
   * @param schemaName
   *   The name of the schema to be used for validation.
   *
   * @param schemaVersion
   *   The version of the schema to be used for validation.
   *
   * @param data
   *   An object containing data to be encrypted and submitted.
   *
   * @returns The total size of the ping.
   */
  async getEncryptedPingSize(
    schemaName: string,
    schemaVersion: number,
    data: object
  ): Promise<number> {
    return this.getPingSize(
      await this.buildEncryptedPayload(schemaName, schemaVersion, data)
    );
  }

  /**
   * Encrypts the given data and submits a properly formatted
   * Pioneer ping to Telemetry.
   *
   * @param schemaName
   *   The name of the schema to be used for validation.
   *
   * @param schemaVersion
   *   The version of the schema to be used for validation.
   *
   * @param data
   *   An object containing data to be encrypted and submitted.
   *
   * @param options.force
   *   A boolean to indicate whether to force submission of the
   *   ping, ignoring eligibility checks.
   *
   * @returns The ID of the ping that was submitted.
   */
  async submitEncryptedPing(
    schemaName: string,
    schemaVersion: number,
    data: object,
    { force = false }: SubmitEncryptedPingOptions = {},
  ): Promise<number> {
    // If the user is no longer opted in, we should not be submitting pings.
    const isUserOptedIn = await this.isUserOptedIn();
    if (!isUserOptedIn && !force) {
      return null;
    }

    const payload = await this.buildEncryptedPayload(schemaName, schemaVersion, data);

    const telOptions = {
      addClientId: true,
      addEnvironment: true,
    };

    return TelemetryController.submitExternalPing("pioneer-study", payload, telOptions);
  }

  /**
   * Chooses a branch from among `config.branches`. This is a
   * deterministic function of `config.studyName` and the user's
   * pioneerId. As long as neither of those change, it will always
   * return the same value.
   *
   * @returns An object from `config.branches`, chosen based on a `weight` key.
   */
  async chooseBranch() {
    const pioneerId = await this.getPioneerId();
    const hashKey = `${this.config.studyName}/${this.getPioneerId()}`;
    return sampling.chooseWeighted(this.config.branches, hashKey);
  }

  /**
   * Ends a study by uninstalling the addon and sending a relevant
   * event ping to telemetry.
   *
   * @param eventId The ID of the event that occured.
   * @returns The ID of the event ping that was submitted.
   */
  async endStudy(eventId = EVENTS.ENDED_NEUTRAL): Promise<void> {
    await this.submitEventPing(eventId, { force: true });
    await this.uninstall();
  }

  /**
   * Uninstalls the study addon.
   */
  async uninstall(): Promise<void> {
    const addon = await AddonManager.getAddonByID(this.bootstrapData.id);
    if (addon) {
      addon.uninstall();
    } else {
      throw new Error(`Could not find addon with ID: ${this.bootstrapData.id}`);
    }
  }

  getAvailableEvents(): { [name: string]: string } {
    return EVENTS;
  }

  /**
   * Submits an encrypted event ping.
   *
   * @param eventId The ID of the event that occured.
   * @param options Object of options to be passed through to submitEncryptedPing
   * @returns The ID of the event ping that was submitted.
   */
  submitEventPing(eventId: string, options: SubmitEncryptedPingOptions = {}): Promise<number> {
    if (!Object.values(EVENTS).includes(eventId)) {
      throw new Error("Invalid event ID.");
    }
    return this.submitEncryptedPing("event", 1, { eventId }, options);
  }

  /**
   * Logger for Pioneer. It has methods like "warn" and "debug".
   */
  get log(): Logger {
    if (this._logger === null) {
      this._logger = Log.repository.getLogger(`pioneer.${this.config.studyName}`);
      this._logger.addAppender(new Log.ConsoleAppender(new Log.BasicFormatter()));
      if (this.config.devMode) {
        this._logger.level = Log.Level.Debug;
      } else {
        this._logger.level = Log.Level.Warn;
      }
    }
    return this._logger;
  }
}

this.PioneerUtils = PioneerUtils;
this.EXPORTED_SYMBOLS = ["PioneerUtils"];
