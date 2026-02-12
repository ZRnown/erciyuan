import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { AssetFileStore } from "../src/services/assetFileStore.js";

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "asset-file-store-test-"));
}

test("AssetFileStore mirrors attachments and rewrites download URLs", async () => {
  const storageDir = makeTempDir();
  const store = new AssetFileStore({
    baseUrl: "https://files.example.com",
    storageDir,
    fetchImpl: async () => ({
      ok: true,
      arrayBuffer: async () => Uint8Array.from([1, 2, 3, 4]).buffer,
    }),
  });

  const original = [
    {
      id: "a1",
      name: "../bad name?.png",
      size: 4,
      url: "https://cdn.discordapp.com/attachments/1/2/image.png",
      contentType: "image/png",
    },
  ];

  const mirrored = await store.mirrorAttachments(original, { scopeKey: "scope-123" });
  assert.equal(mirrored.attachments.length, 1);
  assert.equal(mirrored.attachments[0].name, original[0].name);
  assert.equal(mirrored.attachments[0].storageKey, "scope-123");
  assert.equal(
    mirrored.attachments[0].url.startsWith("https://files.example.com/files/scope-123/"),
    true,
  );

  const savedFile = path.join(storageDir, "scope-123", mirrored.attachments[0].storedName);
  assert.equal(fs.existsSync(savedFile), true);
  assert.deepEqual([...fs.readFileSync(savedFile)], [1, 2, 3, 4]);

  await store.deleteFilesForAttachments(mirrored.attachments);
  assert.equal(fs.existsSync(path.join(storageDir, "scope-123")), false);
});

test("AssetFileStore keeps original URLs when hosting is disabled", async () => {
  const storageDir = makeTempDir();
  const store = new AssetFileStore({
    baseUrl: "",
    storageDir,
    fetchImpl: async () => {
      throw new Error("should not fetch when disabled");
    },
  });

  const original = [
    {
      id: "a1",
      name: "file.json",
      size: 10,
      url: "https://cdn.discordapp.com/attachments/1/2/file.json",
      contentType: "application/json",
    },
  ];

  const mirrored = await store.mirrorAttachments(original);
  assert.deepEqual(mirrored.attachments, original);
});
