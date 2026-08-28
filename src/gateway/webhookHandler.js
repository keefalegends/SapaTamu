const express = require('express');
const router = express.Router();
const config = require('../config/env');
const { processInboundMessage } = require('../bot/engine');

/**
 * 1. Webhook Handshake Verification (GET)
 * Digunakan oleh OpenKoneksi / Meta untuk memverifikasi URL webhook saat pertama kali didaftarkan
 */
router.get('/', (req, res) => {
  const mode = req.query['hub.mode'] || req.query.mode;
  const token = req.query['hub.verify_token'] || req.query.verify_token || req.query.token;
  const challenge = req.query['hub.challenge'] || req.query.challenge;

  const expectedToken = config.openkoneksi.webhookSecret;

  if (token === expectedToken) {
    console.log('✅ [WEBHOOK VERIFY] Handshake OpenKoneksi berhasil diverifikasi!');
    return res.status(200).send(challenge || 'VERIFIED');
  }

  console.warn('⚠️ [WEBHOOK VERIFY FAILED] Token tidak cocok!');
  return res.status(403).send('Verification token mismatch');
});

// In-memory cache untuk idempotency check (menahan retry duplikat dari Meta/OpenKoneksi)
const processedMessages = new Map();

// Bersihkan pesan yang lebih lama dari 10 menit setiap 5 menit
setInterval(() => {
  const now = Date.now();
  for (const [id, time] of processedMessages.entries()) {
    if (now - time > 10 * 60 * 1000) {
      processedMessages.delete(id);
    }
  }
}, 5 * 60 * 1000);

/**
 * 2. Inbound Message Receiver (POST)
 * Menerima kiriman event pesan dari OpenKoneksi.com (format standar WhatsApp Cloud API)
 */
router.post('/', async (req, res) => {
  // Langsung balas 200 OK ke OpenKoneksi agar tidak timeout
  res.status(200).json({ status: 'received' });

  try {
    const body = req.body;
    if (!body) return;

    // Normalisasi struktur payload Meta / OpenKoneksi
    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value || body;

    // Tangani event status pesan (sent, delivered, read, failed)
    if (value.statuses && (!value.messages || value.messages.length === 0)) {
      const st = value.statuses[0];
      if (st?.status === 'failed') {
        console.warn(`⚠️ [WABA DELIVERY FAILED] Pesan ke +${st.recipient_id} gagal dikirim:`, st.errors || 'Unknown error');
      }
      return;
    }

    const messages = value.messages;
    if (!messages || messages.length === 0) {
      return;
    }

    const msg = messages[0];
    const wamid = msg.id;

    // 1. Idempotency Check: Cegah proses ganda jika gateway melakukan retry
    if (wamid) {
      if (processedMessages.has(wamid)) {
        console.log(`⚡ [IDEMPOTENCY IGNORED] Mengabaikan pesan duplikat/retry: ${wamid}`);
        return;
      }
      processedMessages.set(wamid, Date.now());
    }

    const from = msg.from; // Nomor telepon pengirim
    const contact = value.contacts?.[0];
    const senderName = contact?.profile?.name || `Tamu (+${from})`;

    let incomingText = '';

    if (msg.type === 'text') {
      incomingText = msg.text?.body || '';
    } else if (msg.type === 'interactive') {
      if (msg.interactive?.type === 'button_reply') {
        incomingText = msg.interactive.button_reply.id || msg.interactive.button_reply.title;
      } else if (msg.interactive?.type === 'list_reply') {
        incomingText = msg.interactive.list_reply.id || msg.interactive.list_reply.title;
      }
    } else if (msg.type === 'button') {
      incomingText = msg.button?.payload || msg.button?.text || '';
    } else {
      incomingText = `[Tipe pesan: ${msg.type}]`;
    }

    console.log(`📩 [INBOUND WEBHOOK] Dari: ${senderName} (+${from}) | Pesan: "${incomingText}"`);

    // Proses ke State Machine Bot & AI
    await processInboundMessage(from, senderName, incomingText, msg);
  } catch (err) {
    console.error('❌ [WEBHOOK ERROR]:', err.message);
  }
});

module.exports = router;
