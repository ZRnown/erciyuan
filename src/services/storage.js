const NEW_MODE_VALUES = new Set(["none", "reaction", "reaction_or_comment"]);

function deriveLegacyPolicy(unlockMode, passwordHash) {
  if (unlockMode === "none") {
    return { baseMode: "none", passcodeEnabled: false };
  }
  if (unlockMode === "reaction") {
    return { baseMode: "reaction", passcodeEnabled: false };
  }
  if (unlockMode === "reaction_or_comment") {
    return { baseMode: "reaction_or_comment", passcodeEnabled: false };
  }
  if (unlockMode === "comment" || unlockMode === "reaction_comment") {
    return { baseMode: "reaction_or_comment", passcodeEnabled: false };
  }
  if (unlockMode === "password") {
    return { baseMode: "none", passcodeEnabled: true };
  }
  if (unlockMode === "reaction_password") {
    return { baseMode: "reaction", passcodeEnabled: true };
  }
  if (unlockMode === "comment_password" || unlockMode === "all") {
    return { baseMode: "reaction_or_comment", passcodeEnabled: true };
  }

  return {
    baseMode: "reaction",
    passcodeEnabled: Boolean(passwordHash),
  };
}

function normalizePolicy(row) {
  const legacyPolicy = deriveLegacyPolicy(row.unlock_mode, row.password_hash);
  const unlockModeLooksLegacy = !NEW_MODE_VALUES.has(row.unlock_mode);

  const baseMode = unlockModeLooksLegacy
    ? legacyPolicy.baseMode
    : row.base_mode || legacyPolicy.baseMode;

  const passcodeEnabled = unlockModeLooksLegacy
    ? legacyPolicy.passcodeEnabled
    : Boolean(row.passcode_enabled) || legacyPolicy.passcodeEnabled;

  return {
    baseMode,
    passcodeEnabled,
  };
}

function rowToAsset(row) {
  if (!row) {
    return null;
  }

  const policy = normalizePolicy(row);

  return {
    id: row.id,
    guildId: row.guild_id,
    ownerUserId: row.owner_user_id,
    gateChannelId: row.gate_channel_id,
    gateMessageId: row.gate_message_id,
    sourceType: row.source_type,
    sourceChannelId: row.source_channel_id,
    sourceMessageId: row.source_message_id,
    sourceUrl: row.source_url,
    unlockMode: row.unlock_mode,
    baseMode: policy.baseMode,
    passcodeEnabled: policy.passcodeEnabled,
    passwordHash: row.password_hash,
    quotaPolicy: row.quota_policy ?? "open_share",
    statementEnabled: Boolean(row.statement_enabled),
    statementText: row.statement_text ?? null,
    attachments: JSON.parse(row.attachments_json),
    createdAt: row.created_at,
  };
}

function rowToProgress(row) {
  if (!row) {
    return null;
  }

  return {
    gateMessageId: row.gate_message_id,
    userId: row.user_id,
    reactionMet: Boolean(row.reaction_met),
    commentMet: Boolean(row.comment_met),
    passwordMet: Boolean(row.password_met),
    statementConfirmed: Boolean(row.statement_confirmed),
    deliveredAt: row.delivered_at,
    updatedAt: row.updated_at,
  };
}

