import fs from "node:fs";
import { promises as fsPromises } from "node:fs";
import http from "node:http";
import path from "node:path";
import { randomUUID } from "node:crypto";

const DEFAULT_ROUTE_PREFIX = "/files";
const DEFAULT_PORT = 8787;
const SAFE_SCOPE_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;

function trimTrailingSlash(value) {
  return String(value).replace(/\/+$/, "");
}

function normalizeRoutePrefix(routePrefix) {
  const raw = String(routePrefix ?? "").trim();
  if (!raw) {
    return DEFAULT_ROUTE_PREFIX;
  }

  const withLeadingSlash = raw.startsWith("/") ? raw : `/${raw}`;
  return withLeadingSlash.replace(/\/+$/, "") || DEFAULT_ROUTE_PREFIX;
}

function normalizeBaseUrl(baseUrl) {
  const raw = String(baseUrl ?? "").trim();
  if (!raw) {
    return "";
  }

  const url = new URL(raw);
  url.hash = "";
  url.search = "";
  url.pathname = trimTrailingSlash(url.pathname || "/") || "/";
  return url.toString();
}

function sanitizeScopeKey(input) {
  const raw = String(input ?? "").trim();
  if (!raw) {
    return randomUUID();
  }

  const cleaned = raw
    .replace(/[^A-Za-z0-9_-]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);

  if (!cleaned) {
    return randomUUID();
  }

  return cleaned;
}

