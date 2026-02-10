import test from "node:test";
import assert from "node:assert/strict";

import { buildCommands } from "../src/discord/commands.js";

test("buildCommands keeps only required slash commands + publish context command", () => {
  const commands = buildCommands();

  assert.equal(commands.length, 4);
  const payloads = commands.map((command) => command.toJSON());

  const slashCount = payloads.filter((item) => !item.type || item.type === 1).length;
  const contextCount = payloads.filter((item) => item.type === 3).length;

  assert.equal(slashCount, 3);
  assert.equal(contextCount, 1);
  assert.equal(
    payloads.some((item) => item.name === "发布此消息附件作为作品" && item.type === 3),
    true,
  );

  const slashNames = payloads
    .filter((item) => !item.type || item.type === 1)
    .map((item) => item.name)
    .sort();
  assert.deepEqual(slashNames, ["claim-by-id", "delete-post", "top"]);

  const claimById = payloads.find((item) => item.name === "claim-by-id");
  assert.ok(claimById);
  assert.equal(claimById.name_localizations["zh-CN"], "输入作品id获取");

  const deletePost = payloads.find((item) => item.name === "delete-post");
  assert.ok(deletePost);
  assert.equal(deletePost.name_localizations["zh-CN"], "删除帖子");
  assert.equal(deletePost.options.length, 1);
  assert.equal(deletePost.options[0].name, "post_link");

  const top = payloads.find((item) => item.name === "top");
  assert.ok(top);
  assert.equal(top.name_localizations["zh-CN"], "回顶");
});
