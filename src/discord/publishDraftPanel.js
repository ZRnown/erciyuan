import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  ModalBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { formatAccessMode, formatQuotaPolicy } from "../domain/unlockMode.js";

const DRAFT_BUTTON_PREFIX = "publish_draft";
const DRAFT_MODAL_PREFIX = "publish_draft_modal";
const MAX_IMPORT_DOWNLOAD_BUTTONS = 5;
export const DRAFT_PASSCODE_FIELD_ID = "draft_passcode";
export const DRAFT_STATEMENT_FIELD_ID = "draft_statement";

function formatBytes(size = 0) {
  const units = ["B", "KB", "MB", "GB"];
  let value = Number(size);
  let index = 0;

  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }

  const fixed = index === 0 ? String(Math.round(value)) : value.toFixed(2);
  return `${fixed} ${units[index]}`;
}

function renderAttachments(attachments) {
  if (!attachments || attachments.length === 0) {
    return "（未找到附件）";
  }

  const lines = attachments.slice(0, 12).map((attachment) => {
    const type = attachment.contentType ?? "unknown";
    return `📄 ${attachment.name}\n大小：${formatBytes(attachment.size)} | 类型：${type}`;
  });

  if (attachments.length > 12) {
    lines.push(`... 还有 ${attachments.length - 12} 个附件`);
  }

  return lines.join("\n");
}

function buildImportDownloadRows(draft) {
  const files = (draft.attachments ?? [])
    .filter((attachment) => Boolean(attachment?.url))
    .slice(0, MAX_IMPORT_DOWNLOAD_BUTTONS);

  if (files.length === 0) {
    return [];
  }

  const rows = [];
  const chunkSize = 3;

  for (let index = 0; index < files.length; index += chunkSize) {
    const row = new ActionRowBuilder();
    const chunk = files.slice(index, index + chunkSize);

    for (const [offset, file] of chunk.entries()) {
      const order = index + offset + 1;
      row.addComponents(
        new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setLabel(files.length === 1 ? ">>点击下载<<" : `>>点击下载 ${order}<<`)
          .setURL(file.url),
      );
    }

    rows.push(row);
  }

  return rows;
}

function statementPreview(draft) {
  if (!draft.statementEnabled) {
    return "已禁用";
  }

  const text = draft.statementText?.trim();
  if (!text) {
    return "已启用（暂无内容）";
  }

  return text.length > 220 ? `${text.slice(0, 220)}...` : text;
}

function passcodePreview(draft) {
  if (!draft.passcodeEnabled) {
    return "已关闭";
  }

  const value = draft.passcode?.trim();
  if (!value) {
    return "已启用（未设置）";
  }

  return value;
}

export function buildPublishDraftButtonId(draftId, action, value = "") {
  return `${DRAFT_BUTTON_PREFIX}:${draftId}:${action}:${value}`;
}

export function parsePublishDraftButtonId(customId) {
  const parts = String(customId).split(":");
  if (parts.length < 4 || parts[0] !== DRAFT_BUTTON_PREFIX) {
    return null;
  }

  const [, draftId, action, ...rest] = parts;
  return {
    draftId,
    action,
    value: rest.join(":"),
  };
}

export function buildPublishDraftModalId(draftId, kind) {
  return `${DRAFT_MODAL_PREFIX}:${draftId}:${kind}`;
}

export function parsePublishDraftModalId(customId) {
  const parts = String(customId).split(":");
  if (parts.length !== 3 || parts[0] !== DRAFT_MODAL_PREFIX) {
    return null;
  }

  return {
    draftId: parts[1],
    kind: parts[2],
  };
}

function modeButtons(draft) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(buildPublishDraftButtonId(draft.id, "set_mode", "none"))
      .setLabel("☀️ 无限制")
      .setStyle(draft.mode === "none" ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(buildPublishDraftButtonId(draft.id, "set_mode", "reaction"))
      .setLabel("❤️ 点赞")
      .setStyle(draft.mode === "reaction" ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(buildPublishDraftButtonId(draft.id, "set_mode", "reaction_or_comment"))
      .setLabel("🎁 点赞或回复")
      .setStyle(draft.mode === "reaction_or_comment" ? ButtonStyle.Success : ButtonStyle.Secondary),
  );
}

function passcodeActionButtons(draft) {
  const hasPasscode = Boolean(draft.passcode?.trim());

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(buildPublishDraftButtonId(draft.id, "toggle_passcode"))
      .setLabel(draft.passcodeEnabled ? "# 提取码：已启用" : "# 提取码：已关闭")
      .setStyle(draft.passcodeEnabled ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(buildPublishDraftButtonId(draft.id, "edit_passcode"))
      .setLabel("✍️ 输入提取码")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(buildPublishDraftButtonId(draft.id, "clear_passcode"))
      .setLabel("🗑 删除提取码")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!hasPasscode),
  );
}

