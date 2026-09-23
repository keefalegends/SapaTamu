const gateway = require('../gateway/whatsappClient');
const db = require('../db/database');
const { handleHotelFlow } = require('./hotelHandler');
const { handleCafeFlow } = require('./cafeHandler');
const { jawabAI } = require('./aiService');
const { sendToRasa } = require('./rasaService');

const MENU_UTAMA = {
  text:
    '👋 *Selamat Datang di SapaTamu!*\n\n' +
    'Halo! Saya asisten virtual SapaTamu, siap melayani kebutuhan Hotel & Kafe Anda 24/7.\n\n' +
    'Silakan pilih layanan yang Anda butuhkan:',
  buttons: [
    { id: 'menu_kafe',  title: '☕ Kafe' },
    { id: 'menu_hotel', title: '🏨 Hotel' },
    { id: 'menu_cs',    title: '🎧 Customer Service' },
  ],
};

async function sendWelcomeMenu(phone) {
  db.clearSession(phone);
  try {
    const axios = require('axios');
    const rasaUrl = process.env.RASA_API_URL || 'http://localhost:5005/webhooks/rest/webhook';
    axios.post(rasaUrl, { sender: String(phone), message: '/restart' }, { timeout: 1500 }).catch(() => {});
  } catch (e) {}
  await gateway.sendButtons(phone, MENU_UTAMA.text, MENU_UTAMA.buttons);
}

// Antrean serial per-nomor untuk mencegah race condition keranjang & sesi
const userQueues = new Map();

async function processInboundMessage(phone, senderName, text, rawPayload = null) {
  const cleanPhone = String(phone).replace(/\D/g, '');

  const previousQueue = userQueues.get(cleanPhone) || Promise.resolve();
  const currentTask = previousQueue
    .then(() => _executeInboundMessage(cleanPhone, senderName, text, rawPayload))
    .catch((err) => {
      console.error(`❌ [USER QUEUE ERROR] +${cleanPhone}:`, err);
    })
    .finally(() => {
      if (userQueues.get(cleanPhone) === currentTask) {
        userQueues.delete(cleanPhone);
      }
    });

  userQueues.set(cleanPhone, currentTask);
  return currentTask;
}

