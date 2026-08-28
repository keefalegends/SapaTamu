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

/**
 * 2. Inbound Message Receiver (POST)
 * Menerima kiriman event pesan dari OpenKoneksi.com (format standar WhatsApp Cloud API)
 */
router.post('/', async (req, res) => {
  // Langsung balas 200 OK ke OpenKoneksi agar tidak timeout
  res.status(200).json({ status: 'received' });

  try {
    const body = req.body;

    // Normalisasi struktur payload Meta / OpenKoneksi
    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value || body;

    const messages = value.messages;
    if (!messages || messages.length === 0) {
      // Event status delivery (sent, delivered, read) diabaikan
      return;
    }

    const msg = messages[0];
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
