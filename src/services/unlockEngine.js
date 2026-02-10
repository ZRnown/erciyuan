import { isAccessComplete } from "../domain/unlockMode.js";

export function createEmptyProgress() {
  return {
    reactionMet: false,
    commentMet: false,
    passwordMet: false,
    statementConfirmed: false,
  };
}

export function isSignalRelevant(policy, signal) {
  if (signal === "reaction") {
    return policy.mode === "reaction" || policy.mode === "reaction_or_comment";
  }

  if (signal === "comment") {
    return policy.mode === "reaction_or_comment";
  }

  if (signal === "password") {
    return policy.passcodeEnabled;
  }

  if (signal === "statement") {
    return true;
  }

  return false;
}

export function applyUnlockSignal(policy, progress, signal) {
  const next = {
    reactionMet: Boolean(progress.reactionMet),
    commentMet: Boolean(progress.commentMet),
    passwordMet: Boolean(progress.passwordMet),
    statementConfirmed: Boolean(progress.statementConfirmed),
  };

  if (signal === "reaction" && isSignalRelevant(policy, "reaction")) {
    next.reactionMet = true;
  }

  if (signal === "comment" && isSignalRelevant(policy, "comment")) {
    next.commentMet = true;
  }

  if (signal === "password" && isSignalRelevant(policy, "password")) {
    next.passwordMet = true;
  }

  if (signal === "statement") {
    next.statementConfirmed = true;
  }

  return {
    ...next,
    completed: isAccessComplete(policy, next),
  };
}
