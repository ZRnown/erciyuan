import { execFileSync, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

function shouldRebuildBetterSqlite3(error) {
  const message = String(error?.message ?? "");
  if (!message.includes("better_sqlite3.node")) {
    return false;
  }

  return (
    message.includes("NODE_MODULE_VERSION") ||
    message.includes("Could not locate the bindings file")
  );
}

function verifyBetterSqlite3Binary() {
  const Database = require("better-sqlite3");
  const db = new Database(":memory:");
  db.prepare("SELECT 1 as ok").get();
  db.close();
}

function findNpmCliPath() {
  const candidates = [
    path.resolve(path.dirname(process.execPath), "../lib/node_modules/npm/bin/npm-cli.js"),
    path.resolve(path.dirname(process.execPath), "../../lib/node_modules/npm/bin/npm-cli.js"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function rebuildWithCurrentNode() {
  const npmCliPath = findNpmCliPath();

  if (npmCliPath) {
    execFileSync(process.execPath, [npmCliPath, "rebuild", "better-sqlite3"], {
      cwd: projectRoot,
      stdio: "inherit",
    });
    return;
  }

  // Fallback for unusual Node installations where npm-cli path cannot be inferred.
  execSync("npm rebuild better-sqlite3", {
    cwd: projectRoot,
    stdio: "inherit",
  });
}

function ensureBetterSqlite3Binary() {
  try {
    verifyBetterSqlite3Binary();
  } catch (error) {
    if (!shouldRebuildBetterSqlite3(error)) {
      throw error;
    }

    console.warn(
      "Detected better-sqlite3 binary mismatch, rebuilding for current Node.js runtime...",
    );
    rebuildWithCurrentNode();
    verifyBetterSqlite3Binary();
  }
}

ensureBetterSqlite3Binary();

try {
  await import("../src/index.js");
} catch (error) {
  if (!shouldRebuildBetterSqlite3(error)) {
    throw error;
  }

  console.warn("Detected better-sqlite3 mismatch during app bootstrap, rebuilding and retrying...");
  rebuildWithCurrentNode();
  await import("../src/index.js");
}
