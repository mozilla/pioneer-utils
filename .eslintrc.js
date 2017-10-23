"use strict";

module.exports = {
  extends: [
    "plugin:mozilla/recommended",
  ],

  plugins: [
    "mozilla",
  ],

  parserOptions: {
    sourceType: "module"
  },

  rules: {
    "no-return-await": ["off"],
    "valid-jsdoc": ["error", {
      requireReturn: false,
      requireParamDescription: false,
      requireReturnDescription: false,
    }],
  },
};
