"use strict";

const { classes: Cc, interfaces: Ci, utils: Cu } = Components;
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");

const { TelemetryController } = Cu.import("resource://gre/modules/TelemetryController.jsm", null);
const { generateUUID } = Cc["@mozilla.org/uuid-generator;1"].getService(Ci.nsIUUIDGenerator);

import { setCrypto, Jose, JoseJWE } from "jose-jwe-jws/dist/jose-commonjs.js";

// The public keys used for encryption
const PUBLIC_KEYS = require("./public_keys.json");

const PIONEER_ID_PREF = "extensions.pioneer.cachedClientID";

// Make crypto available and make jose use it.
Cu.importGlobalProperties(["crypto"]);
setCrypto(crypto);

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
      encryptionKeyId: key.id,
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
}

this.PioneerUtils = PioneerUtils;
this.EXPORTED_SYMBOLS = ["PioneerUtils"];
