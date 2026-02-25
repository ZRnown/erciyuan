import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  TextDisplayBuilder,
} from "discord.js";
import {
  formatAccessMode,
  formatQuotaPolicy,
  parseAccessPolicy,
} from "../domain/unlockMode.js";

const CUSTOM_ID_PREFIX = "protected_asset";

function buildFrontCondition(policy) {
  const modeText = formatAccessMode(policy.mode);
  if (!policy.passcodeEnabled) {
    return modeText;
  }

  if (policy.mode === "none") {
    return "提取码";
  }

  return `${modeText} + 提取码`;
}

function inferAssetName(asset) {
  const firstAttachment = asset?.attachments?.[0]?.name;
  if (!firstAttachment) {
    return "未命名作品";
  }

  const trimmed = String(firstAttachment).trim();
  if (!trimmed) {
    return "未命名作品";
  }

  return trimmed;
}

function buildAttachmentSummary(asset) {
  const attachments = Array.isArray(asset?.attachments) ? asset.attachments : [];
  if (attachments.length === 0) {
    return "无附件";
  }

  const names = attachments
    .slice(0, 3)
    .map((item) => item?.name)
    .filter(Boolean);

  const summary = names.join("、") || "未知附件";
  if (attachments.length <= 3) {
    return `${summary}（共${attachments.length}个）`;
  }

  return `${summary} 等（共${attachments.length}个）`;
}

export function buildAssetCustomId(action, assetId) {
  return `${CUSTOM_ID_PREFIX}:${action}:${assetId}`;
}

export function parseAssetCustomId(customId) {
  const parts = String(customId).split(":");
  if (parts.length !== 3 || parts[0] !== CUSTOM_ID_PREFIX) {
    return null;
  }

  const [, action, assetId] = parts;
  return { action, assetId };
}

export function createGatePanel(asset) {
  const policy = parseAccessPolicy(asset.baseMode, asset.passcodeEnabled);
  const quotaText = formatQuotaPolicy(asset.quotaPolicy);

  const claimRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(buildAssetCustomId("download", asset.id))
      .setLabel("👍 验证并获取附件")
      .setStyle(ButtonStyle.Success),
  );

  const container = new ContainerBuilder()
    .setAccentColor(0x2ecc71)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          "## 💐作品获取处",
          "",
          `作品名：${inferAssetName(asset)}`,
          `附件内容：${buildAttachmentSummary(asset)}`,
          `获取条件：${buildFrontCondition(policy)}（${quotaText}）`,
        ].join("\n"),
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`作品ID: ${asset.id}`))
    .addActionRowComponents(claimRow);

  if (policy.passcodeEnabled) {
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(buildAssetCustomId("passcode", asset.id))
          .setLabel("🔑 输入提取码")
          .setStyle(ButtonStyle.Secondary),
      ),
    );
  }

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
  };
}

export function createStatementConfirmPanel(asset, { ephemeral = false } = {}) {
  const payload = {
    content: `作者声明：\n${asset.statementText ?? "发布者启用了声明确认"}`,
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(buildAssetCustomId("confirm_statement", asset.id))
          .setLabel("我已阅读并同意")
          .setStyle(ButtonStyle.Success),
      ),
    ],
  };

  if (ephemeral) {
    payload.flags = MessageFlags.Ephemeral;
  }

  return payload;
}

export function createTopJumpMessage(link) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel("回到首楼").setStyle(ButtonStyle.Link).setURL(link),
  );

  return {
    content: "点击按钮回顶到首楼：",
    components: [row],
  };
}
