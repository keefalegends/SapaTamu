const axios = require('axios');
const config = require('../config/env');
const db = require('../db/database');

/**
 * OpenKoneksi / WABA REST API Client
 * Mengirim pesan ke pengguna WhatsApp melalui gateway OpenKoneksi.com
 */

async function sendRawOpenKoneksi(payload) {
  const apiKey = config.openkoneksi.apiKey;
  const url = `${config.openkoneksi.apiUrl}/messages`;

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

  db.saveMessage(to, 'outbound', 'bot', msgType, textPreview, payload);
  db.upsertConversation(to, null, textPreview);

  // Jika API Key dummy/demo, log ke console dan anggap berhasil (Mode Simulasi)
  if (!apiKey || apiKey.startsWith('test_') || apiKey === 'YOUR_OPENKONEKSI_API_KEY') {
    console.log(`📡 [OPENKONEKSI SIMULASI] Outbound ke +${to}: "${textPreview.substring(0, 50)}..."`);
    return { success: true, simulated: true };
  }

  // Pengiriman nyata via REST API OpenKoneksi
  try {
    const res = await axios.post(url, payload, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });
    console.log(`✅ [OPENKONEKSI OUTBOUND] Sukses kirim ke +${to} (ID: ${res.data?.id || 'OK'})`);
    return res.data;
  } catch (err) {
    console.error(`❌ [OPENKONEKSI OUTBOUND ERROR] Gagal kirim ke +${to}:`, err.response?.data || err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Kirim Pesan Teks Standar
 */
async function sendText(to, text) {
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: String(to).replace(/\D/g, ''),
    type: 'text',
    text: {
      preview_url: false,
      body: text,
    },
  };
  return sendRawOpenKoneksi(payload);
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
    to: String(to).replace(/\D/g, ''),
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: bodyText },
      action: { buttons: formattedButtons },
    },
  };
  return sendRawOpenKoneksi(payload);
}

/**
 * Kirim Pesan List Menu Interaktif (Untuk opsi > 3 item)
 */
async function sendList(to, bodyText, buttonText, sections) {
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: String(to).replace(/\D/g, ''),
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
  return sendRawOpenKoneksi(payload);
}

/**
 * Kirim Gambar dengan Caption
 */
async function sendImage(to, imageUrlOrFilename, caption) {
  const cleanTo = String(to).replace(/\D/g, '');
  
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
  return sendRawOpenKoneksi(payload);
}

module.exports = {
  sendText,
  sendButtons,
  sendList,
  sendImage,
};
