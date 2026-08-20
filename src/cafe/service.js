// ─── Café Service ───────────────────────────────────────────────────────────
// Cart operations, order persistence, reservations, loyalty points.

const menu = require('./menu.json');
const { getDb } = require('../db/session');
const { formatRupiah } = require('../booking/service');

// ─── Menu Lookup ────────────────────────────────────────────────────────────

function findMenuItem(itemId) {
  for (const cat of menu.categories) {
    const item = cat.items.find(i => i.id === itemId);
    if (item) return item;
  }
  return null;
}

function fuzzyFindItem(text) {
  const lower = text.toLowerCase().trim();
  if (!lower) return null;

  // Exact match first
  for (const cat of menu.categories) {
    const exact = cat.items.find(i => i.name.toLowerCase() === lower);
    if (exact) return exact;
  }
  // Partial match
  for (const cat of menu.categories) {
    const partial = cat.items.find(i => i.name.toLowerCase().includes(lower));
    if (partial) return partial;
  }
  // Reverse partial (user text contains item name)
  for (const cat of menu.categories) {
    const rev = cat.items.find(i => lower.includes(i.name.toLowerCase()));
    if (rev) return rev;
  }
  return null;
}

// ─── Cart Operations ────────────────────────────────────────────────────────

function addToCart(draft, itemId, qty = 1) {
  const item = findMenuItem(itemId);
  if (!item) return false;

  const existing = draft.cart.find(c => c.itemId === itemId);
  if (existing) {
    existing.qty += qty;
    existing.subtotal = existing.qty * existing.price;
  } else {
    draft.cart.push({
      itemId,
      name: item.name,
      qty,
      price: item.price,
      subtotal: item.price * qty,
    });
  }
  recalcTotal(draft);
  return true;
}

function removeFromCart(draft, itemId) {
  draft.cart = draft.cart.filter(c => c.itemId !== itemId);
  recalcTotal(draft);
}

function updateCartQty(draft, itemId, newQty) {
  if (newQty <= 0) return removeFromCart(draft, itemId);
  const existing = draft.cart.find(c => c.itemId === itemId);
  if (!existing) return addToCart(draft, itemId, newQty);
  existing.qty = newQty;
  existing.subtotal = existing.qty * existing.price;
  recalcTotal(draft);
}

function recalcTotal(draft) {
  draft.totalAmount = draft.cart.reduce((sum, c) => sum + c.subtotal, 0);
}

// ─── Free-text Cart Modification ────────────────────────────────────────────

function parseCartModification(text, draft) {
  const lower = text.toLowerCase().trim();

  // "hapus espresso" / "remove latte" / "batal croissant"
  const hapusMatch = lower.match(/^(hapus|remove|batal)\s+(.+)/);
  if (hapusMatch) {
    const found = fuzzyFindItem(hapusMatch[2]);
    if (found) {
      removeFromCart(draft, found.id);
      return { message: `❌ ${found.name} dihapus dari keranjang` };
    }
  }

  // "espresso 3" / "3 espresso" / "espresso x3"
  const qtyMatch = lower.match(/^(.+?)\s*[x×]\s*(\d+)$/)
    || lower.match(/^(.+?)\s+(\d+)$/)
    || lower.match(/^(\d+)\s*[x×]?\s*(.+)$/);
  if (qtyMatch) {
    const [, a, b] = qtyMatch;
    const nameStr = isNaN(a) ? a : b;
    const qtyStr = isNaN(a) ? b : a;
    const found = fuzzyFindItem(nameStr.trim());
    if (found) {
      const qty = parseInt(qtyStr, 10);
      addToCart(draft, found.id, qty);
      return { message: `✅ ${found.name} x${qty} ditambahkan — ${formatRupiah(found.price * qty)}` };
    }
  }

  // Plain item name → add 1
  const found = fuzzyFindItem(lower);
  if (found) {
    addToCart(draft, found.id, 1);
    return { message: `✅ ${found.name} x1 ditambahkan — ${formatRupiah(found.price)}` };
  }

  return null;
}

// ─── Order Persistence ──────────────────────────────────────────────────────

function generateOrderCode() {
  const now = new Date();
  const ymd = now.toISOString().slice(2, 10).replace(/-/g, '');
  const rand = Math.random().toString(16).slice(2, 6).toUpperCase();
  return `KFE-${ymd}-${rand}`;
}

function saveOrder(conversationId, draft) {
  const db = getDb();
  const orderCode = generateOrderCode();

  const insertOrder = db.prepare(`
    INSERT INTO cafe_orders (id, conversation_id, order_type, table_number, total_amount, payment_status, status)
    VALUES (?, ?, ?, ?, ?, 'paid', 'new')
  `);

  const insertItem = db.prepare(`
    INSERT INTO cafe_order_items (order_id, item_name, qty, price, subtotal)
    VALUES (?, ?, ?, ?, ?)
  `);

  const txn = db.transaction(() => {
    insertOrder.run(orderCode, conversationId, draft.type, draft.tableNumber || null, draft.totalAmount);
    for (const item of draft.cart) {
      insertItem.run(orderCode, item.name, item.qty, item.price, item.subtotal);
    }
  });
  txn();

  return orderCode;
}

function markOrderPaid(orderCode) {
  const db = getDb();
  db.prepare(`UPDATE cafe_orders SET payment_status = 'paid' WHERE id = ?`).run(orderCode);
}

