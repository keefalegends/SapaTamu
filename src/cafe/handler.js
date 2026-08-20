// ─── Café Handler ───────────────────────────────────────────────────────────
// State machine for all kafe_* states. Called from chatwootWebhook.js.

const { getStatus, setStatus, getDraft, setDraft, clearDraft } = require('../session/manager');
const { sendMessage, sendMenuMessage } = require('../chatwoot/client');
const cafeService = require('./service');
const renderer = require('./menuRenderer');
const { formatRupiah } = require('../booking/service');

const MENU_UTAMA = {
  text:
    '👋 *Selamat Datang di SapaTamu!*\n\n' +
    'Halo! Saya asisten virtual SapaTamu, siap membantu Anda 24/7.\n\n' +
    'Pilih layanan yang Anda butuhkan:',
  items: [
    { title: '☕ Kafe',             value: 'menu_kafe'   },
    { title: '🏨 Hotel',            value: 'menu_hotel'  },
    { title: '🎧 Customer Service', value: 'menu_cs'     },
  ],
};

// ─── Button Detection (café-specific) ───────────────────────────────────────

const CAFE_VALUES = new Set([
  'cafe_dinein', 'cafe_takeaway', 'cafe_reservasi',
  'cat_show', 'cart_view', 'cart_done', 'cart_cancel',
  'order_confirm', 'order_edit', 'order_cancel',
  'cafe_pay_done', 'cafe_pay_cancel',
  'book_confirm', 'book_cancel',
]);

function detectCafeAction(text) {
  if (!text) return null;
  const lower = text.toLowerCase().trim();
  const clean = lower.replace(/[^\w\s]/g, '').trim();

  // Exact callback match
  if (/^cat_\w+$/.test(lower)) return lower;
  if (/^item_\w+$/.test(lower)) return lower;

  const menu = require('./menu.json');

  // 1. Dynamic Category Match from menu.json
  for (const cat of menu.categories) {
    const catNameClean = cat.name.toLowerCase().replace(/[^\w\s]/g, '').trim();
    if (lower === 'cat_' + cat.id || clean === catNameClean || lower.includes(cat.id)) {
      return 'cat_' + cat.id;
    }
  }

  // 2. Dynamic Item Match from menu.json
  for (const cat of menu.categories) {
    for (const item of cat.items) {
      const itemNameClean = item.name.toLowerCase().replace(/[^\w\s]/g, '').trim();
      if (lower === 'item_' + item.id || clean === itemNameClean || lower === item.name.toLowerCase()) {
        return 'item_' + item.id;
      }
    }
  }

  // Common UI Actions
  if (lower.includes('dine') || lower.includes('makan di tempat')) return 'cafe_dinein';
  if (lower.includes('takeaway') || lower.includes('bungkus') || lower.includes('bawa pulang')) return 'cafe_takeaway';
  if (lower.includes('reservasi') || lower.includes('booking meja')) return 'cafe_reservasi';
  if (lower.includes('lihat keranjang') || lower.includes('keranjang') || lower.includes('cart')) return 'cart_view';
  if (lower.includes('selesai pesan') || lower.includes('selesai') || lower.includes('checkout')) return 'cart_done';
  if (lower.includes('batalkan') || lower.includes('batal')) return 'cart_cancel';
  if (lower.includes('konfirmasi') || lower.includes('confirm')) return 'order_confirm';
  if (lower.includes('ubah') || lower.includes('edit')) return 'order_edit';
  if (lower.includes('sudah bayar')) return 'cafe_pay_done';
  if (lower.includes('tambah lagi') || lower.includes('kategori')) return 'cat_show';

  return null;
}

// ─── Entry Points ───────────────────────────────────────────────────────────

async function handleMejaEntry(convId, contactId, senderPhone, tableNumber) {
  clearDraft(convId);
  setDraft(convId, {
    type: 'dine_in',
    tableNumber,
    cart: [],
    totalAmount: 0,
  });
  setStatus(convId, 'kafe_ordering');

  const padded = String(tableNumber).padStart(2, '0');
  await sendMessage(convId,
    `🍽️ *Selamat datang di Kafe SapaTamu!*\n` +
    `📍 Meja: ${padded}\n\n` +
    `Silakan pilih kategori menu:`
  );
  await sendMenuMessage(convId, 'Pilih kategori:', renderer.categoryButtons());
}

