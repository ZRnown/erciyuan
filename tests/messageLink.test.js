import test from "node:test";
import assert from "node:assert/strict";

import { parseDiscordMessageLink } from "../src/domain/messageLink.js";

test("parseDiscordMessageLink parses standard channel link", () => {
  const result = parseDiscordMessageLink(
    "https://discord.com/channels/123/456/789",
  );

  assert.deepEqual(result, {
    guildId: "123",
    channelId: "456",
    messageId: "789",
  });
});

test("parseDiscordMessageLink supports ptb and canary links", () => {
  const ptb = parseDiscordMessageLink("https://ptb.discord.com/channels/1/2/3");
  const canary = parseDiscordMessageLink(
    "https://canary.discord.com/channels/9/8/7",
  );

  assert.deepEqual(ptb, { guildId: "1", channelId: "2", messageId: "3" });
  assert.deepEqual(canary, { guildId: "9", channelId: "8", messageId: "7" });
});

test("parseDiscordMessageLink throws on invalid links", () => {
  assert.throws(() => parseDiscordMessageLink("https://google.com"), {
    message: /Invalid Discord message link/,
  });
});
