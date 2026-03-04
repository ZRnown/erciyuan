import {
  ActionRowBuilder,
  ChannelType,
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
  ModalBuilder,
  Partials,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { randomUUID } from "node:crypto";

import { buildThreadTopLink } from "../domain/threadTop.js";
import { parseDiscordMessageLink } from "../domain/messageLink.js";
import {
  isAccessComplete,
  listMissingConditions,
  parseAccessPolicy,
} from "../domain/unlockMode.js";
import {
  applyUnlockSignal,
  createEmptyProgress,
  isSignalRelevant,
} from "../services/unlockEngine.js";
import { hashPassword, verifyPassword } from "../services/password.js";
import { evaluateDailyQuota, toDateKey } from "../services/dailyQuota.js";
import { PublishDraftStore } from "../services/publishDraftStore.js";
import {
  buildAssetCustomId,
  createGatePanel,
  createStatementConfirmPanel,
  createTopJumpMessage,
  parseAssetCustomId,
} from "./gateMessages.js";
import {
  DRAFT_PASSCODE_FIELD_ID,
  DRAFT_STATEMENT_FIELD_ID,
  createPasscodeModal,
  createPublishDraftPanel,
  createPublishDraftResultPanel,
  createStatementModal,
  parsePublishDraftButtonId,
  parsePublishDraftModalId,
} from "./publishDraftPanel.js";
import { createDeliveryDmPanel } from "./deliveryDm.js";
import { createClaimSuccessPanel } from "./downloadSuccessPanel.js";
import {
  CLAIM_PICKER_SELECT_ID,
  createAssetClaimPanel,
  parseAssetClaimButtonId,
} from "./assetClaimPanel.js";
import {
  canUserOpenNewbieVerifyPanel,
  NewbieQuizService,
  createNewbieQuizEntryPanel,
  parseNewbieVerifyPanelOwnerIds,
  createNewbieQuizQuestionPanel,
  createNewbieQuizResultPanel,
  parseNewbieQuizButtonId,
  resolveNewbieQuizQuestions,
} from "./newbieQuiz.js";

const MESSAGE_CONTEXT_PUBLISH_NAME = "发布此消息附件作为作品";
const PASSCODE_MODAL_PREFIX = "protected_passcode_modal";
const PASSCODE_INPUT_ID = "passcode_value";

function buildPasscodeModalId(assetId) {
  return `${PASSCODE_MODAL_PREFIX}:${assetId}`;
}

function parsePasscodeModalId(customId) {
  const parts = String(customId).split(":");
  if (parts.length !== 2 || parts[0] !== PASSCODE_MODAL_PREFIX) {
    return null;
  }

  return {
    assetId: parts[1],
  };
}

function isThreadChannel(channel) {
  return (
    channel?.type === ChannelType.PublicThread ||
    channel?.type === ChannelType.PrivateThread ||
    channel?.type === ChannelType.AnnouncementThread
  );
}

function parsePostLink(link) {
  const trimmed = String(link ?? "").trim();

  try {
    const parsed = parseDiscordMessageLink(trimmed);
    return {
      guildId: parsed.guildId,
      channelId: parsed.channelId,
    };
  } catch {
    const match = trimmed.match(
      /^https:\/\/(?:canary\.|ptb\.)?discord\.com\/channels\/(\d+)\/(\d+)\/?$/,
    );

    if (!match) {
      throw new Error("帖子链接格式不正确，请粘贴完整 Discord 帖子链接。");
    }

    const [, guildId, channelId] = match;
    return { guildId, channelId };
  }
}

export function shouldCountReactionForAsset({
  asset,
  reactionMessageId,
  channelType,
  starterMessageId,
}) {
  if (!asset?.gateMessageId) {
    return false;
  }

  if (!["reaction", "reaction_or_comment"].includes(asset.baseMode)) {
    return false;
  }

  const isThread =
    channelType === ChannelType.PublicThread ||
    channelType === ChannelType.PrivateThread ||
    channelType === ChannelType.AnnouncementThread;

  if (isThread) {
    if (!starterMessageId) {
      return false;
    }

    return reactionMessageId === starterMessageId;
  }

  return reactionMessageId === asset.gateMessageId;
}

function isMessageAfterGate(messageId, gateMessageId) {
  try {
    return BigInt(messageId) > BigInt(gateMessageId);
  } catch {
    return messageId !== gateMessageId;
  }
}

function attachmentToRecord(attachment) {
  return {
    id: attachment.id,
    name: attachment.name ?? `attachment-${attachment.id}`,
    size: attachment.size ?? 0,
    url: attachment.url,
    contentType: attachment.contentType ?? null,
  };
}

function makeProgressSnapshot(progress) {
  return {
    reactionMet: Boolean(progress?.reactionMet),
    commentMet: Boolean(progress?.commentMet),
    passwordMet: Boolean(progress?.passwordMet),
    statementConfirmed: Boolean(progress?.statementConfirmed),
    deliveredAt: progress?.deliveredAt ?? null,
  };
}

function resolveProgress(storage, gateMessageId, userId) {
  const current = storage.getProgress(gateMessageId, userId);
  if (!current) {
    return {
      ...createEmptyProgress(),
      deliveredAt: null,
    };
  }

  return {
    reactionMet: current.reactionMet,
    commentMet: current.commentMet,
    passwordMet: current.passwordMet,
    statementConfirmed: current.statementConfirmed,
    deliveredAt: current.deliveredAt,
  };
}

function getPolicy(asset) {
  return parseAccessPolicy(asset.baseMode, asset.passcodeEnabled);
}

function formatMissingSteps(asset, progress) {
  const missing = listMissingConditions(getPolicy(asset), progress);
  if (missing.length === 0) {
    return "无";
  }

  return missing.join(" + ");
}

function formatDeliveredAt(timestamp) {
  if (!timestamp) {
    return "未知时间";
  }

  try {
    return new Date(timestamp).toLocaleString("zh-CN", {
      hour12: false,
    });
  } catch {
    return String(timestamp);
  }
}

function buildAssetPostLink(asset) {
  const guildId = String(asset?.guildId ?? "").trim();
  const channelId = String(asset?.gateChannelId ?? "").trim();

  if (guildId && channelId) {
    return `https://discord.com/channels/${guildId}/${channelId}`;
  }

  const sourceUrl = String(asset?.sourceUrl ?? "").trim();
  if (sourceUrl) {
    return sourceUrl;
  }

  return "未知链接";
}

function listRecentAssetsForChannel(storage, channelId, limit = 25) {
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(25, Math.trunc(limit))) : 25;
  return storage.listAssetsByGateChannel(channelId).slice(0, safeLimit);
}

