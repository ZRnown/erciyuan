export function toDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function evaluateDailyQuota({ quotaPolicy, dailyLimit, usedToday }) {
  const normalizedLimit = Number.isFinite(dailyLimit) && dailyLimit > 0 ? dailyLimit : 10;
  const used = Number.isFinite(usedToday) && usedToday > 0 ? usedToday : 0;

  if (used >= normalizedLimit) {
    return {
      allowed: false,
      reason: `获取次数到达上限（${used}/${normalizedLimit}），等明天刷新次数后再进行获取。`,
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