function sanitizeFileName(fileName, index) {
  const fallback = `attachment-${index + 1}`;
  const base = path.basename(String(fileName ?? "").trim() || fallback);
  const cleaned = base
    .replace(/[\u0000-\u001f<>:"/\\|?*]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "");

  const safe = cleaned || fallback;
  const indexPrefix = `${String(index + 1).padStart(2, "0")}-`;

  const extension = path.extname(safe);
  const stem = extension ? safe.slice(0, -extension.length) : safe;
  const safeStem = stem.slice(0, 120);
  const safeExtension = extension.slice(0, 20);

  return `${indexPrefix}${safeStem || fallback}${safeExtension}`;
}

function isSafeStoredName(fileName) {
  if (!fileName) {
    return false;
  }

  if (fileName.includes("/") || fileName.includes("\\")) {
    return false;
  }

  if (fileName.includes("..")) {
    return false;
  }

  return true;
}

function toArray(input) {
  if (!Array.isArray(input)) {
    return [];
  }
  return input;
}

function encodeRFC5987Value(value) {
  return encodeURIComponent(value).replace(/['()*]/g, (ch) => `%${ch.charCodeAt(0).toString(16)}`);
}

export class AssetFileStore {
  constructor({
    baseUrl = "",
    storageDir,
    routePrefix = DEFAULT_ROUTE_PREFIX,
    fetchImpl = globalThis.fetch,
    logger = console,
  } = {}) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.enabled = this.baseUrl.length > 0;
    this.storageDir = path.resolve(storageDir ?? path.resolve(process.cwd(), "data", "uploads"));
    this.routePrefix = normalizeRoutePrefix(routePrefix);
    this.fetchImpl = fetchImpl;
    this.logger = logger;
    this.server = null;

    if (this.enabled && typeof this.fetchImpl !== "function") {
      throw new Error("当前运行环境不支持 fetch，无法转存附件。");
    }

    const base = this.baseUrl ? new URL(this.baseUrl) : null;
    const basePath = base ? trimTrailingSlash(base.pathname || "/") : "";
    this.routePath = base ? `${basePath}${this.routePrefix}`.replace(/\/{2,}/g, "/") : this.routePrefix;
  }

  buildPublicUrl(scopeKey, storedName) {
    if (!this.enabled) {
      return "";
    }

    const key = sanitizeScopeKey(scopeKey);
    const fileName = String(storedName ?? "").trim();
    const base = new URL(this.baseUrl);
    base.pathname = `${this.routePath}/${encodeURIComponent(key)}/${encodeURIComponent(fileName)}`.replace(
      /\/{2,}/g,
      "/",
    );
    base.hash = "";
    base.search = "";
    return base.toString();
  }

  parseStoredRef(url) {
    if (!this.enabled) {
      return null;
    }

    const raw = String(url ?? "").trim();
    if (!raw) {
      return null;
    }

    let parsed;
    try {
      parsed = new URL(raw);
    } catch {
      return null;
    }

    const base = new URL(this.baseUrl);
    if (parsed.origin !== base.origin) {
      return null;
    }

    const routePrefix = `${this.routePath}/`;
    if (!parsed.pathname.startsWith(routePrefix)) {
      return null;
    }

    const relative = parsed.pathname.slice(routePrefix.length);
    const parts = relative.split("/").filter(Boolean);
    if (parts.length < 2) {
      return null;
    }

    let scopeKey;
    let storedName;
    try {
      scopeKey = decodeURIComponent(parts[0]);
      storedName = decodeURIComponent(parts.slice(1).join("/"));
    } catch {
      return null;
    }

    if (!SAFE_SCOPE_PATTERN.test(scopeKey)) {
      return null;
    }

    if (!isSafeStoredName(storedName)) {
      return null;
    }

    return { scopeKey, storedName };
  }

  resolveStoredPath(scopeKey, storedName) {
    if (!SAFE_SCOPE_PATTERN.test(scopeKey)) {
      return null;
    }
    if (!isSafeStoredName(storedName)) {
      return null;
    }

    const scopeDir = path.resolve(this.storageDir, scopeKey);
    const filePath = path.resolve(scopeDir, storedName);

    const scopeDirPrefix = `${scopeDir}${path.sep}`;
    if (filePath !== scopeDir && !filePath.startsWith(scopeDirPrefix)) {
      return null;
    }

    return filePath;
  }

  async mirrorAttachments(attachments, { scopeKey = randomUUID() } = {}) {
    const sourceAttachments = toArray(attachments).map((item) => ({ ...item }));
    if (!this.enabled || sourceAttachments.length === 0) {
      return {
        attachments: sourceAttachments,
        scopeKey: null,
      };
    }

    const safeScopeKey = sanitizeScopeKey(scopeKey);
    const scopeDir = path.join(this.storageDir, safeScopeKey);
    await fsPromises.mkdir(scopeDir, { recursive: true });

    const mirrored = [];
    try {
      for (const [index, attachment] of sourceAttachments.entries()) {
        const sourceUrl = String(attachment?.url ?? "").trim();
        if (!sourceUrl) {
          throw new Error(`第 ${index + 1} 个附件缺少下载地址`);
        }

        const response = await this.fetchImpl(sourceUrl);
        if (!response?.ok) {
          throw new Error(
            `下载附件失败（${attachment?.name ?? `附件${index + 1}`}，HTTP ${response?.status ?? "unknown"}）`,
          );
        }

        const bytes = Buffer.from(await response.arrayBuffer());
        const storedName = sanitizeFileName(attachment?.name, index);
        const storedPath = path.join(scopeDir, storedName);
        await fsPromises.writeFile(storedPath, bytes);

        mirrored.push({
          ...attachment,
          url: this.buildPublicUrl(safeScopeKey, storedName),
          storageKey: safeScopeKey,
          storedName,
        });
      }
    } catch (error) {
      await fsPromises.rm(scopeDir, { recursive: true, force: true }).catch(() => {});
      throw new Error(`附件转存失败：${error instanceof Error ? error.message : String(error)}`);
    }

    return {
      attachments: mirrored,
      scopeKey: safeScopeKey,
    };
  }

  async deleteFilesForAttachments(attachments) {
    if (!this.enabled) {
      return;
    }

    const keys = new Set();
    for (const attachment of toArray(attachments)) {
      const directKey = String(attachment?.storageKey ?? "").trim();
      if (directKey && SAFE_SCOPE_PATTERN.test(directKey)) {
        keys.add(directKey);
        continue;
      }

      const parsed = this.parseStoredRef(attachment?.url);
      if (parsed?.scopeKey) {
        keys.add(parsed.scopeKey);
      }
    }

    for (const key of keys) {
      const dirPath = path.join(this.storageDir, key);
      await fsPromises.rm(dirPath, { recursive: true, force: true }).catch(() => {});
    }
  }

  async startServer({ host = "0.0.0.0", port = DEFAULT_PORT } = {}) {
    if (!this.enabled) {
      return null;
    }

    if (this.server) {
      return this.server;
    }

    await fsPromises.mkdir(this.storageDir, { recursive: true });

    const server = http.createServer((req, res) => {
      this.handleRequest(req, res).catch((error) => {
        this.logger.error?.("File server request failed:", error);
        if (!res.headersSent) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
        }
        res.end("Internal Server Error");
      });
    });

    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, host, () => {
        server.off("error", reject);
        resolve();
      });
    });

    this.server = server;
    return server;
  }

  async stopServer() {
    if (!this.server) {
      return;
    }

    const server = this.server;
    this.server = null;
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  async handleRequest(req, res) {
    if (!this.enabled) {
      res.statusCode = 404;
      res.end("Not Found");
      return;
    }

    const method = String(req.method ?? "GET").toUpperCase();
    if (method !== "GET" && method !== "HEAD") {
      res.statusCode = 405;
      res.setHeader("Allow", "GET, HEAD");
      res.end("Method Not Allowed");
      return;
    }

    const requestUrl = new URL(req.url ?? "/", "http://localhost");
    const candidates = [`${this.routePath}/`, `${this.routePrefix}/`];

    let relative = null;
    for (const prefix of candidates) {
      if (requestUrl.pathname.startsWith(prefix)) {
        relative = requestUrl.pathname.slice(prefix.length);
        break;
      }
    }

    if (relative === null) {
      res.statusCode = 404;
      res.end("Not Found");
      return;
    }
    const parts = relative.split("/").filter(Boolean);
    if (parts.length < 2) {
      res.statusCode = 404;
      res.end("Not Found");
      return;
    }

    let scopeKey;
    let storedName;
    try {
      scopeKey = decodeURIComponent(parts[0]);
      storedName = decodeURIComponent(parts.slice(1).join("/"));
    } catch {
      res.statusCode = 400;
      res.end("Bad Request");
      return;
    }

    const filePath = this.resolveStoredPath(scopeKey, storedName);
    if (!filePath) {
      res.statusCode = 400;
      res.end("Bad Request");
      return;
    }

    let stats;
    try {
      stats = await fsPromises.stat(filePath);
    } catch {
      res.statusCode = 404;
      res.end("Not Found");
      return;
    }

    if (!stats.isFile()) {
      res.statusCode = 404;
      res.end("Not Found");
      return;
    }

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Length", String(stats.size));
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeRFC5987Value(storedName)}`,
    );
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");

    if (method === "HEAD") {
      res.end();
      return;
    }

    const stream = fs.createReadStream(filePath);
    stream.on("error", () => {
      if (!res.headersSent) {
        res.statusCode = 500;
      }
      res.end("Internal Server Error");
    });
    stream.pipe(res);
  }
}
