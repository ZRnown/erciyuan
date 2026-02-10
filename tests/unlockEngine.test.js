import test from "node:test";
import assert from "node:assert/strict";

import { parseAccessPolicy } from "../src/domain/unlockMode.js";
import {
  applyUnlockSignal,
  createEmptyProgress,
  isSignalRelevant,
} from "../src/services/unlockEngine.js";

test("createEmptyProgress initializes all flags to false", () => {
  assert.deepEqual(createEmptyProgress(), {
    reactionMet: false,
    commentMet: false,
    passwordMet: false,
    statementConfirmed: false,
  });
});

test("applyUnlockSignal supports reaction/comment OR + passcode", () => {
  const policy = parseAccessPolicy("reaction_or_comment", true);
  const afterComment = applyUnlockSignal(policy, createEmptyProgress(), "comment");

  assert.equal(afterComment.commentMet, true);
  assert.equal(afterComment.completed, false);

  const afterPassword = applyUnlockSignal(policy, afterComment, "password");
  assert.equal(afterPassword.passwordMet, true);
  assert.equal(afterPassword.completed, true);
});

test("applyUnlockSignal keeps completion true for unlimited mode", () => {
  const policy = parseAccessPolicy("none", false);
  const result = applyUnlockSignal(policy, createEmptyProgress(), "reaction");

  assert.equal(result.completed, true);
});

test("isSignalRelevant matches policy requirements", () => {
  const policy = parseAccessPolicy("reaction_or_comment", false);
  assert.equal(isSignalRelevant(policy, "reaction"), true);
  assert.equal(isSignalRelevant(policy, "comment"), true);
  assert.equal(isSignalRelevant(policy, "password"), false);
});
