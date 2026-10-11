import { readFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { validateRecord } from "./server.js";
export function restore(source, target) {
  target = resolve(target);
  if (existsSync(target))
    throw new Error("Target already exists. Restore to a new database path.");
  const text = readFileSync(source);
  if (text.length > 10 * 1024 * 1024) throw new Error("Backup exceeds 10 MiB.");
  const data = JSON.parse(text.toString());
  if (
    data.schema !== 1 ||
    !Array.isArray(data.records) ||
    data.records.length > 10000
  )
    throw new Error("Unsupported backup.");
  const rows = data.records.map((r) => {
    const payload = validateRecord(r);
    if (
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
        r.id,
      ) ||
      !Number.isSafeInteger(r.version) ||
      r.version < 1 ||
      typeof r.created !== "string" ||
      typeof r.updated !== "string" ||
      !Number.isFinite(Date.parse(r.created)) ||
      !Number.isFinite(Date.parse(r.updated))
    )
      throw new Error("Invalid record metadata.");
    return [r.id, JSON.stringify(payload), r.version, r.created, r.updated];
  });
  mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(target);
  try {
    db.exec(
      "BEGIN; CREATE TABLE records(id TEXT PRIMARY KEY,payload TEXT NOT NULL,version INTEGER NOT NULL,created TEXT NOT NULL,updated TEXT NOT NULL); PRAGMA user_version=1;",
    );
    const stmt = db.prepare("INSERT INTO records VALUES(?,?,?,?,?)");
    for (const row of rows) stmt.run(...row);
    db.exec("COMMIT");
    db.close();
    return rows.length;
  } catch (error) {
    db.exec("ROLLBACK");
    db.close();
    rmSync(target);
    throw error;
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    if (process.argv.length !== 4)
      throw new Error("Usage: node restore.js backup.json data/restored.db");
    console.log(
      `Restored ${restore(process.argv[2], process.argv[3])} decisions.`,
    );
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}
