import test from "node:test";
import assert from "node:assert/strict";

import {
  accessModeChoices,
  parseAccessPolicy,
  isAccessComplete,
  listMissingConditions,
} from "../src/domain/unlockMode.js";

test("accessModeChoices exposes supported values", () => {
  const values = accessModeChoices.map((choice) => choice.value);
  assert.deepEqual(values.sort(), ["none", "reaction", "reaction_or_comment"]);
});

test("parseAccessPolicy normalizes mode + passcode switch", () => {
  assert.deepEqual(parseAccessPolicy("reaction_or_comment", true), {
    mode: "reaction_or_comment",
    passcodeEnabled: true,
  });
});

test("parseAccessPolicy throws for unsupported mode", () => {
  assert.throws(() => parseAccessPolicy("unsupported", false), {
    message: /Unsupported access mode/,
  });
});

test("isAccessComplete supports reaction-or-comment and passcode combo", () => {
  const policy = parseAccessPolicy("reaction_or_comment", true);

  assert.equal(
    isAccessComplete(policy, {
      reactionMet: true,
      commentMet: false,
      passwordMet: false,
    }),
    false,
  );

  assert.equal(
    isAccessComplete(policy, {
      reactionMet: false,
      commentMet: true,
      passwordMet: true,
    }),
    true,
  );
});

test("listMissingConditions reports user-facing missing steps", () => {
  const policy = parseAccessPolicy("reaction_or_comment", true);

  assert.deepEqual(
    listMissingConditions(policy, {
      reactionMet: false,
      commentMet: false,
      passwordMet: false,
    }),
    ["点赞或评论", "提取码"],
  );
});
