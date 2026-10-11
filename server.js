import http from "node:http";
import { DatabaseSync } from "node:sqlite";
import {
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const statuses = ["exploring", "accepted", "revisited"];
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export function validateRecord(input) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new HttpError(400, "Expected an object.");
  const result = {};
  for (const [key, max] of Object.entries({
    title: 120,
    context: 4000,
    decision: 4000,
    evidence: 4000,
    project: 60,
  })) {
    if (typeof input[key] !== "string" || input[key].length > max)
      throw new HttpError(
        400,
        `${key} must be text of at most ${max} characters.`,
      );
    result[key] = input[key].trim();
  }
  if (!result.title || !result.project)
    throw new HttpError(400, "Title and project are required.");
  if (!statuses.includes(input.status))
    throw new HttpError(400, "Invalid status.");
  result.status = input.status;
  if (
    !Array.isArray(input.tags) ||
    input.tags.length > 8 ||
    input.tags.some((t) => typeof t !== "string" || !t.trim() || t.length > 24)
  )
    throw new HttpError(400, "Use up to 8 tags, each 1–24 characters.");
  result.tags = [...new Set(input.tags.map((t) => t.trim()))];
  return result;
}
export function createApp({
  dbPath = process.env.TRACE_DB || resolve(root, "data/trace.db"),
  password = process.env.TRACE_PASSWORD_FILE
    ? readFileSync(process.env.TRACE_PASSWORD_FILE, "utf8").trim()
    : process.env.TRACE_PASSWORD,
  origin = process.env.TRACE_ORIGIN || "http://127.0.0.1:3000",
  secure = process.env.TRACE_SECURE_COOKIE === "true",
} = {}) {
  if (!password || password.length < 12)
    throw new Error(
      "Set TRACE_PASSWORD (at least 12 characters) or TRACE_PASSWORD_FILE.",
    );
  const allowedOrigin = new URL(origin).origin;
  if (dbPath !== ":memory:")
    mkdirSync(dirname(dbPath), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(dbPath);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS records(id TEXT PRIMARY KEY, payload TEXT NOT NULL, version INTEGER NOT NULL, created TEXT NOT NULL, updated TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS attempts(ip TEXT PRIMARY KEY, count INTEGER NOT NULL, reset INTEGER NOT NULL);
    PRAGMA user_version=1;`);
  // Restart invalidates sessions, including after password rotation.
  db.exec("DELETE FROM sessions");
  const salt = randomBytes(32),
    passwordHash = scryptSync(password, salt, 64);
  const decode = (row) =>
    row && {
      ...JSON.parse(row.payload),
      id: row.id,
      version: row.version,
      created: row.created,
      updated: row.updated,
    };
  const cookie = (token, maxAge) =>
    `trace_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
  const server = http.createServer(async (req, res) => {
    const requestId = randomUUID();
    res.setHeader("X-Request-ID", requestId);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    );
    res.setHeader("Cache-Control", "no-store");
    const send = (status, value) => {
      res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
      });
      res.end(JSON.stringify(value));
    };
    async function body() {
      if (!req.headers["content-type"]?.startsWith("application/json"))
        throw new HttpError(415, "Use application/json.");
      let chunks = [],
        size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 65536) throw new HttpError(413, "Request exceeds 64 KiB.");
        chunks.push(chunk);
      }
      try {
        return JSON.parse(Buffer.concat(chunks).toString());
      } catch {
        throw new HttpError(400, "Invalid JSON.");
      }
    }
    try {
      const url = new URL(req.url, "http://localhost"),
        path = url.pathname;
      if (!["GET", "POST", "PUT", "DELETE"].includes(req.method))
        throw new HttpError(405, "Method not allowed.");
      if (!["GET"].includes(req.method) && req.headers.origin !== allowedOrigin)
        throw new HttpError(403, "Origin rejected.");
      if (path === "/health" && req.method === "GET") {
        db.prepare("SELECT 1").get();
        return send(200, { ok: true });
      }
      const token = /(?:^|;\s*)trace_session=([a-f0-9]{64})(?:;|$)/.exec(
        req.headers.cookie || "",
      )?.[1];
      const session =
        token &&
        db.prepare("SELECT expires FROM sessions WHERE token=?").get(token);
      const authenticated = session && session.expires > Date.now();
      if (path === "/api/session" && req.method === "GET")
        return send(200, { authenticated: !!authenticated });
      if (path === "/api/session" && req.method === "POST") {
        const ip = req.socket.remoteAddress,
          now = Date.now();
        db.prepare("DELETE FROM attempts WHERE reset < ?").run(now);
        db.prepare("DELETE FROM sessions WHERE expires < ?").run(now);
        const attempt = db.prepare("SELECT * FROM attempts WHERE ip=?").get(ip);
        if (attempt?.count >= 10) {
          res.setHeader("Retry-After", Math.ceil((attempt.reset - now) / 1000));
          throw new HttpError(
            429,
            "Too many attempts. Try again in 15 minutes.",
          );
        }
        const input = await body();
        if (typeof input?.password !== "string" || input.password.length > 1024)
          throw new HttpError(400, "Invalid password.");
        if (
          !timingSafeEqual(scryptSync(input.password, salt, 64), passwordHash)
        ) {
          db.prepare(
            "INSERT INTO attempts VALUES(?,1,?) ON CONFLICT(ip) DO UPDATE SET count=count+1",
          ).run(ip, now + 900000);
          throw new HttpError(401, "Incorrect password.");
        }
        db.prepare("DELETE FROM attempts WHERE ip=?").run(ip);
        const newToken = randomBytes(32).toString("hex");
        db.prepare("INSERT INTO sessions VALUES(?,?)").run(
          newToken,
          now + 86400000,
        );
        res.setHeader("Set-Cookie", cookie(newToken, 86400));
        return send(200, { authenticated: true });
      }
      if (path.startsWith("/api/")) {
        if (!authenticated) throw new HttpError(401, "Please sign in.");
        if (path === "/api/session" && req.method === "DELETE") {
          db.prepare("DELETE FROM sessions WHERE token=?").run(token);
          res.setHeader("Set-Cookie", cookie("", 0));
          return send(200, { ok: true });
        }
        if (path === "/api/export" && req.method === "GET") {
          res.setHeader(
            "Content-Disposition",
            'attachment; filename="trace-backup.json"',
          );
          return send(200, {
            schema: 1,
            exported: new Date().toISOString(),
            records: db
              .prepare("SELECT * FROM records ORDER BY created")
              .all()
              .map(decode),
          });
        }
        if (path === "/api/records" && req.method === "GET")
          return send(
            200,
            db
              .prepare("SELECT * FROM records ORDER BY updated DESC")
              .all()
              .map(decode),
          );
        if (path === "/api/records" && req.method === "POST") {
          const record = validateRecord(await body()),
            id = randomUUID(),
            now = new Date().toISOString();
          db.prepare("INSERT INTO records VALUES(?,?,1,?,?)").run(
            id,
            JSON.stringify(record),
            now,
            now,
          );
          return send(
            201,
            decode(db.prepare("SELECT * FROM records WHERE id=?").get(id)),
          );
        }
        const match = /^\/api\/records\/([a-f0-9-]{36})$/.exec(path);
        if (match) {
          const old = db
            .prepare("SELECT * FROM records WHERE id=?")
            .get(match[1]);
          if (!old) throw new HttpError(404, "Decision not found.");
          if (req.method === "PUT" || req.method === "DELETE") {
            const input = await body();
            if (
              !Number.isInteger(input?.version) ||
              input.version !== old.version
            )
              throw new HttpError(
                409,
                "This decision changed. Reload before editing.",
              );
            if (req.method === "DELETE") {
              db.prepare("DELETE FROM records WHERE id=? AND version=?").run(
                old.id,
                input.version,
              );
              return send(200, { ok: true });
            }
            const record = validateRecord(input);
            db.prepare(
              "UPDATE records SET payload=?, version=version+1, updated=? WHERE id=? AND version=?",
            ).run(
              JSON.stringify(record),
              new Date().toISOString(),
              old.id,
              input.version,
            );
            return send(
              200,
              decode(
                db.prepare("SELECT * FROM records WHERE id=?").get(old.id),
              ),
            );
          }
        }
        throw new HttpError(404, "Endpoint not found.");
      }
      const assets = {
        "/": ["index.html", "text/html"],
        "/app.js": ["app.js", "text/javascript"],
        "/style.css": ["style.css", "text/css"],
        "/favicon.svg": ["favicon.svg", "image/svg+xml"],
      };
      if (req.method !== "GET" || !assets[path])
        throw new HttpError(404, "Page not found.");
      const [file, type] = assets[path];
      res.writeHead(200, { "Content-Type": `${type}; charset=utf-8` });
      res.end(readFileSync(resolve(root, "public", file)));
    } catch (error) {
      if (!error.status)
        console.error(
          JSON.stringify({ level: "error", requestId, message: error.message }),
        );
      if (!res.headersSent)
        send(error.status || 500, {
          error: error.status ? error.message : "Internal server error.",
          requestId,
        });
      else res.end();
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.on("close", () => db.close());
  return server;
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const server = createApp();
  server.listen(
    Number(process.env.PORT || 3000),
    process.env.HOST || "127.0.0.1",
    () =>
      console.log("Trace is listening on port " + (process.env.PORT || 3000)),
  );
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => {
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(1), 10000).unref();
    });
}