async function sendTraceMessage({ client, traceChannelId, asset, userId, deliveredAt }) {
  if (!traceChannelId) {
    return;
  }

  try {
    const channel = await client.channels.fetch(traceChannelId).catch(() => null);
    if (!channel || !channel.isTextBased()) {
      return;
    }

    const fileNames = (asset.attachments ?? [])
      .map((item) => item.name)
      .filter(Boolean)
      .join("、");

    await channel.send({
      content: [
        "溯源记录",
        `用户：<@${userId}>`,
        `用户ID：${userId}`,
        `作品ID：${asset.id}`,
        `帖子链接：${buildAssetPostLink(asset)}`,
        `文件：${fileNames || "未知文件"}`,
        `领取时间：${formatDeliveredAt(deliveredAt)}`,
      ].join("\n"),
    });
  } catch (error) {
    console.error("Trace message failed:", error);
  }
}

async function deleteAssetWithFiles({ storage, fileStore, assetId }) {
  const asset = storage.getAssetById(assetId);
  if (!asset) {
    return false;
  }

  const deleted = storage.deleteAssetById(assetId);
  if (!deleted) {
    return false;
  }

  if (fileStore?.enabled) {
    await fileStore.deleteFilesForAttachments(asset.attachments).catch((error) => {
      console.error(`Cleanup mirrored files failed for asset ${assetId}:`, error);
    });
  }

  return true;
}

async function deliverAssetToUser({ client, storage, asset, userId, quotaText }) {
  const progress = storage.getProgress(asset.gateMessageId, userId);
  const alreadyDelivered = Boolean(progress?.deliveredAt);

  const sentAt = Date.now();
  const user = await client.users.fetch(userId);
  await user.send(createDeliveryDmPanel({ asset, quotaText, sentAt }));

  const snapshot = makeProgressSnapshot(progress ?? createEmptyProgress());
  storage.saveProgress(asset.gateMessageId, userId, {
    ...snapshot,
    deliveredAt: sentAt,
  });

  return {
    delivered: true,
    alreadyDelivered,
    deliveredAt: sentAt,
  };
}


async function processSignal({ storage, asset, userId, signal }) {
  if (!asset?.gateMessageId) {
    return { changed: false, completed: false, progress: null };
  }

  const policy = getPolicy(asset);
  if (!isSignalRelevant(policy, signal)) {
    const progress = resolveProgress(storage, asset.gateMessageId, userId);
    return {
      changed: false,
      completed: isAccessComplete(policy, progress),
      progress,
    };
  }

  const current = resolveProgress(storage, asset.gateMessageId, userId);
  const next = applyUnlockSignal(policy, current, signal);

  const saved = storage.saveProgress(asset.gateMessageId, userId, {
    reactionMet: next.reactionMet,
    commentMet: next.commentMet,
    passwordMet: next.passwordMet,
    statementConfirmed: next.statementConfirmed,
    deliveredAt: current.deliveredAt,
  });

  return {
    changed: true,
    completed: next.completed,
    progress: {
      reactionMet: saved.reactionMet,
      commentMet: saved.commentMet,
      passwordMet: saved.passwordMet,
      statementConfirmed: saved.statementConfirmed,
      deliveredAt: saved.deliveredAt,
    },
  };
}

async function claimIfEligible({ client, storage, asset, userId, dailyDownloadLimit, traceChannelId }) {
  if (!asset?.gateMessageId) {
    throw new Error("未找到对应的受保护附件。请检查 gate_id。");
  }

  const policy = getPolicy(asset);
  const progress = resolveProgress(storage, asset.gateMessageId, userId);

  if (!isAccessComplete(policy, progress)) {
    return {
      success: false,
      reason: `你还没满足下载条件，缺少：${formatMissingSteps(asset, progress)}`,
      progress,
    };
  }

  if (asset.statementEnabled && !progress.statementConfirmed) {
    return {
      success: false,
      reason: "请先确认作者声明，再点击下载。",
      requireStatementConfirm: true,
      progress,
    };
  }

  const todayKey = toDateKey();
  const usedToday = storage.getDailyUsage(userId, todayKey);
  const quotaCheck = evaluateDailyQuota({
    quotaPolicy: asset.quotaPolicy,
    dailyLimit: dailyDownloadLimit,
    usedToday,
  });

  if (!quotaCheck.allowed) {
    return {
      success: false,
      reason: quotaCheck.reason,
      progress,
      quota: quotaCheck,
    };
  }

  try {
    const quotaPreview = `${usedToday + 1}/${dailyDownloadLimit}`;
    const delivered = await deliverAssetToUser({
      client,
      storage,
      asset,
      userId,
      quotaText: quotaPreview,
    });

    await sendTraceMessage({
      client,
      traceChannelId,
      asset,
      userId,
      deliveredAt: delivered.deliveredAt,
    });

    if (delivered.alreadyDelivered) {
      return {
        success: true,
        alreadyDelivered: true,
        reason: `你已领取过该作品，已重新发送到你的私信。${quotaCheck.reason}`,
        progress,
        quota: quotaCheck,
      };
    }

    const nextUsed = storage.incrementDailyUsage(userId, todayKey, 1);

    return {
      success: true,
      alreadyDelivered: false,
      reason: `附件已发到你的私信。今日下载额度：${nextUsed}/${dailyDownloadLimit}`,
      progress,
      quota: {
        allowed: true,
        usedToday: nextUsed,
        dailyLimit: dailyDownloadLimit,
      },
    };
  } catch (error) {
    return {
      success: false,
      reason: `私信发送失败：${error.message}`,
      progress,
      quota: quotaCheck,
    };
  }
}