async function handleMenuKafe(convId) {
  clearDraft(convId);
  setStatus(convId, 'kafe_choose_type');

  await sendMessage(convId,
    '☕ *Kafe SapaTamu*\n\n' +
    'Buka setiap hari 07.00 – 22.00 WIB.\n\n' +
    'Mau ngapain hari ini?'
  );
  await sendMenuMessage(convId, 'Pilih layanan:', [
    { title: '🍽️ Makan di Tempat', value: 'cafe_dinein' },
    { title: '🛍️ Takeaway',        value: 'cafe_takeaway' },
    { title: '📅 Reservasi Meja',   value: 'cafe_reservasi' },
  ]);
}

// ─── Main Dispatcher ────────────────────────────────────────────────────────

async function handle(convId, contactId, senderPhone, text, status, senderName) {
  switch (status) {
    case 'kafe_choose_type':
      return handleChooseType(convId, contactId, senderPhone, text, senderName);
    case 'kafe_ordering':
      return handleOrdering(convId, text);
    case 'kafe_confirm':
      return handleConfirm(convId, contactId, senderPhone, text);
    case 'kafe_payment_pending':
      return handlePayment(convId, contactId, senderPhone, text);
    case 'kafe_book_ask_pax':
      return handleBookPax(convId, text, senderName);
    case 'kafe_book_ask_datetime':
      return handleBookDatetime(convId, text);
    case 'kafe_book_confirm':
      return handleBookConfirm(convId, contactId, text);
    default:
      // Unknown kafe state — reset
      setStatus(convId, 'ai_active');
      return;
  }
}

// ─── State: kafe_choose_type ────────────────────────────────────────────────

async function handleChooseType(convId, contactId, senderPhone, text, senderName) {
  const { detectMeja } = require('./detector');

  // Check if user typed "Meja XX" (dine-in without QR)
  const mejaMatch = detectMeja(text);
  if (mejaMatch) {
    return handleMejaEntry(convId, contactId, senderPhone, mejaMatch.tableNumber);
  }

  const action = detectCafeAction(text);

  if (action === 'cafe_dinein') {
    await sendMessage(convId,
      '🍽️ *Makan di Tempat (Dine-in)*\n\n' +
      'Silakan scan QR Code yang tertera di meja Anda untuk mulai memesan. ☕✨'
    );
    // Stay in kafe_choose_type — next message parsed as "Meja XX" from QR scan
    return;
  }

  if (action === 'cafe_takeaway') {
    clearDraft(convId);
    setDraft(convId, { type: 'takeaway', tableNumber: null, cart: [], totalAmount: 0 });
    setStatus(convId, 'kafe_ordering');

    await sendMessage(convId, '🛍️ *Takeaway Order*\n\nPilih kategori menu:');
    await sendMenuMessage(convId, 'Pilih kategori:', renderer.categoryButtons());
    return;
  }

  if (action === 'cafe_reservasi') {
    clearDraft(convId);
    setDraft(convId, { type: 'reservasi', pax: null, date: null, time: null, notes: null, name: senderName || null });
    setStatus(convId, 'kafe_book_ask_pax');

    await sendMessage(convId,
      '📅 *Reservasi Meja Kafe*\n\n' +
      'Untuk berapa orang?\n' +
      'Boleh sebutkan preferensi juga.\n\n' +
      '_Contoh: "4 orang, outdoor dekat taman"_'
    );
    return;
  }

  // Try AI response for questions like "jam berapa buka?", "lokasi di mana?"
  const { jawab } = require('../ai/handler');
  const { eksekusiEskalasi } = require('../escalation/service');
  console.log(`🤖 [CAFÉ AI] Answering question during choose type: "${text}"`);
  const aiResp = await jawab(text);

  if (aiResp.eskalasi) {
    await eksekusiEskalasi(convId, 'ai_unhandled');
    return;
  }

  if (aiResp.jawaban) {
    await sendMessage(convId, `🤖 *AI SapaTamu:*\n\n${aiResp.jawaban}`);
  }

  // Show options again
  await sendMenuMessage(convId, 'Pilih layanan kafe:', [
    { title: '🍽️ Makan di Tempat', value: 'cafe_dinein' },
    { title: '🛍️ Takeaway',        value: 'cafe_takeaway' },
    { title: '📅 Reservasi Meja',   value: 'cafe_reservasi' },
  ]);
}

