import { config } from "./config.js";
import { createDatabase } from "./db.js";
import { bootstrapDiscordProxy } from "./network/proxyBootstrap.js";
import { AssetFileStore } from "./services/assetFileStore.js";
import { Storage } from "./services/storage.js";

bootstrapDiscordProxy();

const { createBot } = await import("./discord/bot.js");

const db = createDatabase(config.dbPath);
const storage = new Storage(db);
const fileStore = new AssetFileStore({
  baseUrl: config.fileBaseUrl,
  storageDir: config.fileStorageDir,
});

if (fileStore.enabled) {
  await fileStore.startServer({
    host: config.fileServerHost,
    port: config.fileServerPort,
  });
  console.log(
    `Asset file server started on ${config.fileServerHost}:${config.fileServerPort} (${config.fileBaseUrl})`,
  );
}

const bot = createBot({
  token: config.token,
  storage,
  fileStore,
  passwordSalt: config.passwordSalt,
  dailyDownloadLimit: config.dailyDownloadLimit,
  feedbackChannelId: config.feedbackChannelId,
  traceChannelId: config.traceChannelId,
  newbieVerifiedRoleId: config.newbieVerifiedRoleId,
  newbieQuizQuestionsRaw: config.newbieQuizQuestionsRaw,
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
