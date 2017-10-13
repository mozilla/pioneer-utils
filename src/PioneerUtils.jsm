"use strict";

const { classes: Cc, interfaces: Ci, utils: Cu } = Components;
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");

const { TelemetryController } = Cu.import("resource://gre/modules/TelemetryController.jsm", null);
const { generateUUID } = Cc["@mozilla.org/uuid-generator;1"].getService(Ci.nsIUUIDGenerator);

import { setCrypto as Jose_SetCrypto, Jose, JoseJWE } from "jose-jwe-jws/dist/jose-commonjs.js";
import sampling from "./sampling.js";

// The public keys used for encryption
const PUBLIC_KEYS = require("./public_keys.json");

const PIONEER_ID_PREF = "extensions.pioneer.cachedClientID";

// Make crypto available and make jose use it.
Cu.importGlobalProperties(["crypto"]);
Jose_setCrypto(crypto);

/**
 * @typedef {Object} PioneerUtilsConfig
 * @property {String} studyName
 *   Unique name of the study.
 *
 * @property {String} studyVersion
 *   Version of the study. Should match contents of install.rdf.
 *
 * @property {String?} pioneerEnv
 *   Optional. Which telemetry environment to send data to. Should be
 *   either "prod" or "stage". Defaults to "prod".
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
 *
 * @property {Number} branches[].weight
 *   Optional, defaults to 1.
 */

class PioneerUtils {
  constructor(config) {
    this.config = config;
    this.encrypter = null;
  }

  getPublicKey() {
    const env = this.config.pioneerEnv || "prod";
    return PUBLIC_KEYS[env];
  }

  setupEncrypter() {
    if (this.encrypter === null) {
      const pk = this.getPublicKey();
      const rsa_key = Jose.Utils.importRsaPublicKey(pk.key, "RSA-OAEP");
      const cryptographer = new Jose.WebCryptographer();
      this.encrypter = new JoseJWE.Encrypter(cryptographer, rsa_key);
    }
  }

  getPioneerId() {
    let id = Services.prefs.getCharPref(PIONEER_ID_PREF, "");

    if (!id) {
      // generateUUID adds leading and trailing "{" and "}". strip them off.
      id = generateUUID().toString().slice(1, -1);
      Services.prefs.setCharPref(PIONEER_ID_PREF, id);
    }

    return id;
  }

  async encryptData(data) {
    this.setupEncrypter();
    return await this.encrypter.encrypt(data);
  }

  async submitEncryptedPing(data) {
    const pk = this.getPublicKey();

    const payload = {
      encryptedData: await this.encryptData(JSON.stringify(data)),
      encryptionKeyId: pk.id,
      pioneerId: this.getPioneerId(),
      studyName: this.config.studyName,
      studyVersion: this.config.studyVersion,
    };

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
    const hashKey = `${this.config.studyName}/${await this.getPioneerId()}`;
    return sampling.chooseWeighted(this.config.branches, hashKey);
  }
}

this.PioneerUtils = PioneerUtils;
this.EXPORTED_SYMBOLS = ["PioneerUtils"];