// ─── State: kafe_ordering (Cart Loop) ───────────────────────────────────────

async function handleOrdering(convId, text) {
  const draft = getDraft(convId);
  if (!draft) {
    setStatus(convId, 'ai_active');
    return;
  }

  const action = detectCafeAction(text);

  // Show categories
  if (action === 'cat_show' || !action && !text) {
    await sendMenuMessage(convId, 'Pilih kategori:', renderer.categoryButtons());
    return;
  }

  // Category selected
  if (action && action.startsWith('cat_') && action !== 'cat_show') {
    const categoryId = action.replace('cat_', '');
    const result = renderer.renderCategory(categoryId);
    if (result) {
      await sendMessage(convId, result.text);
      await sendMenuMessage(convId, 'Pilih item:', result.buttons);
    } else {
      await sendMenuMessage(convId, 'Pilih kategori:', renderer.categoryButtons());
    }
    return;
  }

  // Item selected
  if (action && action.startsWith('item_')) {
    const itemId = action.replace('item_', '');
    const success = cafeService.addToCart(draft, itemId);
    if (success) {
      setDraft(convId, draft);
      await sendMessage(convId, renderer.formatCartAddConfirm(draft, itemId));
      await sendMenuMessage(convId, 'Mau apa lagi?', renderer.afterAddButtons());
    } else {
      await sendMessage(convId, '❌ Item tidak ditemukan');
      await sendMenuMessage(convId, 'Pilih kategori:', renderer.categoryButtons());
    }
    return;
  }

  // View cart
  if (action === 'cart_view') {
    await sendMessage(convId, renderer.formatFullCart(draft));
    await sendMenuMessage(convId, 'Pilih aksi:', renderer.cartActionButtons());
    return;
  }

  // Done ordering
  if (action === 'cart_done') {
    if (!draft.cart || draft.cart.length === 0) {
      await sendMessage(convId, '🛒 Keranjang masih kosong. Pilih menu dulu ya!');
      await sendMenuMessage(convId, 'Pilih kategori:', renderer.categoryButtons());
      return;
    }
    setStatus(convId, 'kafe_confirm');
    await sendMessage(convId, renderer.formatOrderSummary(draft));
    await sendMenuMessage(convId, 'Konfirmasi pesanan:', [
      { title: '✅ Konfirmasi',  value: 'order_confirm' },
      { title: '✏️ Ubah',       value: 'order_edit' },
      { title: '❌ Batalkan',    value: 'order_cancel' },
    ]);
    return;
  }

  // Cancel
  if (action === 'cart_cancel') {
    clearDraft(convId);
    setStatus(convId, 'ai_active');
    await sendMessage(convId, '❌ *Pesanan kafe telah dibatalkan.*');
    await sendMenuMessage(convId, MENU_UTAMA.text, MENU_UTAMA.items);
    return;
  }

  // Free-text: try parse as cart modification
  const parsed = cafeService.parseCartModification(text, draft);
  if (parsed) {
    setDraft(convId, draft);
    await sendMessage(convId, parsed.message);
    await sendMenuMessage(convId, 'Mau apa lagi?', renderer.afterAddButtons());
    return;
  }

  // Free-text: Call AI to answer user question!
  const { jawab } = require('../ai/handler');
  const { eksekusiEskalasi } = require('../escalation/service');
  console.log(`🤖 [CAFÉ AI] Answering question during ordering: "${text}"`);
  const aiResp = await jawab(text);

  if (aiResp.eskalasi) {
    await eksekusiEskalasi(convId, 'ai_unhandled');
    return;
  }

  if (aiResp.jawaban) {
    await sendMessage(convId, `🤖 *AI SapaTamu:*\n\n${aiResp.jawaban}`);
    if (draft.cart && draft.cart.length > 0) {
      await sendMenuMessage(convId, 'Lanjutkan pesanan Anda:', renderer.afterAddButtons());
    } else {
      await sendMenuMessage(convId, 'Pilih menu kafe:', renderer.categoryButtons());
    }
    return;
  }

  // Unrecognized — show categories
  await sendMessage(convId, '🤔 Tidak mengenali item tersebut.\n\nPilih dari menu:');
  await sendMenuMessage(convId, 'Pilih kategori:', renderer.categoryButtons());
}

