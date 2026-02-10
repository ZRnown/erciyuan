import { setGlobalDispatcher, ProxyAgent } from "undici";

let cachedState = null;

export function normalizeProxyUrl(rawValue) {
  const value = String(rawValue ?? "").trim();
  if (!value) {
    return null;
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`代理地址无效：${value}`);
  }

  if (!parsed.protocol || !["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("仅支持 http/https 代理，请设置为 http:// 或 https:// 开头");
  }

  return parsed.toString();
}

export function resolveProxyUrlFromEnv(env = process.env) {
  const candidates = [
    env.DISCORD_PROXY_URL,
    env.HTTPS_PROXY,
    env.https_proxy,
    env.HTTP_PROXY,
    env.http_proxy,
  ];

  for (const candidate of candidates) {
    if (String(candidate ?? "").trim()) {
      return normalizeProxyUrl(candidate);
    }
  }

  return null;
}

function maskProxyForLog(proxyUrl) {
  try {
    const url = new URL(proxyUrl);
    if (!url.username && !url.password) {
      return url.toString();
    }

    url.username = "***";
    url.password = "***";
    return url.toString();
  } catch {
    return proxyUrl;
  }
}

export function bootstrapDiscordProxy({ env = process.env, logger = console } = {}) {
  if (cachedState) {
    return cachedState;
  }

  const proxyUrl = resolveProxyUrlFromEnv(env);

  if (!proxyUrl) {
    cachedState = {
      enabled: false,
      proxyUrl: null,
      dispatcher: null,
      logUrl: null,
    };
    return cachedState;
  }

  const dispatcher = new ProxyAgent(proxyUrl);
  setGlobalDispatcher(dispatcher);

  // @discordjs/ws 在 Node.js 下默认使用 ws 包，无法走 undici 代理。
  // 这里在代理模式下启用全局 WebSocket 路径，让网关连接也复用 undici 代理。
  if (!("bun" in process.versions)) {
    process.versions.bun = process.versions.node;
  }

  const logUrl = maskProxyForLog(proxyUrl);

  cachedState = {
    enabled: true,
    proxyUrl,
    dispatcher,
    logUrl,
  };

  logger.info?.(`Discord network proxy enabled: ${logUrl}`);

  return cachedState;
}