// ─── Reservation ────────────────────────────────────────────────────────────

function generateReservationId() {
  const now = new Date();
  const ymd = now.toISOString().slice(2, 10).replace(/-/g, '');
  const rand = Math.random().toString(16).slice(2, 6).toUpperCase();
  return `RSV-${ymd}-${rand}`;
}

function saveReservation(contactId, draft) {
  const db = getDb();
  const id = generateReservationId();

  db.prepare(`
    INSERT INTO cafe_reservations (id, contact_id, name, pax, date, time, notes, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed')
  `).run(id, contactId, draft.name || null, draft.pax, draft.date, draft.time, draft.notes || null);

  return id;
}

// ─── Pax & DateTime Parsing ─────────────────────────────────────────────────

function parsePaxInput(text) {
  const paxMatch = text.match(/(\d+)\s*(orang|pax|org|tamu)?/i);
  const pax = paxMatch ? parseInt(paxMatch[1], 10) : null;

  let notes = null;
  if (paxMatch) {
    const afterPax = text.slice(paxMatch.index + paxMatch[0].length).trim();
    notes = afterPax.replace(/^[,\-–—]\s*/, '').trim() || null;
  }

  return { pax, notes };
}

function parseDateTimeInput(text) {
  const lower = text.toLowerCase().trim();
  const now = new Date();

  let date = null;
  let time = null;

  // Time parsing: "jam 19:00", "19.00", "7 malam", "19:30"
  const timeMatch = lower.match(/(?:jam\s+)?(\d{1,2})[.:h](\d{2})/)
    || lower.match(/(?:jam\s+)?(\d{1,2})\s*(pagi|siang|sore|malam)/);
  if (timeMatch) {
    let hour = parseInt(timeMatch[1], 10);
    const minute = timeMatch[2] && isNaN(timeMatch[2]) ? '00' : (timeMatch[2] || '00');
    const period = timeMatch[2] && isNaN(timeMatch[2]) ? timeMatch[2] : null;

    if (period === 'malam' && hour < 12) hour += 12;
    if (period === 'sore' && hour < 12) hour += 12;
    if (period === 'pagi' && hour === 12) hour = 0;

    time = `${String(hour).padStart(2, '0')}:${typeof minute === 'string' && minute.length === 2 ? minute : '00'}`;
  }

  // Date parsing
  const MONTHS = {
    januari: 0, februari: 1, maret: 2, april: 3, mei: 4, juni: 5,
    juli: 6, agustus: 7, september: 8, oktober: 9, november: 10, desember: 11,
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, agu: 7, sep: 8, okt: 9, oct: 9, nov: 10, des: 11, dec: 11,
  };

  // "besok" / "lusa"
  if (lower.includes('besok') || lower.includes('tomorrow')) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    date = formatDate(d);
  } else if (lower.includes('lusa')) {
    const d = new Date(now);
    d.setDate(d.getDate() + 2);
    date = formatDate(d);
  } else if (lower.includes('hari ini') || lower.includes('today')) {
    date = formatDate(now);
  }

  // "20 Agustus" / "20 Aug"
  if (!date) {
    const dateMatch = lower.match(/(\d{1,2})\s+([\wéè]+)/);
    if (dateMatch) {
      const day = parseInt(dateMatch[1], 10);
      const monthStr = dateMatch[2];
      if (MONTHS[monthStr] !== undefined) {
        const d = new Date(now.getFullYear(), MONTHS[monthStr], day);
        if (d < now) d.setFullYear(d.getFullYear() + 1);
        date = formatDate(d);
      }
    }
  }

  // Day names: "sabtu", "minggu"
  if (!date) {
    const DAYS = { minggu: 0, senin: 1, selasa: 2, rabu: 3, kamis: 4, jumat: 5, sabtu: 6 };
    for (const [name, dayIdx] of Object.entries(DAYS)) {
      if (lower.includes(name)) {
        const d = new Date(now);
        const diff = (dayIdx - d.getDay() + 7) % 7 || 7;
        d.setDate(d.getDate() + diff);
        date = formatDate(d);
        break;
      }
    }
  }

  return { date, time };
}

function formatDate(d) {
  const day = d.getDate();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  return `${day} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

// ─── Loyalty Points ─────────────────────────────────────────────────────────

function addLoyaltyPoints(contactId, amount) {
  const points = Math.floor(amount / 10000); // 1 poin per 10rb
  if (points <= 0) return 0;

  const db = getDb();
  db.prepare(`
    INSERT INTO loyalty_points (contact_id, points_balance, last_earned_at, created_at)
    VALUES (?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(contact_id) DO UPDATE SET
      points_balance = points_balance + ?,
      last_earned_at = datetime('now')
  `).run(contactId, points, points);

  return points;
}

function getPoints(contactId) {
  const db = getDb();
  const row = db.prepare('SELECT points_balance FROM loyalty_points WHERE contact_id = ?').get(contactId);
  return row?.points_balance || 0;
}

module.exports = {
  findMenuItem,
  fuzzyFindItem,
  addToCart,
  removeFromCart,
  updateCartQty,
  parseCartModification,
  generateOrderCode,
  saveOrder,
  markOrderPaid,
  parsePaxInput,
  parseDateTimeInput,
  saveReservation,
  addLoyaltyPoints,
  getPoints,
  formatRupiah,
};
