import test from "node:test";
import assert from "node:assert/strict";
import { MessageFlags } from "discord.js";

import {
  CLAIM_PICKER_SELECT_ID,
  buildAssetClaimButtonId,
  createAssetClaimPanel,
  parseAssetClaimButtonId,
} from "../src/discord/assetClaimPanel.js";

const assets = [
  {
    id: "a1",
    createdAt: Date.parse("2026-02-14T08:00:00+08:00"),
    attachments: [{ name: "果实V5.40预设-0201更新.zip" }],
  },
  {
    id: "a2",
    createdAt: Date.parse("2026-02-10T23:07:00+08:00"),
    attachments: [{ name: "克劳德版 果实C0.2——0210更新.zip" }],
  },
];

test("asset claim button id can be encoded and parsed", () => {
  const id = buildAssetClaimButtonId("claim", "a1");
  assert.equal(id, "claim_picker:claim:a1");
  assert.deepEqual(parseAssetClaimButtonId(id), {
    action: "claim",
    assetId: "a1",
  });
});

test("createAssetClaimPanel builds select + disabled claim button by default", () => {
  const payload = createAssetClaimPanel({ assets });
  assert.equal(payload.flags, MessageFlags.Ephemeral);
  assert.equal(payload.components.length, 2);

  const selectRow = payload.components[0].toJSON();
  assert.equal(selectRow.components[0].custom_id, CLAIM_PICKER_SELECT_ID);
  assert.equal(selectRow.components[0].options.length, 2);

  const buttonRow = payload.components[1].toJSON();
  assert.equal(buttonRow.components[0].custom_id, buildAssetClaimButtonId("claim", ""));
  assert.equal(buttonRow.components[0].disabled, true);
});

test("createAssetClaimPanel enables claim button when an asset is selected", () => {
  const payload = createAssetClaimPanel({
    assets,
    selectedAssetId: "a2",
    includeFlags: false,
  });

  assert.equal(payload.flags, undefined);
  const buttonRow = payload.components[1].toJSON();
  assert.equal(buttonRow.components[0].custom_id, buildAssetClaimButtonId("claim", "a2"));
  assert.equal(buttonRow.components[0].disabled, false);
});
