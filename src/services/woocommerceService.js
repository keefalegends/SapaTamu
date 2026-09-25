const axios = require('axios');
const config = require('../config/env');
const { db } = require('../db/database');

let lastSyncStatus = {
  success: null,
  lastSyncTime: null,
  totalSynced: 0,
  error: null,
};

function getApiClient() {
  const { url, consumerKey, consumerSecret } = config.woocommerce;
  return axios.create({
    baseURL: url.replace(/\/+$/, '') + '/wp-json/wc/v3',
    auth: {
      username: consumerKey,
      password: consumerSecret,
    },
    timeout: 10000,
  });
}

/**
 * Mengambil seluruh produk dari WooCommerce REST API
 */
async function fetchProducts() {
  const client = getApiClient();
  const response = await client.get('/products', {
    params: {
      per_page: 100,
      status: 'publish',
    },
  });
  return response.data || [];
}

/**
 * Sinkronisasi produk WooCommerce ke tabel room_catalog & menu_catalog SQLite
 */
async function syncCatalogToDatabase() {
  try {
    console.log('🔄 [WOOCOMMERCE SYNC] Memulai sinkronisasi katalog dari WooCommerce...');
    const products = await fetchProducts();
    if (!Array.isArray(products) || products.length === 0) {
      console.warn('⚠️ [WOOCOMMERCE SYNC] Tidak ada produk yang ditemukan dari WooCommerce.');
      return { success: false, message: 'Tidak ada produk ditemukan' };
    }

    let syncedRooms = 0;
    let syncedMenus = 0;

    const upsertRoom = db.prepare(`
      INSERT INTO room_catalog (room_key, name, price, description, image, wc_product_id, wc_sku)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(room_key) DO UPDATE SET
        name = excluded.name,
        price = excluded.price,
        description = excluded.description,
        image = excluded.image,
        wc_product_id = excluded.wc_product_id,
        wc_sku = excluded.wc_sku
    `);

    const upsertMenu = db.prepare(`
      INSERT INTO menu_catalog (id, category, name, price, wc_product_id, wc_sku, image, description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        category = excluded.category,
        name = excluded.name,
        price = excluded.price,
        wc_product_id = excluded.wc_product_id,
        wc_sku = excluded.wc_sku,
        image = excluded.image,
        description = excluded.description
    `);

    const syncTransaction = db.transaction((items) => {
      for (const p of items) {
        const sku = (p.sku || '').toUpperCase().trim();
        const name = (p.name || '').trim();
        const price = Math.round(parseFloat(p.price || 0));
        const categories = (p.categories || []).map((c) => c.name.toLowerCase());
        const isHotelRoom = categories.some((c) => c.includes('kamar') || c.includes('hotel')) || sku.startsWith('ROOM-');

        const cleanDesc = (p.short_description || p.description || '')
          .replace(/<[^>]*>/g, '')
          .replace(/&nbsp;/g, ' ')
          .trim();
        const imageUrl = p.images && p.images.length > 0 ? p.images[0].src : '';

        if (isHotelRoom) {
          // Deteksi roomKey
          let roomKey = 'deluxe';
          let localImage = 'kamar_deluxe.jpg';
          if (sku === 'ROOM-EXEC' || name.toLowerCase().includes('exec')) {
            roomKey = 'executive';
            localImage = 'kamar_executive.jpg';
          } else if (sku === 'ROOM-SUITE' || name.toLowerCase().includes('suite') || name.toLowerCase().includes('presiden')) {
            roomKey = 'suite';
            localImage = 'kamar_suite.jpg';
          }

          upsertRoom.run(
            roomKey,
            name,
            price,
            cleanDesc || 'Fasilitas kamar lengkap standar hotel bintang 4',
            imageUrl || localImage,
            p.id,
            sku
          );
          syncedRooms++;
        } else {
          // Deteksi Menu Kafe
          const isMinuman = categories.some((c) => c.includes('kopi') || c.includes('minum'));
          const category = isMinuman ? 'minuman' : 'makanan';

          // Mapping id ringkas dari SKU (misal FOOD-NAS ➔ nas, FOOD-MAT ➔ mat)
          let menuId = '';
          if (sku.startsWith('FOOD-')) {
            menuId = sku.replace('FOOD-', '').toLowerCase();
          } else {
            menuId = name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5);
          }

          upsertMenu.run(
            menuId,
            category,
            name,
            price,
            p.id,
            sku,
            imageUrl,
            cleanDesc
          );
          syncedMenus++;
        }
      }
    });

    syncTransaction(products);

    // Reload System Prompt AI agar langsung mengetahui perubahan harga & menu
    try {
      const { reloadPrompt } = require('../bot/aiService');
      if (typeof reloadPrompt === 'function') {
        reloadPrompt();
      }
    } catch (e) {
      // Abaikan jika reloadPrompt belum siap
    }

    lastSyncStatus = {
      success: true,
      lastSyncTime: new Date().toISOString(),
      totalSynced: syncedRooms + syncedMenus,
      syncedRooms,
      syncedMenus,
      error: null,
    };

    console.log(`✅ [WOOCOMMERCE SYNC BERHASIL] ${syncedRooms} kamar hotel & ${syncedMenus} menu kafe disinkronkan dari WooCommerce.`);
    return lastSyncStatus;
  } catch (err) {
    const errorMsg = err.response ? `${err.response.status} ${JSON.stringify(err.response.data)}` : err.message;
    console.error('❌ [WOOCOMMERCE SYNC GAGAL]:', errorMsg);
    lastSyncStatus = {
      success: false,
      lastSyncTime: new Date().toISOString(),
      totalSynced: 0,
      error: errorMsg,
    };
    return lastSyncStatus;
  }
}