function parseRuleOptions(interaction) {
  const mode = interaction.options.getString("mode", true);
  const enablePasscode = interaction.options.getBoolean("enable_passcode", false) ?? false;
  const passcodeRaw = interaction.options.getString("passcode", false) ?? "";
  const passcode = passcodeRaw.trim();
  const passcodeEnabled = enablePasscode || passcode.length > 0;

  if (passcodeEnabled && passcode.length === 0) {
    throw new Error("启用提取码时，passcode 不能为空。");
  }

  const quotaPolicy = interaction.options.getString("quota_policy", false) ?? "open_share";

  if (!["open_share", "daily_limited"].includes(quotaPolicy)) {
    throw new Error("不支持的获取次数策略。");
  }

  const statementRaw = interaction.options.getString("statement", false) ?? "";
  const statementText = statementRaw.trim();

  const policy = parseAccessPolicy(mode, passcodeEnabled);

  return {
    policy,
    passcode,
    passcodeEnabled,
    quotaPolicy,
    statementEnabled: statementText.length > 0,
    statementText: statementText.length > 0 ? statementText : null,
  };
}

async function publishAssetPanel({
  client,
  storage,
  fileStore,
  guildId,
  gateChannel,
  gateChannelId,
  mode,
  ownerUserId,
  sourceType,
  sourceChannelId,
  sourceMessageId,
  sourceUrl,
  attachments,
  passcodeEnabled,
  passcode,
  quotaPolicy,
  statementEnabled,
  statementText,
  passwordSalt,
}) {
  if (!gateChannel?.isTextBased()) {
    throw new Error("目标频道不可发送消息。");
  }

  if (passcodeEnabled && !passcode.trim()) {
    throw new Error("启用提取码后必须输入提取码内容。");
  }

  let mirroredAttachments = attachments;
  let mirroredAtServer = false;

  if (fileStore?.enabled) {
    const mirrored = await fileStore.mirrorAttachments(attachments, {
      scopeKey: randomUUID(),
    });
    mirroredAttachments = mirrored.attachments;
    mirroredAtServer = true;
  }

  let asset;
  try {
    asset = storage.createAsset({
      guildId,
      ownerUserId,
      gateChannelId,
      sourceType,
      sourceChannelId,
      sourceMessageId,
      sourceUrl,
      unlockMode: mode,
      baseMode: mode,
      passcodeEnabled,
      passwordHash: passcodeEnabled ? hashPassword(passcode.trim(), passwordSalt) : null,
      quotaPolicy,
      statementEnabled,
      statementText,
      attachments: mirroredAttachments,
    });
  } catch (error) {
    if (mirroredAtServer) {
      await fileStore.deleteFilesForAttachments(mirroredAttachments).catch(() => {});
    }
    throw error;
  }

  let gateMessage;
  try {
    gateMessage = await gateChannel.send(createGatePanel(asset));
  } catch (error) {
    await deleteAssetWithFiles({
      storage,
      fileStore,
      assetId: asset.id,
    });
    throw error;
  }

  const bound = storage.bindGateMessage(asset.id, gateMessage.id);

  let sourceMessageDeleted = false;
  let sourceDeleteError = null;

  if (sourceChannelId && sourceMessageId) {
    try {
      const sourceChannel = await client.channels.fetch(sourceChannelId).catch(() => null);
      if (sourceChannel?.isTextBased()) {
        const sourceMessage = await sourceChannel.messages.fetch(sourceMessageId).catch(() => null);
        if (sourceMessage && sourceMessage.id !== gateMessage.id) {
          await sourceMessage.delete();
          sourceMessageDeleted = true;
        }
      }
    } catch (error) {
      sourceDeleteError = error;
    }
  }

  if (bound.baseMode === "reaction" || bound.baseMode === "reaction_or_comment") {
    gateMessage.react("👍").catch(() => {});
  }

  return {
    ...bound,
    sourceMessageDeleted,
    sourceDeleteError:
      sourceDeleteError instanceof Error ? sourceDeleteError.message : sourceDeleteError,
  };
}

async function fetchMessageFromLink(interaction, messageLink) {
  const parsed = parseDiscordMessageLink(messageLink);

  if (interaction.guildId !== parsed.guildId) {
    throw new Error("消息链接必须属于当前服务器。");
  }

  const channel = await interaction.guild.channels.fetch(parsed.channelId);
  if (!channel || !channel.isTextBased()) {
    throw new Error("无法访问目标频道。请检查机器人权限。");
  }

  const message = await channel.messages.fetch(parsed.messageId);
  return { channel, message };
}

