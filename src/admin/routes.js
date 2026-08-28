const express = require('express');
const router = express.Router();
const db = require('../db/database');
const gateway = require('../gateway/openkoneksiClient');
const { processInboundMessage } = require('../bot/engine');

// 1. Dashboard Overview Stats
router.get('/stats', (req, res) => {
  try {
    const stats = db.getStats();
    res.json({ success: true, stats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Chat List
router.get('/chats', (req, res) => {
  try {
    const chats = db.getAllConversations();
    res.json({ success: true, chats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Chat Messages History
router.get('/chats/:phone/messages', (req, res) => {
  try {
    const phone = req.params.phone;
    const messages = db.getMessages(phone);
    res.json({ success: true, messages });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Staf CS Membalas Manual (Human Reply)
router.post('/chats/:phone/reply', async (req, res) => {
  try {
    const phone = req.params.phone;
    const { text } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, error: 'Pesan tidak boleh kosong' });
    }

    // Pastikan status kontak adalah human (takeover)
    db.setBotStatus(phone, 'human');

    // Kirim pesan WhatsApp ke nomor user
    await gateway.sendText(phone, `👨‍💼 *[Staf CS SapaTamu]*\n\n${text}`);

    // Update sender di database menjadi 'admin'
    db.saveMessage(phone, 'outbound', 'admin', 'text', text);
    db.upsertConversation(phone, null, `[Staf]: ${text}`);

    res.json({ success: true, message: 'Balasan terkirim ke WhatsApp' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Toggle Bot Status (Bot Aktif <-> Human Takeover)
router.patch('/chats/:phone/toggle-bot', (req, res) => {
  try {
    const phone = req.params.phone;
    const { status } = req.body; // 'bot' atau 'human'

    if (!['bot', 'human'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Status harus "bot" atau "human"' });
    }

    db.setBotStatus(phone, status);
    res.json({ success: true, status });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Daftar Reservasi Kamar Hotel
router.get('/bookings', (req, res) => {
  try {
    const bookings = db.db.prepare('SELECT * FROM hotel_bookings ORDER BY created_at DESC LIMIT 100').all();
    res.json({ success: true, bookings });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 7. Daftar Pesanan Kafe & Rincian Item
router.get('/orders', (req, res) => {
  try {
    const orders = db.db.prepare('SELECT * FROM cafe_orders ORDER BY created_at DESC LIMIT 100').all();
    const getItems = db.db.prepare('SELECT * FROM cafe_order_items WHERE order_code = ?');

    const ordersWithItems = orders.map(o => ({
      ...o,
      items: getItems.all(o.order_code),
    }));

    res.json({ success: true, orders: ordersWithItems });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 8. Daftar Reservasi Meja Kafe
router.get('/reservations', (req, res) => {
  try {
    const reservations = db.db.prepare('SELECT * FROM cafe_reservations ORDER BY created_at DESC LIMIT 100').all();
    res.json({ success: true, reservations });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 9. Katalog Kamar & Menu
router.get('/catalog', (req, res) => {
  try {
    const rooms = db.db.prepare('SELECT * FROM room_catalog').all();
    const menu = db.db.prepare('SELECT * FROM menu_catalog').all();
    res.json({ success: true, rooms, menu });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 10. Update Harga Menu
router.post('/catalog/menu', (req, res) => {
  try {
    const { id, price, name } = req.body;
    db.db.prepare('UPDATE menu_catalog SET price = ?, name = COALESCE(?, name) WHERE id = ?').run(price, name || null, id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 11. WhatsApp Simulator (Untuk Live Demo Presentasi)
router.post('/simulate', async (req, res) => {
  try {
    const { phone, senderName, text } = req.body;
    const testPhone = phone || '6281958992884';
    const testName = senderName || 'Tamu Presentasi';

    await processInboundMessage(testPhone, testName, text);
    const messages = db.getMessages(testPhone);

    res.json({ success: true, messages });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
