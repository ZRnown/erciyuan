const ACCESS_MODES = {
  none: "none",
  reaction: "reaction",
  reaction_or_comment: "reaction_or_comment",
};

export const accessModeChoices = [
  { name: "无限制", value: ACCESS_MODES.none },
  { name: "点赞", value: ACCESS_MODES.reaction },
  { name: "点赞或回复", value: ACCESS_MODES.reaction_or_comment },
];

export const quotaPolicyChoices = [
  { name: "开放分享", value: "open_share" },
  { name: "每日限定", value: "daily_limited" },
];

export function parseAccessPolicy(mode, passcodeEnabled = false) {
  if (!Object.values(ACCESS_MODES).includes(mode)) {
    throw new Error(`Unsupported access mode: ${mode}`);
  }

  return {
    mode,
    passcodeEnabled: Boolean(passcodeEnabled),
  };
}

function isPrimaryConditionMet(policy, progress) {
  if (policy.mode === ACCESS_MODES.none) {
    return true;
  }

  if (policy.mode === ACCESS_MODES.reaction) {
    return Boolean(progress.reactionMet);
  }

  if (policy.mode === ACCESS_MODES.reaction_or_comment) {
    return Boolean(progress.reactionMet || progress.commentMet);
  }

  return false;
}

export function isAccessComplete(policy, progress) {
  const primaryMet = isPrimaryConditionMet(policy, progress);
  if (!primaryMet) {
    return false;
  }

  if (policy.passcodeEnabled && !progress.passwordMet) {
    return false;
  }

  return true;
}

export function listMissingConditions(policy, progress) {
  const missing = [];

  if (policy.mode === ACCESS_MODES.reaction && !progress.reactionMet) {
    missing.push("点赞");
  }

  if (
    policy.mode === ACCESS_MODES.reaction_or_comment &&
    !(progress.reactionMet || progress.commentMet)
  ) {
    missing.push("点赞或评论");
  }

  if (policy.passcodeEnabled && !progress.passwordMet) {
    missing.push("提取码");
  }

  return missing;
}

export function formatAccessMode(mode) {
  const match = accessModeChoices.find((choice) => choice.value === mode);
  return match ? match.name : mode;
}

export function formatQuotaPolicy(policy) {
  const match = quotaPolicyChoices.find((choice) => choice.value === policy);
  return match ? match.name : policy;
}

// Backward compatibility exports (legacy flow used in earlier iteration).
export const modeChoices = accessModeChoices;

const LEGACY_MODE_REQUIREMENTS = {
  reaction: { reactionRequired: true, commentRequired: false, passwordRequired: false },
  comment: { reactionRequired: false, commentRequired: true, passwordRequired: false },
  password: { reactionRequired: false, commentRequired: false, passwordRequired: true },
  reaction_comment: { reactionRequired: true, commentRequired: true, passwordRequired: false },
  reaction_password: { reactionRequired: true, commentRequired: false, passwordRequired: true },
  comment_password: { reactionRequired: false, commentRequired: true, passwordRequired: true },
  all: { reactionRequired: true, commentRequired: true, passwordRequired: true },
};

export function parseUnlockMode(mode) {
  const requirements = LEGACY_MODE_REQUIREMENTS[mode];
  if (!requirements) {
    throw new Error(`Unsupported unlock mode: ${mode}`);
  }
  return { ...requirements };
}

export function isUnlockComplete(requirements, progress) {
  if (requirements.reactionRequired && !progress.reactionMet) {
    return false;
  }
  if (requirements.commentRequired && !progress.commentMet) {
    return false;
  }
  if (requirements.passwordRequired && !progress.passwordMet) {
    return false;
  }
  return true;
}

export function formatUnlockMode(mode) {
  return formatAccessMode(mode);
}
