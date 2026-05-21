import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sqlite3 from "sqlite3";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../../../");

const defaultDbPath = path.resolve(repoRoot, "apps/api/data/miclub.sqlite");
const configuredDbPath = process.env.SQLITE_DB_PATH
  ? path.resolve(repoRoot, process.env.SQLITE_DB_PATH)
  : defaultDbPath;

fs.mkdirSync(path.dirname(configuredDbPath), { recursive: true });

const db = new sqlite3.Database(configuredDbPath);

const addColumnIfMissing = (
  existingColumns: Set<string>,
  columnName: string,
  definition: string
) => {
  if (!existingColumns.has(columnName)) {
    db.run(`ALTER TABLE message_history ADD COLUMN ${columnName} ${definition}`);
  }
};

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS message_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    body TEXT NOT NULL,
    isDefault INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS message_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    memberId TEXT NOT NULL,
    nombre TEXT NOT NULL,
    telefono TEXT NOT NULL,
    mensaje TEXT NOT NULL,
    waLink TEXT NOT NULL,
    estado TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'prepared',
    openedAt TEXT,
    sentAt TEXT,
    note TEXT
  )`);

  db.all<{ name: string }>("PRAGMA table_info(message_history)", (err, rows) => {
    if (err) {
      console.error("No se pudo inspeccionar schema de message_history", err);
      return;
    }

    const existingColumns = new Set(rows.map((row) => row.name));

    db.serialize(() => {
      addColumnIfMissing(existingColumns, "status", "TEXT NOT NULL DEFAULT 'prepared'");
      addColumnIfMissing(existingColumns, "openedAt", "TEXT");
      addColumnIfMissing(existingColumns, "sentAt", "TEXT");
      addColumnIfMissing(existingColumns, "note", "TEXT");

      db.run("UPDATE message_history SET status = 'prepared' WHERE status IS NULL");
    });
  });
});

export default db;
