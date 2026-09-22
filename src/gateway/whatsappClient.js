const axios = require('axios');
const config = require('../config/env');
const db = require('../db/database');

/**
 * Meta WhatsApp Cloud API Client
 * Mengirim pesan ke pengguna WhatsApp langsung melalui Meta Graph API resmi
 * Endpoint: POST https://graph.facebook.com/{version}/{phoneNumberId}/messages
 */

/**
 * Normalisasi format nomor telepon ke standar internasional WhatsApp (E.164)
 * Menjamin nomor 08xx otomatis diubah menjadi 628xx
 */
function formatE164(phone) {
  let clean = String(phone || '').replace(/\D/g, '');
  if (clean.startsWith('0')) {
    clean = '62' + clean.slice(1);
  }
  return clean;
}

/**
 * Kirim payload JSON mentah ke Meta WhatsApp Cloud API
 */
async function sendRawWhatsApp(payload, sender = 'bot') {
  const phoneId = config.whatsapp.phoneNumberId;
  const version = config.whatsapp.apiVersion || 'v20.0';
  const token = config.whatsapp.metaToken;
  const url = `https://graph.facebook.com/${version}/${phoneId}/messages`;

  // Normalisasi nomor tujuan ke E.164
  if (payload.to) {
    payload.to = formatE164(payload.to);
  }

  // Simpan ke database lokal agar admin dashboard melihat pesan yang dikirim
  const to = payload.to;
  let textPreview = '';
  let msgType = payload.type || 'text';

  if (msgType === 'text') {
    textPreview = payload.text?.body || '';
  } else if (msgType === 'interactive') {
    textPreview = payload.interactive?.body?.text || '[Pesan Interaktif / Menu]';
  } else if (msgType === 'image') {
    textPreview = payload.image?.caption || '[Gambar / Foto]';
  }

  db.saveMessage(to, 'outbound', sender, msgType, textPreview, payload);
  db.upsertConversation(to, null, textPreview);

  // Jika Token Meta belum diset atau masih placeholder, log ke console (Mode Simulasi)
  if (!token || token.startsWith('test_') || token.includes('YOUR_') || token.trim() === '') {
    console.log(`📡 [META WA SIMULASI] Outbound ke +${to} (${sender}): "${textPreview.substring(0, 50)}..."`);
    return { success: true, simulated: true };
  }

  // Pengiriman nyata via Meta WhatsApp Cloud API dengan auto-retry pada HTTP 429
  const maxRetries = 2;
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      const res = await axios.post(url, payload, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        timeout: 8000,
      });
      const messageId = res.data?.messages?.[0]?.id || res.data?.id || 'OK';
      console.log(`✅ [META CLOUD API OUTBOUND] Sukses kirim ke +${to} (ID: ${messageId})`);
      return res.data;
    } catch (err) {
      const isRateLimit = err.response?.status === 429;
      if (isRateLimit && attempt <= maxRetries) {
        const delay = attempt * 1000;
        console.warn(`⏳ [RATE LIMIT 429] Terkena rate limit Meta. Menunggu ${delay}ms sebelum retry...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      if (attempt > maxRetries) {
        console.error(`❌ [META CLOUD API ERROR] Gagal kirim ke +${to}:`, err.response?.data || err.message);
        return { success: false, error: err.response?.data || err.message };
      }
    }
  }
}

/**
 * Kirim Pesan Teks Standar
 */
async function sendText(to, text, sender = 'bot') {
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: formatE164(to),
    type: 'text',
    text: {
      preview_url: false,
      body: text,
    },
  };
  return sendRawWhatsApp(payload, sender);
}

/**
 * Kirim Pesan Tombol Interaktif (Maksimal 3 tombol, judul <= 20 karakter)
 */
async function sendButtons(to, bodyText, buttons) {
  const formattedButtons = buttons.slice(0, 3).map((b, idx) => ({
    type: 'reply',
    reply: {
      id: b.id || b.value || `btn_${idx}`,
      title: b.title.length > 20 ? b.title.substring(0, 20) : b.title,
    },
  }));

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: formatE164(to),
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: bodyText },
      action: { buttons: formattedButtons },
    },
  };
  return sendRawWhatsApp(payload);
}

/**
 * Kirim Pesan List Menu Interaktif (Untuk opsi > 3 item)
 */
async function sendList(to, bodyText, buttonText, sections) {
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: formatE164(to),
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: bodyText },
      action: {
        button: buttonText.substring(0, 20),
        sections: sections,
      },
    },
  };
  return sendRawWhatsApp(payload);
}

/**
 * Kirim Gambar dengan Caption
 */
async function sendImage(to, imageUrlOrFilename, caption) {
  const cleanTo = formatE164(to);
  
  // Jika URL lokal, buat URL lengkap atau link media
  let link = imageUrlOrFilename;
  if (!link.startsWith('http')) {
    link = `http://localhost:${config.port}/images/${imageUrlOrFilename}`;
  }

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: cleanTo,
    type: 'image',
    image: {
      link: link,
      caption: caption || '',
    },
  };
  return sendRawWhatsApp(payload);
}

module.exports = {
  formatE164,
  sendText,
  sendButtons,
  sendList,
  sendImage,
};
