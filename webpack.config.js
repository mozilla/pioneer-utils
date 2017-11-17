/* eslint-env node */
const path = require("path");

module.exports = {
  context: __dirname,
  entry: {
    PioneerUtils: './src/PioneerUtils.ts',
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: "ts-loader",
        exclude: /node_modules/
      }
    ]
  },
  resolve: {
    extensions: [".ts", ".js"]
  },
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "[name].jsm",
    libraryTarget: "this",
  },
};
