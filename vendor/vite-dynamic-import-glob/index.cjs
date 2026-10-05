// The upstream plugin uses CommonJS and ESM default imports of this one method.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { globSync } = require("tinyglobby");

exports.sync = globSync;
