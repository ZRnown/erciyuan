import test from "node:test";
import assert from "node:assert/strict";

import { buildThreadTopLink } from "../src/domain/threadTop.js";

test("buildThreadTopLink builds starter message URL for thread", () => {
  const link = buildThreadTopLink({
    guildId: "111",
    threadId: "222",
    starterMessageId: "333",
  });

  assert.equal(link, "https://discord.com/channels/111/222/333");
});

test("buildThreadTopLink throws when required ids are missing", () => {
  assert.throws(() =>
    buildThreadTopLink({ guildId: "1", threadId: "2", starterMessageId: "" }),
  );
});
