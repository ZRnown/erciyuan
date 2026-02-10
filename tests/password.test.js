import test from "node:test";
import assert from "node:assert/strict";

import { hashPassword, verifyPassword } from "../src/services/password.js";

test("hashPassword is deterministic with same salt", () => {
  const one = hashPassword("abc123", "salt");
  const two = hashPassword("abc123", "salt");

  assert.equal(one, two);
});

test("verifyPassword validates correct and incorrect values", () => {
  const hash = hashPassword("secret", "salt");

  assert.equal(verifyPassword("secret", "salt", hash), true);
  assert.equal(verifyPassword("wrong", "salt", hash), false);
});
