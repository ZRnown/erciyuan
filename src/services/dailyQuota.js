export function toDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function evaluateDailyQuota({ quotaPolicy, dailyLimit, usedToday }) {
  const normalizedLimit = Number.isFinite(dailyLimit) && dailyLimit > 0 ? dailyLimit : 10;
  const used = Number.isFinite(usedToday) && usedToday > 0 ? usedToday : 0;

  if (quotaPolicy === "daily_limited" && used >= normalizedLimit) {
    return {
      allowed: false,
      reason: `今日下载额度已用完（${used}/${normalizedLimit}）`,
      usedToday: used,
      dailyLimit: normalizedLimit,
    };
  }

  return {
    allowed: true,
    reason: `今日下载额度：${used}/${normalizedLimit}`,
    usedToday: used,
    dailyLimit: normalizedLimit,
  };
}
