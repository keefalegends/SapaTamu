const { getDb } = require('../db/session');
const { getDraft, setDraft, clearDraft } = require('../session/manager');

// ─── MASTER DATA KAMAR ────────────────────────────────────────────────────────

const ROOM_CATALOG = {
  deluxe: {
    key:         'deluxe',
    name:        'Deluxe Room',
    price:       550000,
    image:       'kamar_deluxe.jpg',
    description: 'Kamar modern seluas 28m² dengan kasur King Size. Dilengkapi AC, Smart TV 43", Kamar Mandi Air Panas (Rain Shower), Balkon Pribadi, dan WiFi cepat.',
    facilities:  ['🍳 Sarapan Gratis 2 Orang', '📶 WiFi 100 Mbps', '🏊 Akses Kolam Renang & Gym', '☕ Coffee & Tea Maker', '🅿️ Parkir Gratis'],
  },
  executive: {
    key:         'executive',
    name:        'Executive Suite',
    price:       950000,
    image:       'kamar_executive.jpg',
    description: 'Suite mewah seluas 45m² dengan Ruang Tamu terpisah, Bathtub Jacuzzi, Mesin Kopi Espresso, Kasur Super King, dan Akses Executive Lounge.',
    facilities:  ['🍳 Sarapan Buffet 2 Orang', '🛁 Bathtub Jacuzzi', '☕ Mesin Kopi Espresso', '🍸 Akses Executive Lounge', '⏰ Free Late Check-out s/d 14.00'],
  },
  suite: {
    key:         'suite',
    name:        'Presidential Suite',
    price:       1800000,
    image:       'kamar_suite.jpg',
    description: 'Suite termewah dan paling eksklusif dengan 2 Kamar Tidur, Ruang Makan & Dapur Mini, Mini Bar Gratis, dan Layanan Butler 24 Jam.',
    facilities:  ['🍳 Sarapan Buffet 4 Orang', '🛎️ Layanan Butler 24 Jam', '🍷 Free Mini Bar Sepuasnya', '🧖 Private Jacuzzi & Sauna', '🚐 Antar-Jemput Bandara Gratis'],
  },
};

// ─── UTILS ────────────────────────────────────────────────────────────────────

function formatRupiah(num) {
  return 'Rp ' + Number(num).toLocaleString('id-ID');
}

function findRoom(query) {
  if (!query) return ROOM_CATALOG.deluxe;
  const q = query.toLowerCase();
  if (q.includes('presidential') || q.includes('suite') || q.includes('presiden')) return ROOM_CATALOG.suite;
  if (q.includes('executive') || q.includes('eksekutif')) return ROOM_CATALOG.executive;
  return ROOM_CATALOG.deluxe;
}

function generateBookingCode() {
  const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  const randHex = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `SPT-${dateStr}-${randHex}`;
}

function calculateCheckOut(checkInStr, nights, explicitCheckOut) {
  if (explicitCheckOut) return explicitCheckOut;
  const match = (checkInStr || '').match(/^(\d{1,2})\s+([A-Za-z]+)(?:\s+(\d{4}))?/i);
  if (!match) return `Hari ke-${(parseInt(nights) || 1) + 1}`;
  const day = parseInt(match[1]);
  const month = match[2];
  const year = match[3] ? ' ' + match[3] : '';
  const outDay = day + (parseInt(nights) || 1);
  return `${outDay} ${month}${year}`;
}

// ─── DRAFT LOGIC ──────────────────────────────────────────────────────────────

/**
 * Update atau buat draft booking baru
 */
function updateBookingDraft(conversationId, updateData) {
  const current = getDraft(conversationId) || {};
  const cleanUpdate = {};

  // Hanya salin nilai yang tidak null / undefined agar roomKey sebelumnya tidak tertimpa
  for (const [k, v] of Object.entries(updateData || {})) {
    if (v !== null && v !== undefined && v !== '') {
      cleanUpdate[k] = v;
    }
  }

  const merged = { ...current, ...cleanUpdate };

  // Pastikan roomKey selalu valid dari pilihan user
  merged.roomKey       = merged.roomKey || current.roomKey || 'deluxe';
  const room           = ROOM_CATALOG[merged.roomKey] || ROOM_CATALOG.deluxe;
  const nights         = Math.max(1, parseInt(merged.nights) || 1);

  merged.roomName      = room.name;
  merged.pricePerNight = room.price;
  merged.nights        = nights;
  merged.totalPrice    = room.price * nights;

  if (merged.checkInDate && !merged.checkOutDate) {
    merged.checkOutDate = calculateCheckOut(merged.checkInDate, nights);
  }

  setDraft(conversationId, merged);
  return merged;
}

/**
 * Format ringkasan invoice draft untuk dikirim ke user
 */