async function handleSendProtected(interaction, deps) {
  const file = interaction.options.getAttachment("file", true);
  const { policy, passcode, passcodeEnabled, quotaPolicy, statementEnabled, statementText } =
    parseRuleOptions(interaction);

  const asset = await publishAssetPanel({
    client: deps.client,
    storage: deps.storage,
    fileStore: deps.fileStore,
    guildId: interaction.guildId,
    gateChannel: interaction.channel,
    gateChannelId: interaction.channelId,
    mode: policy.mode,
    ownerUserId: interaction.user.id,
    sourceType: "upload",
    sourceChannelId: interaction.channelId,
    sourceMessageId: null,
    sourceUrl: null,
    attachments: [attachmentToRecord(file)],
    passcodeEnabled,
    passcode,
    quotaPolicy,
    statementEnabled,
    statementText,
    passwordSalt: deps.passwordSalt,
  });

  await interaction.reply({
    content: [
      `已创建作品下载面板，门票消息 ID：\`${asset.gateMessageId}\``,
      `面板按钮：\`${buildAssetCustomId("download", asset.id)}\``,
      asset.sourceMessageDeleted ? "已自动删除原始附件消息。" : null,
      asset.sourceDeleteError ? `原始附件消息删除失败：${asset.sourceDeleteError}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
    flags: MessageFlags.Ephemeral,
  });
}

async function handleProtectMessage(interaction, deps) {
  const messageLink = interaction.options.getString("message_link", true);
  const { policy, passcode, passcodeEnabled, quotaPolicy, statementEnabled, statementText } =
    parseRuleOptions(interaction);

  const { message } = await fetchMessageFromLink(interaction, messageLink);
  const attachments = [...message.attachments.values()].map(attachmentToRecord);

  if (attachments.length === 0) {
    throw new Error("目标消息没有可保护的附件。");
  }

  const asset = await publishAssetPanel({
    client: deps.client,
    storage: deps.storage,
    fileStore: deps.fileStore,
    guildId: interaction.guildId,
    gateChannel: interaction.channel,
    gateChannelId: interaction.channelId,
    mode: policy.mode,
    ownerUserId: interaction.user.id,
    sourceType: "message_link",
    sourceChannelId: message.channelId,
    sourceMessageId: message.id,
    sourceUrl: message.url,
    attachments,
    passcodeEnabled,
    passcode,
    quotaPolicy,
    statementEnabled,
    statementText,
    passwordSalt: deps.passwordSalt,
  });

  await interaction.reply({
    content: [
      `已保护目标消息附件，门票消息 ID：\`${asset.gateMessageId}\``,
      asset.sourceMessageDeleted ? "已自动删除原始附件消息。" : null,
      asset.sourceDeleteError ? `原始附件消息删除失败：${asset.sourceDeleteError}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
    flags: MessageFlags.Ephemeral,
  });
}


function ensureDraftOwner(interaction, draft) {
  if (draft.ownerUserId !== interaction.user.id) {
    throw new Error("只有发起该面板的用户可以操作。");
  }
}

async function handleMessageContextCommand(interaction, deps) {
  if (interaction.commandName !== MESSAGE_CONTEXT_PUBLISH_NAME) {
    await interaction.reply({
      content: `暂不支持的消息菜单命令：${interaction.commandName}`,
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  const targetMessage = interaction.targetMessage;
  const attachments = [...targetMessage.attachments.values()].map(attachmentToRecord);

  if (attachments.length === 0) {
    throw new Error("该消息没有可导入的附件。请先在消息中上传附件。");
  }

  const draft = deps.draftStore.create({
    ownerUserId: interaction.user.id,
    guildId: interaction.guildId,
    gateChannelId: targetMessage.channelId,
    sourceType: "message_context",
    sourceChannelId: targetMessage.channelId,
    sourceMessageId: targetMessage.id,
    sourceUrl: targetMessage.url,
    attachments,
    mode: "none",
    passcodeEnabled: false,
    passcode: "",
    quotaPolicy: "open_share",
    statementEnabled: false,
    statementText: "",
  });

  await interaction.reply(createPublishDraftPanel(draft, { ephemeral: true }));
  return true;
}

async function handleProtectedAttachmentCommand(interaction, deps) {
  const file = interaction.options.getAttachment("file", true);
  const attachment = attachmentToRecord(file);

  const draft = deps.draftStore.create({
    ownerUserId: interaction.user.id,
    guildId: interaction.guildId,
    gateChannelId: interaction.channelId,
    sourceType: "slash_attachment",
    sourceChannelId: interaction.channelId,
    sourceMessageId: null,
    sourceUrl: null,
    attachments: [attachment],
    mode: "none",
    passcodeEnabled: false,
    passcode: "",
    quotaPolicy: "open_share",
    statementEnabled: false,
    statementText: "",
    modeOnly: true,
  });

  await interaction.reply(createPublishDraftPanel(draft, { ephemeral: true }));
}

async function finalizePublishDraft(interaction, deps, draft) {
  if (draft.passcodeEnabled && !draft.passcode.trim()) {
    await interaction.reply({
      content: "你已启用提取码，请先点击“输入提取码”填写内容。",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const gateChannel = await deps.client.channels.fetch(draft.gateChannelId).catch(() => null);
  if (!gateChannel || !gateChannel.isTextBased()) {
    throw new Error("无法访问原消息所在频道，请检查机器人权限。");
  }

  const asset = await publishAssetPanel({
    client: deps.client,
    storage: deps.storage,
    fileStore: deps.fileStore,
    guildId: draft.guildId,
    gateChannel,
    gateChannelId: draft.gateChannelId,
    mode: draft.mode,
    ownerUserId: draft.ownerUserId,
    sourceType: draft.sourceType,
    sourceChannelId: draft.sourceChannelId,
    sourceMessageId: draft.sourceMessageId,
    sourceUrl: draft.sourceUrl,
    attachments: draft.attachments,
    passcodeEnabled: draft.passcodeEnabled,
    passcode: draft.passcode,
    quotaPolicy: draft.quotaPolicy,
    statementEnabled: draft.statementEnabled,
    statementText: draft.statementText,
    passwordSalt: deps.passwordSalt,
  });

  deps.draftStore.delete(draft.id);

  await interaction.update(
    createPublishDraftResultPanel({
      title: "已发布",
      body: [
        "作品发布处已发送到原帖。",
        "请回到帖子查看新消息，并点击“获取作品”测试。",
        asset.sourceDeleteError ? `原始附件消息删除失败：${asset.sourceDeleteError}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      success: true,
    }),
  );
}

