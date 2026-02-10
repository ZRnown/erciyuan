import test from "node:test";
import assert from "node:assert/strict";

import { createClaimSuccessPanel } from "../src/discord/downloadSuccessPanel.js";

test("createClaimSuccessPanel renders screenshot-like success embed with links", () => {
  const payload = createClaimSuccessPanel({
    asset: {
      attachments: [
        {
          name: "01-qr.json",
          size: 35_800,
          url: "https://cdn.discordapp.com/attachments/a/01-qr.json",
          contentType: "application/json",
        },
      ],
    },
    quota: {
      usedToday: 11,
      dailyLimit: 75,
    },
    dailyDownloadLimit: 75,
    feedbackChannelId: "123456",
  });

  assert.equal(payload.embeds.length, 1);
  const embed = payload.embeds[0].toJSON();
  assert.equal(embed.title, "🎈 获取作品");
  assert.equal(embed.description.includes("今日剩余可获取作品量: **64/75**"), true);
  assert.equal(embed.description.includes("[>>点击下载<<](https://cdn.discordapp.com/attachments/a/01-qr.json)"), true);
  assert.equal(embed.description.includes("<#123456>"), true);
});

test("createClaimSuccessPanel prioritizes non-image attachments", () => {
  const payload = createClaimSuccessPanel({
    asset: {
      attachments: [
        {
          name: "a.png",
          size: 200,
          url: "https://cdn.discordapp.com/attachments/a/a.png",
          contentType: "image/png",
        },
        {
          name: "b.json",
          size: 100,
          url: "https://cdn.discordapp.com/attachments/a/b.json",
          contentType: "application/json",
        },
      ],
    },
    quota: {
      usedToday: 1,
      dailyLimit: 10,
    },
    dailyDownloadLimit: 10,
  });

  const embed = payload.embeds[0].toJSON();
  assert.equal(embed.description.includes("以下为非图片附件"), true);
  assert.equal(embed.description.includes("b.json"), true);
  assert.equal(embed.description.includes("a.png"), false);
});
