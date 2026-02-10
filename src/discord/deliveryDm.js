import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  TextDisplayBuilder,
} from "discord.js";

const MAX_DOWNLOAD_BUTTONS = 10;

function formatBytes(size = 0) {
  const units = ["B", "KB", "MB", "GB"];
  let value = Number(size) || 0;
  let index = 0;

  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }

  const fixed = index === 0 ? String(Math.round(value)) : value.toFixed(2);
  return `${fixed} ${units[index]}`;
}

function formatDateTime(timestamp) {
  return new Date(timestamp).toLocaleString("zh-CN", {
    hour12: false,
  });
}

function inferCardName(asset) {
  const firstName = asset?.attachments?.[0]?.name;
  if (!firstName) {
    return "未命名作品";
  }

  const trimmed = firstName.replace(/\.[^.]+$/, "");
  return trimmed || firstName;
}

function inferAttachmentTitle(_attachment, index) {
  return `附件${index + 1}`;
}

function attachmentNote(attachment) {
  if (!attachment?.contentType) {
    return "无";
  }

  if (/json/i.test(attachment.contentType)) {
    return "快捷回复";
  }

  if (/image/i.test(attachment.contentType)) {
    return "图片文件";
  }

  return attachment.contentType;
}

function buildMetaText(asset, quotaText, sentAt) {
  return [
    "## ✦ Hash Brown ✦",
    formatDateTime(sentAt),
    "",
    `链接：${asset?.sourceUrl ?? "未知"}`,
    `作者：${asset?.ownerUserId ? `<@${asset.ownerUserId}>` : "未知"}`,
    `卡名：${inferCardName(asset)}`,
    quotaText ? `您今天的下载额度：${quotaText}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildAttachmentText(attachment, index) {
  return [
    `### ${inferAttachmentTitle(attachment, index)}`,
    `${attachment?.name ?? `附件-${index + 1}`}`,
    `说明：${attachmentNote(attachment)}`,
    `大小：${formatBytes(attachment?.size)}`,
  ].join("\n");
}

export function createDeliveryDmPanel({ asset, quotaText = null, sentAt = Date.now() }) {
  const attachments = Array.isArray(asset?.attachments) ? asset.attachments : [];

  const container = new ContainerBuilder()
    .setAccentColor(0xf1d3dd)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(buildMetaText(asset, quotaText, sentAt)))
    .addSeparatorComponents(new SeparatorBuilder());

  const visibleAttachments = attachments.slice(0, MAX_DOWNLOAD_BUTTONS);

  if (visibleAttachments.length === 0) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent("当前作品未包含可下载附件，请联系发布者补发。"),
    );
  }

  for (const [index, attachment] of visibleAttachments.entries()) {
    container
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(buildAttachmentText(attachment, index)))
      .addActionRowComponents(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setLabel("点击下载 ↗")
            .setURL(attachment.url),
        ),
      )
      .addSeparatorComponents(new SeparatorBuilder());
  }

  if (attachments.length > visibleAttachments.length) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`⚠️ 附件较多，仅显示前 ${visibleAttachments.length} 个下载按钮。`),
    );
  }

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
  };
}