function formatDraftInvoice(draft) {
  const roomKey  = draft.roomKey || 'deluxe';
  const room     = ROOM_CATALOG[roomKey] || ROOM_CATALOG.deluxe;
  const nights   = Math.max(1, parseInt(draft.nights) || 1);
  const total    = room.price * nights;
  const name     = draft.customerName || 'Tamu Terhormat';
  const checkIn  = draft.checkInDate || 'Menyesuaikan';
  const checkOut = draft.checkOutDate || calculateCheckOut(checkIn, nights);

  return (
    '📋 *RINGKASAN PEMESANAN KAMAR*\n' +
    '────────────────────────\n' +
    `👤 *Nama Tamu*   : *${name}*\n` +
    `🏨 *Tipe Kamar*  : *${room.name}*\n` +
    `📅 *Check-In*    : ${checkIn} (14.00 WIB)\n` +
    `🚪 *Check-Out*   : ${checkOut} (12.00 WIB)\n` +
    `🌙 *Durasi*      : ${nights} Malam\n` +
    `🍽️ *Sarapan*     : Termasuk (${room.facilities[0]})\n` +
    '────────────────────────\n' +
    `💰 *Harga/Malam* : ${formatRupiah(room.price)}\n` +
    `💵 *Total Tagihan*: *${formatRupiah(total)}*\n` +
    '────────────────────────\n' +
    '_Apakah data di atas sudah benar? Silakan pilih langkah selanjutnya:_'
  );
}

// ─── PAYMENT & E-VOUCHER ──────────────────────────────────────────────────────

/**
 * Simpan pesanan ke tabel SQLite bookings dengan status 'paid'
 */
function saveConfirmedBooking(conversationId, paymentMethod, customerPhone) {
  const draft = getDraft(conversationId);
  if (!draft) return null;

  const db = getDb();
  const bookingCode = generateBookingCode();
  const roomKey = draft.roomKey || 'deluxe';
  const room = ROOM_CATALOG[roomKey] || ROOM_CATALOG.deluxe;
  const nights = Math.max(1, parseInt(draft.nights) || 1);
  const totalPrice = room.price * nights;
  const name = draft.customerName || 'Tamu SapaTamu';
  const phone = customerPhone || draft.customerPhone || '-';
  const checkIn = draft.checkInDate || 'Hari ini';
  const checkOut = draft.checkOutDate || calculateCheckOut(checkIn, nights);

  db.prepare(`
    INSERT INTO bookings (
      booking_code, conversation_id, customer_phone, customer_name,
      room_type, check_in_date, nights, total_price, payment_method, status, paid_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'paid', datetime('now'))
  `).run(
    bookingCode,
    conversationId,
    phone,
    name,
    room.name,
    `${checkIn} - ${checkOut}`,
    nights,
    totalPrice,
    paymentMethod
  );

  // Bersihkan draft setelah booking sukses
  clearDraft(conversationId);

  return {
    bookingCode,
    customerName:  name,
    customerPhone: phone,
    roomName:      room.name,
    checkInDate:   checkIn,
    checkOutDate:  checkOut,
    nights:        nights,
    totalPrice:    totalPrice,
    paymentMethod: paymentMethod,
    facilities:    room.facilities,
  };
}

/**
 * Format E-Voucher resmi setelah pembayaran berhasil
 */
function formatEVoucher(booking) {
  return (
    '🎉 *PEMESANAN BERHASIL & LUNAS!* 🎉\n\n' +
    'Terima kasih! Pembayaran Anda telah kami terima.\n\n' +
    '🎟️ *E-VOUCHER HOTEL SAPATAMU*\n' +
    '════════════════════════\n' +
    `🔖 *No. Booking* : *${booking.bookingCode}*\n` +
    `👤 *Nama Tamu*   : *${booking.customerName}*\n` +
    `🏨 *Tipe Kamar*  : ${booking.roomName}\n` +
    `📅 *Check-In*    : ${booking.checkInDate} (Pukul 14.00 WIB)\n` +
    `🚪 *Check-Out*   : ${booking.checkOutDate} (Pukul 12.00 WIB)\n` +
    `🌙 *Durasi*      : ${booking.nights} Malam\n` +
    `💳 *Pembayaran*  : ${booking.paymentMethod.toUpperCase()} (LUNAS)\n` +
    `💰 *Total Bayar* : ${formatRupiah(booking.totalPrice)}\n` +
    '════════════════════════\n\n' +
    '📌 *Petunjuk Check-In:*\n' +
    '1. Tunjukkan pesan E-Voucher ini ke Resepsionis saat tiba di hotel.\n' +
    '2. Siapkan KTP/Identitas asli sesuai nama pemesan.\n' +
    '3. Resepsionis standby 24 jam.\n\n' +
    '📍 *Lokasi:* Jl. Sudirman No. 123, SapaTamu Resort\n' +
    '📞 *Bantuan:* Hubungi resepsionis di nomor ini kapan saja.\n\n' +
    'Selamat beristirahat dan menikmati liburan Anda! 🙏✨'
  );
}

module.exports = {
  ROOM_CATALOG,
  formatRupiah,
  findRoom,
  generateBookingCode,
  updateBookingDraft,
  formatDraftInvoice,
  saveConfirmedBooking,
  formatEVoucher,
};
