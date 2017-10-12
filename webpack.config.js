/* eslint-env node */
var path = require("path");

module.exports = {
  context: __dirname,
  entry: {
    PioneerUtils: "./src/PioneerUtils.jsm",
  },
  output: {
    path: path.resolve(__dirname, "dist/"),
    filename: "[name].jsm",
  },
};
