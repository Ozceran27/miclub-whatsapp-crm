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
});

export default db;
