const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '../../sapatamu_waba.db');
const db = new Database(dbPath, { timeout: 7000 });

// Enable WAL mode & High-Concurrency Pragmas
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 7000');
db.pragma('synchronous = NORMAL');
db.pragma('temp_store = MEMORY');

// ─── Table Schemas ────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    phone_number TEXT PRIMARY KEY,
    name TEXT,
    bot_status TEXT DEFAULT 'bot', -- 'bot' (otomatis) atau 'human' (takeover staf CS)
    last_message TEXT,
    last_message_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    unread_count INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone_number TEXT NOT NULL,
    direction TEXT NOT NULL,       -- 'inbound' (dari user) / 'outbound' (dari bot/admin)
    sender TEXT NOT NULL,          -- 'user' / 'bot' / 'admin'
    message_type TEXT DEFAULT 'text', -- 'text', 'button', 'interactive', 'image'
    content TEXT,
    payload TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS hotel_bookings (
    booking_code TEXT PRIMARY KEY,
    phone_number TEXT,
    guest_name TEXT,
    room_key TEXT,
    room_name TEXT,
    nights INTEGER DEFAULT 1,
    check_in TEXT,
    check_out TEXT,
    total_price INTEGER,
    payment_method TEXT,
    status TEXT DEFAULT 'confirmed',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS cafe_orders (
    order_code TEXT PRIMARY KEY,
    phone_number TEXT,
    customer_name TEXT,
    table_number INTEGER,
    order_type TEXT,               -- 'dine_in' / 'takeaway'
    total_amount INTEGER,
    payment_status TEXT DEFAULT 'paid',
    status TEXT DEFAULT 'new',     -- 'new', 'preparing', 'ready', 'completed'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS cafe_order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_code TEXT NOT NULL,
    item_name TEXT NOT NULL,
    qty INTEGER DEFAULT 1,
    price INTEGER DEFAULT 0,
    subtotal INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS cafe_reservations (
    id TEXT PRIMARY KEY,
    phone_number TEXT,
    guest_name TEXT,
    pax INTEGER,
    date TEXT,
    time TEXT,
    notes TEXT,
    status TEXT DEFAULT 'confirmed',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS room_catalog (
    room_key TEXT PRIMARY KEY,
    name TEXT,
    price INTEGER,
    description TEXT,
    image TEXT
  );

  CREATE TABLE IF NOT EXISTS menu_catalog (
    id TEXT PRIMARY KEY,
    category TEXT,
    name TEXT,
    price INTEGER
  );

  CREATE TABLE IF NOT EXISTS bot_session_state (
    phone_number TEXT PRIMARY KEY,
    status TEXT DEFAULT 'idle',
    draft TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// ─── Auto-migration Kolom Tambahan ──────────────────────────────────────────
try {
  db.exec('ALTER TABLE cafe_orders ADD COLUMN customer_name TEXT');
} catch (e) {
  // Kolom sudah ada
}

// ─── Initial Seed Catalog if Empty ──────────────────────────────────────────
const countRooms = db.prepare('SELECT COUNT(*) as count FROM room_catalog').get();
if (countRooms.count === 0) {
  const insertRoom = db.prepare(`
    INSERT INTO room_catalog (room_key, name, price, description, image)
    VALUES (?, ?, ?, ?, ?)
  `);
  insertRoom.run('deluxe', 'Deluxe Room', 550000, 'Kasur King Size, Smart TV 43", AC, Balkon, Sarapan 2 pax', 'kamar_deluxe.jpg');
  insertRoom.run('executive', 'Executive Suite', 950000, 'Ruang Tamu Terpisah, Jacuzzi, Espresso Machine, Lounge Access', 'kamar_executive.jpg');
  insertRoom.run('suite', 'Presidential Suite', 1800000, '2 Kamar Tidur, Dining Room Mewah, Mini Bar Gratis, 24h Butler', 'kamar_suite.jpg');
}

const countMenu = db.prepare('SELECT COUNT(*) as count FROM menu_catalog').get();
if (countMenu.count === 0) {
  const insertMenu = db.prepare(`
    INSERT INTO menu_catalog (id, category, name, price)
    VALUES (?, ?, ?, ?)
  `);
  const menuData = [
    { id: 'esp', category: 'minuman', name: 'Espresso', price: 22000 },
    { id: 'ame', category: 'minuman', name: 'Americano', price: 22000 },
    { id: 'lat', category: 'minuman', name: 'Caffe Latte', price: 28000 },
    { id: 'cap', category: 'minuman', name: 'Cappuccino', price: 28000 },
    { id: 'mat', category: 'minuman', name: 'Matcha Latte', price: 25000 },
    { id: 'teh', category: 'minuman', name: 'Es Teh', price: 15000 },
    { id: 'jer', category: 'minuman', name: 'Jeruk Peras', price: 15000 },
    { id: 'cro', category: 'makanan', name: 'Butter Croissant', price: 20000 },
    { id: 'rot', category: 'makanan', name: 'Roti Bakar Spesial', price: 18000 },
    { id: 'car', category: 'makanan', name: 'Spaghetti Carbonara', price: 45000 },
    { id: 'nas', category: 'makanan', name: 'Nasi Goreng Spesial', price: 35000 },
  ];
  for (const m of menuData) {
    insertMenu.run(m.id, m.category, m.name, m.price);
  }
}

// ─── DAO Operations ─────────────────────────────────────────────────────────

function getConversation(phone) {
  return db.prepare('SELECT * FROM conversations WHERE phone_number = ?').get(phone);
}

function upsertConversation(phone, name, lastMessage) {
  db.prepare(`
    INSERT INTO conversations (phone_number, name, bot_status, last_message, last_message_at)
    VALUES (?, COALESCE(?, 'Tamu (+' || ? || ')'), 'bot', ?, CURRENT_TIMESTAMP)
    ON CONFLICT(phone_number) DO UPDATE SET
      last_message = excluded.last_message,
      last_message_at = CURRENT_TIMESTAMP,
      name = CASE WHEN excluded.name IS NOT NULL AND excluded.name != '' THEN excluded.name ELSE conversations.name END
  `).run(phone, name || null, phone, lastMessage);
}

function setBotStatus(phone, status) {
  db.prepare('UPDATE conversations SET bot_status = ? WHERE phone_number = ?').run(status, phone);
}

function saveMessage(phone, direction, sender, messageType, content, payload = null) {
  db.prepare(`
    INSERT INTO messages (phone_number, direction, sender, message_type, content, payload)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(phone, direction, sender, messageType, content, payload ? JSON.stringify(payload) : null);
}

function getMessages(phone, limit = 50) {
  return db.prepare(`
    SELECT * FROM messages 
    WHERE phone_number = ? 
    ORDER BY created_at ASC, id ASC
    LIMIT ?
  `).all(phone, limit);
}

function getAllConversations() {
  return db.prepare(`
    SELECT * FROM conversations 
    ORDER BY last_message_at DESC
  `).all();
}

function getSession(phone) {
  const row = db.prepare('SELECT status, draft FROM bot_session_state WHERE phone_number = ?').get(phone);
  if (!row) return { status: 'idle', draft: null };
  return {
    status: row.status,
    draft: row.draft ? JSON.parse(row.draft) : null,
  };
}

function setSession(phone, status, draft = null) {
  db.prepare(`
    INSERT INTO bot_session_state (phone_number, status, draft, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(phone_number) DO UPDATE SET
      status = excluded.status,
      draft = excluded.draft,
      updated_at = CURRENT_TIMESTAMP
  `).run(phone, status, draft ? JSON.stringify(draft) : null);
}

function clearSession(phone) {
  setSession(phone, 'idle', null);
}

function saveHotelBooking(data) {
  db.prepare(`
    INSERT INTO hotel_bookings (
      booking_code, phone_number, guest_name, room_key, room_name,
      nights, check_in, check_out, total_price, payment_method, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed')
  `).run(
    data.bookingCode, data.phoneNumber, data.guestName, data.roomKey, data.roomName,
    data.nights, data.checkIn, data.checkOut, data.totalPrice, data.paymentMethod
  );
  return data.bookingCode;
}

function saveCafeOrder(orderData, items) {
  const insertOrder = db.prepare(`
    INSERT INTO cafe_orders (order_code, phone_number, customer_name, table_number, order_type, total_amount, payment_status, status)
    VALUES (?, ?, ?, ?, ?, ?, 'paid', 'new')
  `);
  const insertItem = db.prepare(`
    INSERT INTO cafe_order_items (order_code, item_name, qty, price, subtotal)
    VALUES (?, ?, ?, ?, ?)
  `);

  const txn = db.transaction(() => {
    insertOrder.run(
      orderData.orderCode,
      orderData.phoneNumber || null,
      orderData.customerName || orderData.guestName || 'Pelanggan',
      orderData.tableNumber || null,
      orderData.orderType || 'dine_in',
      orderData.totalAmount
    );
    for (const item of (items || [])) {
      insertItem.run(orderData.orderCode, item.name, item.qty, item.price, item.subtotal);
    }
  });
  txn();
  return orderData.orderCode;
}

function saveCafeReservation(data) {
  db.prepare(`
    INSERT INTO cafe_reservations (id, phone_number, guest_name, pax, date, time, notes, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed')
  `).run(data.id, data.phoneNumber, data.guestName, data.pax, data.date, data.time, data.notes);
  return data.id;
}

function getStats() {
  const totalBookings = db.prepare('SELECT COUNT(*) as c, COALESCE(SUM(total_price), 0) as rev FROM hotel_bookings').get();
  const totalOrders = db.prepare('SELECT COUNT(*) as c, COALESCE(SUM(total_amount), 0) as rev FROM cafe_orders').get();
  const totalReservations = db.prepare('SELECT COUNT(*) as c FROM cafe_reservations').get();
  const activeChats = db.prepare('SELECT COUNT(*) as c FROM conversations').get();
  return {
    hotel: { count: totalBookings.c, revenue: totalBookings.rev },
    cafe: { count: totalOrders.c, revenue: totalOrders.rev },
    reservations: totalReservations.c,
    chats: activeChats.c,
  };
}

module.exports = {
  db,
  prepare: (...args) => db.prepare(...args),
  transaction: (fn) => db.transaction(fn),
  getConversation,
  upsertConversation,
  setBotStatus,
  saveMessage,
  getMessages,
  getAllConversations,
  getSession,
  setSession,
  clearSession,
  saveHotelBooking,
  saveCafeOrder,
  saveCafeReservation,
  getStats,
};
