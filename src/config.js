import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function parsePort(value, fallback) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 65535) {
    return fallback;
  }
  return parsed;
}

export const config = {
  token: required("DISCORD_TOKEN"),
  // Optional: register script can auto-resolve application id from token.
  clientId: process.env.DISCORD_CLIENT_ID ?? "",
  guildId: process.env.DISCORD_GUILD_ID ?? "",
  dbPath: process.env.DB_PATH
    ? path.resolve(process.env.DB_PATH)
    : path.resolve(projectRoot, "data", "bot.db"),
  passwordSalt: process.env.PASSWORD_SALT ?? "discord-protected-attachment-default-salt",
  dailyDownloadLimit: parsePositiveInt(process.env.DAILY_DOWNLOAD_LIMIT ?? 10, 10),
  feedbackChannelId: process.env.FEEDBACK_CHANNEL_ID ?? "",
  traceChannelId: process.env.TRACE_CHANNEL_ID ?? "",
  fileBaseUrl: String(process.env.FILE_BASE_URL ?? "").trim(),
  fileStorageDir: process.env.FILE_STORAGE_DIR
    ? path.resolve(process.env.FILE_STORAGE_DIR)
    : path.resolve(projectRoot, "data", "uploads"),
  fileServerHost: String(process.env.FILE_SERVER_HOST ?? "0.0.0.0").trim() || "0.0.0.0",
  fileServerPort: parsePort(process.env.FILE_SERVER_PORT ?? 8787, 8787),
};
