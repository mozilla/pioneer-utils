"use strict";

const { classes: Cc, interfaces: Ci, utils: Cu } = Components;
Cu.import("resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyModuleGetter(this, "AddonManager", "resource://gre/modules/AddonManager.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "Services", "resource://gre/modules/Services.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "Log", "resource://gre/modules/Log.jsm");

const { TelemetryController } = Cu.import("resource://gre/modules/TelemetryController.jsm", null);
const { generateUUID } = Cc["@mozilla.org/uuid-generator;1"].getService(Ci.nsIUUIDGenerator);

import { setCrypto as joseSetCrypto, Jose, JoseJWE } from "jose-jwe-jws/dist/jose-commonjs.js";
import sampling from "./sampling.js";

// The public keys used for encryption
import * as PUBLIC_KEYS from "./public_keys.json";

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
joseSetCrypto(crypto);

/**
 * @typedef {Object} Config
 * @property {String} studyName
 *   Unique name of the study.
 *
 * @property {String} addonId
 *   The ID of the study addon.
 *
 * @property {String?} telemetryEnv
 *   Optional. Which telemetry environment to send data to. Should be
 *   either ``"prod"`` or ``"stage"``. Defaults to ``"prod"``.
 *
 * @property {Object} branches
 *   Array of branches objects. If useful, you may store extra data on
 *   each branch. It will be included when choosing a branch.
 *
 *   Example:
 *     [
 *       { name: "control", weight: 1 },
 *       { name: "variation1", weight: 2 },
 *       { name: "variation2", weight: 2 },
 *     ]
 *
 * @property {String} branches[].name
 *   The name of the branch.
 *
 * @property {Number} branches[].weight
 *   Optional, defaults to 1.
 *
 * @property {Boolean?} devMode
 *   If this is set to true, PioneerUtils enables extra logging and
 *   other settings for developers.
 */

/**
 * Utilities for making Pioneer Studies.
 */
export class PioneerUtils {
  /**
   * @param {Config} config
   */
  constructor(config) {
    this.config = config;
    this.encrypter = null;
    this._logger = null;
  }

  /**
   * @returns {Object} A public key
   */
  getPublicKey() {
    const env = this.config.telemetryEnv || "prod";
    return PUBLIC_KEYS[env];
  }

  /** */
  setupEncrypter() {
    if (this.encrypter === null) {
      const pk = this.getPublicKey();
      const rsa_key = Jose.Utils.importRsaPublicKey(pk.key, "RSA-OAEP");
      const cryptographer = new Jose.WebCryptographer();
      this.encrypter = new JoseJWE.Encrypter(cryptographer, rsa_key);
    }
  }

  /**
   * @returns {String} Unique ID for a Pioneer user.
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
   * Checks to see if SHIELD is enabled for a user.
   *
   * @returns {Boolean}
   *   A boolean to indicate SHIELD opt-in status.
   */
  isShieldEnabled() {
    return Services.prefs.getBoolPref("app.shield.optoutstudies.enabled", true);
  }

  /**
   * Checks to see if the user has opted in to Pioneer. This is
   * done by checking that the opt-in addon is installed and active.
   *
   * @returns {Boolean}
   *   A boolean to indicate opt-in status.
   */
  async isUserOptedIn() {
    const addon = await AddonManager.getAddonByID("pioneer-opt-in@mozilla.org");
    return this.isShieldEnabled() && addon !== null && addon.isActive;
  }
  
  /**
   * Calculate the size of a ping.
   *
   * @param {Object} payload
   *   The data payload of the ping.
   *
   * @returns {Number}
   *   The total size of the ping.
   */
  getPingSize(payload) {
    const converter = Cc["@mozilla.org/intl/scriptableunicodeconverter"]
      .createInstance(Ci.nsIScriptableUnicodeConverter);
    converter.charset = "UTF-8";
    let utf8Payload = converter.ConvertFromUnicode(JSON.stringify(payload));
    utf8Payload += converter.Finish();
    return utf8Payload.length;
  }

  /**
   * @private
   * @param {String} data The data to encrypt
   * @returns {String}
   */
  async encryptData(data) {
    this.setupEncrypter();
    return await this.encrypter.encrypt(data);
  }
  
  /**
   * Constructs a payload object with encrypted data.
   *
   * @param {String} schemaName
   *   The name of the schema to be used for validation.
   *
   * @param {int} schemaVersion
   *   The version of the schema to be used for validation.
   *
   * @param {Object} data
   *   An object containing data to be encrypted and submitted.
   *
   * @returns {Object}
   *   A Telemetry payload object with the encrypted data.
   */
  async buildEncryptedPayload(schemaName, schemaVersion, data) {
    const pk = this.getPublicKey();

    const payload = {
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
   * @param {String} schemaName
   *   The name of the schema to be used for validation.
   *
   * @param {int} schemaVersion
   *   The version of the schema to be used for validation.
   *
   * @param {Object} data
   *   An object containing data to be encrypted and submitted.
   *
   * @returns {Number}
   *   The total size of the ping.
   */
  async getEncryptedPingSize(schemaName, schemaVersion, data) {
    return this.getPingSize(
      await this.buildEncryptedPayload(schemaName, schemaVersion, data)
    );
  }

  /**
   * Encrypts the given data and submits a properly formatted
   * Pioneer ping to Telemetry.
   *
   * @param {String} schemaName
   *   The name of the schema to be used for validation.
   *
   * @param {int} schemaVersion
   *   The version of the schema to be used for validation.
   *
   * @param {Object} data
   *   A object containing data to be encrypted and submitted.
   *
   * @param {Object} options
   *   An object with additional options for the function.
   *
   * @param {Boolean} options.force
   *   A boolean to indicate whether to force submission of the ping.
   *
   * @returns {String}
   *   The ID of the ping that was submitted
   */
  async submitEncryptedPing(schemaName, schemaVersion, data, options = {}) {
    // If the user is no longer opted in we should not be submitting pings.
    const isUserOptedIn = await this.isUserOptedIn();
    if (!isUserOptedIn && !options.force) {
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
   * @returns {Object}
   *   An object from `config.branches`, chosen based on a `weight` key.
   */
  async chooseBranch() {
    const pioneerId = await this.getPioneerId();
    const hashKey = `${this.config.studyName}/${pioneerId}`;
    return sampling.chooseWeighted(this.config.branches, hashKey);
  }

  /**
   * Ends a study by uninstalling the addon and sending a relevant
   * event ping to telemetry.
   *
   * @param {String?} eventId
   *   The ID of the event that occured.
   *
   * @returns {String}
   *   The ID of the event ping that was submitted.
   */
  endStudy(eventId = EVENTS.ENDED_NEUTRAL) {
    this.uninstall();
    return this.submitEventPing(eventId, { force: true });
  }

  /**
   * Uninstalls the study addon.
   *
   * @returns {void}
   */
  async uninstall() {
    const addon = await AddonManager.getAddonByID(this.config.addonId);
    if (addon) {
      addon.uninstall();
    } else {
      throw new Error(`Could not find addon with ID: ${this.config.addonId}`);
    }
  }

  /**
   * Gets an object that is a mapping of all the available events.
   *
   * @returns {Object}
   *   An object with all the available events.
   */
  getAvailableEvents() {
    return EVENTS;
  }

  /**
   * Submits an encrypted event ping.
   *
   * @param {String} eventId
   *   The ID of the event that occured.
   *
   * @param {Object} options
   *   An object of options to be passed through to submitEncryptedPing
   *
   * @returns {String}
   *   The ID of the event ping that was submitted.
   */
  submitEventPing(eventId, options = {}) {
    if (!Object.values(EVENTS).includes(eventId)) {
      throw new Error("Invalid event ID.");
    }
    return this.submitEncryptedPing("event", 1, { eventId }, options);
  }

  /**
   * Logger for Pioneer. It has methods like "warn" and "debug".
   *
   * @returns {Object} Logger
   */
  get log() {
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
