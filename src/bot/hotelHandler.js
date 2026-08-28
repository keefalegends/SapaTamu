const gateway = require('../gateway/openkoneksiClient');
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

function formatRupiah(num) {
  return 'Rp ' + Number(num).toLocaleString('id-ID');
}

async function handleHotelFlow(phone, text, session) {
  const lower = (text || '').toLowerCase().trim();

  // 1. Menu Pilihan Kamar
  if (session.status === 'hotel_menu' || lower === 'hotel_reservasi' || lower.includes('reservasi kamar') || lower.includes('booking kamar')) {
    db.setSession(phone, 'hotel_pick_room', { roomKey: null });

    const menuText =
      '🛏️ *Pilihan Kamar Hotel SapaTamu*\n\n' +
      'Nikmati kenyamanan bintang 4 dengan fasilitas lengkap:\n\n' +
      '• 🛏️ *Deluxe Room* — Rp 550.000 / malam\n' +
      '  _Kasur King Size, AC, Smart TV, Balkon_\n\n' +
      '• 🌟 *Executive Suite* — Rp 950.000 / malam\n' +
      '  _Ruang Tamu, Jacuzzi, Espresso Maker, Lounge_\n\n' +
      '• 👑 *Presidential Suite* — Rp 1.800.000 / malam\n' +
      '  _2 Kamar Tidur, Dining Room, Mini Bar, Butler_\n\n' +
      'Silakan pilih tipe kamar yang Anda inginkan:';

    await gateway.sendButtons(phone, menuText, [
      { id: 'room_deluxe',    title: '🛏️ Deluxe Room' },
      { id: 'room_executive', title: '🌟 Executive Suite' },
      { id: 'room_suite',     title: '👑 Presidential' },
    ]);
    return true;
  }

  // 2. Pilih Kamar
  if (session.status === 'hotel_pick_room' || lower.startsWith('room_')) {
    let chosenKey = 'deluxe';
    if (lower.includes('executive') || lower === 'room_executive') chosenKey = 'executive';
    if (lower.includes('suite') || lower.includes('presidential') || lower === 'room_suite') chosenKey = 'suite';

    const room = ROOMS[chosenKey];
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
    const room = ROOMS[roomKey] || ROOMS.deluxe;
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
  if (session.status === 'hotel_confirm_draft' && (lower === 'hotel_pay_step' || lower.includes('bayar'))) {
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
        'Nomor VA: *8808-0822-1947-2360*\n' +
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
  if (session.status === 'hotel_await_payment' && (lower === 'hotel_pay_confirm' || lower.includes('sudah bayar'))) {
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

    db.clearSession(phone);

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
    db.clearSession(phone);
    await gateway.sendText(phone, '❌ *Pemesanan kamar telah dibatalkan.*');
    return false; // Kembali ke menu utama
  }

  return false;
}

module.exports = {
  handleHotelFlow,
  ROOMS,
};
