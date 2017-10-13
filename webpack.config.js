/* eslint-env node */
const path = require("path");

module.exports = {
  context: __dirname,
  entry: {
    PioneerUtils: "./src/PioneerUtils.jsm",
  },
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "[name].jsm",
    libraryTarget: "this",
  },
};