async function handlePublishDraftButton(interaction, deps, parsed) {
  const draft = deps.draftStore.get(parsed.draftId);
  if (!draft) {
    await interaction.reply({
      content: "该发布面板已过期或不存在，请重新从消息发起。",
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  ensureDraftOwner(interaction, draft);
  const modeOnly = Boolean(draft.modeOnly);

  if (
    modeOnly &&
    !["set_mode", "publish", "cancel"].includes(parsed.action)
  ) {
    await interaction.reply({
      content: "当前面板仅支持选择验证模式后直接发布。",
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  if (parsed.action === "edit_passcode") {
    await interaction.showModal(createPasscodeModal(draft));
    return true;
  }

  if (parsed.action === "edit_statement") {
    await interaction.showModal(createStatementModal(draft));
    return true;
  }

  if (parsed.action === "publish") {
    await finalizePublishDraft(interaction, deps, draft);
    return true;
  }

  if (parsed.action === "cancel") {
    deps.draftStore.delete(draft.id);
    await interaction.update(
      createPublishDraftResultPanel({
        title: "已取消",
        body: "本次作品发布已取消，可重新从消息菜单发起。",
        success: false,
      }),
    );
    return true;
  }

  let updated = draft;

  if (parsed.action === "set_mode") {
    if (!["none", "reaction", "reaction_or_comment"].includes(parsed.value)) {
      throw new Error("不支持的模式选择。");
    }
    updated = deps.draftStore.update(draft.id, { mode: parsed.value });
  }

  if (parsed.action === "toggle_passcode") {
    updated = deps.draftStore.update(draft.id, {
      passcodeEnabled: !draft.passcodeEnabled,
    });
  }

  if (parsed.action === "clear_passcode") {
    updated = deps.draftStore.update(draft.id, {
      passcode: "",
      passcodeEnabled: false,
    });
  }

  if (parsed.action === "set_quota") {
    if (!["open_share", "daily_limited"].includes(parsed.value)) {
      throw new Error("不支持的获取次数策略。");
    }
    updated = deps.draftStore.update(draft.id, { quotaPolicy: parsed.value });
  }

  if (parsed.action === "toggle_statement") {
    updated = deps.draftStore.update(draft.id, {
      statementEnabled: !draft.statementEnabled,
    });
  }

  if (parsed.action === "set_statement") {
    if (!["on", "off"].includes(parsed.value)) {
      throw new Error("不支持的声明状态。");
    }

    updated = deps.draftStore.update(draft.id, {
      statementEnabled: parsed.value === "on",
      statementText: parsed.value === "off" ? "" : draft.statementText,
    });
  }

  if (!updated) {
    throw new Error("面板状态更新失败，请重试。");
  }

  await interaction.update(createPublishDraftPanel(updated));
  return true;
}

async function handlePublishDraftModal(interaction, deps) {
  const parsed = parsePublishDraftModalId(interaction.customId);
  if (!parsed) {
    return false;
  }

  const draft = deps.draftStore.get(parsed.draftId);
  if (!draft) {
    await interaction.reply({
      content: "该发布面板已过期或不存在，请重新从消息发起。",
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  ensureDraftOwner(interaction, draft);

  if (parsed.kind === "passcode") {
    const passcode = interaction.fields.getTextInputValue(DRAFT_PASSCODE_FIELD_ID).trim();
    const updated = deps.draftStore.update(draft.id, {
      passcode,
      passcodeEnabled: passcode.length > 0,
    });

    await interaction.update(createPublishDraftPanel(updated));
    return true;
  }

  if (parsed.kind === "statement") {
    const statementText = interaction.fields.getTextInputValue(DRAFT_STATEMENT_FIELD_ID).trim();
    const updated = deps.draftStore.update(draft.id, {
      statementText,
      statementEnabled: statementText.length > 0 ? true : draft.statementEnabled,
    });

    await interaction.update(createPublishDraftPanel(updated));
    return true;
  }

  return false;
}

async function handleInputPassword(interaction, deps) {
  const gateId = interaction.options.getString("gate_id", true).trim();
  const password = interaction.options.getString("password", true).trim();

  const asset = deps.storage.getAssetByGateMessageId(gateId);
  if (!asset) {
    throw new Error("未找到该 gate_id 对应的受保护附件。");
  }

  if (!asset.passcodeEnabled) {
    throw new Error("该作品未启用提取码。请直接点击下载。 ");
  }

  if (!verifyPassword(password, deps.passwordSalt, asset.passwordHash)) {
    await interaction.reply({
      content: "提取码错误，请重试。",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const signal = await processSignal({
    storage: deps.storage,
    asset,
    userId: interaction.user.id,
    signal: "password",
  });

  if (signal.completed) {
    await interaction.reply({
      content: "提取码正确，条件已满足。请点击下载按钮领取附件。",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const progress = signal.progress ?? resolveProgress(deps.storage, gateId, interaction.user.id);
  await interaction.reply({
    content: `提取码正确，还缺少：${formatMissingSteps(asset, progress)}`,
    flags: MessageFlags.Ephemeral,
  });
}

async function handleClaimProtected(interaction, deps) {
  const gateId = interaction.options.getString("gate_id", true).trim();
  const asset = deps.storage.getAssetByGateMessageId(gateId);

  if (!asset) {
    throw new Error("未找到该 gate_id 对应的受保护附件。");
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const result = await claimIfEligible({
    client: deps.client,
    storage: deps.storage,
    asset,
    userId: interaction.user.id,
    dailyDownloadLimit: deps.dailyDownloadLimit,
    traceChannelId: deps.traceChannelId,
  });

  if (result.requireStatementConfirm) {
    await interaction.editReply(createStatementConfirmPanel(asset));
    return;
  }

  if (result.success) {
    await interaction.editReply(
      createClaimSuccessPanel({
        asset,
        quota: result.quota,
        dailyDownloadLimit: deps.dailyDownloadLimit,
        feedbackChannelId: deps.feedbackChannelId,
        alreadyDelivered: result.alreadyDelivered ?? false,
      }),
    );
    return;
  }

  await interaction.editReply({
    content: result.reason,
    components: [],
  });
}

async function handleClaimByAssetId(interaction, deps) {
  const assetId = interaction.options.getString("asset_id", true).trim();
  const asset = deps.storage.getAssetById(assetId);

  if (!asset) {
    throw new Error("未找到该作品ID对应的发布处。请确认输入正确。");
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const result = await claimIfEligible({
    client: deps.client,
    storage: deps.storage,
    asset,
    userId: interaction.user.id,
    dailyDownloadLimit: deps.dailyDownloadLimit,
    traceChannelId: deps.traceChannelId,
  });

  if (result.requireStatementConfirm) {
    await interaction.editReply(createStatementConfirmPanel(asset));
    return;
  }

  if (result.success) {
    await interaction.editReply(
      createClaimSuccessPanel({
        asset,
        quota: result.quota,
        dailyDownloadLimit: deps.dailyDownloadLimit,
        feedbackChannelId: deps.feedbackChannelId,
        alreadyDelivered: result.alreadyDelivered ?? false,
      }),
    );
    return;
  }

  await interaction.editReply({
    content: result.reason,
    components: [],
  });
}

async function handleDeletePost(interaction, deps) {
  const postLink = interaction.options.getString("post_link", true).trim();
  const parsed = parsePostLink(postLink);

  if (interaction.guildId !== parsed.guildId) {
    throw new Error("帖子链接必须属于当前服务器。");
  }

  const channel = await interaction.guild.channels.fetch(parsed.channelId).catch(() => null);
  if (!channel || !isThreadChannel(channel)) {
    throw new Error("未找到对应帖子，请确认链接是否正确。");
  }

  const canManage = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
  const isPostOwner = channel.ownerId === interaction.user.id;

  if (!canManage && !isPostOwner) {
    throw new Error("仅帖子作者或管理方可以删除整帖。");
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  let postDeleted = false;
  let postDeleteError = null;

  try {
    await channel.delete("delete-post command");
    postDeleted = true;
  } catch (error) {
    postDeleteError = error;
  }

  const deletedAssetIds = [];
  if (postDeleted) {
    const assets = deps.storage.listAssetsByGateChannel(channel.id);
    for (const asset of assets) {
      const deleted = await deleteAssetWithFiles({
        storage: deps.storage,
        fileStore: deps.fileStore,
        assetId: asset.id,
      });
      if (deleted) {
        deletedAssetIds.push(asset.id);
      }
    }
  }

  await interaction.editReply({
    content: [
      postDeleted ? "已删除整个帖子。" : "帖子删除失败，请检查机器人权限。",
      postDeleted
        ? `已清理作品记录：${deletedAssetIds.length} 条${deletedAssetIds.length ? `（${deletedAssetIds.join("、")}）` : ""}`
        : "帖子未删除，作品记录保持不变。",
      postDeleteError instanceof Error ? `删除失败原因：${postDeleteError.message}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
    components: [],
  });
}


async function handleTop(interaction) {
  const channel = interaction.channel;
  if (!isThreadChannel(channel)) {
    throw new Error("/top 只能在帖子/线程内使用。");
  }

  const starter = await channel.fetchStarterMessage();
  if (!starter) {
    throw new Error("无法获取首楼消息。请确认机器人有读取历史消息权限。");
  }

  const link = buildThreadTopLink({
    guildId: interaction.guildId,
    threadId: channel.id,
    starterMessageId: starter.id,
  });

  await interaction.reply(createTopJumpMessage(link));
}

async function handleFetchAttachments(interaction, deps) {
  const channel = interaction.channel;
  if (!channel || !channel.isTextBased()) {
    throw new Error("当前频道不支持附件获取列表。");
  }

  const assets = listRecentAssetsForChannel(deps.storage, interaction.channelId, 25);
  if (assets.length === 0) {
    await interaction.reply({
      content: "📂 当前频道暂无可获取附件。请先发布作品后再试。",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.reply(createAssetClaimPanel({ assets }));
}

async function handleNewbieVerify(interaction, deps) {
  if (!canUserOpenNewbieVerifyPanel(deps.newbieVerifyPanelOwnerIds, interaction.user.id)) {
    throw new Error("你没有权限使用该命令。");
  }

  await interaction.reply(
    createNewbieQuizEntryPanel({
      questionCount: deps.newbieQuiz.questionCount,
    }),
  );
}

async function handleCommand(interaction, deps) {
  try {
    if (interaction.commandName === "send-protected") {
      await handleSendProtected(interaction, deps);
      return;
    }

    if (interaction.commandName === "protect-message") {
      await handleProtectMessage(interaction, deps);
      return;
    }

    if (interaction.commandName === "input-password") {
      await handleInputPassword(interaction, deps);
      return;
    }

    if (interaction.commandName === "claim-protected") {
      await handleClaimProtected(interaction, deps);
      return;
    }

    if (interaction.commandName === "claim-by-id") {
      await handleClaimByAssetId(interaction, deps);
      return;
    }

    if (interaction.commandName === "delete-post") {
      await handleDeletePost(interaction, deps);
      return;
    }

    if (interaction.commandName === "top") {
      await handleTop(interaction);
      return;
    }

    if (interaction.commandName === "fetch-attachments") {
      await handleFetchAttachments(interaction, deps);
      return;
    }

    if (interaction.commandName === "newbie-verify") {
      await handleNewbieVerify(interaction, deps);
      return;
    }

    if (interaction.commandName === "protected-attachment") {
      await handleProtectedAttachmentCommand(interaction, deps);
      return;
    }

  } catch (error) {
    const payload = {
      content: `操作失败：${error.message}`,
      flags: MessageFlags.Ephemeral,
    };

    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(payload).catch(() => {});
    } else {
      await interaction.reply(payload).catch(() => {});
    }
  }
}

async function handleDownloadButton(interaction, deps, asset) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const result = await claimIfEligible({
    client: deps.client,
    storage: deps.storage,
    asset,
    userId: interaction.user.id,
    dailyDownloadLimit: deps.dailyDownloadLimit,
    traceChannelId: deps.traceChannelId,
  });

  if (result.requireStatementConfirm) {
    await interaction.editReply(createStatementConfirmPanel(asset));
    return;
  }

  if (result.success) {
    const alreadyDelivered = result.alreadyDelivered ?? false;
    await interaction.editReply(
      createClaimSuccessPanel({
        asset,
        quota: result.quota,
        dailyDownloadLimit: deps.dailyDownloadLimit,
        feedbackChannelId: deps.feedbackChannelId,
        alreadyDelivered,
      }),
    );
    return;
  }

  await interaction.editReply({
    content: result.reason,
    components: [],
  });
}

async function handlePasscodeButton(interaction, asset) {
  if (!asset.passcodeEnabled) {
    await interaction.reply({
      content: "该作品未启用提取码。",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(buildPasscodeModalId(asset.id))
    .setTitle("输入提取码");

  const input = new TextInputBuilder()
    .setCustomId(PASSCODE_INPUT_ID)
    .setLabel("提取码")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(100);

  modal.addComponents(new ActionRowBuilder().addComponents(input));
  await interaction.showModal(modal);
}

async function handleConfirmStatement(interaction, deps, asset) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const signal = await processSignal({
    storage: deps.storage,
    asset,
    userId: interaction.user.id,
    signal: "statement",
  });

  if (!signal.completed) {
    await interaction.editReply({
      content: "声明已确认。请先满足下载条件后，再点击下载。",
      components: [],
    });
    return;
  }

  const result = await claimIfEligible({
    client: deps.client,
    storage: deps.storage,
    asset,
    userId: interaction.user.id,
    dailyDownloadLimit: deps.dailyDownloadLimit,
    traceChannelId: deps.traceChannelId,
  });

  await interaction.editReply({
    content: result.reason,
    components: [],
  });
}

async function handleAssetClaimSelect(interaction, deps) {
  if (interaction.customId !== CLAIM_PICKER_SELECT_ID) {
    return false;
  }

  const assets = listRecentAssetsForChannel(deps.storage, interaction.channelId, 25);
  if (assets.length === 0) {
    await interaction.update({
      content: "📂 当前频道暂无可获取附件。请重新执行 /获取附件。",
      components: [],
    });
    return true;
  }

  const selectedAssetId = interaction.values?.[0] ?? "";
  await interaction.update(
    createAssetClaimPanel({
      assets,
      selectedAssetId,
      includeFlags: false,
    }),
  );
  return true;
}

async function handleButton(interaction, deps) {
  const privateFlags = interaction.inGuild() ? MessageFlags.Ephemeral : undefined;

  const newbieAction = parseNewbieQuizButtonId(interaction.customId);
  if (newbieAction) {
    if (newbieAction.action === "start") {
      const session = deps.newbieQuiz.startSession(interaction.user.id);
      const firstQuestion = deps.newbieQuiz.questions[0];

      await interaction.reply(
        createNewbieQuizQuestionPanel({
          question: session.questions[0] ?? firstQuestion,
          sessionId: session.id,
          index: 0,
          total: session.total,
          includeFlags: interaction.inGuild(),
        }),
      );
      return;
    }

    if (newbieAction.action === "answer") {
      const result = deps.newbieQuiz.answer({
        sessionId: newbieAction.sessionId,
        userId: interaction.user.id,
        option: newbieAction.option,
      });

      if (result.status === "expired") {
        const payload = {
          content: "答题会话已过期，请点击“开始答题验证”重新开始。",
        };
        if (privateFlags) {
          payload.flags = privateFlags;
        }
        await interaction.reply(payload);
        return;
      }

      if (result.status === "forbidden") {
        const payload = {
          content: "该答题会话不属于你，请自行点击“开始答题验证”。",
        };
        if (privateFlags) {
          payload.flags = privateFlags;
        }
        await interaction.reply(payload);
        return;
      }

      if (result.status === "failed") {
        await interaction.update(
          createNewbieQuizResultPanel({
            title: "验证未通过",
            message: `回答错误（正确选项：${result.correctOption}）。请回到验证面板重新开始。`,
          }),
        );
        return;
      }

      if (result.status === "passed") {
        let roleMessage = "验证通过。";
        const roleId = String(deps.newbieVerifiedRoleId ?? "").trim();

        if (interaction.guild && roleId) {
          const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
          if (member) {
            const added = await member.roles.add(roleId).then(() => true).catch(() => false);
            roleMessage = added
              ? `验证通过，已发放身份组：<@&${roleId}>`
              : "验证通过，但身份组发放失败，请联系管理员手动处理。";
          } else {
            roleMessage = "验证通过，但无法找到你的成员信息，身份组发放失败。";
          }
        } else if (!roleId) {
          roleMessage = "验证通过。当前未配置自动发放身份组。";
        }

        await interaction.update(
          createNewbieQuizResultPanel({
            title: "验证通过",
            message: roleMessage,
          }),
        );
        return;
      }

      if (result.status === "next") {
        await interaction.update(
          createNewbieQuizQuestionPanel({
            question: result.nextQuestion,
            sessionId: newbieAction.sessionId,
            index: result.index,
            total: result.total,
            includeFlags: false,
          }),
        );
        return;
      }

      await interaction.reply({
        content: "无效答题选项，请重新开始验证。",
        ...(privateFlags ? { flags: privateFlags } : {}),
      });
      return;
    }
  }

  const pickerAction = parseAssetClaimButtonId(interaction.customId);
  if (pickerAction) {
    if (pickerAction.action !== "claim") {
      return;
    }

    const assetId = String(pickerAction.assetId ?? "").trim();
    if (!assetId) {
      await interaction.reply({
        content: "请先从下拉菜单里选择要获取的附件。",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const asset = deps.storage.getAssetById(assetId);
    if (!asset || asset.gateChannelId !== interaction.channelId) {
      await interaction.reply({
        content: "该附件包已失效或不在当前频道，请重新执行 /获取附件。",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await handleDownloadButton(interaction, deps, asset);
    return;
  }

  const draftAction = parsePublishDraftButtonId(interaction.customId);
  if (draftAction) {
    await handlePublishDraftButton(interaction, deps, draftAction);
    return;
  }

  const parsed = parseAssetCustomId(interaction.customId);
  if (!parsed) {
    return;
  }

  const asset = deps.storage.getAssetById(parsed.assetId);
  if (!asset) {
    await interaction.reply({
      content: "该面板已失效或作品不存在。",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (parsed.action === "download") {
    await handleDownloadButton(interaction, deps, asset);
    return;
  }

  if (parsed.action === "passcode") {
    await handlePasscodeButton(interaction, asset);
    return;
  }

  if (parsed.action === "remove_gate") {
    if (asset.ownerUserId !== interaction.user.id) {
      await interaction.reply({
        content: "只有作品发布者可以移除发布处。",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferUpdate();
    await deleteAssetWithFiles({
      storage: deps.storage,
      fileStore: deps.fileStore,
      assetId: asset.id,
    });
    await interaction.message.delete().catch(() => {});
    await interaction.followUp({
      content: "已移除本条发布处。",
      flags: MessageFlags.Ephemeral,
    }).catch(() => {});
    return;
  }

  if (parsed.action === "replace_gate") {
    if (asset.ownerUserId !== interaction.user.id) {
      await interaction.reply({
        content: "只有作品发布者可以放置新的发布处。",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const channel = interaction.channel;
    if (!channel || !channel.isTextBased()) {
      await interaction.editReply({
        content: "无法访问当前频道，请检查权限。",
      });
      return;
    }

    const newGateMessage = await channel.send(createGatePanel(asset));
    const rebound = deps.storage.bindGateMessage(asset.id, newGateMessage.id);
    if (rebound.baseMode === "reaction" || rebound.baseMode === "reaction_or_comment") {
      newGateMessage.react("👍").catch(() => {});
    }

    if (interaction.message.id !== newGateMessage.id) {
      interaction.message.delete().catch(() => {});
    }

    await interaction.editReply({
      content: `已放置新的作品发布处：${newGateMessage.url}`,
    });
    return;
  }

  if (parsed.action === "toggle_pin") {
    if (asset.ownerUserId !== interaction.user.id) {
      await interaction.reply({
        content: "只有作品发布者可以标注/取消标注本消息。",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (interaction.message.pinned) {
      await interaction.message.unpin().catch(() => {});
      await interaction.reply({
        content: "已取消标注本消息。",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.message.pin().catch(() => {});
    await interaction.reply({
      content: "已标注本消息。",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (parsed.action === "confirm_statement") {
    await handleConfirmStatement(interaction, deps, asset);
  }
}

async function handlePasscodeModal(interaction, deps) {
  const handledDraft = await handlePublishDraftModal(interaction, deps);
  if (handledDraft) {
    return;
  }

  const parsed = parsePasscodeModalId(interaction.customId);
  if (!parsed) {
    return;
  }

  const asset = deps.storage.getAssetById(parsed.assetId);
  if (!asset) {
    await interaction.reply({
      content: "该面板已失效或作品不存在。",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const password = interaction.fields.getTextInputValue(PASSCODE_INPUT_ID).trim();

  if (!asset.passcodeEnabled) {
    await interaction.reply({
      content: "该作品未启用提取码。",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!verifyPassword(password, deps.passwordSalt, asset.passwordHash)) {
    await interaction.reply({
      content: "提取码错误，请重试。",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const signal = await processSignal({
    storage: deps.storage,
    asset,
    userId: interaction.user.id,
    signal: "password",
  });

  if (signal.completed) {
    await interaction.reply({
      content: "提取码验证成功，请点击下载按钮领取附件。",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const progress = signal.progress ?? resolveProgress(deps.storage, asset.gateMessageId, interaction.user.id);
  await interaction.reply({
    content: `提取码验证成功，还缺少：${formatMissingSteps(asset, progress)}`,
    flags: MessageFlags.Ephemeral,
  });
}

async function handleSelectMenu(interaction, deps) {
  return handleAssetClaimSelect(interaction, deps);
}

export function createBot({
  token,
  storage,
  fileStore = null,
  passwordSalt,
  dailyDownloadLimit,
  feedbackChannelId = "",
  traceChannelId = "",
  newbieVerifiedRoleId = "",
  newbieQuizQuestionsRaw = "",
  newbieVerifyPanelOwnerIds = "",
}) {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildMessageReactions,
      GatewayIntentBits.DirectMessages,
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction],
  });

  const deps = {
    client,
    storage,
    fileStore,
    passwordSalt,
    dailyDownloadLimit,
    feedbackChannelId,
    traceChannelId,
    newbieVerifiedRoleId,
    newbieVerifyPanelOwnerIds: parseNewbieVerifyPanelOwnerIds(newbieVerifyPanelOwnerIds),
    draftStore: new PublishDraftStore(),
    newbieQuiz: new NewbieQuizService({
      questions: resolveNewbieQuizQuestions(newbieQuizQuestionsRaw),
    }),
  };

  client.once(Events.ClientReady, (readyClient) => {
    console.log(`Bot logged in as ${readyClient.user.tag}`);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        await handleCommand(interaction, deps);
        return;
      }

      if (interaction.isMessageContextMenuCommand()) {
        await handleMessageContextCommand(interaction, deps);
        return;
      }

      if (interaction.isStringSelectMenu()) {
        const handled = await handleSelectMenu(interaction, deps);
        if (handled) {
          return;
        }
      }

      if (interaction.isButton()) {
        await handleButton(interaction, deps);
        return;
      }

      if (interaction.isModalSubmit()) {
        await handlePasscodeModal(interaction, deps);
      }
    } catch (error) {
      const payload = {
        content: `操作失败：${error.message}`,
        flags: MessageFlags.Ephemeral,
      };

      if (interaction.deferred || interaction.replied) {
        await interaction.followUp(payload).catch(() => {});
      } else {
        await interaction.reply(payload).catch(() => {});
      }
    }
  });

  client.on(Events.MessageReactionAdd, async (reaction, user) => {
    if (user.bot) {
      return;
    }

    try {
      if (reaction.partial) {
        await reaction.fetch();
      }
      if (reaction.message.partial) {
        await reaction.message.fetch();
      }

      const channel = reaction.message.channel;
      if (!channel || !channel.isTextBased()) {
        return;
      }

      const assets = storage
        .listAssetsByGateChannel(reaction.message.channelId)
        .filter((asset) => ["reaction", "reaction_or_comment"].includes(asset.baseMode));

      if (assets.length === 0) {
        return;
      }

      let starterMessageId = null;
      if (isThreadChannel(channel)) {
        const starter = await channel.fetchStarterMessage().catch(() => null);
        starterMessageId = starter?.id ?? null;
      }

      for (const asset of assets) {
        if (
          !shouldCountReactionForAsset({
            asset,
            reactionMessageId: reaction.message.id,
            channelType: channel.type,
            starterMessageId,
          })
        ) {
          continue;
        }

        await processSignal({
          storage,
          asset,
          userId: user.id,
          signal: "reaction",
        });
      }
    } catch (error) {
      console.error("Reaction unlock error:", error);
    }
  });

  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) {
      return;
    }

    if (!message.guildId || !message.channel?.isTextBased()) {
      return;
    }

    const assets = storage.listCommentAssetsByChannel(message.channelId);
    if (assets.length === 0) {
      return;
    }

    for (const asset of assets) {
      if (!asset.gateMessageId) {
        continue;
      }
      if (!isMessageAfterGate(message.id, asset.gateMessageId)) {
        continue;
      }

      try {
        await processSignal({
          storage,
          asset,
          userId: message.author.id,
          signal: "comment",
        });
      } catch (error) {
        console.error(`Comment unlock error for gate ${asset.gateMessageId}:`, error);
      }
    }
  });

  return {
    client,
    start: () => client.login(token),
  };
}
