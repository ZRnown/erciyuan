import { randomUUID } from "node:crypto";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  TextDisplayBuilder,
} from "discord.js";

const NEWBIE_QUIZ_PREFIX = "newbie_quiz";
const QUIZ_OPTION_ORDER = ["A", "B", "C", "D"];

export const DEFAULT_NEWBIE_QUESTIONS = [
  {
    prompt: "进入群后，第一步应该做什么？",
    options: {
      A: "先阅读群公告和置顶说明",
      B: "直接私聊管理员要资源",
      C: "在群里反复催更",
      D: "跳过规则直接下载",
    },
    correct: "A",
  },
  {
    prompt: "遇到下载或使用问题，推荐的正确做法是？",
    options: {
      A: "直接攻击作者",
      B: "阅读说明后在指定频道提问",
      C: "刷屏求助",
      D: "随便@所有人",
    },
    correct: "B",
  },
  {
    prompt: "群内资源通常应当如何使用？",
    options: {
      A: "遵守发布者说明，不擅自二次传播",
      B: "任意转载并商用",
      C: "改名后二传",
      D: "到处发外链",
    },
    correct: "A",
  },
  {
    prompt: "如果你看到违规内容，应该怎么做？",
    options: {
      A: "跟着一起发",
      B: "无视并扩散",
      C: "通过正常渠道反馈给管理",
      D: "开小号继续发",
    },
    correct: "C",
  },
  {
    prompt: "通过新人验证后，你会获得什么？",
    options: {
      A: "任意管理权限",
      B: "小行星身份组或等效验证身份",
      C: "无限下载额度",
      D: "机器人管理员权限",
    },
    correct: "B",
  },
];

export function parseNewbieVerifyPanelOwnerIds(rawValue) {
  const raw = String(rawValue ?? "").trim();
  if (!raw) {
    return new Set();
  }

  const values = raw
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  return new Set(values);
}

export function canUserOpenNewbieVerifyPanel(ownerIds, userId) {
  if (!(ownerIds instanceof Set) || ownerIds.size === 0) {
    return false;
  }

  return ownerIds.has(String(userId));
}

function normalizeQuestion(input) {
  const prompt = String(input?.prompt ?? "").trim();
  const options = input?.options ?? {};
  const correct = String(input?.correct ?? "").trim().toUpperCase();

  if (!prompt) {
    return null;
  }

  const normalizedOptions = {};
  for (const key of QUIZ_OPTION_ORDER) {
    const value = String(options[key] ?? "").trim();
    if (!value) {
      return null;
    }
    normalizedOptions[key] = value;
  }

  if (!QUIZ_OPTION_ORDER.includes(correct)) {
    return null;
  }

  return {
    prompt,
    options: normalizedOptions,
    correct,
  };
}

export function resolveNewbieQuizQuestions(rawValue) {
  const raw = String(rawValue ?? "").trim();
  if (!raw) {
    return DEFAULT_NEWBIE_QUESTIONS;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return DEFAULT_NEWBIE_QUESTIONS;
    }

    const normalized = parsed.map(normalizeQuestion).filter(Boolean);
    return normalized.length > 0 ? normalized : DEFAULT_NEWBIE_QUESTIONS;
  } catch {
    return DEFAULT_NEWBIE_QUESTIONS;
  }
}

export function buildNewbieQuizButtonId(action, sessionId = "", option = "") {
  if (action === "start") {
    return `${NEWBIE_QUIZ_PREFIX}:start`;
  }

  if (action === "answer") {
    return `${NEWBIE_QUIZ_PREFIX}:answer:${sessionId}:${option}`;
  }

  return `${NEWBIE_QUIZ_PREFIX}:${action}`;
}

export function parseNewbieQuizButtonId(customId) {
  const parts = String(customId).split(":");
  if (parts.length < 2 || parts[0] !== NEWBIE_QUIZ_PREFIX) {
    return null;
  }

  const action = parts[1];
  if (action === "start") {
    return { action };
  }

  if (action === "answer" && parts.length === 4) {
    return {
      action,
      sessionId: parts[2],
      option: parts[3],
    };
  }

  return null;
}

