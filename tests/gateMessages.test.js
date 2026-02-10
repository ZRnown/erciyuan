import test from "node:test";
import assert from "node:assert/strict";
import { MessageFlags } from "discord.js";

import {
  buildAssetCustomId,
  createGatePanel,
  createStatementConfirmPanel,
  createTopJumpMessage,
  parseAssetCustomId,
} from "../src/discord/gateMessages.js";

test("asset custom id can be encoded and parsed", () => {
  const id = buildAssetCustomId("download", "asset-123");
  assert.equal(id, "protected_asset:download:asset-123");
  assert.deepEqual(parseAssetCustomId(id), {
    action: "download",
    assetId: "asset-123",
  });
});

test("createGatePanel builds components-v2 card with owner + claim actions", () => {
  const panel = createGatePanel({
    id: "asset-1",
    baseMode: "reaction_or_comment",
    passcodeEnabled: true,
    quotaPolicy: "daily_limited",
    statementEnabled: false,
    statementText: null,
  });

  assert.equal(panel.flags, MessageFlags.IsComponentsV2);
  assert.equal(panel.components.length, 1);

  const container = panel.components[0].toJSON();
  const textDisplays = container.components
    .filter((component) => component.type === 10)
    .map((component) => component.content);

  assert.equal(textDisplays.some((content) => content.includes("作品发布处")), true);
  assert.equal(textDisplays.some((content) => content.includes("Tips")), true);
  assert.equal(textDisplays.some((content) => content.includes("获取作品需求")), true);
  assert.equal(textDisplays.some((content) => content.includes("> ")), false);
  assert.equal(textDisplays.some((content) => content.includes("│ ")), false);

  const allButtons = container.components
    .filter((component) => component.type === 1)
    .flatMap((row) => row.components);
  const customIds = allButtons.map((button) => button.custom_id).filter(Boolean);

  assert.equal(customIds.includes(buildAssetCustomId("remove_gate", "asset-1")), true);
  assert.equal(customIds.includes(buildAssetCustomId("replace_gate", "asset-1")), true);
  assert.equal(customIds.includes(buildAssetCustomId("toggle_pin", "asset-1")), true);
  assert.equal(customIds.includes(buildAssetCustomId("download", "asset-1")), true);
  assert.equal(customIds.includes(buildAssetCustomId("passcode", "asset-1")), true);
});

test("createStatementConfirmPanel supports ephemeral flags", () => {
  const payload = createStatementConfirmPanel(
    {
      id: "asset-1",
      statementText: "测试声明",
    },
    { ephemeral: true },
  );

  assert.equal(payload.flags, MessageFlags.Ephemeral);
  assert.equal(payload.components.length, 1);
});

test("createTopJumpMessage returns link button payload", () => {
  const payload = createTopJumpMessage("https://discord.com/channels/1/2/3");

  assert.equal(payload.components.length, 1);
  const row = payload.components[0].toJSON();
  assert.equal(row.components.length, 1);
  assert.equal(row.components[0].label, "回到首楼");
  assert.equal(row.components[0].style, 5);
  assert.equal(row.components[0].url, "https://discord.com/channels/1/2/3");
});