async function _executeInboundMessage(cleanPhone, senderName, text, rawPayload) {
  const cleanText = (text || '').trim();
  const lower = cleanText.toLowerCase();

  // 1. Simpan pesan masuk ke database
  db.saveMessage(cleanPhone, 'inbound', 'user', 'text', cleanText, rawPayload);
  db.upsertConversation(cleanPhone, senderName, cleanText);

  // 2. Periksa apakah kontak sedang di-takeover oleh Staf Manusia (Human CS)
  const conv = db.getConversation(cleanPhone);
  if (conv && conv.bot_status === 'human') {
    console.log(`👤 [HUMAN TAKEOVER] Pesan dari +${cleanPhone} diabaikan bot (staf sedang handle)`);
    return;
  }

  // 3. Global Interceptor: Permintaan Eskalasi ke Staf CS / Resepsionis
  const isEscalation =
    lower === 'menu_cs' ||
    lower === 'btn_cs' ||
    /\b(cs|staf|staff|operator|manusia|admin|komplain|darurat|keluhan|resepsionis)\b/i.test(cleanText) ||
    lower.includes('customer service') ||
    lower.includes('bicara sama orang') ||
    lower.includes('tanya resepsionis');

  if (isEscalation) {
    db.setBotStatus(cleanPhone, 'human');
    const StateManager = require('./stateManager');
    await StateManager.reset(cleanPhone, 'escalation_to_human');

    const csResponse =
      '👨‍💼 *Menghubungkan ke Staf Customer Service / Resepsionis...*\n\n' +
      'Halo! Anda telah terhubung langsung dengan tim Customer Service SapaTamu.\n\n' +
      '🟢 *Status: Staf Siap Membantu*\n' +
      'Staf/Resepsionis kami akan segera membalas pesan Anda di sini. Mohon ditunggu ya 🙏';

    await gateway.sendText(cleanPhone, csResponse);
    return;
  }

  // 4. Global Interceptor: Reset / Menu Utama
  if (
    lower === 'menu' ||
    lower === 'menu utama' ||
    lower === 'kembali' ||
    lower === 'start' ||
    lower === 'goto_main' ||
    lower === 'halo' ||
    lower === 'hai' ||
    lower === 'p' ||
    lower === 'hi' ||
    lower === 'selamat pagi' ||
    lower === 'selamat siang' ||
    lower === 'selamat sore' ||
    lower === 'selamat malam'
  ) {
    await sendWelcomeMenu(cleanPhone);
    return;
  }

  // 5. Cek Sesi Aktif
  const StateManager = require('./stateManager');
  const session = StateManager.get(cleanPhone);

  // ─── INTENT DETECTOR & ROUTER ──────────────────────────────────────────────
  // Deteksi intent Kafe (Button payload atau kata kunci makanan/minuman)
  const isCafeIntent =
    session.status.startsWith('cafe_') ||
    ['menu_kafe', 'btn_kafe', 'kafe', 'cafe_dinein', 'cafe_takeaway', 'cafe_reservasi', 'cart_view', 'order_confirm'].includes(lower) ||
    lower.startsWith('cat_') ||
    lower.startsWith('add_') ||
    /\b(kafe|cafe|kopi|ngopi|makan|minum|makanan|minuman|resto|restoran|snack|croissant|latte|espresso|cappuccino)\b/i.test(lower);

  // Deteksi intent Hotel (Button payload atau kata kunci kamar/menginap)
  const isHotelIntent =
    session.status.startsWith('hotel_') ||
    ['menu_hotel', 'btn_hotel', 'hotel', 'hotel_reservasi', 'hotel_pay_step', 'hotel_pay_confirm', 'hotel_cancel'].includes(lower) ||
    lower.startsWith('room_') ||
    lower.startsWith('hotel_pay_') ||
    /\b(hotel|kamar|nginep|menginap|checkin|check-in|checkout|check-out|deluxe|suite|presidential)\b/i.test(lower);

  // Prioritas 1: Jika user menyebut kafe / makanan / minuman ➔ Langsung ke Kafe Flow
  if (isCafeIntent && !session.status.startsWith('hotel_')) {
    const handled = await handleCafeFlow(cleanPhone, cleanText, session);
    if (handled) return;
  }

  // Prioritas 2: Jika user menyebut hotel / reservasi kamar ➔ Langsung ke Hotel Flow
  if (isHotelIntent) {
    const handled = await handleHotelFlow(cleanPhone, cleanText, session);
    if (handled) return;
  }

  // Prioritas 3: Coba proses melalui Rasa AI (Natural Language Processing untuk Pesanan Kafe / Q&A)
  const rasaResult = await sendToRasa(cleanPhone, cleanText);
  const isDefaultFallback = rasaResult.messages?.some((m) =>
    m.includes('belum memahami maksud Anda')
  );

  // Guard: Jangan sampai pesan default hotel terpental jika user tidak sedang booking hotel
  const isUnwantedHotelPrompt = rasaResult.messages?.some((m) =>
    m.includes('Mau booking tipe kamar apa kak')
  );

  if (
    rasaResult.handled &&
    rasaResult.messages?.length > 0 &&
    !isDefaultFallback &&
    !(isUnwantedHotelPrompt && !isHotelIntent)
  ) {
    console.log(`🤖 [RASA HANDLED] Membalas ${rasaResult.messages.length} pesan dari Rasa ke +${cleanPhone}`);
    for (const reply of rasaResult.messages) {
      await gateway.sendText(cleanPhone, reply);
    }
    return;
  }

  // Prioritas 4: Default fallback ke AI Gemini Q&A (Anti-Defaulting to Hotel!)
  console.log(`🤖 [AI QUERY] Memanggil Gemini untuk: "${cleanText}"`);
  const aiResult = await jawabAI(cleanText);

  if (aiResult.eskalasi) {
    db.setBotStatus(cleanPhone, 'human');
    await gateway.sendText(cleanPhone,
      '👨‍💼 Pertanyaan Anda memerlukan bantuan khusus staf kami.\n\n' +
      '🟢 *Status: Terhubung ke Staf CS*\n' +
      'Mohon tunggu sebentar, tim kami akan segera merespons 🙏'
    );
    return;
  }

  // Kirim balasan cerdas AI + Opsi Menu Navigasi
  if (aiResult.jawaban) {
    await gateway.sendText(cleanPhone, `🤖 *AI SapaTamu:*\n\n${aiResult.jawaban}`);
  }

  // Jika user belum dalam flow transaksi, tawarkan tombol navigasi
  if (session.status === 'idle') {
    await gateway.sendButtons(cleanPhone, 'Pilihan layanan SapaTamu:', MENU_UTAMA.buttons);
  }
}

module.exports = {
  processInboundMessage,
  sendWelcomeMenu,
};
