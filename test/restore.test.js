import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { restore } from "../restore.js";
test("backup restores exactly and refuses overwrites or invalid input", () => {
  const dir = mkdtempSync(join(tmpdir(), "trace-restore-")),
    source = join(dir, "backup.json"),
    target = join(dir, "restored.db");
  const row = {
    id: "00000000-0000-4000-8000-000000000000",
    title: "Decision",
    project: "Trace",
    status: "accepted",
    context: "Context",
    decision: "Choice",
    evidence: "Result",
    tags: ["tag"],
    version: 2,
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
  };
  try {
    writeFileSync(source, JSON.stringify({ schema: 1, records: [row] }));
    assert.equal(restore(source, target), 1);
    const db = new DatabaseSync(target);
    assert.equal(
      JSON.parse(db.prepare("SELECT payload FROM records").get().payload)
        .evidence,
      "Result",
    );
    db.close();
    assert.throws(() => restore(source, target), /already exists/);
    writeFileSync(source, JSON.stringify({ schema: 1, records: [row, row] }));
    assert.throws(() => restore(source, join(dir, "duplicate.db")));
    assert.equal(existsSync(join(dir, "duplicate.db")), false);
    writeFileSync(source, JSON.stringify({ schema: 2, records: [] }));
    assert.throws(() => restore(source, join(dir, "bad.db")), /Unsupported/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
