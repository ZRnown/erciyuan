import { randomUUID } from "node:crypto";

const DEFAULT_TTL_MS = 60 * 60 * 1000;

export class PublishDraftStore {
  constructor({ ttlMs = DEFAULT_TTL_MS } = {}) {
    this.ttlMs = ttlMs;
    this.items = new Map();
  }

  isExpired(draft) {
    return Date.now() - draft.updatedAt > this.ttlMs;
  }

  pruneExpired() {
    for (const [id, draft] of this.items.entries()) {
      if (this.isExpired(draft)) {
        this.items.delete(id);
      }
    }
  }

  create(input) {
    this.pruneExpired();

    const id = randomUUID();
    const now = Date.now();

    const draft = {
      id,
      ownerUserId: input.ownerUserId,
      guildId: input.guildId,
      gateChannelId: input.gateChannelId,
      sourceType: input.sourceType,
      sourceChannelId: input.sourceChannelId,
      sourceMessageId: input.sourceMessageId,
      sourceUrl: input.sourceUrl,
      attachments: input.attachments,
      mode: input.mode ?? "none",
      passcodeEnabled: Boolean(input.passcodeEnabled),
      passcode: input.passcode ?? "",
      quotaPolicy: input.quotaPolicy ?? "open_share",
      statementEnabled: Boolean(input.statementEnabled),
      statementText: input.statementText ?? "",
      modeOnly: Boolean(input.modeOnly),
      createdAt: now,
      updatedAt: now,
    };

    this.items.set(id, draft);
    return draft;
  }

  get(id) {
    const draft = this.items.get(id);
    if (!draft) {
      return null;
    }

    if (this.isExpired(draft)) {
      this.items.delete(id);
      return null;
    }

    return draft;
  }

  update(id, patch) {
    const current = this.get(id);
    if (!current) {
      return null;
    }

    const nextPatch = typeof patch === "function" ? patch(current) : patch;
    const next = {
      ...current,
      ...nextPatch,
      updatedAt: Date.now(),
    };

    this.items.set(id, next);
    return next;
  }

  delete(id) {
    this.items.delete(id);
  }
}
