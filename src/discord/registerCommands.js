import { config } from "../config.js";
import { bootstrapDiscordProxy } from "../network/proxyBootstrap.js";

const proxyState = bootstrapDiscordProxy();

const [{ REST, Routes }, { buildCommands }] = await Promise.all([
  import("discord.js"),
  import("./commands.js"),
]);

const rest = new REST({
  version: "10",
  agent: proxyState.dispatcher,
}).setToken(config.token);

const payload = buildCommands().map((command) => command.toJSON());

async function resolveClientId() {
  const configuredId = String(config.clientId ?? "").trim();
  if (configuredId) {
    return configuredId;
  }

  const routeCandidates = [Routes.currentApplication(), Routes.oauth2CurrentApplication()];
  let lastError = null;

  for (const route of routeCandidates) {
    try {
      const app = await rest.get(route);
      if (app?.id) {
        console.log(`Auto resolved application id: ${app.id}`);
        return app.id;
      }
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(
    `未设置 DISCORD_CLIENT_ID，且无法通过 Token 自动获取应用 ID。${lastError instanceof Error ? ` 原因：${lastError.message}` : ""}`,
  );
}

async function main() {
  const clientId = await resolveClientId();
  const route = config.guildId
    ? Routes.applicationGuildCommands(clientId, config.guildId)
    : Routes.applicationCommands(clientId);

  const scope = config.guildId ? `guild ${config.guildId}` : "global";

  console.log(`Registering ${payload.length} slash commands to ${scope} ...`);
  await rest.put(route, { body: payload });
  console.log("Slash commands registered.");
}

main().catch((error) => {
  console.error("Failed to register slash commands:", error);
  process.exitCode = 1;
});
