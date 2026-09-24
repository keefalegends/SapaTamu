const gateway = require('../gateway/whatsappClient');
const db = require('../db/database');
const StateManager = require('./stateManager');
const { handleHotelFlow } = require('./hotelHandler');
const { handleCafeFlow, parseMultipleMenuItems } = require('./cafeHandler');
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
  await StateManager.reset(phone, 'welcome_menu');

  const guestProfile = db.getGuestProfile(phone);
  let welcomeText;

  if (guestProfile && guestProfile.name) {
    welcomeText =
      `👋 *Halo Kak ${guestProfile.name}!*\n` +
      `Selamat datang kembali di *SapaTamu* 🏨☕\n\n` +
      `Senang bisa melayani Kak ${guestProfile.name} lagi. Asisten virtual SapaTamu siap membantu kebutuhan Hotel & Kafe Anda.\n\n` +
      `Silakan pilih layanan yang diinginkan:`;
  } else {
    welcomeText = MENU_UTAMA.text;
  }

  await gateway.sendButtons(phone, welcomeText, MENU_UTAMA.buttons);
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

  // Cek apakah sesi pengguna telah idle > 30 menit SEBELUM timestamp percakapan diperbarui
  const sessionExpired = StateManager.isSessionExpired(cleanPhone, 30);

  // 1. Simpan pesan masuk ke database
  db.saveMessage(cleanPhone, 'inbound', 'user', 'text', cleanText, rawPayload);
  db.upsertConversation(cleanPhone, senderName, cleanText);

  // Jika sesi expired (> 30 menit idle), reset sesi transaksi & keranjang ke idle
  if (sessionExpired) {
    console.log(`⏱️ [SESSION TIMEOUT] Sesi +${cleanPhone} telah lewat 30 menit. Reset sesi ke IDLE.`);
    await StateManager.reset(cleanPhone, 'session_timeout_30m');
  }

  // 2. Periksa apakah kontak sedang di-takeover oleh Staf Manusia (Human CS)
  const conv = db.getConversation(cleanPhone);
  if (conv && conv.bot_status === 'human') {
    console.log(`👤 [HUMAN TAKEOVER] Pesan dari +${cleanPhone} diabaikan bot (staf sedang handle)`);
    return;
  }

  // 3. Global Interceptor: Permintaan Eskalasi ke Staf CS / Resepsionis / Keadaan Darurat
  const isEscalation =
    lower === 'menu_cs' ||
    lower === 'btn_cs' ||
    /\b(cs|staf|staff|operator|manusia|admin|komplain|darurat|keluhan|resepsionis|kebakaran|api|bahaya|maling|kecelakaan|rusak|bocor|mati lampu|hilang|kehilangan|tolong|bantuan)\b/i.test(cleanText) ||
    lower.includes('customer service') ||
    lower.includes('bicara sama orang') ||
    lower.includes('tanya resepsionis');

  if (isEscalation) {
    db.setBotStatus(cleanPhone, 'human');
    await StateManager.reset(cleanPhone, 'escalation_to_human');

    const csResponse =
      '👨‍💼 *Menghubungkan ke Staf Customer Service / Resepsionis...*\n\n' +
      'Halo! Anda telah terhubung langsung dengan tim Customer Service SapaTamu.\n\n' +
      '🟢 *Status: Staf Siap Membantu (Prioritas)*\n' +
      'Staf/Resepsionis kami akan segera membalas pesan Anda di sini. Untuk keadaan darurat, tim operasional segera menuju ke lokasi Anda. Mohon ditunggu ya 🙏';

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

  // 4B. Global Interceptor: Pembatalan Alur (Anti-Draft Lock)
  const isCancellation = /\b(gajadi|ga jadi|gak jadi|nggak jadi|enggak jadi|batal|batalkan|cancel|abort|stop|jangan jadi)\b/i.test(lower);
  if (isCancellation) {
    console.log(`🛑 [GLOBAL CANCEL] Pengguna +${cleanPhone} membatalkan alur via kata kunci '${cleanText}'`);
    await StateManager.reset(cleanPhone, 'user_cancellation');
    await gateway.sendText(cleanPhone, '❌ *Alur transaksi berhasil dibatalkan.*\nSesi Anda telah dikembalikan ke menu utama.');
    await gateway.sendButtons(cleanPhone, 'Pilihan layanan SapaTamu:', MENU_UTAMA.buttons);
    return;
  }

  // 5. Cek Sesi Aktif
  let session = StateManager.get(cleanPhone);

  // Helper untuk mengenali apakah input adalah kalimat tanya
  const isQuestion =
    lower.includes('?') ||
    /\b(berapa|total|apa|apakah|ada\s+gak|ada\s+tidak|ada\s+nggak|gimana|bagaimana|bisa|rekomendasi|harga|fasilitas|kalo|kalau|kenapa|siapa|kapan|dimana|mana)\b/i.test(lower);

  // ─── INTENT DETECTOR & ROUTER ──────────────────────────────────────────────
  // Deteksi item kafe langsung dari teks bebas
  const cafeItemsFound = !isQuestion ? parseMultipleMenuItems(cleanText) : [];

  // Deteksi intent Kafe (Button payload, kata kunci makanan/minuman, atau item menu langsung)
  const isCafeButton =
    ['menu_kafe', 'btn_kafe', 'kafe', 'cafe_dinein', 'cafe_takeaway', 'cafe_reservasi', 'cart_view', 'order_confirm', 'cafe_cancel'].includes(lower) ||
    lower.startsWith('cat_') ||
    lower.startsWith('add_');

  const isCafeIntent =
    session.status.startsWith('cafe_') ||
    isCafeButton ||
    cafeItemsFound.length > 0 ||
    (!isQuestion && /\b(kafe|cafe|kopi|ngopi|makan|minum|makanan|minuman|resto|restoran|snack|croissant|quaso|latte|espresso|cappuccino|pesan\s+(?:makan|minum|kopi)|order\s+(?:makan|minum)|beli)\b/i.test(lower));

  // Deteksi intent Hotel (Button payload atau kata kunci spesifik reservasi/menginap)
  const isHotelButton =
    ['menu_hotel', 'btn_hotel', 'hotel', 'hotel_reservasi', 'hotel_pay_step', 'hotel_pay_confirm', 'hotel_cancel'].includes(lower) ||
    lower.startsWith('room_') ||
    lower.startsWith('hotel_pay_');

  const isHotelIntent =
    session.status.startsWith('hotel_') ||
    isHotelButton ||
    (!isQuestion && (
      /\b(booking|reservasi|sewa|menginap|nginep|checkin|check-in|checkout|check-out)\b/i.test(lower) ||
      /\b(kamar|hotel)\b/i.test(lower) ||
      /\b(pengen\s+kamar|mau\s+kamar|butuh\s+kamar|cari\s+kamar|ambil\s+kamar|pesan\s+kamar|sewa\s+kamar)\b/i.test(lower)
    ));

  // ─── CONTEXT SWITCHING (ANTI-TRAP DRAFT) ──────────────────────────────────
  // Jika user sedang di alur Hotel tetapi secara eksplisit meminta Kafe / memesan makanan
  const isExplicitCafeRequest = isCafeButton || cafeItemsFound.length > 0 || /\b(kafe|cafe|kopi|ngopi|makan|minum|makanan|minuman|resto|pesan|beli|order)\b/i.test(lower);
  if (session.status.startsWith('hotel_') && isExplicitCafeRequest) {
    console.log(`🔄 [CONTEXT SWITCH] Pengguna +${cleanPhone} beralih dari ${session.status} ke KAFE`);
    await StateManager.reset(cleanPhone, 'switch_hotel_to_cafe');
    session = StateManager.get(cleanPhone);
  }

  // Jika user sedang di alur Kafe tetapi secara eksplisit meminta Hotel / booking kamar
  const isExplicitHotelRequest = isHotelButton || /\b(booking|reservasi|sewa\s*kamar|kamar|hotel|nginep|menginap|checkin)\b/i.test(lower);
  if (session.status.startsWith('cafe_') && isExplicitHotelRequest) {
    console.log(`🔄 [CONTEXT SWITCH] Pengguna +${cleanPhone} beralih dari ${session.status} ke HOTEL`);
    await StateManager.reset(cleanPhone, 'switch_cafe_to_hotel');
    session = StateManager.get(cleanPhone);
  }

  // Prioritas 1: Jika user menyebut kafe / makanan / minuman ➔ Langsung ke Kafe Flow
  if (isCafeIntent) {
    const handled = await handleCafeFlow(cleanPhone, cleanText, session);
    if (handled) return;
  }

  // Prioritas 2: Jika user menyebut hotel / reservasi kamar ➔ Langsung ke Hotel Flow
  if (isHotelIntent) {
    const handled = await handleHotelFlow(cleanPhone, cleanText, session);
    if (handled) return;
  }

  // Prioritas 3: Coba proses melalui Rasa AI (Natural Language Processing untuk Pesanan Kafe / Perintah Transaksi)
  // Jika input adalah pertanyaan informatif/follow-up (isQuestion), lewati Rasa dan serahkan langsung ke Gemini AI (Prioritas 4)
  if (!isQuestion) {
    const rasaResult = await sendToRasa(cleanPhone, cleanText);

    // Cek apakah Rasa memberikan respon fallback tidak paham
    const isDefaultFallback = rasaResult.messages?.some((m) =>
      m.includes('belum memahami maksud Anda') ||
      m.includes('di luar konteks')
    );

    // Guard Anti-Halusinasi Hotel: Jika user tidak berniat booking hotel, jangan biarkan prompt kamar/checkin dari Rasa lolos
    const isUnwantedHotelPrompt = rasaResult.messages?.some((m) =>
      m.includes('Mau booking tipe kamar') ||
      m.includes('tanggal check-in') ||
      m.includes('pemesanannya kak') ||
      m.includes('RESERVASI KAMAR BERHASIL') ||
      m.includes('PILIHAN KAMAR')
    );

    // Guard Anti-Shadow Order Kafe dari Rasa: Rasa dilarang membuat pesanan otomatis langsung ke DB
    const isUnwantedCafeOrder = rasaResult.messages?.some((m) =>
      m.includes('PESANAN KAFE BERHASIL DIBUAT') ||
      m.includes('No. Pesanan: ST-CAFE')
    );

    // Guard Anti-False-CS dari Rasa: Jika user tidak berniat darurat/CS, jangan biarkan prompt CS/Darurat dari Rasa lolos
    const isUnwantedCSPrompt = rasaResult.messages?.some((m) =>
      m.includes('Layanan Bantuan & Customer Service') ||
      m.includes('Pesan Anda terkait bantuan staf/darurat')
    ) && !isEscalation;

    if (
      rasaResult.handled &&
      rasaResult.messages?.length > 0 &&
      !isDefaultFallback &&
      !isUnwantedCafeOrder &&
      !isUnwantedCSPrompt &&
      (!isUnwantedHotelPrompt || isHotelIntent)
    ) {
      console.log(`🤖 [RASA HANDLED] Membalas ${rasaResult.messages.length} pesan dari Rasa ke +${cleanPhone}`);
      for (const reply of rasaResult.messages) {
        await gateway.sendText(cleanPhone, reply);
      }
      return;
    }
  }

  // Prioritas 4: Default fallback ke AI Gemini Q&A (Anti-Defaulting to Hotel!)
  console.log(`🤖 [AI QUERY] Memanggil Gemini untuk: "${cleanText}"`);
  const chatHistory = db.getRecentSessionMessages(cleanPhone, 6, 30);
  const guestProfile = db.getGuestProfile(cleanPhone);
  const aiResult = await jawabAI(cleanText, { chatHistory, guestProfile });

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