// ─── State: kafe_confirm ────────────────────────────────────────────────────

async function handleConfirm(convId, contactId, senderPhone, text) {
  const action = detectCafeAction(text);
  const lower = (text || '').toLowerCase().trim();

  // Cancel action check
  if (
    action === 'order_cancel' ||
    action === 'cart_cancel' ||
    action === 'cafe_pay_cancel' ||
    action === 'book_cancel' ||
    lower.includes('batal')
  ) {
    clearDraft(convId);
    setStatus(convId, 'ai_active');
    await sendMessage(convId, '❌ *Pesanan kafe telah dibatalkan.*');
    await sendMenuMessage(convId, MENU_UTAMA.text, MENU_UTAMA.items);
    return;
  }

  // Edit action check
  if (
    action === 'order_edit' ||
    lower.includes('ubah') ||
    lower.includes('edit')
  ) {
    setStatus(convId, 'kafe_ordering');
    const draft = getDraft(convId);
    await sendMessage(convId, renderer.formatFullCart(draft));
    await sendMenuMessage(convId, 'Pilih aksi:', renderer.cartActionButtons());
    return;
  }

  // Confirm action check
  if (
    action === 'order_confirm' ||
    action === 'book_confirm' ||
    lower.includes('konfirmasi') ||
    lower.includes('confirm')
  ) {
    const draft = getDraft(convId);
    if (!draft || !draft.cart || draft.cart.length === 0) {
      setStatus(convId, 'ai_active');
      await sendMessage(convId, '⚠️ Sesi pesanan telah berakhir. Silakan mulai lagi.');
      return;
    }

    // Generate order code & store in draft
    const orderCode = cafeService.generateOrderCode();
    draft.orderCode = orderCode;
    setDraft(convId, draft);
    setStatus(convId, 'kafe_payment_pending');

    const label = draft.type === 'dine_in'
      ? `Meja ${String(draft.tableNumber).padStart(2, '0')}`
      : 'Takeaway';

    await sendMessage(convId,
      `💳 *Pembayaran — ${label}*\n\n` +
      `Kode Pesanan: *${orderCode}*\n` +
      `Total: *${formatRupiah(draft.totalAmount)}*\n\n` +
      `📱 *QRIS*\n` +
      `Scan QR pembayaran di kasir\n\n` +
      `🏦 *Transfer VA*\n` +
      `Bank BCA: 8808-0822-1947-2360\n` +
      `a.n. SapaTamu Cafe\n\n` +
      `_⚠️ Demo mode — tekan "Sudah Bayar" untuk lanjut._`
    );
    await sendMenuMessage(convId, 'Status pembayaran:', [
      { title: '✅ Sudah Bayar', value: 'cafe_pay_done' },
      { title: '❌ Batalkan',    value: 'cafe_pay_cancel' },
    ]);
    return;
  }

  // Unrecognized text / questions / greetings: try AI!
  const { jawab } = require('../ai/handler');
  const { eksekusiEskalasi } = require('../escalation/service');
  console.log(`🤖 [CAFÉ AI] Answering question during confirm: "${text}"`);
  const aiResp = await jawab(text);

  if (aiResp.eskalasi) {
    await eksekusiEskalasi(convId, 'ai_unhandled');
    return;
  }

  if (aiResp.jawaban) {
    await sendMessage(convId, `🤖 *AI SapaTamu:*\n\n${aiResp.jawaban}`);
  }

  // Resend confirmation options
  await sendMenuMessage(convId, 'Konfirmasi pesanan:', [
    { title: '✅ Konfirmasi',  value: 'order_confirm' },
    { title: '✏️ Ubah',       value: 'order_edit' },
    { title: '❌ Batalkan',    value: 'order_cancel' },
  ]);
}

// ─── State: kafe_payment_pending ────────────────────────────────────────────