export function createNewbieQuizEntryPanel({ questionCount, includeFlags = true } = {}) {
  const container = new ContainerBuilder()
    .setAccentColor(0x2ecc71)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          "## 📝 新人入群验证",
          "欢迎来到本群，请先完成答题验证。",
          "",
          "答题说明：",
          `- 题目数量：${questionCount} 题`,
          `- 及格标准：${questionCount}/${questionCount}`,
          "- 完成后自动发放验证身份组",
        ].join("\n"),
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(buildNewbieQuizButtonId("start"))
          .setLabel("📝 开始答题验证")
          .setStyle(ButtonStyle.Success),
      ),
    );

  const payload = {
    components: [container],
  };

  if (includeFlags) {
    payload.flags = MessageFlags.SuppressNotifications | MessageFlags.IsComponentsV2;
  } else {
    payload.flags = MessageFlags.IsComponentsV2;
  }

  return payload;
}

export function createNewbieQuizQuestionPanel({
  question,
  sessionId,
  index,
  total,
  includeFlags = true,
}) {
  const container = new ContainerBuilder()
    .setAccentColor(0x4ea7ff)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          `## 新人验证答题 (${index + 1}/${total})`,
          `答题进度：${index + 1}/${total}`,
          "",
          question.prompt,
          "",
          `A. ${question.options.A}`,
          `B. ${question.options.B}`,
          `C. ${question.options.C}`,
          `D. ${question.options.D}`,
          "",
          "请选择一个选项继续作答。",
        ].join("\n"),
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(buildNewbieQuizButtonId("answer", sessionId, "A"))
          .setLabel("A")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(buildNewbieQuizButtonId("answer", sessionId, "B"))
          .setLabel("B")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(buildNewbieQuizButtonId("answer", sessionId, "C"))
          .setLabel("C")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(buildNewbieQuizButtonId("answer", sessionId, "D"))
          .setLabel("D")
          .setStyle(ButtonStyle.Primary),
      ),
    );

  const payload = {
    components: [container],
  };

  if (includeFlags) {
    payload.flags = MessageFlags.Ephemeral | MessageFlags.IsComponentsV2;
  } else {
    payload.flags = MessageFlags.IsComponentsV2;
  }

  return payload;
}

export function createNewbieQuizResultPanel({
  title,
  message,
  includeFlags = false,
}) {
  const container = new ContainerBuilder()
    .setAccentColor(0x2ecc71)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          `## ${title}`,
          String(message ?? "").trim(),
        ]
          .filter(Boolean)
          .join("\n\n"),
      ),
    );

  const payload = {
    components: [container],
  };

  if (includeFlags) {
    payload.flags = MessageFlags.Ephemeral | MessageFlags.IsComponentsV2;
  } else {
    payload.flags = MessageFlags.IsComponentsV2;
  }

  return payload;
}

export class NewbieQuizService {
  constructor({ questions = DEFAULT_NEWBIE_QUESTIONS } = {}) {
    this.questions = questions.map(normalizeQuestion).filter(Boolean);
    if (this.questions.length === 0) {
      this.questions = DEFAULT_NEWBIE_QUESTIONS;
    }
    this.sessions = new Map();
    this.userActiveSession = new Map();
  }

  getSession(sessionId) {
    return this.sessions.get(sessionId) ?? null;
  }

  startSession(userId) {
    const previousSessionId = this.userActiveSession.get(userId);
    if (previousSessionId) {
      this.sessions.delete(previousSessionId);
    }

    const session = {
      id: randomUUID(),
      userId,
      index: 0,
      createdAt: Date.now(),
    };
    this.sessions.set(session.id, session);
    this.userActiveSession.set(userId, session.id);
    return session;
  }

  clearSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }
    this.sessions.delete(sessionId);
    if (this.userActiveSession.get(session.userId) === sessionId) {
      this.userActiveSession.delete(session.userId);
    }
  }

  answer({ sessionId, userId, option }) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { status: "expired" };
    }

    if (session.userId !== userId) {
      return { status: "forbidden" };
    }

    const question = this.questions[session.index];
    const normalizedOption = String(option ?? "").toUpperCase();
    if (!QUIZ_OPTION_ORDER.includes(normalizedOption)) {
      return { status: "invalid_option" };
    }

    if (normalizedOption !== question.correct) {
      this.clearSession(sessionId);
      return { status: "failed", correctOption: question.correct };
    }

    if (session.index >= this.questions.length - 1) {
      this.clearSession(sessionId);
      return { status: "passed" };
    }

    session.index += 1;
    return {
      status: "next",
      index: session.index,
      nextQuestion: this.questions[session.index],
    };
  }
}