function quotaButtons(draft) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(buildPublishDraftButtonId(draft.id, "set_quota", "open_share"))
      .setLabel("🎀 开放分享")
      .setStyle(draft.quotaPolicy === "open_share" ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(buildPublishDraftButtonId(draft.id, "set_quota", "daily_limited"))
      .setLabel("💳 每日限定")
      .setStyle(draft.quotaPolicy === "daily_limited" ? ButtonStyle.Success : ButtonStyle.Secondary),
  );
}

function statementButtons(draft) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(buildPublishDraftButtonId(draft.id, "set_statement", "on"))
      .setLabel("🔔 启用")
      .setStyle(draft.statementEnabled ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(buildPublishDraftButtonId(draft.id, "set_statement", "off"))
      .setLabel("❌ 关闭")
      .setStyle(draft.statementEnabled ? ButtonStyle.Secondary : ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(buildPublishDraftButtonId(draft.id, "edit_statement"))
      .setLabel("📝 输入声明")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!draft.statementEnabled),
  );
}

function actionButtons(draft) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(buildPublishDraftButtonId(draft.id, "publish"))
      .setLabel("📦 发布")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(buildPublishDraftButtonId(draft.id, "cancel"))
      .setLabel("⚠️ 取消")
      .setStyle(ButtonStyle.Danger),
  );
}

function overviewText(draft) {
  return [
    "## 作品发布面板",
    "──────────────",
    "### 获取作品需求",
    `当前模式：${formatAccessMode(draft.mode)}`,
  ].join("\n");
}

function passcodeText(draft) {
  return [
    "### 提取码",
    "点击按钮切换是否启用来和上方的需求进行组合（无限制 + 启用提取码为纯提取码模式）",
    "🎈 记得将提取码置于贴内",
    "⚠️ 开头或结尾的空格将被自动清理",
    `当前提取码：${passcodePreview(draft)}`,
  ].join("\n");
}

function quotaText(draft) {
  return [
    "### 获取次数设置",
    "可以设置当用户的当日获取作品次数耗尽时，是否依然允许其获取本作品？",
    `当前设置：${formatQuotaPolicy(draft.quotaPolicy)}`,
  ].join("\n");
}

function statementText(draft) {
  return [
    "### 作者声明",
    `当前状态：${draft.statementEnabled ? "已启用" : "已关闭"}`,
    "在用户下载作品前将先使用本条内容提示一遍用户，要求用户二次确认声明内容",
    `当前声明内容：${statementPreview(draft)}`,
  ].join("\n");
}

function importInfoText(draft) {
  const attachments = draft.attachments ?? [];
  return [
    "### 作品已从消息导入",
    "在从消息导入消息附件后附件内容将固定为当时的原消息附件，无法修改",
    "如需修改请发起新的交互面板",
    renderAttachments(attachments),
    "",
    attachments.length > MAX_IMPORT_DOWNLOAD_BUTTONS
      ? `⚠️ 仅显示前 ${MAX_IMPORT_DOWNLOAD_BUTTONS} 个预览下载按钮`
      : "",
  ].join("\n");
}

export function createPublishDraftPanel(draft, { ephemeral = false } = {}) {
  const modeOnly = Boolean(draft.modeOnly);
  const importDownloadRows = modeOnly ? [] : buildImportDownloadRows(draft);

  const container = new ContainerBuilder()
    .setAccentColor(0x4ea7ff)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(overviewText(draft)))
    .addActionRowComponents(modeButtons(draft));

  if (!modeOnly) {
    container
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(passcodeText(draft)))
      .addActionRowComponents(passcodeActionButtons(draft))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(quotaText(draft)))
      .addActionRowComponents(quotaButtons(draft))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(statementText(draft)))
      .addActionRowComponents(statementButtons(draft));
  }

  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(importInfoText(draft)));

  for (const row of importDownloadRows) {
    container.addActionRowComponents(row);
  }

  container.addActionRowComponents(actionButtons(draft));

  const flags = ephemeral
    ? MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
    : MessageFlags.IsComponentsV2;

  return {
    components: [container],
    flags,
  };
}

export function createPublishDraftResultPanel({ title, body, success = true }) {
  const container = new ContainerBuilder()
    .setAccentColor(success ? 0x57f287 : 0xed4245)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `## ${title}`,
        body,
      ].join("\n")),
    );

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
  };
}

export function createPasscodeModal(draft) {
  const modal = new ModalBuilder()
    .setCustomId(buildPublishDraftModalId(draft.id, "passcode"))
    .setTitle("输入提取码（留空即删除）");

  const input = new TextInputBuilder()
    .setCustomId(DRAFT_PASSCODE_FIELD_ID)
    .setLabel("提取码")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(100);

  if (draft.passcode) {
    input.setValue(draft.passcode);
  }

  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return modal;
}

export function createStatementModal(draft) {
  const modal = new ModalBuilder()
    .setCustomId(buildPublishDraftModalId(draft.id, "statement"))
    .setTitle("输入作者声明");

  const input = new TextInputBuilder()
    .setCustomId(DRAFT_STATEMENT_FIELD_ID)
    .setLabel("声明内容")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(1000);

  if (draft.statementText) {
    input.setValue(draft.statementText);
  }

  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return modal;
}