export class Storage {
  constructor(db) {
    this.db = db;

    this.insertAssetStmt = db.prepare(`
      INSERT INTO protected_assets (
        id,
        guild_id,
        owner_user_id,
        gate_channel_id,
        source_type,
        source_channel_id,
        source_message_id,
        source_url,
        unlock_mode,
        base_mode,
        passcode_enabled,
        password_hash,
        quota_policy,
        statement_enabled,
        statement_text,
        attachments_json,
        created_at
      ) VALUES (
        @id,
        @guild_id,
        @owner_user_id,
        @gate_channel_id,
        @source_type,
        @source_channel_id,
        @source_message_id,
        @source_url,
        @unlock_mode,
        @base_mode,
        @passcode_enabled,
        @password_hash,
        @quota_policy,
        @statement_enabled,
        @statement_text,
        @attachments_json,
        @created_at
      )
    `);

    this.bindGateMessageStmt = db.prepare(`
      UPDATE protected_assets
      SET gate_message_id = @gate_message_id
      WHERE id = @id
    `);

    this.getAssetByIdStmt = db.prepare(`
      SELECT * FROM protected_assets WHERE id = ?
    `);

    this.getAssetByGateMessageStmt = db.prepare(`
      SELECT * FROM protected_assets WHERE gate_message_id = ?
    `);

    this.listAssetsByGateChannelStmt = db.prepare(`
      SELECT * FROM protected_assets
      WHERE gate_channel_id = ?
        AND gate_message_id IS NOT NULL
      ORDER BY created_at DESC
    `);

    this.listCommentAssetsByChannelStmt = db.prepare(`
      SELECT * FROM protected_assets
      WHERE gate_channel_id = ?
        AND (
          base_mode = 'reaction_or_comment'
          OR unlock_mode IN ('comment', 'reaction_comment', 'comment_password', 'all')
        )
    `);

    this.getProgressStmt = db.prepare(`
      SELECT * FROM unlock_progress WHERE gate_message_id = ? AND user_id = ?
    `);

    this.upsertProgressStmt = db.prepare(`
      INSERT INTO unlock_progress (
        gate_message_id,
        user_id,
        reaction_met,
        comment_met,
        password_met,
        statement_confirmed,
        delivered_at,
        updated_at
      ) VALUES (
        @gate_message_id,
        @user_id,
        @reaction_met,
        @comment_met,
        @password_met,
        @statement_confirmed,
        @delivered_at,
        @updated_at
      )
      ON CONFLICT(gate_message_id, user_id)
      DO UPDATE SET
        reaction_met = excluded.reaction_met,
        comment_met = excluded.comment_met,
        password_met = excluded.password_met,
        statement_confirmed = excluded.statement_confirmed,
        delivered_at = excluded.delivered_at,
        updated_at = excluded.updated_at
    `);

    this.getDailyUsageStmt = db.prepare(`
      SELECT used_count FROM daily_usage WHERE user_id = ? AND date_key = ?
    `);

    this.incrementDailyUsageStmt = db.prepare(`
      INSERT INTO daily_usage (user_id, date_key, used_count, updated_at)
      VALUES (@user_id, @date_key, @used_count, @updated_at)
      ON CONFLICT(user_id, date_key)
      DO UPDATE SET
        used_count = daily_usage.used_count + excluded.used_count,
        updated_at = excluded.updated_at
    `);

    this.deleteProgressByGateMessageStmt = db.prepare(`
      DELETE FROM unlock_progress WHERE gate_message_id = ?
    `);

    this.deleteAssetByIdStmt = db.prepare(`
      DELETE FROM protected_assets WHERE id = ?
    `);

    this.listDeliveryLogsStmt = db.prepare(`
      SELECT
        a.id AS asset_id,
        a.gate_message_id,
        a.source_url,
        a.attachments_json,
        p.user_id,
        p.delivered_at
      FROM unlock_progress p
      INNER JOIN protected_assets a
        ON a.gate_message_id = p.gate_message_id
      WHERE p.delivered_at IS NOT NULL
        AND (@asset_id IS NULL OR a.id = @asset_id)
        AND (@user_id IS NULL OR p.user_id = @user_id)
      ORDER BY p.delivered_at DESC
      LIMIT @limit
    `);

    this.getAssetIdSequenceStmt = db.prepare(`
      SELECT next_value FROM asset_id_sequence WHERE id = 1
    `);

    this.updateAssetIdSequenceStmt = db.prepare(`
      UPDATE asset_id_sequence SET next_value = @next_value WHERE id = 1
    `);

    this.allocateAssetIdTxn = db.transaction(() => {
      let nextValue = this.getAssetIdSequenceStmt.get()?.next_value ?? 1;

      if (!Number.isFinite(nextValue) || nextValue < 1) {
        nextValue = 1;
      }

      while (this.getAssetByIdStmt.get(String(nextValue))) {
        nextValue += 1;
      }

      this.updateAssetIdSequenceStmt.run({
        next_value: nextValue + 1,
      });

      return String(nextValue);
    });
  }

