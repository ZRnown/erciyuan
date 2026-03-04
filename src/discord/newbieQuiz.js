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
const DEFAULT_SESSION_QUESTION_COUNT = 5;

export const DEFAULT_NEWBIE_QUESTIONS = [
  {
    prompt: "本社区属于是什么性质？",
    options: {
      A: "Sillytavern全开源交流社区",
      B: "可商业化贩卖资源的社区",
      C: "服主的个人作品合集社区",
      D: "自由发布内容的小团体组织",
    },
    correct: "C",
  },
  {
    prompt: "社区内作品的主要来源是？",
    options: {
      A: "服主个人作品",
      B: "全网随意搬运整合",
      C: "成员自发投稿为主",
      D: "商业平台购买分享",
    },
    correct: "A",
  },
  {
    prompt: "本社区是否允许随意转载外部作品？",
    options: {
      A: "允许，自由转载",
      B: "禁止，仅限服主授权/原作者同意内容",
      C: "标注来源即可转载",
      D: "非商用就可以转载",
    },
    correct: "B",
  },
  {
    prompt: "本社区对成员性质的要求？",
    options: {
      A: "必须是成年女性",
      B: "必须是服主认识的朋友",
      C: "辱骂过服主的不允许进入",
      D: "遵守社区规则即可，不限任何属性",
    },
    correct: "D",
  },
  {
    prompt: "对于服主作品，我们应当？",
    options: {
      A: "尊重每个作品的明确规则",
      B: "随意二改",
      C: "拆包提取公开分享",
      D: "用于商业用途",
    },
    correct: "A",
  },
  {
    prompt: "在社区内发布内容的权限属于？",
    options: {
      A: "所有成员均可在社区规则内发布",
      B: "活跃成员可发布",
      C: "仅服主有权发布正式作品",
      D: "管理员可随意发布",
    },
    correct: "A",
  },
  {
    prompt: "社区是否允许公屏讨论争议内容（包括触犯法律边界、社区外节奏）？",
    options: {
      A: "允许简单讨论几句",
      B: "允许无指向模糊提及",
      C: "不限制话题",
      D: "严格禁止，禁言处罚",
    },
    correct: "D",
  },
  {
    prompt: "本社区是否属于 SillyTavern 官方社区？",
    options: {
      A: "是官方合作社区",
      B: "是官方认证社区",
      C: "不是，纯属服主个人社区",
      D: "是第三方大型公共社区",
    },
    correct: "C",
  },
  {
    prompt: "发现他人泄露社区内容应该？",
    options: {
      A: "及时向服主举报",
      B: "跟着一起传播",
      C: "假装没看见",
      D: "私下警告即可",
    },
    correct: "A",
  },
  {
    prompt: "使用社区作品的前提是？",
    options: {
      A: "随便用，无任何要求",
      B: "遵守社区规则前提下",
      C: "只要不被发现即可",
      D: "用于盈利也没关系",
    },
    correct: "B",
  },
  {
    prompt: "本社区是否接受其他作者的作品发布？",
    options: {
      A: "欢迎所有遵守社区规则的作者投稿入驻",
      B: "优质作品可入驻",
      C: "不接受，仅服主个人作品",
      D: "付费即可入驻",
    },
    correct: "A",
  },
  {
    prompt: "对于社区内成员的交流，正确态度是？",
    options: {
      A: "小团体抱团辱骂其他人",
      B: "公屏发表对各种xp取向的态度",
      C: "即使不喜欢，也不在公屏发表意见",
      D: "随意公开他人隐私 XP",
    },
    correct: "C",
  },
  {
    prompt: "对于社区内成员的个人 XP，正确态度是？",
    options: {
      A: "公开嘲讽、贬低他人喜好",
      B: "尊重差异，不辱骂、不攻击",
      C: "强迫他人接受自己的喜好",
      D: "随意公开讨论他人隐私 XP",
    },
    correct: "B",
  },
  {
    prompt: "本社区对小众 XP 的立场是？",
    options: {
      A: "禁止任何与 XP 相关内容",
      B: "鼓励公开深度讨论各类 XP",
      C: "允许存在，但不鼓励公开讨论",
      D: "只允许符合大众审美的 XP",
    },
    correct: "C",
  },
  {
    prompt: "在社区内遇到不符合自己xp的作品，绝对禁止的行为是？",
    options: {
      A: "向服主询问",
      B: "在公屏辱骂、阴阳",
      C: "私下和朋友吐槽",
      D: "划走不看",
    },
    correct: "B",
  },
  {
    prompt: "通过审核后将自动获得哪个身份组？",
    options: {
      A: "海棠微雨",
      B: "管理员",
      C: "贡献者",
      D: "游客",
    },
    correct: "A",
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
          "## 繁花Sylvie基础问卷",
          "欢迎来到繁花Sylvie，请阅读【公告】内容后点击下方按钮完成审核。",
          "",
          "答题规则：",
          `- ${questionCount}道单选题`,
          "- 全部答对",
          "- 完成后将自动获得【海棠微雨】身份组，查看社区其它内容",
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
  constructor({
    questions = DEFAULT_NEWBIE_QUESTIONS,
    questionCount = DEFAULT_SESSION_QUESTION_COUNT,
    rng = Math.random,
  } = {}) {
    this.questions = questions.map(normalizeQuestion).filter(Boolean);
    if (this.questions.length === 0) {
      this.questions = DEFAULT_NEWBIE_QUESTIONS;
    }
    this.questionCount = Math.max(
      1,
      Math.min(Number.isFinite(questionCount) ? Math.trunc(questionCount) : DEFAULT_SESSION_QUESTION_COUNT, this.questions.length),
    );
    this.rng = typeof rng === "function" ? rng : Math.random;
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

    const sessionQuestions = this.pickSessionQuestions();
    const session = {
      id: randomUUID(),
      userId,
      index: 0,
      total: sessionQuestions.length,
      questions: sessionQuestions,
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

    const question = session.questions[session.index];
    const normalizedOption = String(option ?? "").toUpperCase();
    if (!QUIZ_OPTION_ORDER.includes(normalizedOption)) {
      return { status: "invalid_option" };
    }

    if (normalizedOption !== question.correct) {
      this.clearSession(sessionId);
      return { status: "failed", correctOption: question.correct };
    }

    if (session.index >= session.total - 1) {
      this.clearSession(sessionId);
      return { status: "passed" };
    }

    session.index += 1;
    return {
      status: "next",
      index: session.index,
      nextQuestion: session.questions[session.index],
      total: session.total,
    };
  }

  pickSessionQuestions() {
    const pool = [...this.questions];
    this.shuffleInPlace(pool);
    const picked = pool.slice(0, this.questionCount);
    return picked.map((item) => this.shuffleQuestionOptions(item));
  }

  shuffleQuestionOptions(question) {
    const optionEntries = QUIZ_OPTION_ORDER.map((key) => ({
      key,
      value: question.options[key],
    }));
    this.shuffleInPlace(optionEntries);

    const remappedOptions = {};
    let remappedCorrect = "A";
    for (const [index, entry] of optionEntries.entries()) {
      const targetKey = QUIZ_OPTION_ORDER[index];
      remappedOptions[targetKey] = entry.value;
      if (entry.key === question.correct) {
        remappedCorrect = targetKey;
      }
    }

    return {
      prompt: question.prompt,
      options: remappedOptions,
      correct: remappedCorrect,
    };
  }

  shuffleInPlace(items) {
    for (let i = items.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.rng() * (i + 1));
      const tmp = items[i];
      items[i] = items[j];
      items[j] = tmp;
    }
    return items;
  }
}
