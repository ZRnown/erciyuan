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

const route = config.guildId
  ? Routes.applicationGuildCommands(config.clientId, config.guildId)
  : Routes.applicationCommands(config.clientId);

const scope = config.guildId ? `guild ${config.guildId}` : "global";

async function main() {
  console.log(`Registering ${payload.length} slash commands to ${scope} ...`);
  await rest.put(route, { body: payload });
  console.log("Slash commands registered.");
}

main().catch((error) => {
  console.error("Failed to register slash commands:", error);
  process.exitCode = 1;
});
