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
  { id: 'car', name: 'Spaghetti Carbonara', price: 45000, aliases: ['spaghetti carbonara', 'spaghetti', 'carbonara', 'spageti carbonara', 'spageti carbo', 'spaghetti carbo', 'carbo', 'spageti', 'pasta'] },
  { id: 'cro', name: 'Butter Croissant', price: 20000, aliases: ['butter croissant', 'croissant', 'croisant', 'roti croissant', 'butter quaso', 'quaso', 'kwason', 'kuaso', 'croisnt', 'croisan', 'quasong', 'quasoo'] },
  { id: 'rot', name: 'Roti Bakar Spesial', price: 18000, aliases: ['roti bakar spesial', 'roti bakar', 'rotbak'] },
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
          id: item.id,
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

function getMenuItemStock(identifier) {
  if (!identifier) return null;
  const clean = String(identifier).trim();
  try {
    return db.db.prepare(`
      SELECT id, name, price, category, stock_status, stock_quantity, manage_stock
      FROM menu_catalog
      WHERE id = ? OR LOWER(name) = LOWER(?) OR LOWER(name) LIKE ?
      LIMIT 1
    `).get(clean, clean, `%${clean}%`);
  } catch (e) {
    return null;
  }
}

function isItemOutOfStock(row) {
  if (!row) return false;
  if (row.stock_status === 'outofstock') return true;
  if (row.manage_stock === 1 && row.stock_quantity !== null && row.stock_quantity <= 0) return true;
  return false;
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

function isQuestion(text) {
  if (!text) return false;
  const lower = text.toLowerCase().trim();
  return (
    lower.includes('?') ||
    /\b(berapa|total|apa|gimana|bagaimana|apakah|bisa|rekomendasi|menu|harga|kalo|kalau|kenapa|siapa|kapan|dimana|mana)\b/i.test(lower)
  );
}

async function handleCafeFlow(phone, text, session) {
  const lower = (text || '').toLowerCase().trim();

  // 0A. Interceptor Pembatalan Alur Kafe
  const isCancellation = lower === 'cafe_cancel' || /\b(gajadi|ga jadi|gak jadi|nggak jadi|enggak jadi|batal|batalkan|cancel|abort|stop|jangan jadi)\b/i.test(lower);
  if (isCancellation && session.status.startsWith('cafe_')) {
    const StateManager = require('./stateManager');
    await StateManager.reset(phone, 'cafe_cancelled');
    await gateway.sendText(phone, '❌ *Pesanan kafe telah dibatalkan.*');
    await gateway.sendButtons(phone, 'Silakan pilih layanan SapaTamu:', [
      { id: 'goto_main',  title: '🔙 Menu Utama' },
      { id: 'menu_kafe',  title: '☕ Kafe' },
      { id: 'menu_hotel', title: '🏨 Hotel' },
    ]);
    return true;
  }

  // Interceptor Pertanyaan saat alur kafe aktif
  if (isQuestion(text) && session.status.startsWith('cafe_')) {
    const { jawabAI } = require('./aiService');
    const chatHistory = db.getRecentSessionMessages(phone, 6, 30);
    const guestProfile = db.getGuestProfile(phone);
    const aiResp = await jawabAI(text, { chatHistory, guestProfile });
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

  // 0B. Deteksi Pemesanan Menu Langsung (Direct Multi-Item Ordering dari percakapan bebas / idle)
  if (!lower.startsWith('room_') && !isQuestion(text)) {
    const directItems = parseMultipleMenuItems(text);
    if (directItems.length > 0) {
      let draft = session.draft || { orderType: 'takeaway', cart: [] };
      if (!draft.cart) draft.cart = [];
      const addedSummaries = [];
      const outOfStockItems = [];

      for (const it of directItems) {
        const stockRow = getMenuItemStock(it.id || it.name);
        if (isItemOutOfStock(stockRow)) {
          outOfStockItems.push(it.name);
          continue;
        }

        let finalQty = it.qty;
        if (stockRow && stockRow.manage_stock === 1 && stockRow.stock_quantity > 0) {
          const existing = draft.cart.find(c => c.name === it.name);
          const currentQty = existing ? existing.qty : 0;
          if (currentQty + finalQty > stockRow.stock_quantity) {
            finalQty = Math.max(0, stockRow.stock_quantity - currentQty);
          }
        }

        if (finalQty <= 0) {
          outOfStockItems.push(`${it.name} (stok tersisa sudah di keranjang)`);
          continue;
        }

        const existing = draft.cart.find(c => c.name === it.name);
        if (existing) {
          existing.qty += finalQty;
          existing.subtotal = existing.qty * existing.price;
        } else {
          draft.cart.push({
            id: it.id,
            name: it.name,
            qty: finalQty,
            price: it.price,
            subtotal: it.price * finalQty,
          });
        }
        addedSummaries.push(`• *${finalQty}x ${it.name}* (${formatRupiah(it.price * finalQty)})`);
      }

      if (outOfStockItems.length > 0) {
        await gateway.sendText(phone, `⚠️ *Pemberitahuan Stok Kosong:*\nMohon maaf Kak, menu berikut sedang habis:\n${outOfStockItems.map(n => `• *${n}* (Stok Habis)`).join('\n')}\n\nItem tersebut tidak dapat dipesan saat ini. 🙏`);
      }

      if (addedSummaries.length > 0) {
        db.setSession(phone, 'cafe_ordering', draft);
        await gateway.sendText(phone, `✅ Berhasil menambahkan ke keranjang:\n${addedSummaries.join('\n')}`);
        await gateway.sendButtons(phone, 'Lanjut pesan atau periksa keranjang?', [
          { id: 'cat_minuman', title: '☕ Minuman' },
          { id: 'cat_makanan', title: '🍳 Makanan' },
          { id: 'cart_view',   title: '🛒 Lihat Keranjang' },
        ]);
      } else if (outOfStockItems.length > 0) {
        await gateway.sendButtons(phone, 'Silakan pilih menu lain yang masih tersedia:', [
          { id: 'cat_minuman', title: '☕ Minuman' },
          { id: 'cat_makanan', title: '🍳 Makanan' },
          { id: 'goto_main',   title: '🔙 Menu Utama' },
        ]);
      }
      return true;
    }
  }

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
  const isCafeMenuRequest =
    session.status === 'cafe_menu' ||
    session.status === 'idle' ||
    lower === 'menu_kafe' ||
    lower === 'kafe' ||
    lower === 'btn_kafe' ||
    /\b(kafe|cafe|resto|restoran|ngopi)\b/i.test(lower);

  if (isCafeMenuRequest) {
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
      const isOut = isItemOutOfStock(r);
      if (isOut) {
        menuListText += `• *${r.name}* — ${formatRupiah(r.price)} ❌ _(Stok Habis)_\n`;
      } else {
        menuListText += `• *${r.name}* — ${formatRupiah(r.price)}\n`;
      }
    }
    menuListText += '\nKetik nama menu yang diinginkan (contoh: _"1 Nasi Goreng"_ atau _"2 Caffe Latte"_):';

    await gateway.sendText(phone, menuListText);

    // Kirim quick buttons HANYA untuk item yang stoknya tersedia
    const availableRows = rows.filter(r => !isItemOutOfStock(r));
    const quickItems = availableRows.slice(0, 3).map(r => ({
      id: `add_${r.id}`,
      title: `+1 ${r.name.length > 15 ? r.name.substring(0, 15) : r.name}`,
    }));
    if (quickItems.length > 0) {
      await gateway.sendButtons(phone, 'Pilih cepat:', quickItems);
    }
    return true;
  }

  // 5. Tambah Menu ke Keranjang
  if (lower.startsWith('add_') || session.status === 'cafe_ordering') {
    let draft = session.draft || { orderType: 'takeaway', cart: [] };

    if (lower.startsWith('add_')) {
      const itemId = lower.replace('add_', '');
      const item = db.prepare('SELECT * FROM menu_catalog WHERE id = ?').get(itemId);
      if (item) {
        if (isItemOutOfStock(item)) {
          await gateway.sendText(phone, `⚠️ *Mohon maaf Kak*, menu *${item.name}* saat ini sedang habis (out of stock). 🙏\n\nSilakan pilih menu lainnya yang masih tersedia ya!`);
          await gateway.sendButtons(phone, 'Pilih kategori menu:', [
            { id: 'cat_minuman', title: '☕ Minuman' },
            { id: 'cat_makanan', title: '🍳 Makanan' },
            { id: 'cart_view',   title: '🛒 Lihat Keranjang' },
          ]);
          return true;
        }

        if (item.manage_stock === 1 && item.stock_quantity > 0) {
          if (!draft.cart) draft.cart = [];
          const existing = draft.cart.find(c => c.name === item.name);
          const currentQty = existing ? existing.qty : 0;
          if (currentQty + 1 > item.stock_quantity) {
            await gateway.sendText(phone, `⚠️ *Mohon maaf Kak*, stok *${item.name}* hanya tersisa ${item.stock_quantity} porsi. Anda sudah memasukkan ${currentQty} porsi ke keranjang.`);
            return true;
          }
        }

        if (!draft.cart) draft.cart = [];
        const existing = draft.cart.find(c => c.name === item.name);
        if (existing) {
          existing.qty += 1;
          existing.subtotal = existing.qty * existing.price;
        } else {
          draft.cart.push({
            id: item.id,
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
        const outOfStockItems = [];

        for (const it of parsedItems) {
          const stockRow = getMenuItemStock(it.id || it.name);
          if (isItemOutOfStock(stockRow)) {
            outOfStockItems.push(it.name);
            continue;
          }

          let finalQty = it.qty;
          if (stockRow && stockRow.manage_stock === 1 && stockRow.stock_quantity > 0) {
            const existing = draft.cart.find(c => c.name === it.name);
            const currentQty = existing ? existing.qty : 0;
            if (currentQty + finalQty > stockRow.stock_quantity) {
              finalQty = Math.max(0, stockRow.stock_quantity - currentQty);
            }
          }

          if (finalQty <= 0) {
            outOfStockItems.push(`${it.name} (stok tersisa sudah di keranjang)`);
            continue;
          }

          const existing = draft.cart.find(c => c.name === it.name);
          if (existing) {
            existing.qty += finalQty;
            existing.subtotal = existing.qty * existing.price;
          } else {
            draft.cart.push({
              id: it.id,
              name: it.name,
              qty: finalQty,
              price: it.price,
              subtotal: it.price * finalQty,
            });
          }
          addedSummaries.push(`• *${finalQty}x ${it.name}*`);
        }

        if (outOfStockItems.length > 0) {
          await gateway.sendText(phone, `⚠️ *Pemberitahuan Stok Kosong:*\nMohon maaf Kak, menu berikut sedang habis:\n${outOfStockItems.map(n => `• *${n}* (Stok Habis)`).join('\n')}\n\nItem tersebut tidak dimasukkan ke keranjang.`);
        }

        if (addedSummaries.length > 0) {
          db.setSession(phone, 'cafe_ordering', draft);
          await gateway.sendText(phone, `✅ Berhasil menambahkan ke keranjang:\n${addedSummaries.join('\n')}`);
          await gateway.sendButtons(phone, 'Lanjut pesan atau periksa keranjang?', [
            { id: 'cat_minuman', title: '☕ Minuman' },
            { id: 'cat_makanan', title: '🍳 Makanan' },
            { id: 'cart_view',   title: '🛒 Lihat Keranjang' },
          ]);
        } else if (outOfStockItems.length > 0) {
          await gateway.sendButtons(phone, 'Silakan pilih menu lain yang masih tersedia:', [
            { id: 'cat_minuman', title: '☕ Minuman' },
            { id: 'cat_makanan', title: '🍳 Makanan' },
            { id: 'cart_view',   title: '🛒 Lihat Keranjang' },
          ]);
        }
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
  const isOrderConfirm =
    lower === 'order_confirm' ||
    /\b(konfirmasi|confirm|gas|gas beli|gas order|gas pesan|beli|bayar|oke|ok|lanjut|proses|siap|deal|ya|yoi|pesan sekarang)\b/i.test(lower);

  if ((session.status === 'cafe_confirm_order' || session.status === 'cafe_ordering') && isOrderConfirm) {
    const draft = session.draft || { cart: [] };
    if (!draft.cart || draft.cart.length === 0) {
      await gateway.sendButtons(phone, '🛒 Keranjang Anda masih kosong. Silakan pilih menu:', [
        { id: 'cat_minuman', title: '☕ Minuman' },
        { id: 'cat_makanan', title: '🍳 Makanan' },
        { id: 'goto_main',   title: '🔙 Menu Utama' },
      ]);
      return true;
    }

    // Validasi stok terakhir sebelum order dibuat
    const outOfStockInCart = [];
    for (const it of draft.cart) {
      const row = getMenuItemStock(it.id || it.name);
      if (isItemOutOfStock(row)) {
        outOfStockInCart.push(it.name);
      }
    }
    if (outOfStockInCart.length > 0) {
      // Hapus item yang out of stock dari keranjang
      draft.cart = draft.cart.filter(it => !outOfStockInCart.includes(it.name));
      draft.totalAmount = draft.cart.reduce((sum, item) => sum + (item.subtotal || (item.price * item.qty)), 0);
      db.setSession(phone, 'cafe_ordering', draft);

      await gateway.sendText(phone,
        `⚠️ *Peringatan Stok Kosong!*\n\n` +
        `Mohon maaf Kak, menu berikut ternyata stoknya sedang habis:\n` +
        `${outOfStockInCart.map(n => `• *${n}*`).join('\n')}\n\n` +
        `Item tersebut telah kami keluarkan dari keranjang Anda.`
      );

      if (draft.cart.length === 0) {
        await gateway.sendButtons(phone, 'Keranjang Anda saat ini kosong. Silakan pilih menu lain:', [
          { id: 'cat_minuman', title: '☕ Minuman' },
          { id: 'cat_makanan', title: '🍳 Makanan' },
          { id: 'goto_main',   title: '🔙 Menu Utama' },
        ]);
        return true;
      } else {
        await gateway.sendButtons(phone, `Sisa keranjang: ${draft.cart.length} item (${formatRupiah(draft.totalAmount)}). Lanjutkan pesanan?`, [
          { id: 'order_confirm', title: '✅ Ya, Pesan Sisa' },
          { id: 'cart_view',     title: '🛒 Lihat Keranjang' },
          { id: 'cat_minuman',   title: '➕ Tambah Lain' },
        ]);
        return true;
      }
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

    // Kirim pesanan ke WooCommerce Orders secara background
    const { createWooCommerceOrder } = require('../services/woocommerceService');
    createWooCommerceOrder({
      type: 'cafe',
      orderCode,
      customerName,
      phoneNumber: phone,
      items: draft.cart,
      tableNumber: draft.tableNumber,
      orderType: draft.orderType,
      totalAmount: draft.totalAmount,
    }).catch((err) => console.error('⚠️ [WOOCOMMERCE BG ERROR] cafe order push:', err.message));

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
  parseMultipleMenuItems,
};
