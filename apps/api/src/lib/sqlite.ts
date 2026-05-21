import sqlite3 from "sqlite3";

const db = new sqlite3.Database("./apps/api/data/miclub.sqlite");

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
