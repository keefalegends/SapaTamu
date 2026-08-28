const gateway = require('../gateway/openkoneksiClient');
const db = require('../db/database');
const { handleHotelFlow } = require('./hotelHandler');
const { handleCafeFlow } = require('./cafeHandler');
const { jawabAI } = require('./aiService');

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
  await gateway.sendButtons(phone, MENU_UTAMA.text, MENU_UTAMA.buttons);
}

async function processInboundMessage(phone, senderName, text, rawPayload = null) {
  const cleanPhone = String(phone).replace(/\D/g, '');
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

  // 3. Global Interceptor: Permintaan Eskalasi ke Staf CS Manusia
  const isEscalation =
    lower === 'menu_cs' ||
    /\b(cs|staf|staff|operator|manusia|admin|komplain|darurat|keluhan)\b/i.test(cleanText) ||
    lower.includes('customer service') ||
    lower.includes('bicara sama orang');

  if (isEscalation) {
    db.setBotStatus(cleanPhone, 'human');
    db.clearSession(cleanPhone);

    const csResponse =
      '👨‍💼 *Menghubungkan ke Staf Customer Service...*\n\n' +
      'Halo! Anda telah terhubung langsung dengan tim Customer Service SapaTamu.\n\n' +
      '🟢 *Status: Staf Siap Membantu*\n' +
      'Staf kami akan segera membalas pesan Anda di sini. Mohon ditunggu ya 🙏';

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
    lower === 'hai'
  ) {
    await sendWelcomeMenu(cleanPhone);
    return;
  }

  // 5. Cek Sesi Aktif
  const session = db.getSession(cleanPhone);

  // 6. Router Alur Hotel
  if (session.status.startsWith('hotel_') || lower.startsWith('hotel_') || lower.startsWith('room_') || lower === 'menu_hotel' || lower.includes('kamar') || lower.includes('hotel') || lower.includes('menginap')) {
    const handled = await handleHotelFlow(cleanPhone, cleanText, session);
    if (handled) return;
  }

  // 7. Router Alur Kafe
  if (session.status.startsWith('cafe_') || lower.startsWith('cafe_') || lower.startsWith('cat_') || lower.startsWith('add_') || lower === 'cart_view' || lower === 'order_confirm' || lower === 'menu_kafe' || lower.includes('meja') || lower.includes('makan') || lower.includes('minum') || lower.includes('kafe') || lower.includes('kopi')) {
    const handled = await handleCafeFlow(cleanPhone, cleanText, session);
    if (handled) return;
  }

  // 8. Default: AI Gemini Q&A
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
