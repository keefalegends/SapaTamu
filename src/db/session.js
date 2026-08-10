const Database = require('better-sqlite3');
const path     = require('path');
const fs       = require('fs');

// Simpan DB di root project
const DB_DIR  = path.join(__dirname, '../../');
const DB_PATH = path.join(DB_DIR, 'session.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');

    // Buat tabel jika belum ada
    db.exec(`
      CREATE TABLE IF NOT EXISTS session_state (
        conversation_id INTEGER PRIMARY KEY,
        status          TEXT NOT NULL DEFAULT 'idle',
        updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    console.log('✅ [DB] SQLite session.db siap digunakan');
  }
  return db;
}

module.exports = { getDb };