/**
 * Mengirim order baru dari WhatsApp ke WooCommerce Orders (status: processing)
 */
async function createWooCommerceOrder(params) {
  const {
    type = 'cafe', // 'cafe' atau 'hotel'
    orderCode,
    customerName = 'Pelanggan SapaTamu',
    phoneNumber,
    items = [],
    tableNumber = null,
    orderType = 'takeaway',
    checkIn = null,
    nights = 1,
    totalAmount = 0,
    note = '',
  } = params;

  try {
    const client = getApiClient();
    const cleanPhone = String(phoneNumber || '').replace(/\D/g, '');
    const phoneDisplay = cleanPhone ? `+${cleanPhone}` : '-';

    const lineItems = [];

    if (type === 'cafe') {
      // Default fallback product jika ada item khusus yang tidak ada di DB
      const defaultCafeProduct = db.prepare('SELECT wc_product_id FROM menu_catalog WHERE wc_product_id IS NOT NULL LIMIT 1').get();
      const defaultProductId = defaultCafeProduct ? defaultCafeProduct.wc_product_id : 36;

      for (const item of items) {
        const itemName = (item.name || '').trim();
        const itemId = (item.id || '').trim();

        // 1. Coba exact match name atau id
        let row = db.prepare('SELECT wc_product_id, name, price FROM menu_catalog WHERE id = ? OR LOWER(name) = LOWER(?)').get(itemId, itemName);

        // 2. Coba partial match (LIKE)
        if (!row && itemName) {
          row = db.prepare('SELECT wc_product_id, name, price FROM menu_catalog WHERE LOWER(name) LIKE LOWER(?) OR LOWER(?) LIKE (\'%\' || LOWER(name) || \'%\')').get(`%${itemName}%`, itemName);
        }

        // 3. Coba cari berdasarkan kata kunci populer (misal 'nasi', 'kopi', 'roti')
        if (!row && itemName) {
          const words = itemName.toLowerCase().split(/\s+/).filter(w => w.length >= 3);
          for (const w of words) {
            row = db.prepare('SELECT wc_product_id, name, price FROM menu_catalog WHERE LOWER(name) LIKE ?').get(`%${w}%`);
            if (row) break;
          }
        }

        const productId = row && row.wc_product_id ? row.wc_product_id : defaultProductId;

        lineItems.push({
          product_id: productId,
          name: itemName || (row ? row.name : 'Item Kafe'),
          quantity: item.qty || 1,
          total: String(item.subtotal || (item.price * (item.qty || 1))),
        });
      }
    } else if (type === 'hotel') {
      const roomKey = params.roomKey || 'deluxe';
      let row = db.prepare('SELECT wc_product_id, name, price FROM room_catalog WHERE room_key = ?').get(roomKey);
      if (!row) {
        row = db.prepare('SELECT wc_product_id, name, price FROM room_catalog WHERE wc_product_id IS NOT NULL LIMIT 1').get();
      }
      const productId = row && row.wc_product_id ? row.wc_product_id : 19;

      lineItems.push({
        product_id: productId,
        name: params.roomName || (row ? row.name : 'Kamar Hotel SapaTamu'),
        quantity: nights || 1,
        total: String(totalAmount || (row ? row.price * nights : 550000)),
      });
    }

    let customerNote = `[SapaTamu WA #${orderCode}] `;
    if (type === 'cafe') {
      customerNote += orderType === 'dine_in' ? `Makan di Tempat (Meja ${String(tableNumber).padStart(2, '0')})` : 'Takeaway (Ambil di Kasir)';
    } else {
      customerNote += `Reservasi Kamar: Check-In ${checkIn || 'Besok'} (${nights} Malam)`;
    }
    if (note) customerNote += ` | Catatan: ${note}`;

    const orderPayload = {
      status: 'processing', // Sesuai permintaan Pak Zohan
      payment_method: 'whatsapp_sapatamu',
      payment_method_title: 'SapaTamu WhatsApp Payment (QRIS/VA)',
      set_paid: true,
      billing: {
        first_name: customerName,
        phone: phoneDisplay,
        email: `${cleanPhone || 'guest'}@sapatamu.guest`,
      },
      customer_note: customerNote,
      line_items: lineItems,
      meta_data: [
        { key: 'sapatamu_order_code', value: orderCode },
        { key: 'sapatamu_order_type', value: type },
        { key: 'order_source', value: 'WhatsApp Chatbot Official' },
      ],
    };

    console.log(`📤 [WOOCOMMERCE PUSH] Mengirim order ${orderCode} (${type}) ke WooCommerce...`);
    const res = await client.post('/orders', orderPayload);
    const wcOrder = res.data;

    if (wcOrder && wcOrder.id) {
      console.log(`🎉 [WOOCOMMERCE ORDER SUCCESS] Order #${wcOrder.id} berhasil tercatat di WooCommerce untuk kode ${orderCode}!`);

      // Simpan wc_order_id ke database lokal SQLite
      if (type === 'cafe') {
        db.prepare('UPDATE cafe_orders SET wc_order_id = ? WHERE order_code = ?').run(wcOrder.id, orderCode);
      } else if (type === 'hotel') {
        db.prepare('UPDATE hotel_bookings SET wc_order_id = ? WHERE booking_code = ?').run(wcOrder.id, orderCode);
      }

      return {
        success: true,
        wcOrderId: wcOrder.id,
        orderCode,
        total: wcOrder.total,
        status: wcOrder.status,
      };
    }

    return { success: false, error: 'Tidak mendapatkan response order id' };
  } catch (err) {
    const errorMsg = err.response ? `${err.response.status} ${JSON.stringify(err.response.data)}` : err.message;
    console.error(`❌ [WOOCOMMERCE ORDER FAILED] Gagal mengirim order ${orderCode}:`, errorMsg);
    return { success: false, error: errorMsg };
  }
}

/**
 * Cek status koneksi WooCommerce
 */
async function checkConnection() {
  try {
    const client = getApiClient();
    const res = await client.get('/system_status', { timeout: 5000 });
    return {
      online: true,
      status: res.status,
      url: config.woocommerce.url,
      lastSync: lastSyncStatus,
    };
  } catch (err) {
    // Jika /system_status dibatasi, fallback cek /products
    try {
      const client = getApiClient();
      await client.get('/products', { params: { per_page: 1 }, timeout: 5000 });
      return {
        online: true,
        url: config.woocommerce.url,
        lastSync: lastSyncStatus,
      };
    } catch (e) {
      return {
        online: false,
        url: config.woocommerce.url,
        error: e.message,
        lastSync: lastSyncStatus,
      };
    }
  }
}

module.exports = {
  fetchProducts,
  syncCatalogToDatabase,
  createWooCommerceOrder,
  checkConnection,
  getLastSyncStatus: () => lastSyncStatus,
};
