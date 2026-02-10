import test from "node:test";
import assert from "node:assert/strict";
import { MessageFlags } from "discord.js";

import { createDeliveryDmPanel } from "../src/discord/deliveryDm.js";

const asset = {
  id: "asset-1",
  gateMessageId: "gate-123",
  sourceUrl: "https://discord.com/channels/1/2/3",
  ownerUserId: "10001",
  attachments: [
    {
      name: "01-qr.json",
      size: 35_800,
      url: "https://cdn.discordapp.com/attachments/a/01-qr.json",
      contentType: "application/json; charset=utf-8",
    },
    {
      name: "02-meta.txt",
      size: 9_144,
      url: "https://cdn.discordapp.com/attachments/a/02-meta.txt",
      contentType: "text/plain",
    },
  ],
};

test("createDeliveryDmPanel renders screenshot-like card with download buttons", () => {
  const payload = createDeliveryDmPanel({
    asset,
    quotaText: "1/10",
    sentAt: Date.parse("2026-02-10T15:00:00+08:00"),
  });

  assert.equal(payload.flags, MessageFlags.IsComponentsV2);
  assert.equal(payload.components.length, 1);

  const container = payload.components[0].toJSON();
  const textDisplays = container.components
    .filter((component) => component.type === 10)
    .map((component) => component.content);

  assert.equal(textDisplays.some((content) => content.includes("Hash Brown")), true);
  assert.equal(textDisplays.some((content) => content.includes("您今天的下载额度：1/10")), true);
  assert.equal(textDisplays.some((content) => content.includes("JSON角色卡")), true);

  const allButtons = container.components
    .filter((component) => component.type === 1)
    .flatMap((row) => row.components);

  const linkButtons = allButtons.filter((button) => button.style === 5);
  assert.equal(linkButtons.length, 2);
  assert.equal(linkButtons[0].url, asset.attachments[0].url);
  assert.equal(linkButtons[1].url, asset.attachments[1].url);

  const customButtons = allButtons.filter((button) => Boolean(button.custom_id));
  assert.equal(customButtons.length, 0);
});

test("createDeliveryDmPanel limits visible download buttons", () => {
  const largeAsset = {
    ...asset,
    attachments: Array.from({ length: 12 }, (_, index) => ({
      name: `file-${index + 1}.bin`,
      size: 1024,
      url: `https://cdn.discordapp.com/attachments/a/file-${index + 1}.bin`,
      contentType: "application/octet-stream",
    })),
  };

  const payload = createDeliveryDmPanel({ asset: largeAsset });
  const container = payload.components[0].toJSON();

  const linkButtons = container.components
    .filter((component) => component.type === 1)
    .flatMap((row) => row.components)
    .filter((button) => button.style === 5);

  assert.equal(linkButtons.length, 10);

  const textDisplays = container.components
    .filter((component) => component.type === 10)
    .map((component) => component.content);

  assert.equal(
    textDisplays.some((content) => content.includes("仅显示前 10 个下载按钮")),
    true,
  );
});
