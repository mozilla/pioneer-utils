"use strict";

const { classes: Cc, interfaces: Ci, utils: Cu } = Components;
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");

const { TelemetryController } = Cu.import("resource://gre/modules/TelemetryController.jsm", null);
const { generateUUID } = Cc["@mozilla.org/uuid-generator;1"].getService(Ci.nsIUUIDGenerator);

Cu.importGlobalProperties(["crypto"]);  // Crypto is not available by default
import { Jose, JoseJWE } from "jose-jwe-jws/dist/jose-commonjs.js";

// The public key used for encryption
const PUBLIC_KEY = require("./public_key.json");

// The encryption key ID from the server
const ENCRYPTION_KEY_ID = "pioneer-20170905";

const PIONEER_ID_PREF = "extensions.pioneer.cachedClientID";


class PioneerUtils {
  constructor(config) {
    this.config = config;
    this.encrypter = null;
  }

  setupEncrypter() {
    if (this.encrypter === null) {
      const rsa_key = Jose.Utils.importRsaPublicKey(PUBLIC_KEY, "RSA-OAEP");
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

  async encryptData() {
    this.setupEncrypter();
    return await this.encrypter.encrypt(data);
  }

  async submitEncryptedPing(data) {
    const payload = {
      encryptedData: await this.encryptData(JSON.stringify(data)),
      encryptionKeyId: ENCRYPTION_KEY_ID,
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

this.EXPORTED_SYMBOLS = ["PioneerUtils"];
