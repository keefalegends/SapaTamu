const gateway = require('../gateway/whatsappClient');
const db = require('../db/database');

function formatRupiah(num) {
  return 'Rp ' + Number(num).toLocaleString('id-ID');
}

function detectTableNumber(text) {
  if (!text) return null;
  const match = text.match(/meja\s*(\d+)/i);
  return match ? parseInt(match[1], 10) : null;
}

function getMenuCatalog() {
  const rows = db.prepare('SELECT * FROM menu_catalog').all();
  const categories = {
    minuman: { name: '☕ Minuman', items: [] },
    makanan: { name: '🍳 Makanan', items: [] },
  };
  for (const r of rows) {
    if (categories[r.category]) {
      categories[r.category].items.push(r);
    }
  }
  return categories;
}

function findMenuItem(query) {
  const lower = (query || '').toLowerCase().replace(/[0-9x×+]/g, '').trim();
  const rows = db.db.prepare('SELECT * FROM menu_catalog').all();

  // 1. Direct exact or substring match
  let match = rows.find(r => {
    const rName = r.name.toLowerCase();
    return rName === lower || lower.includes(rName) || rName.includes(lower) || r.id === lower;
  });
  if (match) return match;

  // 2. Multi-word partial matching (contoh: "nasi goreng" cocok dengan "Nasi Goreng Spesial")
  const words = lower.split(/\s+/).filter(w => w.length >= 3);
  if (words.length > 0) {
    match = rows.find(r => {
      const rName = r.name.toLowerCase();
      return words.every(w => rName.includes(w));
    });
  }
  return match;
}

