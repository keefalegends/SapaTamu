const express = require('express');
const router = express.Router();
const db = require('../db/database');
const gateway = require('../gateway/whatsappClient');
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

    // Kirim pesan WhatsApp ke nomor user dengan identitas sender: 'admin'
    await gateway.sendText(phone, `👨‍💼 *[Staf CS SapaTamu]*\n\n${text}`, 'admin');
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

// Hapus Reservasi Kamar Hotel
router.delete('/bookings/:code', (req, res) => {
  try {
    const rawCode = req.params.code;
    const cleanCode = rawCode.replace(/^#/, '');
    const result = db.db.prepare('DELETE FROM hotel_bookings WHERE booking_code = ? OR booking_code = ?').run(rawCode, cleanCode);
    res.json({ success: true, message: `Booking #${cleanCode} berhasil dihapus`, changes: result.changes });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update Status Booking Kamar (Confirmed / Checked In / Checked Out)
router.patch('/bookings/:code/status', (req, res) => {
  try {
    const cleanCode = req.params.code.replace(/^#/, '');
    const { status } = req.body;
    db.db.prepare('UPDATE hotel_bookings SET status = ? WHERE booking_code = ? OR booking_code = ?').run(status, req.params.code, cleanCode);
    res.json({ success: true, message: `Status booking #${cleanCode} berhasil diubah ke ${status}` });
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

// Hapus Pesanan Kafe & Item Terkait
router.delete('/orders/:code', (req, res) => {
  try {
    const rawCode = req.params.code;
    const cleanCode = rawCode.replace(/^#/, '');
    db.db.prepare('DELETE FROM cafe_order_items WHERE order_code = ? OR order_code = ?').run(rawCode, cleanCode);
    const result = db.db.prepare('DELETE FROM cafe_orders WHERE order_code = ? OR order_code = ?').run(rawCode, cleanCode);
    res.json({ success: true, message: `Pesanan #${cleanCode} berhasil dihapus`, changes: result.changes });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update Status Pesanan Kafe (Dapur / Selesai)
router.patch('/orders/:code/status', (req, res) => {
  try {
    const cleanCode = req.params.code.replace(/^#/, '');
    const { status } = req.body;
    db.db.prepare('UPDATE cafe_orders SET status = ? WHERE order_code = ? OR order_code = ?').run(status, req.params.code, cleanCode);
    res.json({ success: true, message: `Status pesanan #${cleanCode} berhasil diubah ke ${status}` });
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

// Hapus Reservasi Meja
router.delete('/reservations/:id', (req, res) => {
  try {
    const rawId = req.params.id;
    const cleanId = rawId.replace(/^#/, '');
    const result = db.db.prepare('DELETE FROM cafe_reservations WHERE id = ? OR id = ?').run(rawId, cleanId);
    res.json({ success: true, message: `Reservasi #${cleanId} berhasil dihapus`, changes: result.changes });
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

// 11. WhatsApp Simulator (Internal API / Testing)
router.post('/simulate', async (req, res) => {
  try {
    const { phone, senderName, text } = req.body;
    const testPhone = phone || '6281958992884';
    const testName = senderName || 'Tamu';

    await processInboundMessage(testPhone, testName, text);
    const messages = db.getMessages(testPhone);

    res.json({ success: true, messages });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 12. Real System Health & Gateway Connection Status
router.get('/system-status', (req, res) => {
  try {
    const config = require('../config/env');
    const t0 = Date.now();
    let dbStatus = 'ONLINE';
    let dbLatency = 0;
    try {
      db.db.prepare('SELECT 1').get();
      dbLatency = Date.now() - t0;
    } catch (e) {
      dbStatus = 'ERROR: ' + e.message;
    }

    const metaToken = config.whatsapp.metaToken;
    const isConfigured = Boolean(metaToken && !metaToken.startsWith('test_') && !metaToken.includes('YOUR_') && metaToken.trim() !== '');

    res.json({
      success: true,
      system: {
        db: { status: dbStatus, latencyMs: dbLatency },
        waba: {
          provider: 'meta_cloud_api',
          connected: isConfigured,
          status: isConfigured ? 'CONNECTED' : 'DISCONNECTED',
          message: isConfigured
            ? 'Terhubung ke Meta WhatsApp Cloud API resmi'
            : 'META_WA_TOKEN belum diset di .env.',
          apiUrl: `https://graph.facebook.com/${config.whatsapp.apiVersion}/${config.whatsapp.phoneNumberId}`,
          phoneId: config.whatsapp.phoneNumberId,
          wabaId: config.whatsapp.wabaId,
          webhookEndpoint: '/api/webhook/whatsapp',
          verifyToken: config.whatsapp.verifyToken,
        },
        ai: {
          model: config.ai.model,
          endpoint: config.ai.baseUrl,
        },
        uptime: Math.floor(process.uptime()),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 13. AI Benchmark & Connection Test
router.get('/ai-benchmark', async (req, res) => {
  try {
    const aiService = require('../bot/aiService');
    const benchmark = await aiService.benchmarkAI();
    res.json({ success: true, benchmark });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 14. AI Diagnostic Playground Test (Detect In-Topic, Out-of-Topic, Escalation)
router.post('/ai-test', async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt || !prompt.trim()) {
      return res.status(400).json({ success: false, error: 'Prompt pertanyaan tidak boleh kosong' });
    }
    const aiService = require('../bot/aiService');
    const result = await aiService.diagnoseAIChat(prompt.trim());
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
