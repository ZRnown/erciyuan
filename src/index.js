import { config } from "./config.js";
import { createDatabase } from "./db.js";
import { bootstrapDiscordProxy } from "./network/proxyBootstrap.js";
import { Storage } from "./services/storage.js";

bootstrapDiscordProxy();

const { createBot } = await import("./discord/bot.js");

const db = createDatabase(config.dbPath);
const storage = new Storage(db);
const bot = createBot({
  token: config.token,
  storage,
  passwordSalt: config.passwordSalt,
  dailyDownloadLimit: config.dailyDownloadLimit,
  feedbackChannelId: config.feedbackChannelId,
  traceChannelId: config.traceChannelId,
});

bot
  .start()
  .then(() => {
    console.log("Discord bot started.");
  })
  .catch((error) => {
    console.error("Discord bot failed to start:", error);
    process.exitCode = 1;
  });
