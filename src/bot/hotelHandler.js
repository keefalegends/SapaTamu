const gateway = require('../gateway/whatsappClient');
const db = require('../db/database');

const ROOMS = {
  deluxe: {
    key: 'deluxe',
    name: 'Deluxe Room',
    price: 550000,
    desc: 'Kasur King Size, Smart TV 43", AC, Balkon, Sarapan 2 pax',
    image: 'kamar_deluxe.jpg',
  },
  executive: {
    key: 'executive',
    name: 'Executive Suite',
    price: 950000,
    desc: 'Ruang Tamu Terpisah, Jacuzzi, Espresso Machine, Lounge Access',
    image: 'kamar_executive.jpg',
  },
  suite: {
    key: 'suite',
    name: 'Presidential Suite',
    price: 1800000,
    desc: '2 Kamar Tidur, Dining Room Mewah, Mini Bar Gratis, 24h Butler',
    image: 'kamar_suite.jpg',
  },
};

function getRoom(key) {
  try {
    const row = db.db.prepare('SELECT * FROM room_catalog WHERE room_key = ?').get(key);
    if (row) {
      return {
        key: row.room_key,
        name: row.name,
        price: row.price,
        desc: row.description,
        image: row.image || 'kamar_deluxe.jpg',
      };
    }
  } catch (e) {}
  return ROOMS[key] || ROOMS.deluxe;
}

function formatRupiah(num) {
  return 'Rp ' + Number(num || 0).toLocaleString('id-ID');
}

function isQuestion(text) {
  const lower = (text || '').toLowerCase().trim();
  return (
    lower.includes('?') ||
    /\b(berapa|total|apa|apakah|ada\s+gak|ada\s+tidak|ada\s+nggak|gimana|bagaimana|bisa|rekomendasi|harga|fasilitas|kalo|kalau|kenapa|siapa|kapan|dimana|mana)\b/i.test(lower)
  );
}