  createAsset(input) {
    const id = this.allocateAssetIdTxn();
    const createdAt = Date.now();
    const baseMode = input.baseMode ?? "reaction";
    const passcodeEnabled = Boolean(input.passcodeEnabled);

    this.insertAssetStmt.run({
      id,
      guild_id: input.guildId,
      owner_user_id: input.ownerUserId,
      gate_channel_id: input.gateChannelId,
      source_type: input.sourceType,
      source_channel_id: input.sourceChannelId ?? null,
      source_message_id: input.sourceMessageId ?? null,
      source_url: input.sourceUrl ?? null,
      unlock_mode: input.unlockMode ?? baseMode,
      base_mode: baseMode,
      passcode_enabled: passcodeEnabled ? 1 : 0,
      password_hash: passcodeEnabled ? input.passwordHash ?? null : null,
      quota_policy: input.quotaPolicy ?? "open_share",
      statement_enabled: input.statementEnabled ? 1 : 0,
      statement_text: input.statementText?.trim() ? input.statementText.trim() : null,
      attachments_json: JSON.stringify(input.attachments),
      created_at: createdAt,
    });

    return rowToAsset(this.getAssetByIdStmt.get(id));
  }

  bindGateMessage(assetId, gateMessageId) {
    this.bindGateMessageStmt.run({
      id: assetId,
      gate_message_id: gateMessageId,
    });
    return rowToAsset(this.getAssetByIdStmt.get(assetId));
  }

  getAssetById(assetId) {
    return rowToAsset(this.getAssetByIdStmt.get(assetId));
  }

  getAssetByGateMessageId(gateMessageId) {
    return rowToAsset(this.getAssetByGateMessageStmt.get(gateMessageId));
  }

  listAssetsByGateChannel(channelId) {
    return this.listAssetsByGateChannelStmt
      .all(channelId)
      .map((row) => rowToAsset(row))
      .filter(Boolean);
  }

  listCommentAssetsByChannel(channelId) {
    return this.listCommentAssetsByChannelStmt
      .all(channelId)
      .map((row) => rowToAsset(row))
      .filter((asset) => Boolean(asset.gateMessageId));
  }

  getProgress(gateMessageId, userId) {
    return rowToProgress(this.getProgressStmt.get(gateMessageId, userId));
  }

  saveProgress(gateMessageId, userId, progress) {
    const updatedAt = Date.now();
    this.upsertProgressStmt.run({
      gate_message_id: gateMessageId,
      user_id: userId,
      reaction_met: progress.reactionMet ? 1 : 0,
      comment_met: progress.commentMet ? 1 : 0,
      password_met: progress.passwordMet ? 1 : 0,
      statement_confirmed: progress.statementConfirmed ? 1 : 0,
      delivered_at: progress.deliveredAt ?? null,
      updated_at: updatedAt,
    });

    return this.getProgress(gateMessageId, userId);
  }

  getDailyUsage(userId, dateKey) {
    const row = this.getDailyUsageStmt.get(userId, dateKey);
    return row ? row.used_count : 0;
  }

  incrementDailyUsage(userId, dateKey, usedCount = 1) {
    const increment = Number.isFinite(usedCount) && usedCount > 0 ? Math.trunc(usedCount) : 1;

    this.incrementDailyUsageStmt.run({
      user_id: userId,
      date_key: dateKey,
      used_count: increment,
      updated_at: Date.now(),
    });

    return this.getDailyUsage(userId, dateKey);
  }

  deleteAssetById(assetId) {
    const asset = this.getAssetById(assetId);
    if (!asset) {
      return false;
    }

    const tx = this.db.transaction(() => {
      if (asset.gateMessageId) {
        this.deleteProgressByGateMessageStmt.run(asset.gateMessageId);
      }
      this.deleteAssetByIdStmt.run(assetId);
    });

    tx();
    return true;
  }

  listDeliveryLogs({ assetId = null, userId = null, limit = 20 } = {}) {
    const safeLimit = Number.isFinite(limit)
      ? Math.max(1, Math.min(30, Math.trunc(limit)))
      : 20;

    const rows = this.listDeliveryLogsStmt.all({
      asset_id: assetId,
      user_id: userId,
      limit: safeLimit,
    });

    return rows.map((row) => {
      let attachments = [];
      try {
        attachments = JSON.parse(row.attachments_json ?? "[]");
      } catch {
        attachments = [];
      }

      return {
        assetId: row.asset_id,
        gateMessageId: row.gate_message_id,
        sourceUrl: row.source_url,
        userId: row.user_id,
        deliveredAt: row.delivered_at,
        attachmentNames: attachments
          .map((item) => item?.name)
          .filter(Boolean),
      };
    });
  }
}
