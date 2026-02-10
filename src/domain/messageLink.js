const MESSAGE_LINK_REGEX =
  /^https:\/\/(?:canary\.|ptb\.)?discord\.com\/channels\/(\d+)\/(\d+)\/(\d+)\/?$/;

export function parseDiscordMessageLink(link) {
  const trimmed = link.trim();
  const match = trimmed.match(MESSAGE_LINK_REGEX);

  if (!match) {
    throw new Error("Invalid Discord message link");
  }

  const [, guildId, channelId, messageId] = match;
  return { guildId, channelId, messageId };
}
