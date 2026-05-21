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

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS message_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      memberId TEXT NOT NULL,
      nombre TEXT NOT NULL,
      telefono TEXT NOT NULL,
      mensaje TEXT NOT NULL,
      waLink TEXT NOT NULL,
      estado TEXT NOT NULL,
      createdAt TEXT NOT NULL
    )`);

  const requiredColumns: Array<{ name: string; definition: string }> = [
    { name: "status", definition: "TEXT NOT NULL DEFAULT 'prepared'" },
    { name: "openedAt", definition: "TEXT" },
    { name: "sentAt", definition: "TEXT" },
    { name: "note", definition: "TEXT" }
  ];

  db.all<{ name: string }>("PRAGMA table_info(message_history)", (err, rows) => {
    if (err) {
      console.error("No se pudo inspeccionar schema de message_history", err);
      return;
    }

    const existingColumns = new Set(rows.map((row) => row.name));
    for (const column of requiredColumns) {
      if (!existingColumns.has(column.name)) {
        db.run(`ALTER TABLE message_history ADD COLUMN ${column.name} ${column.definition}`);
      }
    }

    if (existingColumns.has("estado") && !existingColumns.has("status")) {
      db.run("UPDATE message_history SET status = COALESCE(estado, 'prepared') WHERE status IS NULL");
    }
  });
});

export default db;