async function handlePayment(convId, contactId, senderPhone, text) {
  const action = detectCafeAction(text);
  const lower = (text || '').toLowerCase().trim();

  if (
    action === 'cafe_pay_done' ||
    lower.includes('sudah bayar') ||
    lower.includes('bayar') ||
    lower.includes('lunas')
  ) {
    const draft = getDraft(convId);
    if (!draft || !draft.orderCode) {
      setStatus(convId, 'ai_active');
      await sendMessage(convId, '⚠️ Sesi pesanan telah berakhir. Silakan mulai lagi.');
      return;
    }

    // Save order to DB
    const orderCode = cafeService.saveOrder(convId, draft);

    // Add loyalty points
    const contactKey = senderPhone || String(contactId);
    const earnedPoints = cafeService.addLoyaltyPoints(contactKey, draft.totalAmount);
    const totalPoints = cafeService.getPoints(contactKey);

    // Notify staff
    await notifyStaffOrder(convId, draft, orderCode);

    // Confirm to customer
    const label = draft.type === 'dine_in'
      ? `Pesanan diantar ke Meja ${String(draft.tableNumber).padStart(2, '0')}`
      : 'Ambil pesanan di kasir';

    await sendMessage(convId,
      `✅ *Pembayaran Dikonfirmasi!*\n\n` +
      `📋 Kode: *${orderCode}*\n` +
      `🎉 +${earnedPoints} poin loyalty (total: ${totalPoints} poin)\n\n` +
      `${draft.type === 'dine_in' ? '🍳' : '🛍️'} ${label}\n\n` +
      `Terima kasih sudah memesan di Kafe SapaTamu! 🙏`
    );

    clearDraft(convId);
    setStatus(convId, 'ai_active');
    return;
  }

  if (
    action === 'cafe_pay_cancel' ||
    action === 'order_cancel' ||
    action === 'cart_cancel' ||
    lower.includes('batal')
  ) {
    clearDraft(convId);
    setStatus(convId, 'ai_active');
    await sendMessage(convId, '❌ *Pesanan kafe telah dibatalkan.*');
    await sendMenuMessage(convId, MENU_UTAMA.text, MENU_UTAMA.items);
    return;
  }

  // Unrecognized: try AI
  const { jawab } = require('../ai/handler');
  const { eksekusiEskalasi } = require('../escalation/service');
  const aiResp = await jawab(text);

  if (aiResp.eskalasi) {
    await eksekusiEskalasi(convId, 'ai_unhandled');
    return;
  }

  if (aiResp.jawaban) {
    await sendMessage(convId, `🤖 *AI SapaTamu:*\n\n${aiResp.jawaban}`);
  }

  await sendMessage(convId, 'Silakan selesaikan pembayaran, lalu tekan *Sudah Bayar*.');
  await sendMenuMessage(convId, 'Status pembayaran:', [
    { title: '✅ Sudah Bayar', value: 'cafe_pay_done' },
    { title: '❌ Batalkan',    value: 'cafe_pay_cancel' },
  ]);
}

// ─── State: kafe_book_ask_pax ───────────────────────────────────────────────

async function handleBookPax(convId, text, senderName) {
  const { pax, notes } = cafeService.parsePaxInput(text);

  if (!pax || pax < 1) {
    await sendMessage(convId,
      '🤔 Mohon sebutkan jumlah orang.\n\n_Contoh: "4 orang, outdoor"_'
    );
    return;
  }

  const draft = getDraft(convId) || { type: 'reservasi' };
  draft.pax = pax;
  draft.notes = notes;
  if (!draft.name) draft.name = senderName || null;
  setDraft(convId, draft);

  setStatus(convId, 'kafe_book_ask_datetime');
  await sendMessage(convId,
    `👥 ${pax} orang${notes ? ` _(${notes})_` : ''}\n\n` +
    `Kapan reservasinya?\n\n` +
    `_Contoh: "Besok jam 19:00" atau "Sabtu 12:00"_`
  );
}

// ─── State: kafe_book_ask_datetime ──────────────────────────────────────────

