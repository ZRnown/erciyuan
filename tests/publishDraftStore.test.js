import test from "node:test";
import assert from "node:assert/strict";

import { PublishDraftStore } from "../src/services/publishDraftStore.js";

test("PublishDraftStore create/get/update/delete", () => {
  const store = new PublishDraftStore({ ttlMs: 60_000 });

  const draft = store.create({
    ownerUserId: "u1",
    guildId: "g1",
    gateChannelId: "c1",
    sourceType: "message_context",
    sourceChannelId: "c1",
    sourceMessageId: "m1",
    sourceUrl: "https://discord.com/channels/1/1/1",
    attachments: [{ name: "a.json", size: 1, contentType: "application/json" }],
  });

  const updated = store.update(draft.id, { mode: "reaction" });
  assert.equal(updated.mode, "reaction");

  const found = store.get(draft.id);
  assert.equal(found.id, draft.id);

  store.delete(draft.id);
  assert.equal(store.get(draft.id), null);
});
