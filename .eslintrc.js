"use strict";

module.exports = {
  extends: [
    "plugin:mozilla/recommended",
  ],

  plugins: [
    "mozilla",
    "typescript",
  ],

  parser: "typescript-eslint-parser",

  parserOptions: {
    sourceType: "module"
  },

  rules: {
    "no-return-await": ["off"],

    // The following rules do not work with Typescript
    "no-undef": ["off"], // https://github.com/eslint/typescript-eslint-parser/issues/77
    "no-unused-vars": ["off"], // https://github.com/eslint/typescript-eslint-parser/issues/77
    "no-useless-constructor": ["off"], // https://github.com/eslint/typescript-eslint-parser/issues/77
    "space-infix-ops": ["off"], // https://github.com/eslint/typescript-eslint-parser/issues/224
  },
};
