import test from "node:test";
import assert from "node:assert/strict";
import { MessageFlags } from "discord.js";

import {
  buildPublishDraftButtonId,
  buildPublishDraftModalId,
  createPasscodeModal,
  createPublishDraftPanel,
  createPublishDraftResultPanel,
  parsePublishDraftButtonId,
  parsePublishDraftModalId,
} from "../src/discord/publishDraftPanel.js";

const draft = {
  id: "draft-1",
  mode: "reaction_or_comment",
  passcodeEnabled: true,
  passcode: " 1234 ",
  quotaPolicy: "open_share",
  statementEnabled: false,
  statementText: "",
  attachments: [
    {
      name: "a.json",
      size: 1024,
      contentType: "application/json",
      url: "https://cdn.discordapp.com/attachments/a/a.json",
    },
  ],
};

test("publish draft button id round-trip", () => {
  const id = buildPublishDraftButtonId("draft-1", "set_mode", "none");
  assert.equal(id, "publish_draft:draft-1:set_mode:none");
  assert.deepEqual(parsePublishDraftButtonId(id), {
    draftId: "draft-1",
    action: "set_mode",
    value: "none",
  });
});

test("publish draft modal id round-trip", () => {
  const id = buildPublishDraftModalId("draft-1", "passcode");
  assert.equal(id, "publish_draft_modal:draft-1:passcode");
  assert.deepEqual(parsePublishDraftModalId(id), {
    draftId: "draft-1",
    kind: "passcode",
  });
});

test("createPublishDraftPanel renders components-v2 card with passcode hint + value", () => {
  const panel = createPublishDraftPanel(draft, { ephemeral: true });
  assert.equal(panel.components.length, 1);
  assert.equal(
    panel.flags & (MessageFlags.Ephemeral | MessageFlags.IsComponentsV2),
    MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
  );

  const container = panel.components[0].toJSON();
  const textDisplays = container.components
    .filter((component) => component.type === 10)
    .map((component) => component.content);

  assert.equal(textDisplays.some((content) => content.includes("### 提取码")), true);
  assert.equal(textDisplays.some((content) => content.includes("当前提取码：")), true);
  assert.equal(
    textDisplays.some((content) => content.includes("如使用中有任何问题或建议请前往：反馈频道")),
    false,
  );

  const actionRows = container.components.filter((component) => component.type === 1);
  const buttonCustomIds = actionRows
    .flatMap((row) => row.components)
    .map((button) => button.custom_id)
    .filter(Boolean);

  assert.equal(
    buttonCustomIds.includes(buildPublishDraftButtonId("draft-1", "clear_passcode")),
    true,
  );

  const linkButtons = actionRows
    .flatMap((row) => row.components)
    .filter((button) => button.style === 5);

  assert.equal(linkButtons.some((button) => button.label.includes("点击下载")), true);
  assert.equal(linkButtons[0].url, "https://cdn.discordapp.com/attachments/a/a.json");
});

test("createPasscodeModal preserves existing passcode value", () => {
  const modal = createPasscodeModal(draft).toJSON();
  assert.equal(modal.custom_id, "publish_draft_modal:draft-1:passcode");
  assert.equal(modal.components[0].components[0].value, " 1234 ");
});

test("createPublishDraftResultPanel returns components-v2 only payload", () => {
  const payload = createPublishDraftResultPanel({
    title: "发布成功",
    body: "测试正文",
    success: true,
  });

  assert.equal(payload.flags, MessageFlags.IsComponentsV2);
  assert.equal(payload.components.length, 1);
  const container = payload.components[0].toJSON();
  assert.equal(container.type, 17);
  assert.equal(container.components[0].type, 10);
});
