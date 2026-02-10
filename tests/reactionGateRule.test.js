import test from "node:test";
import assert from "node:assert/strict";
import { ChannelType } from "discord.js";

import { shouldCountReactionForAsset } from "../src/discord/bot.js";

test("thread reactions only count on starter message", () => {
  const asset = {
    gateMessageId: "gate-1",
    baseMode: "reaction",
  };

  assert.equal(
    shouldCountReactionForAsset({
      asset,
      reactionMessageId: "gate-1",
      channelType: ChannelType.PublicThread,
      starterMessageId: "starter-1",
    }),
    false,
  );

  assert.equal(
    shouldCountReactionForAsset({
      asset,
      reactionMessageId: "starter-1",
      channelType: ChannelType.PublicThread,
      starterMessageId: "starter-1",
    }),
    true,
  );
});

test("non-thread reactions keep gate-message behavior", () => {
  const asset = {
    gateMessageId: "gate-2",
    baseMode: "reaction_or_comment",
  };

  assert.equal(
    shouldCountReactionForAsset({
      asset,
      reactionMessageId: "gate-2",
      channelType: ChannelType.GuildText,
      starterMessageId: null,
    }),
    true,
  );

  assert.equal(
    shouldCountReactionForAsset({
      asset,
      reactionMessageId: "other-msg",
      channelType: ChannelType.GuildText,
      starterMessageId: null,
    }),
    false,
  );
});
