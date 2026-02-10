export function buildThreadTopLink({ guildId, threadId, starterMessageId }) {
  if (!guildId || !threadId || !starterMessageId) {
    throw new Error("Missing required ids to build thread top link");
  }

  return `https://discord.com/channels/${guildId}/${threadId}/${starterMessageId}`;
}
