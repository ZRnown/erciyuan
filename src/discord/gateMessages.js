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

function buildAccessGuide(policy, quotaText) {
  return [
    `• 前置条件: **${buildFrontCondition(policy)}**`,
    "",
    "• 无限制: 可直接获取",
    "",
    "• 点赞: 对帖子首楼点赞(任意反应)",
    "",
    "• 点赞或评论: 对帖子首楼点赞(任意反应)或在贴内回复(任意回复)",
    "",
    "• 提取码: 寻找作者在贴内贴出的提取码",
    "",
    `• 分享模式: **${quotaText}**`,
    "",
    "• 每日限定: 用户的每日获取作品次数耗尽后无法获取本作品",
    "",
    "• 开放分享: 用户的每日获取作品次数耗尽后仍可获取本作品",
  ].join("\n");
}

function buildTipsText() {
  return [
    "点击“🎁 获取作品”后，机器人会把附件私信发送给你。",
    "若私信失败，请检查是否开启了允许来自服务器成员的私信。",
  ].join("\n");
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
      .setLabel("🎁 获取作品")
      .setStyle(ButtonStyle.Primary),
  );

  const container = new ContainerBuilder()
    .setAccentColor(0x4ea7ff)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          "## 📍 作品发布处",
          "请在此处交互获取本帖作品",
          "",
          "或者直接发送 /输入作品id获取 来按作品ID领取",
        ].join("\n"),
      ),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          "### 获取作品需求",
          "```md",
          buildAccessGuide(policy, quotaText),
          "```",
        ].join("\n"),
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          "### Tips:",
          "```",
          buildTipsText(),
          "```",
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
