import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp, validateRecord } from "../server.js";
const password = "test-workspace-password",
  origin = "http://127.0.0.1:3000";
let server, base, cookie, record;
const input = {
  title: "Choose SQLite",
  project: "Trace",
  status: "exploring",
  context: "Single server",
  decision: "",
  evidence: "",
  tags: ["storage"],
};
async function call(path, method = "GET", data, extra = {}) {
  const response = await fetch(base + path, {
    method,
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      Cookie: cookie || "",
      ...extra,
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  return { status: response.status, data: await response.json(), response };
}
before(async () => {
  server = createApp({ dbPath: ":memory:", password, origin });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((r) => server.close(r));
});
test("fails closed without a strong password", () => {
  assert.throws(
    () => createApp({ password: "weak", dbPath: ":memory:" }),
    /12 characters/,
  );
});
test("health and security headers", async () => {
  const r = await call("/health");
  assert.equal(r.status, 200);
  assert.equal(r.response.headers.get("x-content-type-options"), "nosniff");
  assert.match(
    r.response.headers.get("content-security-policy"),
    /frame-ancestors 'none'/,
  );
});
test("private endpoints require authentication", async () => {
  assert.equal((await call("/api/records")).status, 401);
  assert.equal((await call("/api/export")).status, 401);
});
test("rejects cross-origin login", async () => {
  assert.equal(
    (
      await call(
        "/api/session",
        "POST",
        { password },
        { Origin: "https://evil.example" },
      )
    ).status,
    403,
  );
});
test("rejects malformed login and wrong credentials", async () => {
  assert.equal((await call("/api/session", "POST", null)).status, 400);
  assert.equal(
    (await call("/api/session", "POST", { password: "wrong" })).status,
    401,
  );
});
test("login creates a private cookie", async () => {
  const r = await call("/api/session", "POST", { password });
  assert.equal(r.status, 200);
  const header = r.response.headers.get("set-cookie");
  assert.match(header, /HttpOnly/);
  assert.match(header, /SameSite=Strict/);
  cookie = header.split(";")[0];
  assert.equal((await call("/api/session")).data.authenticated, true);
});
test("creates and retrieves a decision", async () => {
  const r = await call("/api/records", "POST", input);
  assert.equal(r.status, 201);
  record = r.data;
  assert.equal(record.version, 1);
  assert.equal((await call("/api/records")).data[0].title, input.title);
});
test("validates statuses, fields, tags and lengths", async () => {
  for (const bad of [
    { ...input, status: "oops" },
    { ...input, title: "" },
    { ...input, title: "x".repeat(121) },
    { ...input, tags: ["x".repeat(25)] },
    { ...input, context: null },
    { ...input, tags: Array(9).fill("a") },
  ])
    assert.equal((await call("/api/records", "POST", bad)).status, 400);
  assert.deepEqual(validateRecord({ ...input, tags: [" a ", "a"] }).tags, [
    "a",
  ]);
});
test("optimistic concurrency rejects stale updates and deletes", async () => {
  const r = await call(`/api/records/${record.id}`, "PUT", {
    ...input,
    status: "accepted",
    version: 1,
  });
  assert.equal(r.status, 200);
  assert.equal(r.data.version, 2);
  assert.equal(
    (await call(`/api/records/${record.id}`, "PUT", { ...input, version: 1 }))
      .status,
    409,
  );
  assert.equal(
    (await call(`/api/records/${record.id}`, "DELETE", { version: 1 })).status,
    409,
  );
  record = r.data;
});
test("rejects cross-origin authenticated changes", async () => {
  assert.equal(
    (
      await call("/api/records", "POST", input, {
        Origin: "https://evil.example",
      })
    ).status,
    403,
  );
});
test("export includes complete records and schema", async () => {
  const r = await call("/api/export");
  assert.equal(r.data.schema, 1);
  assert.equal(r.data.records[0].id, record.id);
  assert.match(r.response.headers.get("content-disposition"), /attachment/);
});
test("returns missing record and endpoint errors", async () => {
  assert.equal(
    (
      await call("/api/records/00000000-0000-0000-0000-000000000000", "PUT", {
        ...input,
        version: 1,
      })
    ).status,
    404,
  );
  assert.equal((await call("/api/missing")).status, 404);
});
test("rejects non-JSON and oversized bodies", async () => {
  const malformed = await fetch(base + "/api/records", {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      Cookie: cookie,
    },
    body: "{broken",
  });
  assert.equal(malformed.status, 400);

  assert.equal(
    (
      await call("/api/records", "POST", input, {
        "Content-Type": "text/plain",
      })
    ).status,
    415,
  );
  assert.equal(
    (
      await call("/api/records", "POST", {
        ...input,
        context: "x".repeat(70000),
      })
    ).status,
    413,
  );
});
test("deletes records and invalidates logout session", async () => {
  assert.equal(
    (await call(`/api/records/${record.id}`, "DELETE", { version: 2 })).status,
    200,
  );
  assert.equal((await call("/api/records")).data.length, 0);
  assert.equal((await call("/api/session", "DELETE")).status, 200);
  assert.equal((await call("/api/records")).status, 401);
});
test("rate limits repeated bad passwords", async () => {
  for (let i = 0; i < 10; i++)
    assert.equal(
      (await call("/api/session", "POST", { password: "wrong" })).status,
      401,
    );
  const r = await call("/api/session", "POST", { password });
  assert.equal(r.status, 429);
  assert.ok(Number(r.response.headers.get("retry-after")) > 0);
});
test("SQLite survives restart while sessions are invalidated", async () => {
  const dir = mkdtempSync(join(tmpdir(), "trace-"));
  let s;
  try {
    const dbPath = join(dir, "trace.db");
    s = createApp({ dbPath, password, origin });
    await new Promise((r) => s.listen(0, "127.0.0.1", r));
    let url = `http://127.0.0.1:${s.address().port}`;
    const login = await fetch(url + "/api/session", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const oldCookie = login.headers.get("set-cookie").split(";")[0];
    await fetch(url + "/api/records", {
      method: "POST",
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        Cookie: oldCookie,
      },
      body: JSON.stringify(input),
    });
    await new Promise((r) => s.close(r));
    s = createApp({ dbPath, password, origin });
    await new Promise((r) => s.listen(0, "127.0.0.1", r));
    url = `http://127.0.0.1:${s.address().port}`;
    assert.equal(
      (await fetch(url + "/api/records", { headers: { Cookie: oldCookie } }))
        .status,
      401,
    );
    const login2 = await fetch(url + "/api/session", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const rows = await (
      await fetch(url + "/api/records", {
        headers: { Cookie: login2.headers.get("set-cookie").split(";")[0] },
      })
    ).json();
    assert.equal(rows[0].title, input.title);
  } finally {
    if (s?.listening) await new Promise((r) => s.close(r));
    rmSync(dir, { recursive: true, force: true });
  }
});