async function handleCafeFlow(phone, text, session) {
  const lower = (text || '').toLowerCase().trim();
  const tableNum = detectTableNumber(text);

  // 1. Deteksi Masuk Lewat Scan QR Meja ("Meja 04")
  if (tableNum) {
    const draft = {
      orderType: 'dine_in',
      tableNumber: tableNum,
      cart: [],
    };
    db.setSession(phone, 'cafe_ordering', draft);

    await gateway.sendText(phone,
      `🍽️ *Selamat datang di Kafe SapaTamu!*\n\n` +
      `Anda terhubung di *Meja ${String(tableNum).padStart(2, '0')}*.\n` +
      `Silakan pilih kategori menu di bawah untuk memesan langsung:`
    );
    await gateway.sendButtons(phone, 'Pilih kategori:', [
      { id: 'cat_minuman', title: '☕ Minuman' },
      { id: 'cat_makanan', title: '🍳 Makanan' },
      { id: 'cart_view',   title: '🛒 Keranjang' },
    ]);
    return true;
  }

  // 2. Menu Pilihan Layanan Kafe
  if (session.status === 'cafe_menu' || lower === 'menu_kafe' || lower === 'kafe') {
    db.setSession(phone, 'cafe_choose_type', {});

    const welcomeCafe =
      '☕ *Selamat Datang di Kafe SapaTamu!*\n\n' +
      'Buka setiap hari pukul 07.00 – 22.00 WIB.\n' +
      'Nikmati aneka kopi single origin, hidangan lezat, dan suasana nyaman.\n\n' +
      'Silakan pilih jenis pesanan:';

    await gateway.sendButtons(phone, welcomeCafe, [
      { id: 'cafe_dinein',    title: '🍽️ Makan di Tempat' },
      { id: 'cafe_takeaway',  title: '🛍️ Takeaway' },
      { id: 'cafe_reservasi', title: '📅 Reservasi Meja' },
    ]);
    return true;
  }

  // 3. Pilihan Tipe: Dine-in / Takeaway / Reservasi
  if (session.status === 'cafe_choose_type') {
    if (lower === 'cafe_dinein' || lower.includes('makan di tempat')) {
      await gateway.sendText(phone,
        '🍽️ *Makan di Tempat (Dine-in)*\n\n' +
        'Silakan scan QR Code yang tertera di meja Anda untuk langsung memesan. ☕✨'
      );
      return true;
    }

    if (lower === 'cafe_takeaway' || lower.includes('takeaway')) {
      db.setSession(phone, 'cafe_ordering', { orderType: 'takeaway', cart: [] });
      await gateway.sendButtons(phone,
        '🛍️ *Pesanan Bawa Pulang (Takeaway)*\n\nSilakan pilih kategori menu yang ingin dipesan:',
        [
          { id: 'cat_minuman', title: '☕ Minuman' },
          { id: 'cat_makanan', title: '🍳 Makanan' },
          { id: 'cart_view',   title: '🛒 Keranjang' },
        ]
      );
      return true;
    }

    if (lower === 'cafe_reservasi' || lower.includes('reservasi')) {
      db.setSession(phone, 'cafe_res_pax', {});
      await gateway.sendText(phone,
        '📅 *Reservasi Meja Kafe SapaTamu*\n\n' +
        'Untuk berapa orang reservasi Anda?\n' +
        '_Contoh: "4 orang" atau "2 orang, outdoor"_'
      );
      return true;
    }
  }

  // 4. Tampilkan Menu Kategori
  if (lower === 'cat_minuman' || lower === 'cat_makanan') {
    const isMinuman = lower === 'cat_minuman';
    const rows = db.prepare('SELECT * FROM menu_catalog WHERE category = ?').all(isMinuman ? 'minuman' : 'makanan');

    let menuListText = `${isMinuman ? '☕ *MENU MINUMAN*' : '🍳 *MENU MAKANAN*'}\n════════════════════════\n`;
    for (const r of rows) {
      menuListText += `• *${r.name}* — ${formatRupiah(r.price)}\n`;
    }
    menuListText += '\nKetik nama menu yang diinginkan (contoh: _"1 Nasi Goreng"_ atau _"2 Caffe Latte"_):';

    await gateway.sendText(phone, menuListText);

    // Kirim quick buttons untuk 3 item terlaris
    const quickItems = rows.slice(0, 3).map(r => ({
      id: `add_${r.id}`,
      title: `+1 ${r.name.length > 15 ? r.name.substring(0, 15) : r.name}`,
    }));
    await gateway.sendButtons(phone, 'Pilih cepat:', quickItems);
    return true;
  }

function isQuestion(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return (
    lower.includes('?') ||
    /\b(berapa|total|apa|gimana|apakah|bisa|rekomendasi|menu|harga|kalo|kalau|kenapa|siapa|kapan|dimana|mana)\b/i.test(lower)
  );
}

  // 5. Tambah Menu ke Keranjang
  if (lower.startsWith('add_') || session.status === 'cafe_ordering') {
    // Jika input adalah pertanyaan (misal: "kalo esteh tambah jeruk peras berapa?"), teruskan ke AI
    if (!lower.startsWith('add_') && isQuestion(text)) {
      const { jawabAI } = require('./aiService');
      const aiResp = await jawabAI(text);
      if (aiResp.jawaban) {
        await gateway.sendText(phone, `🤖 *AI SapaTamu:*\n\n${aiResp.jawaban}`);
      }
      await gateway.sendButtons(phone, 'Lanjutkan pesanan Anda:', [
        { id: 'cat_minuman', title: '☕ Minuman' },
        { id: 'cat_makanan', title: '🍳 Makanan' },
        { id: 'cart_view',   title: '🛒 Keranjang' },
      ]);
      return true;
    }

    let draft = session.draft || { orderType: 'takeaway', cart: [] };
    let addedName = null;
    let addedPrice = 0;
    let addedQty = 1;

    if (lower.startsWith('add_')) {
      const itemId = lower.replace('add_', '');
      const item = db.prepare('SELECT * FROM menu_catalog WHERE id = ?').get(itemId);
      if (item) {
        addedName = item.name;
        addedPrice = item.price;
      }
    } else {
      // Free text parser (contoh: "1 espresso", "nasi goreng 2")
      const item = findMenuItem(text);
      if (item) {
        addedName = item.name;
        addedPrice = item.price;
        const qtyMatch = text.match(/\b(\d+)\b/);
        if (qtyMatch) addedQty = parseInt(qtyMatch[1], 10);
      }
    }

    if (addedName) {
      if (!draft.cart) draft.cart = [];
      const existing = draft.cart.find(c => c.name === addedName);
      if (existing) {
        existing.qty += addedQty;
        existing.subtotal = existing.qty * existing.price;
      } else {
        draft.cart.push({
          name: addedName,
          qty: addedQty,
          price: addedPrice,
          subtotal: addedQty * addedPrice,
        });
      }
      db.setSession(phone, 'cafe_ordering', draft);

      await gateway.sendText(phone, `✅ Berhasil menambahkan *${addedQty}x ${addedName}* ke keranjang.`);
      await gateway.sendButtons(phone, 'Lanjut pesan atau periksa keranjang?', [
        { id: 'cat_minuman', title: '☕ Minuman' },
        { id: 'cat_makanan', title: '🍳 Makanan' },
        { id: 'cart_view',   title: '🛒 Lihat Keranjang' },
      ]);
      return true;
    }
  }

  // 6. Tampilkan Keranjang & Opsi Konfirmasi
  if (lower === 'cart_view' || lower.includes('keranjang')) {
    const draft = session.draft || { cart: [] };
    if (!draft.cart || draft.cart.length === 0) {
      await gateway.sendButtons(phone, '🛒 Keranjang Anda masih kosong. Silakan pilih menu:', [
        { id: 'cat_minuman', title: '☕ Minuman' },
        { id: 'cat_makanan', title: '🍳 Makanan' },
        { id: 'goto_main',   title: '🔙 Menu Utama' },
      ]);
      return true;
    }

    let total = 0;
    let cartText = '🛒 *KERANJANG PESANAN KAFE*\n';
    if (draft.orderType === 'dine_in') {
      cartText += `📍 *Makan di Tempat (Meja ${String(draft.tableNumber).padStart(2, '0')})*\n`;
    } else {
      cartText += '🛍️ *Bawa Pulang (Takeaway)*\n';
    }
    cartText += '════════════════════════\n';

    for (const item of draft.cart) {
      cartText += `• ${item.name} (${item.qty}x) = ${formatRupiah(item.subtotal)}\n`;
      total += item.subtotal;
    }
    draft.totalAmount = total;
    db.setSession(phone, 'cafe_confirm_order', draft);

    cartText += '════════════════════════\n';
    cartText += `💰 *Total Belanja: ${formatRupiah(total)}*\n\nKonfirmasi pesanan ini?`;

    await gateway.sendButtons(phone, cartText, [
      { id: 'order_confirm', title: '✅ Konfirmasi' },
      { id: 'cat_makanan',   title: '➕ Tambah Menu' },
      { id: 'cafe_cancel',   title: '❌ Batalkan' },
    ]);
    return true;
  }

  // 7. Konfirmasi Pesanan ➡️ Kode Pesanan & Catat ke DB
  if ((session.status === 'cafe_confirm_order' || session.status === 'cafe_ordering') && (lower === 'order_confirm' || lower.includes('konfirmasi'))) {
    const draft = session.draft || { cart: [] };
    if (!draft.cart || draft.cart.length === 0) {
      await gateway.sendButtons(phone, '🛒 Keranjang Anda masih kosong. Silakan pilih menu:', [
        { id: 'cat_minuman', title: '☕ Minuman' },
        { id: 'cat_makanan', title: '🍳 Makanan' },
        { id: 'goto_main',   title: '🔙 Menu Utama' },
      ]);
      return true;
    }
    if (!draft.totalAmount) {
      draft.totalAmount = draft.cart.reduce((sum, item) => sum + (item.subtotal || (item.price * item.qty)), 0);
    }
    const now = new Date();
    const ymd = now.toISOString().slice(2, 10).replace(/-/g, '');
    const rand = Math.random().toString(16).slice(2, 6).toUpperCase();
    const orderCode = `KFE-${ymd}-${rand}`;

    db.saveCafeOrder({
      orderCode,
      phoneNumber: phone,
      tableNumber: draft.tableNumber || null,
      orderType: draft.orderType || 'takeaway',
      totalAmount: draft.totalAmount,
    }, draft.cart);

    const StateManager = require('./stateManager');
    await StateManager.reset(phone, 'cafe_order_confirmed');

    const receiptText =
      '✅ *PESANAN KAFE TELAH DITERIMA!*\n' +
      '════════════════════════\n' +
      `📋 *KODE PESANAN* : *#${orderCode}*\n` +
      `${draft.orderType === 'dine_in' ? `🍳 *Diantar ke* : Meja ${String(draft.tableNumber).padStart(2, '0')}` : '🛍️ *Tipe*      : Takeaway (Ambil di Kasir)'}\n` +
      `💰 *Total*        : *${formatRupiah(draft.totalAmount)}*\n` +
      '════════════════════════\n' +
      'Pesanan langsung masuk ke antrian barista & dapur.\n' +
      'Silakan lakukan pembayaran kasir/QRIS saat pesanan tiba.\n\n' +
      'Terima kasih telah memesan di Kafe SapaTamu! ☕✨';

    await gateway.sendText(phone, receiptText);

    await gateway.sendButtons(phone, 'Ada yang ingin dipesan lagi?', [
      { id: 'goto_main',  title: '🔙 Menu Utama' },
      { id: 'menu_kafe',  title: '☕ Pesan Lagi' },
      { id: 'menu_cs',    title: '🎧 Bantuan CS' },
    ]);
    return true;
  }

  // 8. Alur Reservasi Meja: Pax ➡️ Waktu ➡️ Selesai
  if (session.status === 'cafe_res_pax') {
    const paxMatch = text.match(/\b(\d+)\b/);
    const pax = paxMatch ? parseInt(paxMatch[1], 10) : 2;
    db.setSession(phone, 'cafe_res_time', { pax, notes: text });

    await gateway.sendText(phone,
      `👥 Dicatat untuk *${pax} orang*.\n\n` +
      `Kapan rencana reservasinya? Sebutkan hari/tanggal dan jam kedatangan.\n` +
      `_Contoh: "Malam ini jam 19.30" atau "Sabtu jam 12.00 atas nama Rina"_`
    );
    return true;
  }

  if (session.status === 'cafe_res_time') {
    const draft = session.draft;
    const now = new Date();
    const resId = `RES-${now.toISOString().slice(2, 10).replace(/-/g, '')}-${Math.random().toString(16).slice(2, 6).toUpperCase()}`;

    db.saveCafeReservation({
      id: resId,
      phoneNumber: phone,
      guestName: 'Tamu Kafe',
      pax: draft.pax,
      date: 'Sesuai Request',
      time: text,
      notes: draft.notes,
    });

    const StateManager = require('./stateManager');
    await StateManager.reset(phone, 'cafe_reservation_confirmed');

    const resReceipt =
      '✅ *RESERVASI MEJA KAFE BERHASIL!*\n' +
      '════════════════════════\n' +
      `📋 *ID RESERVASI* : *#${resId}*\n` +
      `👥 *Jumlah Tamu*  : ${draft.pax} Orang\n` +
      `🕒 *Jadwal*       : ${text}\n` +
      '════════════════════════\n' +
      'Meja Anda akan disiapkan 15 menit sebelum waktu kedatangan.\n' +
      'Sampai jumpa di Kafe SapaTamu! ☕';

    await gateway.sendText(phone, resReceipt);
    await gateway.sendButtons(phone, 'Pilihan layanan lain:', [
      { id: 'goto_main', title: '🔙 Menu Utama' },
      { id: 'menu_hotel', title: '🏨 Hotel' },
    ]);
    return true;
  }

  // 9. Batal Kafe
  if (lower === 'cafe_cancel' || lower.includes('batal')) {
    db.clearSession(phone);
    await gateway.sendText(phone, '❌ *Pesanan kafe telah dibatalkan.*');
    await gateway.sendButtons(phone, 'Pilihan layanan SapaTamu:', [
      { id: 'menu_kafe',  title: '☕ Kafe' },
      { id: 'menu_hotel', title: '🏨 Hotel' },
      { id: 'menu_cs',    title: '🎧 Hubungi CS' },
    ]);
    return true;
  }

  return false;
}

module.exports = {
  handleCafeFlow,
};
