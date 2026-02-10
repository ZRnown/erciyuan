import { EmbedBuilder } from "discord.js";

const MAX_VISIBLE_ATTACHMENTS = 8;

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

function isImageAttachment(attachment) {
  const contentType = String(attachment?.contentType ?? "").toLowerCase();
  if (contentType.startsWith("image/")) {
    return true;
  }

  const fileName = String(attachment?.name ?? "").toLowerCase();
  return /\.(png|jpe?g|gif|webp|bmp|svg|heic|heif)$/i.test(fileName);
}

function formatAttachmentSection(attachments) {
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return "当前没有可下载附件。";
  }

  const nonImage = attachments.filter((item) => !isImageAttachment(item));
  const candidates = nonImage.length > 0 ? nonImage : attachments;
  const title = nonImage.length > 0 ? "以下为非图片附件:" : "以下为附件:";

  const visible = candidates.slice(0, MAX_VISIBLE_ATTACHMENTS);

  const lines = [
    title,
    "",
    "│ 点击超链接下载",
    "",
  ];

  for (const attachment of visible) {
    if (!attachment?.url) {
      continue;
    }

    lines.push(`📄 ${attachment.name ?? "未知文件"}`);
    lines.push(`大小：${formatBytes(attachment.size)}`);
    lines.push(`[>>点击下载<<](${attachment.url})`);
    lines.push("");
  }

  if (candidates.length > visible.length) {
    lines.push(`... 还有 ${candidates.length - visible.length} 个附件`);
  }

  return lines.join("\n");
}

export function createClaimSuccessPanel({
  asset,
  quota,
  dailyDownloadLimit,
  feedbackChannelId = "",
  alreadyDelivered = false,
}) {
  const usedToday = Number(quota?.usedToday ?? 0);
  const totalLimit = Number(quota?.dailyLimit ?? dailyDownloadLimit ?? 0);
  const safeTotalLimit = totalLimit > 0 ? totalLimit : dailyDownloadLimit;
  const remaining = Math.max(0, safeTotalLimit - usedToday);
  const feedbackRef = feedbackChannelId ? `<#${feedbackChannelId}>` : "反馈频道";

  const description = [
    `今日剩余可获取作品量: **${remaining}/${safeTotalLimit}**`,
    alreadyDelivered ? "（你已领取过该作品，可直接再次下载）" : "",
    "\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015",
    formatAttachmentSection(asset?.attachments),
    "\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015",
    `如使用中有任何问题或建议请前往: ${feedbackRef}`,
  ]
    .filter(Boolean)
    .join("\n");

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle("🎈 获取作品")
    .setDescription(description);

  return {
    embeds: [embed],
    components: [],
  };
}
