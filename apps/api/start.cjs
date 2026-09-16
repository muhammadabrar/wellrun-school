const { existsSync } = require("fs");
const { join } = require("path");

const files = ["dist/main.js", "dist/src/main.js"].map((file) => join(__dirname, file));
const entry = files.find(existsSync);
if (!entry) {
  console.error(`Missing API build in ${__dirname}. Looked for:\n${files.join("\n")}`);
  process.exit(1);
}
require(entry);
