import test from "node:test";
import assert from "node:assert/strict";
import { MessageFlags } from "discord.js";

import {
  DEFAULT_NEWBIE_QUESTIONS,
  NewbieQuizService,
  buildNewbieQuizButtonId,
  createNewbieQuizEntryPanel,
  createNewbieQuizQuestionPanel,
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

  assert.equal(panel.flags, MessageFlags.SuppressNotifications);
  assert.equal(panel.components.length, 1);
  const row = panel.components[0].toJSON();
  assert.equal(row.components[0].custom_id, "newbie_quiz:start");
});

test("createNewbieQuizQuestionPanel shows current question and answer buttons", () => {
  const panel = createNewbieQuizQuestionPanel({
    question: QUESTIONS[0],
    sessionId: "s1",
    index: 0,
    total: 2,
    includeFlags: true,
  });

  assert.equal(panel.flags, MessageFlags.Ephemeral);
  assert.equal(panel.components.length, 2);
  const firstRow = panel.components[0].toJSON();
  assert.equal(firstRow.components.length, 2);
  assert.equal(firstRow.components[0].custom_id, "newbie_quiz:answer:s1:A");
  assert.equal(firstRow.components[1].custom_id, "newbie_quiz:answer:s1:B");
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
