import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeProxyUrl,
  resolveProxyUrlFromEnv,
} from "../src/network/proxyBootstrap.js";

test("resolveProxyUrlFromEnv prefers DISCORD_PROXY_URL over generic proxy env", () => {
  const proxyUrl = resolveProxyUrlFromEnv({
    DISCORD_PROXY_URL: "http://127.0.0.1:9000",
    HTTPS_PROXY: "http://127.0.0.1:7897",
  });

  assert.equal(proxyUrl, "http://127.0.0.1:9000/");
});

test("resolveProxyUrlFromEnv falls back to HTTPS_PROXY", () => {
  const proxyUrl = resolveProxyUrlFromEnv({
    https_proxy: "http://127.0.0.1:7897",
  });

  assert.equal(proxyUrl, "http://127.0.0.1:7897/");
});

test("resolveProxyUrlFromEnv ignores socks all_proxy by default", () => {
  const proxyUrl = resolveProxyUrlFromEnv({
    all_proxy: "socks5://127.0.0.1:7897",
  });

  assert.equal(proxyUrl, null);
});

test("normalizeProxyUrl accepts http and https schemes", () => {
  assert.equal(normalizeProxyUrl(" http://127.0.0.1:7897 "), "http://127.0.0.1:7897/");
  assert.equal(normalizeProxyUrl("https://127.0.0.1:7897"), "https://127.0.0.1:7897/");
});

test("normalizeProxyUrl rejects unsupported schemes", () => {
  assert.throws(() => normalizeProxyUrl("socks5://127.0.0.1:7897"), /仅支持 http\/https 代理/);
});
