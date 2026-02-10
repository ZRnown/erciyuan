import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { createDatabase } from "../src/db.js";
import { Storage } from "../src/services/storage.js";

function setupStorage() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "protected-bot-test-"));
  const dbPath = path.join(dir, "bot.db");
  const db = createDatabase(dbPath);
  const storage = new Storage(db);

  return { db, storage, dbPath };
}

test("Storage can create asset and bind gate message", () => {
  const { db, storage } = setupStorage();

  const asset = storage.createAsset({
    guildId: "1",
    ownerUserId: "u1",
    gateChannelId: "c1",
    sourceType: "upload",
    sourceChannelId: "c1",
    sourceMessageId: null,
    sourceUrl: null,
    unlockMode: "reaction_or_comment",
    baseMode: "reaction_or_comment",
    passcodeEnabled: true,
    passwordHash: "hash",
    quotaPolicy: "daily_limited",
    statementEnabled: true,
    statementText: "仅供学习交流",
    attachments: [
      {
        id: "a",
        name: "file.png",
        size: 1,
        url: "https://x",
        contentType: "image/png",
      },
    ],
  });

  assert.equal(asset.gateMessageId, null);
  assert.equal(/^\d+$/.test(asset.id), true);
  assert.equal(asset.baseMode, "reaction_or_comment");
  assert.equal(asset.passcodeEnabled, true);
  assert.equal(asset.quotaPolicy, "daily_limited");
  assert.equal(asset.statementEnabled, true);

  const updated = storage.bindGateMessage(asset.id, "gate123");
  assert.equal(updated.gateMessageId, "gate123");

  const queried = storage.getAssetByGateMessageId("gate123");
  assert.equal(queried.id, asset.id);

  db.close();
});

test("Storage saves and loads progress", () => {
  const { db, storage } = setupStorage();

  storage.saveProgress("gate1", "user1", {
    reactionMet: true,
    commentMet: false,
    passwordMet: true,
    statementConfirmed: true,
    deliveredAt: null,
  });

  const progress = storage.getProgress("gate1", "user1");

  assert.deepEqual(
    {
      reactionMet: progress.reactionMet,
      commentMet: progress.commentMet,
      passwordMet: progress.passwordMet,
      statementConfirmed: progress.statementConfirmed,
    },
    {
      reactionMet: true,
      commentMet: false,
      passwordMet: true,
      statementConfirmed: true,
    },
  );

  db.close();
});

test("Storage tracks daily usage", () => {
  const { db, storage } = setupStorage();

  assert.equal(storage.getDailyUsage("user1", "2026-02-09"), 0);
  storage.incrementDailyUsage("user1", "2026-02-09", 1);
  storage.incrementDailyUsage("user1", "2026-02-09", 2);

  assert.equal(storage.getDailyUsage("user1", "2026-02-09"), 3);

  db.close();
});

test("Storage can delete asset and related progress", () => {
  const { db, storage } = setupStorage();

  const asset = storage.createAsset({
    guildId: "1",
    ownerUserId: "u1",
    gateChannelId: "c1",
    sourceType: "upload",
    sourceChannelId: "c1",
    sourceMessageId: null,
    sourceUrl: null,
    unlockMode: "reaction",
    baseMode: "reaction",
    passcodeEnabled: false,
    passwordHash: null,
    quotaPolicy: "open_share",
    statementEnabled: false,
    statementText: null,
    attachments: [
      {
        id: "a",
        name: "file.png",
        size: 1,
        url: "https://x",
        contentType: "image/png",
      },
    ],
  });

  storage.bindGateMessage(asset.id, "gate-delete-1");
  storage.saveProgress("gate-delete-1", "user1", {
    reactionMet: true,
    commentMet: false,
    passwordMet: false,
    statementConfirmed: false,
    deliveredAt: null,
  });

  assert.equal(storage.deleteAssetById(asset.id), true);
  assert.equal(storage.getAssetById(asset.id), null);
  assert.equal(storage.getProgress("gate-delete-1", "user1"), null);
  assert.equal(storage.deleteAssetById(asset.id), false);

  db.close();
});

test("Storage can list delivery logs by asset and user", () => {
  const { db, storage } = setupStorage();

  const asset = storage.createAsset({
    guildId: "1",
    ownerUserId: "u1",
    gateChannelId: "c1",
    sourceType: "upload",
    sourceChannelId: "c1",
    sourceMessageId: null,
    sourceUrl: "https://discord.com/channels/1/2/3",
    unlockMode: "reaction",
    baseMode: "reaction",
    passcodeEnabled: false,
    passwordHash: null,
    quotaPolicy: "open_share",
    statementEnabled: false,
    statementText: null,
    attachments: [
      {
        id: "a",
        name: "01-qr.json",
        size: 1,
        url: "https://x",
        contentType: "application/json",
      },
    ],
  });

  storage.bindGateMessage(asset.id, "gate-log-1");

  storage.saveProgress("gate-log-1", "user-1", {
    reactionMet: true,
    commentMet: false,
    passwordMet: false,
    statementConfirmed: false,
    deliveredAt: 1730000000000,
  });

  storage.saveProgress("gate-log-1", "user-2", {
    reactionMet: true,
    commentMet: false,
    passwordMet: false,
    statementConfirmed: false,
    deliveredAt: 1730000005000,
  });

  const allLogs = storage.listDeliveryLogs({ limit: 10 });
  assert.equal(allLogs.length, 2);
  assert.equal(allLogs[0].userId, "user-2");
  assert.equal(allLogs[0].assetId, asset.id);
  assert.deepEqual(allLogs[0].attachmentNames, ["01-qr.json"]);

  const assetLogs = storage.listDeliveryLogs({ assetId: asset.id, userId: "user-1", limit: 10 });
  assert.equal(assetLogs.length, 1);
  assert.equal(assetLogs[0].userId, "user-1");

  db.close();
});

test("Storage can list assets by gate channel", () => {
  const { db, storage } = setupStorage();

  const makeAsset = (gateChannelId) =>
    storage.createAsset({
      guildId: "1",
      ownerUserId: "u1",
      gateChannelId,
      sourceType: "upload",
      sourceChannelId: gateChannelId,
      sourceMessageId: null,
      sourceUrl: null,
      unlockMode: "reaction",
      baseMode: "reaction",
      passcodeEnabled: false,
      passwordHash: null,
      quotaPolicy: "open_share",
      statementEnabled: false,
      statementText: null,
      attachments: [
        {
          id: "a",
          name: "file.png",
          size: 1,
          url: "https://x",
          contentType: "image/png",
        },
      ],
    });

  const inThread = makeAsset("thread-1");
  storage.bindGateMessage(inThread.id, "gate-thread-1");

  const otherThread = makeAsset("thread-2");
  storage.bindGateMessage(otherThread.id, "gate-thread-2");

  const rows = storage.listAssetsByGateChannel("thread-1");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, inThread.id);
  assert.notEqual(rows[0].id, otherThread.id);

  db.close();
});
