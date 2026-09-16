const { existsSync } = require("fs");
const { join } = require("path");
const { spawnSync } = require("child_process");

function prismaBin() {
  return [
    join(__dirname, "node_modules/.bin/prisma"),
    join(__dirname, "../../node_modules/.bin/prisma"),
  ].find(existsSync);
}

function databaseUrl(raw) {
  try {
    const url = new URL(raw);
    if (url.hostname.includes("pooler")) url.searchParams.set("pgbouncer", "true");
    url.searchParams.delete("channel_binding");
    return url.toString();
  } catch {
    return raw;
  }
}

if (process.env.RUN_MIGRATIONS !== "0" && process.env.DATABASE_URL) {
  const bin = prismaBin();
  if (bin) {
    console.log("Applying Prisma migrations...");
    const result = spawnSync(
      bin,
      ["migrate", "deploy", "--schema", join(__dirname, "prisma/schema.prisma")],
      {
        stdio: "inherit",
        env: { ...process.env, DATABASE_URL: databaseUrl(process.env.DATABASE_URL) },
        cwd: __dirname,
        shell: process.platform === "win32",
      },
    );
    if (result.status !== 0) {
      console.error("prisma migrate deploy failed");
      process.exit(result.status ?? 1);
    }
  } else {
    console.warn("Skipping migrations: prisma CLI is not installed");
  }
}

const files = ["dist/main.js", "dist/src/main.js"].map((file) => join(__dirname, file));
const entry = files.find(existsSync);
if (!entry) {
  console.error(`Missing API build in ${__dirname}. Looked for:\n${files.join("\n")}`);
  process.exit(1);
}
require(entry);
