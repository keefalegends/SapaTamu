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

const MENU_ALIASES = [
  { id: 'nas', name: 'Nasi Goreng Spesial', price: 35000, aliases: ['nasi goreng spesial', 'nasi goreng', 'nasgor', 'nasi gorng spesial', 'nasi gorng', 'nasigoreng', 'gorng'] },
  { id: 'car', name: 'Spaghetti Carbonara', price: 45000, aliases: ['spaghetti carbonara', 'spaghetti', 'carbonara', 'spageti carbonara', 'spageti', 'pasta'] },
  { id: 'cro', name: 'Butter Croissant', price: 20000, aliases: ['butter croissant', 'croissant', 'croisant', 'roti croissant'] },
  { id: 'rot', name: 'Roti Bakar Spesial', price: 18000, aliases: ['roti bakar spesial', 'roti bakar'] },
  { id: 'mat', name: 'Matcha Latte', price: 25000, aliases: ['matcha latte', 'matcha', 'macha', 'greentea', 'green tea', 'teh hijau'] },
  { id: 'lat', name: 'Caffe Latte', price: 28000, aliases: ['caffe latte', 'cafe latte', 'kopi latte', 'latte', 'kopi susu', 'coffee latte'] },
  { id: 'cap', name: 'Cappuccino', price: 28000, aliases: ['cappuccino', 'capuccino', 'kapucino'] },
  { id: 'ame', name: 'Americano', price: 22000, aliases: ['americano', 'kopi hitam', 'black coffee'] },
  { id: 'esp', name: 'Espresso', price: 22000, aliases: ['espresso', 'espreso'] },
  { id: 'teh', name: 'Es Teh', price: 15000, aliases: ['es teh manis segar', 'es teh manis', 'es teh', 'teh manis', 'esteh', 'teh'] },
  { id: 'jer', name: 'Jeruk Peras', price: 15000, aliases: ['jeruk peras alami', 'jeruk peras', 'es jeruk', 'jus jeruk'] },
];

function parseMultipleMenuItems(text) {
  if (!text) return [];
  const clean = ' ' + text.toLowerCase() + ' ';
  const found = [];

  const allAliases = [];
  for (const item of MENU_ALIASES) {
    for (const al of item.aliases) {
      allAliases.push({ alias: al, item });
    }
  }
  allAliases.sort((a, b) => b.alias.length - a.alias.length);

  const occupied = [];
  for (const { alias, item } of allAliases) {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp('(?:\\b|_)' + escaped + '(?:\\b|_)', 'g');
    let match;
    while ((match = regex.exec(clean)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      if (occupied.some(([s, e]) => (s <= start && start < e) || (s < end && end <= e))) {
        continue;
      }
      occupied.push([start, end]);

      const before = clean.slice(0, start);
      const after = clean.slice(end);

      let qty = 1;
      const qtyBefore = before.match(/(\d+)\s*(?:porsi|gelas|cup|item|x)?\s*$/);
      if (qtyBefore) {
        qty = parseInt(qtyBefore[1], 10) || 1;
      } else {
        const qtyAfter = after.match(/^\s*(?:x\s*)?(\d+)(?:\s*(?:porsi|gelas|cup|item))?/);
        if (qtyAfter) {
          qty = parseInt(qtyAfter[1], 10) || 1;
        }
      }

      const existing = found.find(f => f.name === item.name);
      if (existing) {
        existing.qty += qty;
        existing.subtotal = existing.qty * existing.price;
      } else {
        found.push({
          name: item.name,
          price: item.price,
          qty,
          subtotal: item.price * qty,
        });
      }
    }
  }
  return found;
}

function findMenuItem(query) {
  const parsed = parseMultipleMenuItems(query);
  if (parsed.length > 0) {
    return parsed[0];
  }

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
        if (!draft.cart) draft.cart = [];
        const existing = draft.cart.find(c => c.name === item.name);
        if (existing) {
          existing.qty += 1;
          existing.subtotal = existing.qty * existing.price;
        } else {
          draft.cart.push({
            name: item.name,
            qty: 1,
            price: item.price,
            subtotal: item.price,
          });
        }
        db.setSession(phone, 'cafe_ordering', draft);

        await gateway.sendText(phone, `✅ Berhasil menambahkan *1x ${item.name}* ke keranjang.`);
        await gateway.sendButtons(phone, 'Lanjut pesan atau periksa keranjang?', [
          { id: 'cat_minuman', title: '☕ Minuman' },
          { id: 'cat_makanan', title: '🍳 Makanan' },
          { id: 'cart_view',   title: '🛒 Lihat Keranjang' },
        ]);
        return true;
      }
    } else {
      // Free text parser (mendukung 1 atau banyak item sekaligus: misal "1 nasi gorng sama matcha")
      const parsedItems = parseMultipleMenuItems(text);
      if (parsedItems.length > 0) {
        if (!draft.cart) draft.cart = [];
        const addedSummaries = [];
        for (const it of parsedItems) {
          const existing = draft.cart.find(c => c.name === it.name);
          if (existing) {
            existing.qty += it.qty;
            existing.subtotal = existing.qty * existing.price;
          } else {
            draft.cart.push({
              name: it.name,
              qty: it.qty,
              price: it.price,
              subtotal: it.subtotal,
            });
          }
          addedSummaries.push(`• *${it.qty}x ${it.name}*`);
        }
        db.setSession(phone, 'cafe_ordering', draft);

        await gateway.sendText(phone, `✅ Berhasil menambahkan ke keranjang:\n${addedSummaries.join('\n')}`);
        await gateway.sendButtons(phone, 'Lanjut pesan atau periksa keranjang?', [
          { id: 'cat_minuman', title: '☕ Minuman' },
          { id: 'cat_makanan', title: '🍳 Makanan' },
          { id: 'cart_view',   title: '🛒 Lihat Keranjang' },
        ]);
        return true;
      }
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

    const conv = db.getConversation(phone);
    const customerName = (conv && conv.name && !conv.name.startsWith('Tamu (+')) ? conv.name : 'Pelanggan';

    db.saveCafeOrder({
      orderCode,
      phoneNumber: phone,
      customerName,
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
