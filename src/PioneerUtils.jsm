'use strict';

const { utils: Cu } = Components;
Cu.import('resource://gre/modules/XPCOMUtils.jsm');

const { TelemetryController } = Cu.import('resource://gre/modules/TelemetryController.jsm', null);

Components.utils.importGlobalProperties(['crypto']);  // Crypto is not available by default
const { Jose, JoseJWE } = require('jose-jwe-jws/dist/jose-commonjs.js');

// The encryption key ID from the server
const ENCRYPTION_KEY_ID = 'pioneer-20170905';

// The public key used for encryption
const PUBLIC_KEY = require('./public_key.json');


class PioneerUtils {
  constructor(config) {
    this.config = config;
    this.encrypter = null;
  }

  setupEncrypter() {
    if (this.encrypter === null) {
      const rsa_key = Jose.Utils.importRsaPublicKey(PUBLIC_KEY, 'RSA-OAEP');
      const cryptographer = new Jose.WebCryptographer();
      this.encrypter = new JoseJWE.Encrypter(cryptographer, rsa_key);
    }
  }

  async encryptData() {
    this.setupEncrypter();
    return await this.encrypter.encrypt(data);
  }

  async submitEncryptedPing(data) {
    const payload = {
      encryptedData: await this.encryptData(JSON.stringify(data)),
      encryptionKeyId: ENCRYPTION_KEY_ID,
      pioneerId: this.config.id,
      studyName: this.config.studyName,
      studyVersion: this.config.studyVersion,
    };

    const telOptions = {
      addClientId: true,
      addEnvironment: true
    };

    return TelemetryController.submitExternalPing('pioneer-study', payload, telOptions);
  }
}

this.EXPORTED_SYMBOLS = ['PioneerUtils'];
