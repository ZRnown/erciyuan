import test from "node:test";
import assert from "node:assert/strict";

import { evaluateDailyQuota, toDateKey } from "../src/services/dailyQuota.js";

test("toDateKey returns YYYY-MM-DD", () => {
  const key = toDateKey(new Date("2026-02-09T08:12:00.000Z"));
  assert.equal(key, "2026-02-09");
});

test("evaluateDailyQuota blocks when daily-limited and quota exhausted", () => {
  const result = evaluateDailyQuota({
    quotaPolicy: "daily_limited",
    dailyLimit: 10,
    usedToday: 10,
  });

  assert.equal(result.allowed, false);
  assert.match(result.reason, /获取次数到达上限/);
});

test("evaluateDailyQuota still blocks when open-share quota exhausted", () => {
  const result = evaluateDailyQuota({
    quotaPolicy: "open_share",
    dailyLimit: 10,
    usedToday: 10,
  });

  assert.equal(result.allowed, false);
  assert.match(result.reason, /获取次数到达上限/);
});
