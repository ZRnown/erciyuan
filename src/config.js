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

export const config = {
  token: required("DISCORD_TOKEN"),
  clientId: required("DISCORD_CLIENT_ID"),
  guildId: process.env.DISCORD_GUILD_ID ?? "",
  dbPath: process.env.DB_PATH
    ? path.resolve(process.env.DB_PATH)
    : path.resolve(projectRoot, "data", "bot.db"),
  passwordSalt: process.env.PASSWORD_SALT ?? "discord-protected-attachment-default-salt",
  dailyDownloadLimit: parsePositiveInt(process.env.DAILY_DOWNLOAD_LIMIT ?? 10, 10),
  feedbackChannelId: process.env.FEEDBACK_CHANNEL_ID ?? "",
  traceChannelId: process.env.TRACE_CHANNEL_ID ?? "",
};
