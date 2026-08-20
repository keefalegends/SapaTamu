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

    // ─── Café tables ───
    db.exec(`
      CREATE TABLE IF NOT EXISTS cafe_orders (
        id              TEXT PRIMARY KEY,
        conversation_id INTEGER NOT NULL,
        order_type      TEXT NOT NULL CHECK(order_type IN ('dine_in', 'takeaway')),
        table_number    INTEGER,
        total_amount    INTEGER NOT NULL,
        payment_status  TEXT NOT NULL DEFAULT 'pending' CHECK(payment_status IN ('pending', 'paid', 'cancelled')),
        status          TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new', 'preparing', 'ready', 'completed', 'cancelled')),
        created_at      TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS cafe_order_items (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id        TEXT NOT NULL REFERENCES cafe_orders(id),
        item_name       TEXT NOT NULL,
        qty             INTEGER NOT NULL,
        price           INTEGER NOT NULL,
        subtotal        INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS cafe_reservations (
        id              TEXT PRIMARY KEY,
        contact_id      TEXT NOT NULL,
        name            TEXT,
        pax             INTEGER NOT NULL,
        date            TEXT NOT NULL,
        time            TEXT NOT NULL,
        notes           TEXT,
        status          TEXT NOT NULL DEFAULT 'confirmed' CHECK(status IN ('confirmed', 'cancelled', 'completed')),
        created_at      TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS loyalty_points (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        contact_id      TEXT NOT NULL UNIQUE,
        points_balance  INTEGER NOT NULL DEFAULT 0,
        last_earned_at  TEXT,
        created_at      TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_cafe_orders_conv ON cafe_orders(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_cafe_reservations_contact ON cafe_reservations(contact_id);
    `);

    console.log('✅ [DB] SQLite session.db & bookings & café tables siap digunakan');
  }
  return db;
}

module.exports = { getDb };