async function handleBookDatetime(convId, text) {
  const { date, time } = cafeService.parseDateTimeInput(text);

  if (!date && !time) {
    await sendMessage(convId,
      '🤔 Mohon sebutkan tanggal dan jam.\n\n_Contoh: "Besok jam 19:00" atau "Sabtu 12:00"_'
    );
    return;
  }

  if (!date) {
    await sendMessage(convId, '🤔 Tanggal belum terdeteksi. Contoh: "Besok", "Sabtu", "20 Agustus"');
    return;
  }

  if (!time) {
    await sendMessage(convId, '🤔 Jam belum terdeteksi. Contoh: "jam 19:00" atau "7 malam"');
    return;
  }

  const draft = getDraft(convId);
  draft.date = date;
  draft.time = time;
  setDraft(convId, draft);

  setStatus(convId, 'kafe_book_confirm');
  await sendMessage(convId, renderer.formatReservationSummary(draft) + '\n\nKonfirmasi reservasi?');
  await sendMenuMessage(convId, 'Konfirmasi:', [
    { title: '✅ Konfirmasi', value: 'book_confirm' },
    { title: '❌ Batalkan',   value: 'book_cancel' },
  ]);
}

// ─── State: kafe_book_confirm ───────────────────────────────────────────────

async function handleBookConfirm(convId, contactId, text) {
  const action = detectCafeAction(text);
  const lower = (text || '').toLowerCase().trim();

  if (action === 'book_confirm' || action === 'order_confirm' || lower.includes('konfirmasi') || lower.includes('confirm')) {
    const draft = getDraft(convId);
    if (!draft || !draft.pax || !draft.date) {
      setStatus(convId, 'ai_active');
      await sendMessage(convId, '⚠️ Sesi reservasi telah berakhir. Silakan mulai lagi.');
      return;
    }

    const contactKey = String(contactId);
    const reservationId = cafeService.saveReservation(contactKey, draft);

    // Notify staff
    await notifyStaffReservation(convId, draft, reservationId);

    await sendMessage(convId,
      `✅ *Reservasi Dikonfirmasi!*\n\n` +
      `📋 ID: *${reservationId}*\n` +
      `👥 ${draft.pax} orang\n` +
      `📆 ${draft.date} jam ${draft.time}\n` +
      (draft.notes ? `📝 ${draft.notes}\n` : '') +
      `\nSampai jumpa di Kafe SapaTamu! ☕`
    );

    clearDraft(convId);
    setStatus(convId, 'ai_active');
    return;
  }

  if (action === 'book_cancel' || action === 'order_cancel' || action === 'cart_cancel' || lower.includes('batal')) {
    clearDraft(convId);
    setStatus(convId, 'ai_active');
    await sendMessage(convId, '❌ *Reservasi kafe telah dibatalkan.*');
    await sendMenuMessage(convId, MENU_UTAMA.text, MENU_UTAMA.items);
    return;
  }

  // Unrecognized
  await sendMenuMessage(convId, 'Konfirmasi reservasi:', [
    { title: '✅ Konfirmasi', value: 'book_confirm' },
    { title: '❌ Batalkan',   value: 'book_cancel' },
  ]);
}

// ─── Staff Notifications ────────────────────────────────────────────────────

async function notifyStaffOrder(convId, draft, orderCode) {
  const label = draft.type === 'dine_in'
    ? `🍳 Meja ${String(draft.tableNumber).padStart(2, '0')}`
    : '🛍️ Takeaway';

  const items = draft.cart.map(i => `  ${i.name} x${i.qty}  ${formatRupiah(i.subtotal)}`).join('\n');
  const sep = '─'.repeat(25);

  const msg =
    `📢 *PESANAN BARU — ${label}*\n` +
    `Kode: ${orderCode}\n` +
    `${sep}\n` +
    `${items}\n` +
    `${sep}\n` +
    `Total: ${formatRupiah(draft.totalAmount)}\n` +
    `Status: DIBAYAR ✅`;

  // Send as message in same conversation — staff sees in Chatwoot
  await sendMessage(convId, msg);
}

async function notifyStaffReservation(convId, draft, reservationId) {
  const msg =
    `📢 *RESERVASI BARU*\n` +
    `ID: ${reservationId}\n` +
    `${'─'.repeat(25)}\n` +
    `👥 ${draft.pax} orang\n` +
    `📆 ${draft.date} jam ${draft.time}\n` +
    (draft.notes ? `📝 ${draft.notes}\n` : '') +
    (draft.name ? `👤 ${draft.name}\n` : '') +
    `${'─'.repeat(25)}\n` +
    `Status: CONFIRMED ✅`;

  await sendMessage(convId, msg);
}

module.exports = {
  handleMejaEntry,
  handleMenuKafe,
  handle,
};
