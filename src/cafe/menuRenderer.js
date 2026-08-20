// ─── Menu Renderer ──────────────────────────────────────────────────────────
// Format menu, cart, and order summary for WhatsApp messages.

const menu = require('./menu.json');
const { formatRupiah } = require('../booking/service');

// ─── Category & Item Buttons ────────────────────────────────────────────────

function categoryButtons() {
  const cats = menu.categories.map(c => ({
    title: c.name,
    value: `cat_${c.id}`,
  }));
  cats.push({ title: '🛒 Lihat Keranjang', value: 'cart_view' });
  return cats;
}

function renderCategory(categoryId) {
  const cat = menu.categories.find(c => c.id === categoryId);
  if (!cat) return null;

  const lines = cat.items.map(item =>
    `• ${item.name} — ${formatRupiah(item.price)}`
  );
  const text = `${cat.name}\n\n${lines.join('\n')}\n\nPilih item:`;

  const buttons = cat.items.map(item => ({
    title: item.name.length > 20 ? item.name.substring(0, 20) : item.name,
    value: `item_${item.id}`,
  }));
  buttons.push({ title: '🔙 Kategori', value: 'cat_show' });

  return { text, buttons };
}

function allItemButtons() {
  const buttons = [];
  for (const cat of menu.categories) {
    for (const item of cat.items) {
      buttons.push({ title: item.name, value: `item_${item.id}` });
    }
  }
  return buttons;
}

// ─── Cart Display ───────────────────────────────────────────────────────────

function formatCartAddConfirm(draft, itemId) {
  const cartItem = draft.cart.find(c => c.itemId === itemId);
  if (!cartItem) return '✅ Item ditambahkan';
  return `✅ ${cartItem.name} x${cartItem.qty} — ${formatRupiah(cartItem.subtotal)}\n\n💰 Total: ${formatRupiah(draft.totalAmount)}`;
}

function formatFullCart(draft) {
  if (!draft.cart || draft.cart.length === 0) return '🛒 Keranjang kosong';

  const lines = draft.cart.map((item, i) =>
    `${i + 1}. ${item.name} x${item.qty} — ${formatRupiah(item.subtotal)}`
  );

  const parts = ['🛒 *Keranjang Anda:*\n', ...lines, '', `💰 *Total: ${formatRupiah(draft.totalAmount)}*`];

  if (draft.tableNumber) parts.push(`📍 Meja: ${String(draft.tableNumber).padStart(2, '0')}`);
  if (draft.type === 'takeaway') parts.push('🛍️ Takeaway');

  parts.push('\n_Ketik nama item untuk tambah, atau "hapus [nama]" untuk hapus._');

  return parts.join('\n');
}

function afterAddButtons() {
  return [
    { title: '➕ Tambah Lagi', value: 'cat_show' },
    { title: '✅ Selesai Pesan', value: 'cart_done' },
    { title: '🛒 Keranjang',    value: 'cart_view' },
  ];
}

function cartActionButtons() {
  return [
    { title: '➕ Tambah Lagi',   value: 'cat_show'   },
    { title: '✅ Selesai Pesan', value: 'cart_done'   },
    { title: '❌ Batalkan',      value: 'cart_cancel' },
  ];
}

// ─── Order Summary ──────────────────────────────────────────────────────────

function formatOrderSummary(draft) {
  const header = draft.type === 'dine_in'
    ? `🍽️ *Pesanan Dine-in — Meja ${String(draft.tableNumber).padStart(2, '0')}*`
    : '🛍️ *Pesanan Takeaway*';

  const items = draft.cart.map(item =>
    `  ${item.name} x${item.qty}  ${formatRupiah(item.subtotal)}`
  ).join('\n');

  const sep = '─'.repeat(28);

  return `${header}\n${sep}\n${items}\n${sep}\n💰 *Total: ${formatRupiah(draft.totalAmount)}*`;
}

// ─── Reservation Summary ────────────────────────────────────────────────────

function formatReservationSummary(draft) {
  const parts = [
    '📅 *Reservasi Meja Kafe*',
    '─'.repeat(28),
    `👥 Jumlah: ${draft.pax} orang`,
    `📆 Tanggal: ${draft.date}`,
    `🕐 Jam: ${draft.time}`,
  ];
  if (draft.notes) parts.push(`📝 Catatan: ${draft.notes}`);
  if (draft.name) parts.push(`👤 Nama: ${draft.name}`);
  parts.push('─'.repeat(28));
  return parts.join('\n');
}

module.exports = {
  categoryButtons,
  renderCategory,
  allItemButtons,
  formatCartAddConfirm,
  formatFullCart,
  afterAddButtons,
  cartActionButtons,
  formatOrderSummary,
  formatReservationSummary,
};
