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

    // Buat tabel session_state jika belum ada
    db.exec(`
      CREATE TABLE IF NOT EXISTS session_state (
        conversation_id INTEGER PRIMARY KEY,
        status          TEXT NOT NULL DEFAULT 'idle',
        booking_draft   TEXT,
        updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS bookings (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        booking_code    TEXT UNIQUE NOT NULL,
        conversation_id INTEGER NOT NULL,
        customer_phone  TEXT,
        customer_name   TEXT NOT NULL,
        room_type       TEXT NOT NULL,
        check_in_date   TEXT NOT NULL,
        nights          INTEGER NOT NULL DEFAULT 1,
        total_price     INTEGER NOT NULL,
        payment_method  TEXT NOT NULL,
        status          TEXT NOT NULL DEFAULT 'pending',
        created_at      TEXT NOT NULL DEFAULT (datetime('now')),
        paid_at         TEXT
      );
    `);

    // Migration jika kolom booking_draft belum ada di database lama
    try {
      const tableInfo = db.prepare(`PRAGMA table_info(session_state)`).all();
      const hasDraft = tableInfo.some(col => col.name === 'booking_draft');
      if (!hasDraft) {
        db.exec(`ALTER TABLE session_state ADD COLUMN booking_draft TEXT;`);
      }
    } catch (e) {
      // ignore
    }

    console.log('✅ [DB] SQLite session.db & bookings table siap digunakan');
  }
  return db;
}

module.exports = { getDb };
