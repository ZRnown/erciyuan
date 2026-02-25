import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  StringSelectMenuBuilder,
} from "discord.js";

const CLAIM_PICKER_PREFIX = "claim_picker";
export const CLAIM_PICKER_SELECT_ID = `${CLAIM_PICKER_PREFIX}:select`;
const MAX_SELECT_OPTIONS = 25;
const MAX_LABEL_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 100;

function truncateText(text, maxLength) {
  const value = String(text ?? "").trim();
  if (!value) {
    return "";
  }

  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}

function formatDate(timestamp) {
  if (!timestamp) {
    return "未知时间";
  }

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "未知时间";
  }

  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${month}-${day} ${hour}:${minute}`;
}

function inferAssetTitle(asset) {
  const firstAttachmentName = asset?.attachments?.[0]?.name;
  if (firstAttachmentName) {
    return truncateText(firstAttachmentName, MAX_LABEL_LENGTH);
  }

  return truncateText(`作品 ${asset?.id ?? "未知"}`, MAX_LABEL_LENGTH);
}

function toSelectOption(asset, selectedAssetId) {
  return {
    label: inferAssetTitle(asset),
    value: String(asset.id),
    description: truncateText(
      `发布于 ${formatDate(asset.createdAt)} · 作品ID ${asset.id}`,
      MAX_DESCRIPTION_LENGTH,
    ),
    default: String(asset.id) === String(selectedAssetId),
  };
}

export function buildAssetClaimButtonId(action, assetId = "") {
  return `${CLAIM_PICKER_PREFIX}:${action}:${assetId}`;
}

export function parseAssetClaimButtonId(customId) {
  const parts = String(customId).split(":");
  if (parts.length !== 3 || parts[0] !== CLAIM_PICKER_PREFIX) {
    return null;
  }

  const [, action, assetId] = parts;
  return { action, assetId };
}

export function createAssetClaimPanel({ assets, selectedAssetId = "", includeFlags = true } = {}) {
  const visibleAssets = Array.isArray(assets) ? assets.slice(0, MAX_SELECT_OPTIONS) : [];
  const selected = visibleAssets.find((asset) => String(asset.id) === String(selectedAssetId)) ?? null;

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(CLAIM_PICKER_SELECT_ID)
    .setPlaceholder("🔍 请选择要获取的附件...")
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(visibleAssets.map((asset) => toSelectOption(asset, selectedAssetId)));

  const claimButton = new ButtonBuilder()
    .setCustomId(buildAssetClaimButtonId("claim", selected?.id ?? ""))
    .setLabel("🎁 验证并获取")
    .setStyle(ButtonStyle.Success)
    .setDisabled(!selected);

  const payload = {
    content: [
      "📂 **附件获取列表**",
      `发现本频道有 **${visibleAssets.length}** 个最近的附件包。`,
      selected ? `已选择：**${inferAssetTitle(selected)}**` : "请先从下拉菜单中选择一个附件包。",
    ].join("\n"),
    components: [
      new ActionRowBuilder().addComponents(selectMenu),
      new ActionRowBuilder().addComponents(claimButton),
    ],
  };

  if (includeFlags) {
    payload.flags = MessageFlags.Ephemeral;
  }

  return payload;
}
