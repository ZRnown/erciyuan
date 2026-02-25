import test from "node:test";
import assert from "node:assert/strict";
import { MessageFlags } from "discord.js";

import {
  canUserOpenNewbieVerifyPanel,
  DEFAULT_NEWBIE_QUESTIONS,
  NewbieQuizService,
  buildNewbieQuizButtonId,
  createNewbieQuizEntryPanel,
  createNewbieQuizQuestionPanel,
  parseNewbieVerifyPanelOwnerIds,
  parseNewbieQuizButtonId,
} from "../src/discord/newbieQuiz.js";

const QUESTIONS = [
  {
    prompt: "官方群规则里，遇到问题第一步应该做什么？",
    options: {
      A: "先阅读群公告和置顶",
      B: "直接私聊管理员",
      C: "刷屏问所有人",
      D: "随便猜",
    },
    correct: "A",
  },
  {
    prompt: "下载资源前你应该？",
    options: {
      A: "跳过说明",
      B: "阅读说明并遵守规则",
      C: "转发外链",
      D: "催更",
    },
    correct: "B",
  },
];

test("newbie quiz button id can be encoded and parsed", () => {
  const start = buildNewbieQuizButtonId("start");
  assert.equal(start, "newbie_quiz:start");
  assert.deepEqual(parseNewbieQuizButtonId(start), { action: "start" });

  const answer = buildNewbieQuizButtonId("answer", "session-1", "C");
  assert.equal(answer, "newbie_quiz:answer:session-1:C");
  assert.deepEqual(parseNewbieQuizButtonId(answer), {
    action: "answer",
    sessionId: "session-1",
    option: "C",
  });
});

test("createNewbieQuizEntryPanel builds public start button payload", () => {
  const panel = createNewbieQuizEntryPanel({
    questionCount: 5,
  });

  assert.equal(panel.flags, MessageFlags.SuppressNotifications | MessageFlags.IsComponentsV2);
  assert.equal(panel.components.length, 1);
  const container = panel.components[0].toJSON();
  const textDisplays = container.components
    .filter((component) => component.type === 10)
    .map((component) => component.content);
  assert.equal(textDisplays.some((content) => content.includes("新人入群验证")), true);

  const rows = container.components.filter((component) => component.type === 1);
  assert.equal(rows.length >= 1, true);
  assert.equal(rows[rows.length - 1].components[0].custom_id, "newbie_quiz:start");
});

test("createNewbieQuizEntryPanel can omit message flags for DM usage", () => {
  const panel = createNewbieQuizEntryPanel({
    questionCount: 5,
    includeFlags: false,
  });

  assert.equal(panel.flags, MessageFlags.IsComponentsV2);
  assert.equal(panel.components.length, 1);
});

test("createNewbieQuizQuestionPanel shows current question and answer buttons", () => {
  const panel = createNewbieQuizQuestionPanel({
    question: QUESTIONS[0],
    sessionId: "s1",
    index: 0,
    total: 2,
    includeFlags: true,
  });

  assert.equal(panel.flags, MessageFlags.Ephemeral | MessageFlags.IsComponentsV2);
  assert.equal(panel.components.length, 1);

  const container = panel.components[0].toJSON();
  const textDisplays = container.components
    .filter((component) => component.type === 10)
    .map((component) => component.content);

  assert.equal(textDisplays.some((content) => content.includes("答题进度：1/2")), true);
  assert.equal(textDisplays.some((content) => content.includes("官方群规则里，遇到问题第一步应该做什么？")), true);

  const rows = container.components.filter((component) => component.type === 1);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].components.length, 4);
  assert.equal(rows[0].components[0].custom_id, "newbie_quiz:answer:s1:A");
  assert.equal(rows[0].components[1].custom_id, "newbie_quiz:answer:s1:B");
  assert.equal(rows[0].components[2].custom_id, "newbie_quiz:answer:s1:C");
  assert.equal(rows[0].components[3].custom_id, "newbie_quiz:answer:s1:D");
});

test("NewbieQuizService handles pass/fail flow", () => {
  const service = new NewbieQuizService({ questions: QUESTIONS });

  const session = service.startSession("u1");
  assert.equal(session.index, 0);

  const wrong = service.answer({
    sessionId: session.id,
    userId: "u1",
    option: "D",
  });
  assert.equal(wrong.status, "failed");
  assert.equal(service.getSession(session.id), null);

  const secondSession = service.startSession("u1");
  const first = service.answer({
    sessionId: secondSession.id,
    userId: "u1",
    option: "A",
  });
  assert.equal(first.status, "next");
  assert.equal(first.nextQuestion.prompt, QUESTIONS[1].prompt);

  const pass = service.answer({
    sessionId: secondSession.id,
    userId: "u1",
    option: "B",
  });
  assert.equal(pass.status, "passed");
  assert.equal(service.getSession(secondSession.id), null);
});

test("default newbie question list has five questions", () => {
  assert.equal(DEFAULT_NEWBIE_QUESTIONS.length, 5);
});

test("parse owner ids and permission check", () => {
  const owners = parseNewbieVerifyPanelOwnerIds("10001, 20002  30003");
  assert.equal(owners.has("10001"), true);
  assert.equal(owners.has("20002"), true);
  assert.equal(owners.has("30003"), true);

  assert.equal(canUserOpenNewbieVerifyPanel(owners, "10001"), true);
  assert.equal(canUserOpenNewbieVerifyPanel(owners, "99999"), false);
  assert.equal(canUserOpenNewbieVerifyPanel(new Set(), "10001"), false);
});