async function handleHotelFlow(phone, text, session) {
  const lower = (text || '').toLowerCase().trim();

  // 0. Interceptor Pembatalan Eksplisit dalam Flow Hotel
  const isCancellation = lower === 'hotel_cancel' || /\b(gajadi|ga jadi|gak jadi|nggak jadi|enggak jadi|batal|batalkan|cancel|abort|stop|jangan jadi)\b/i.test(lower);
  if (isCancellation) {
    const StateManager = require('./stateManager');
    await StateManager.reset(phone, 'hotel_cancelled');
    await gateway.sendText(phone, '❌ *Pemesanan kamar hotel telah dibatalkan.*');
    await gateway.sendButtons(phone, 'Silakan pilih layanan SapaTamu:', [
      { id: 'goto_main',  title: '🔙 Menu Utama' },
      { id: 'menu_kafe',  title: '☕ Kafe' },
      { id: 'menu_cs',    title: '🎧 Hubungi CS' },
    ]);
    return true;
  }

  // Interceptor: Jika sedang di alur hotel tapi user menanyakan hal lain (misal fasilitas kamar, harga, dsb)
  if (isQuestion(text)) {
    const { jawabAI } = require('./aiService');
    const chatHistory = db.getRecentSessionMessages(phone, 6, 30);
    const guestProfile = db.getGuestProfile(phone);
    const aiResp = await jawabAI(text, { chatHistory, guestProfile });
    if (aiResp.jawaban) {
      await gateway.sendText(phone, `🤖 *AI SapaTamu:*\n\n${aiResp.jawaban}`);
    }

    if (session.status === 'hotel_await_date') {
      const roomKey = session.draft?.roomKey || 'deluxe';
      const room = getRoom(roomKey);
      await gateway.sendButtons(phone, `Lanjutkan reservasi *${room.name}*?`, [
        { id: `room_${roomKey}`, title: `🏨 Lanjut ${room.name}` },
        { id: 'menu_hotel',      title: '🔄 Ganti Kamar' },
        { id: 'goto_main',       title: '🔙 Menu Utama' },
      ]);
    } else {
      await gateway.sendButtons(phone, 'Silakan pilih tipe kamar yang Anda inginkan:', [
        { id: 'room_deluxe',    title: '🛏️ Deluxe Room' },
        { id: 'room_executive', title: '🌟 Executive Suite' },
        { id: 'room_suite',     title: '👑 Presidential' },
      ]);
    }
    return true;
  }

  // 1. Menu Pilihan Kamar
  const isMenuHotelRequest =
    session.status === 'hotel_menu' ||
    session.status === 'idle' ||
    lower === 'menu_hotel' ||
    lower === 'hotel' ||
    lower === 'kamar' ||
    lower === 'hotel_reservasi' ||
    lower.includes('reservasi kamar') ||
    lower.includes('booking kamar') ||
    lower.includes('booking hotel') ||
    lower.includes('pesan hotel') ||
    lower.includes('pesan kamar') ||
    lower.includes('kamar hotel') ||
    lower.includes('sewa kamar') ||
    lower.includes('mau booking') ||
    /\b(kamar|hotel|booking|reservasi|sewa|menginap|nginep|checkin)\b/i.test(lower);

  if (isMenuHotelRequest) {
    db.setSession(phone, 'hotel_pick_room', { roomKey: null });

    const deluxe = getRoom('deluxe');
    const executive = getRoom('executive');
    const suite = getRoom('suite');

    const menuText =
      '🛏️ *Pilihan Kamar Hotel SapaTamu*\n\n' +
      'Nikmati kenyamanan bintang 4 dengan fasilitas lengkap:\n\n' +
      `• 🛏️ *${deluxe.name}* — ${formatRupiah(deluxe.price)} / malam\n` +
      `  _${deluxe.desc}_\n\n` +
      `• 🌟 *${executive.name}* — ${formatRupiah(executive.price)} / malam\n` +
      `  _${executive.desc}_\n\n` +
      `• 👑 *${suite.name}* — ${formatRupiah(suite.price)} / malam\n` +
      `  _${suite.desc}_\n\n` +
      'Silakan pilih tipe kamar yang Anda inginkan:';

    await gateway.sendButtons(phone, menuText, [
      { id: 'room_deluxe',    title: '🛏️ Deluxe Room' },
      { id: 'room_executive', title: '🌟 Executive Suite' },
      { id: 'room_suite',     title: '👑 Presidential' },
    ]);
    return true;
  }

  // 2. Pilih Kamar (Toleran Typo: 'yang delux', 'delux', 'exec', dsb)
  const isRoomButton = lower.startsWith('room_');
  let chosenKey = null;

  if (isRoomButton) {
    if (lower === 'room_deluxe') chosenKey = 'deluxe';
    else if (lower === 'room_executive') chosenKey = 'executive';
    else if (lower === 'room_suite') chosenKey = 'suite';
  } else if (session.status === 'hotel_pick_room' || session.status === 'hotel_menu') {
    if (/\b(deluxe|delux|dlx|deluks|kamar 1|pilihan 1|1)\b/i.test(lower) || lower.includes('delux')) {
      chosenKey = 'deluxe';
    } else if (/\b(executive|eksekutif|exec|eksekutip|kamar 2|pilihan 2|2)\b/i.test(lower) || lower.includes('exec') || lower.includes('eksekuti')) {
      chosenKey = 'executive';
    } else if (/\b(suite|presidential|presiden|kamar 3|pilihan 3|3)\b/i.test(lower) || lower.includes('suite') || lower.includes('presiden')) {
      chosenKey = 'suite';
    }
  } else {
    // Regex fleksibel saat di luar status hotel_pick_room
    if (/\b(pilih|ambil|booking|pesan|sewa|mau|kamar)\s*(?:tipe\s*)?(?:deluxe|delux|dlx|deluks)\b/i.test(lower) || /\b(yang\s+delux[e]?)\b/i.test(lower)) {
      chosenKey = 'deluxe';
    } else if (/\b(pilih|ambil|booking|pesan|sewa|mau|kamar)\s*(?:tipe\s*)?(?:executive|eksekutif|exec|eksekutip)\b/i.test(lower) || /\b(yang\s+exec(?:utive)?|yang\s+eksekutif)\b/i.test(lower)) {
      chosenKey = 'executive';
    } else if (/\b(pilih|ambil|booking|pesan|sewa|mau|kamar)\s*(?:tipe\s*)?(?:suite|presidential|presiden)\b/i.test(lower) || /\b(yang\s+presiden(?:tial)?|yang\s+suite)\b/i.test(lower)) {
      chosenKey = 'suite';
    }
  }

  if (chosenKey) {
    const room = getRoom(chosenKey);
    db.setSession(phone, 'hotel_await_date', { roomKey: chosenKey });

    // Kirim foto kamar
    await gateway.sendImage(phone, room.image, `🏨 *${room.name}*\n${room.desc}\nTarif: *${formatRupiah(room.price)} / malam*`);

    // Minta tanggal & nama tamu
    await gateway.sendText(phone,
      `Kapan rencana menginap di *${room.name}*?\n\n` +
      `Sebutkan tanggal check-in, durasi malam, dan nama Anda.\n` +
      `_Contoh: "Besok 2 malam atas nama Budi" atau "25 Agustus 1 malam Budi"_`
    );
    return true;
  }

  // 3. User Input Tanggal & Nama
  if (session.status === 'hotel_await_date') {
    const { parseHotelBookingInput } = require('./aiService');
    const parsed = await parseHotelBookingInput(text);

    const roomKey = session.draft?.roomKey || parsed.roomKey || 'deluxe';
    const room = getRoom(roomKey);
    const nights = Math.max(1, parseInt(parsed.nights || 1, 10));
    const checkIn = parsed.checkInDate || 'Besok';
    const guestName = parsed.customerName || 'Tamu Terhormat';
    const totalPrice = room.price * nights;

    const draft = {
      roomKey,
      roomName: room.name,
      nights,
      checkIn,
      guestName,
      totalPrice,
    };
    db.setSession(phone, 'hotel_confirm_draft', draft);

    const invoiceText =
      '📋 *DRAFT INVOICE PEMESANAN KAMAR*\n' +
      '════════════════════════\n' +
      `👤 *Nama Tamu*   : ${guestName}\n` +
      `🏨 *Tipe Kamar*  : ${room.name}\n` +
      `📅 *Check-In*    : ${checkIn} (14.00 WIB)\n` +
      `🌙 *Durasi*      : ${nights} Malam\n` +
      `💵 *Tarif/Malam* : ${formatRupiah(room.price)}\n` +
      '════════════════════════\n' +
      `💰 *Total Tagihan*: *${formatRupiah(totalPrice)}*\n` +
      '_(Sudah termasuk sarapan 2 orang & pajak)_\n\n' +
      'Lanjutkan ke pembayaran?';

    await gateway.sendButtons(phone, invoiceText, [
      { id: 'hotel_pay_step', title: '💳 Lanjut Bayar' },
      { id: 'hotel_cancel',   title: '❌ Batalkan' },
    ]);
    return true;
  }

  // 4. Lanjut Bayar
  const isPayStep =
    lower === 'hotel_pay_step' ||
    /\b(bayar|lanjut|lanjutkan|ya|oke|ok|gas|proses|deal)\b/i.test(lower);

  if (session.status === 'hotel_confirm_draft' && isPayStep) {
    db.setSession(phone, 'hotel_select_payment', session.draft);

    await gateway.sendButtons(phone,
      '💳 *Pilih Metode Pembayaran:*\n\nSilakan pilih salah satu metode simulasi di bawah ini:',
      [
        { id: 'hotel_pay_qris', title: '📱 QRIS (Demo)' },
        { id: 'hotel_pay_va',   title: '🏦 VA BCA (Demo)' },
        { id: 'hotel_cancel',   title: '❌ Batalkan' },
      ]
    );
    return true;
  }

  // 5. Instruksi Bayar (QRIS / VA)
  if (session.status === 'hotel_select_payment') {
    const draft = session.draft;
    db.setSession(phone, 'hotel_await_payment', draft);

    if (lower.includes('qris') || lower === 'hotel_pay_qris') {
      await gateway.sendText(phone,
        '📱 *SIMULASI PEMBAYARAN QRIS (DEMO)*\n\n' +
        `Total Tagihan: *${formatRupiah(draft.totalPrice)}*\n` +
        'Silakan scan kode QRIS kasir atau tekan tombol di bawah jika sudah mentransfer:'
      );
    } else {
      await gateway.sendText(phone,
        '🏦 *SIMULASI VIRTUAL ACCOUNT BCA (DEMO)*\n\n' +
        'Nomor VA: *8808-0812-3456-7890*\n' +
        'Atas Nama: *SapaTamu Hotel Resort*\n' +
        `Total Tagihan: *${formatRupiah(draft.totalPrice)}*\n\n` +
        'Silakan transfer via m-BCA / ATM.'
      );
    }

    await gateway.sendButtons(phone, 'Konfirmasi pembayaran Anda:', [
      { id: 'hotel_pay_confirm', title: '✅ Sudah Bayar' },
      { id: 'hotel_cancel',      title: '❌ Batalkan' },
    ]);
    return true;
  }

  // 6. Konfirmasi Lunas ➡️ E-Voucher Resmi
  const isPaidConfirm =
    lower === 'hotel_pay_confirm' ||
    /\b(sudah bayar|lunas|transfer done|sudah tf|udah bayar|udah tf|selesai bayar)\b/i.test(lower);

  if (['hotel_confirm_draft', 'hotel_select_payment', 'hotel_await_payment'].includes(session.status) && isPaidConfirm) {
    const draft = session.draft;
    const now = new Date();
    const ymd = now.toISOString().slice(2, 10).replace(/-/g, '');
    const rand = Math.random().toString(16).slice(2, 6).toUpperCase();
    const bookingCode = `SPT-${ymd}-${rand}`;

    db.saveHotelBooking({
      bookingCode,
      phoneNumber: phone,
      guestName: draft.guestName,
      roomKey: draft.roomKey,
      roomName: draft.roomName,
      nights: draft.nights,
      checkIn: draft.checkIn,
      checkOut: `Hari ke-${draft.nights + 1}`,
      totalPrice: draft.totalPrice,
      paymentMethod: 'Simulasi QRIS/VA',
    });

    const StateManager = require('./stateManager');
    await StateManager.reset(phone, 'hotel_booking_confirmed');

    const voucherText =
      '🎟️ *E-VOUCHER RESMI HOTEL SAPATAMU*\n' +
      '════════════════════════\n' +
      `📋 *KODE BOOKING* : *#${bookingCode}*\n` +
      `👤 *Nama Tamu*   : ${draft.guestName}\n` +
      `🏨 *Kamar*       : ${draft.roomName}\n` +
      `📅 *Check-In*    : ${draft.checkIn} (14.00 WIB)\n` +
      `🌙 *Durasi*      : ${draft.nights} Malam\n` +
      `💰 *Total Lunas* : *${formatRupiah(draft.totalPrice)}*\n` +
      '════════════════════════\n' +
      '✅ *Status: DIBAYAR LUNAS (CONFIRMED)*\n\n' +
      'Tunjukkan voucher ini kepada resepsionis saat check-in.\n' +
      'Terima kasih telah memilih SapaTamu! 🙏';

    await gateway.sendText(phone, voucherText);

    // Kirim menu kembali
    await gateway.sendButtons(phone, 'Ada yang bisa kami bantu lagi?', [
      { id: 'goto_main',  title: '🔙 Menu Utama' },
      { id: 'menu_kafe',  title: '☕ Kafe' },
      { id: 'menu_cs',    title: '🎧 Hubungi CS' },
    ]);
    return true;
  }

  // 7. Pembatalan Booking
  if (lower === 'hotel_cancel' || lower.includes('batal')) {
    const StateManager = require('./stateManager');
    await StateManager.reset(phone, 'hotel_booking_cancelled');
    await gateway.sendText(phone, '❌ Reservasi kamar telah dibatalkan.');
    await gateway.sendButtons(phone, 'Silakan pilih menu layanan:', [
      { id: 'goto_main',  title: '🔙 Menu Utama' },
      { id: 'menu_kafe',  title: '☕ Kafe' },
      { id: 'menu_cs',    title: '🎧 Hubungi CS' },
    ]);
    return true;
  }

  return false;
}

module.exports = {
  handleHotelFlow,
  ROOMS,
};
