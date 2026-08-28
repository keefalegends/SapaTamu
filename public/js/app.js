let currentActivePhone = null;
let currentBotStatus = 'bot';

// Inisialisasi
document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) lucide.createIcons();
  refreshAll();
  checkSystemStatus();

  // Polling data berkala
  setInterval(() => {
    loadStats();
    loadChats();
    if (currentActivePhone) {
      loadMessages(currentActivePhone, false);
    }
  }, 3000);

  // Polling status gateway
  setInterval(checkSystemStatus, 8000);
});

function refreshAll() {
  loadStats();
  loadChats();
  loadBookings();
  loadCafeOrders();
  loadReservations();
  loadCatalog();
  checkSystemStatus();
}

// ─── TAB NAVIGATION ─────────────────────────────────────────────────────────

function switchTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  document.getElementById(tabId)?.classList.remove('hidden');

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('bg-slate-900', 'text-white');
    btn.classList.add('text-slate-600');
  });

  const activeBtn = document.getElementById('btn-' + tabId);
  if (activeBtn) {
    activeBtn.classList.add('bg-slate-900', 'text-white');
    activeBtn.classList.remove('text-slate-600');
  }

  if (window.lucide) lucide.createIcons();
}

// ─── REAL SYSTEM HEALTH & GATEWAY DIAGNOSIS ─────────────────────────────────

async function checkSystemStatus() {
  try {
    const res = await fetch('/api/admin/system-status');
    const data = await res.json();
    if (!data.success) return;

    const sys = data.system;

    // 1. SQLite Database Status
    const dbEl = document.getElementById('nav-db-status');
    if (dbEl) {
      dbEl.innerText = `${sys.db.status} (${sys.db.latencyMs}ms)`;
    }

    // 2. OpenKoneksi Gateway Status
    const badgeEl = document.getElementById('nav-gateway-badge');
    const dotEl = document.getElementById('nav-gateway-dot');
    const statusEl = document.getElementById('nav-gateway-status');
    const alertBanner = document.getElementById('system-alert-banner');
    const alertText = document.getElementById('system-alert-text');
    const cfgBox = document.getElementById('cfg-status-box');

    if (sys.waba.connected) {
      badgeEl.className = 'flex items-center gap-1.5 px-2.5 py-1 bg-emerald-950/40 text-emerald-300 border border-emerald-800/40 rounded-md text-xs font-medium';
      dotEl.className = 'w-2 h-2 rounded-full bg-emerald-400';
      statusEl.innerText = 'Connected';
      alertBanner.classList.add('hidden');

      if (cfgBox) {
        cfgBox.className = 'p-4 rounded-lg border bg-emerald-50 border-emerald-200 text-emerald-900 text-xs';
        cfgBox.innerHTML = `<strong>Status Gateway Normal:</strong> Terhubung ke OpenKoneksi API. Pesan balasan bot otomatis dikirimkan ke Meta WhatsApp.`;
      }
    } else {
      badgeEl.className = 'flex items-center gap-1.5 px-2.5 py-1 bg-amber-950/40 text-amber-300 border border-amber-800/40 rounded-md text-xs font-medium';
      dotEl.className = 'w-2 h-2 rounded-full bg-amber-400 animate-pulse';
      statusEl.innerText = 'Disconnected';

      alertBanner.classList.remove('hidden');
      alertText.innerText = `Peringatan Gateway: ${sys.waba.message}`;

      if (cfgBox) {
        cfgBox.className = 'p-4 rounded-lg border bg-amber-50 border-amber-200 text-amber-900 text-xs';
        cfgBox.innerHTML = `<strong>Perhatian:</strong> OpenKoneksi API Key belum diisi di file <code>.env</code>. Pesan chat WhatsApp masuk tetap disimpan dan direspons oleh bot di database lokal, namun pengiriman pesan keluar ke nomor pelanggan WhatsApp dihentikan sampai API key aktif.`;
      }
    }

    // Update config fields
    const webhookUrlEl = document.getElementById('cfg-webhook-url');
    if (webhookUrlEl) webhookUrlEl.innerText = `${window.location.origin}${sys.waba.webhookEndpoint}`;

    const verifyTokenEl = document.getElementById('cfg-verify-token');
    if (verifyTokenEl) verifyTokenEl.innerText = sys.waba.verifyToken;

    const apiUrlEl = document.getElementById('cfg-api-url');
    if (apiUrlEl) apiUrlEl.innerText = sys.waba.apiUrl;

    const apiStatusEl = document.getElementById('cfg-api-status');
    if (apiStatusEl) apiStatusEl.innerText = sys.waba.status;

  } catch (err) {
    console.error('Gagal memeriksa status gateway:', err);
  }
}

// ─── STATS LOADER ───────────────────────────────────────────────────────────

async function loadStats() {
  try {
    const res = await fetch('/api/admin/stats');
    const data = await res.json();
    if (data.success) {
      const s = data.stats;
      document.getElementById('stat-chats').innerText = s.chats || 0;
      document.getElementById('stat-hotel-count').innerText = s.hotel.count || 0;
      document.getElementById('stat-hotel-rev').innerText = `Rp ${Number(s.hotel.revenue || 0).toLocaleString('id-ID')}`;
      document.getElementById('stat-cafe-count').innerText = s.cafe.count || 0;
      document.getElementById('stat-cafe-rev').innerText = `Rp ${Number(s.cafe.revenue || 0).toLocaleString('id-ID')}`;
      document.getElementById('stat-res-count').innerText = s.reservations || 0;
    }
  } catch (err) {
    console.error('Gagal load stats:', err);
  }
}

// ─── CHAT INBOX & CS TAKEOVER ───────────────────────────────────────────────

async function loadChats() {
  try {
    const res = await fetch('/api/admin/chats');
    const data = await res.json();
    const listEl = document.getElementById('chat-list');
    document.getElementById('chat-count-badge').innerText = `${data.chats?.length || 0} kontak`;

    if (!data.chats || data.chats.length === 0) {
      listEl.innerHTML = `
        <div class="p-8 text-center text-slate-400 text-xs">
          Belum ada percakapan masuk dari pengguna WhatsApp.
        </div>
      `;
      return;
    }

    listEl.innerHTML = data.chats.map(c => {
      const isActive = c.phone_number === currentActivePhone;
      const isHuman = c.bot_status === 'human';
      const initial = (c.name || 'T')[0].toUpperCase();

      return `
        <div onclick="selectChat('${c.phone_number}', '${c.name || `+${c.phone_number}`}', '${c.bot_status}')"
             class="p-3.5 cursor-pointer hover:bg-slate-100/80 transition-colors flex items-center gap-3 ${isActive ? 'bg-white border-l-4 border-slate-900 shadow-sm' : ''}">
          <div class="w-8 h-8 rounded-full ${isHuman ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-700'} flex items-center justify-center font-bold text-xs shrink-0">
            ${initial}
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between">
              <h4 class="text-xs font-bold text-slate-900 truncate">${c.name || `+${c.phone_number}`}</h4>
              <span class="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${isHuman ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}">
                ${isHuman ? 'Staf CS' : 'Bot'}
              </span>
            </div>
            <p class="text-[11px] text-slate-500 truncate mt-0.5">${c.last_message || '-'}</p>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error('Gagal load chats:', err);
  }
}

function selectChat(phone, name, botStatus) {
  currentActivePhone = phone;
  currentBotStatus = botStatus;

  document.getElementById('current-name').innerText = name;
  document.getElementById('current-phone').innerText = `+${phone}`;
  document.getElementById('current-avatar').innerText = name[0].toUpperCase();
  document.getElementById('takeover-control').style.display = 'flex';

  updateTakeoverButtonUI();
  loadMessages(phone, true);
  loadChats();
}

function updateTakeoverButtonUI() {
  const btn = document.getElementById('btn-toggle-bot');
  const label = document.getElementById('status-label');

  if (currentBotStatus === 'human') {
    label.innerText = 'Mode: CS Manual (Bot Mati)';
    label.className = 'text-xs font-bold text-amber-600';
    btn.className = 'px-3 py-1.5 text-xs font-semibold rounded-md border bg-slate-900 text-white hover:bg-slate-800';
    btn.innerHTML = '<i data-lucide="bot" class="w-3.5 h-3.5"></i><span>Aktifkan Bot</span>';
  } else {
    label.innerText = 'Mode: Bot Otomatis';
    label.className = 'text-xs font-medium text-slate-500';
    btn.className = 'px-3 py-1.5 text-xs font-semibold rounded-md border bg-amber-600 text-white hover:bg-amber-700';
    btn.innerHTML = '<i data-lucide="user-check" class="w-3.5 h-3.5"></i><span>Ambil Alih CS</span>';
  }
  if (window.lucide) lucide.createIcons();
}

async function toggleBotStatus() {
  if (!currentActivePhone) return;
  const newStatus = currentBotStatus === 'human' ? 'bot' : 'human';

  try {
    const res = await fetch(`/api/admin/chats/${currentActivePhone}/toggle-bot`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    const data = await res.json();
    if (data.success) {
      currentBotStatus = newStatus;
      updateTakeoverButtonUI();
      loadChats();
    }
  } catch (err) {
    alert('Gagal mengubah mode bot: ' + err.message);
  }
}

async function loadMessages(phone, autoScroll = false) {
  try {
    const res = await fetch(`/api/admin/chats/${phone}/messages`);
    const data = await res.json();
    const container = document.getElementById('messages-container');

    if (!data.messages || data.messages.length === 0) {
      container.innerHTML = `<div class="h-full flex items-center justify-center text-slate-400 text-xs">Belum ada riwayat pesan</div>`;
      return;
    }

    container.innerHTML = data.messages.map(m => {
      const isUser = m.direction === 'inbound';
      const senderBadge = m.sender === 'admin' ? 'Staf CS' : (m.sender === 'bot' ? 'Bot SapaTamu' : 'Pelanggan');

      return `
        <div class="flex flex-col ${isUser ? 'items-start' : 'items-end'}">
          <span class="text-[10px] font-medium text-slate-400 px-1 mb-0.5">${senderBadge}</span>
          <div class="max-w-[80%] rounded-xl px-3.5 py-2 text-xs leading-relaxed ${isUser ? 'bg-white text-slate-800 border border-slate-200' : (m.sender === 'admin' ? 'bg-slate-900 text-white' : 'bg-emerald-700 text-white')}">
            <p class="whitespace-pre-wrap">${escapeHtml(m.content)}</p>
          </div>
          <span class="text-[9px] font-mono text-slate-400 mt-1 px-1">${m.created_at.slice(11, 16)}</span>
        </div>
      `;
    }).join('');

    if (autoScroll) {
      container.scrollTop = container.scrollHeight;
    }
  } catch (err) {
    console.error('Gagal load pesan:', err);
  }
}

async function sendManualReply(e) {
  e.preventDefault();
  if (!currentActivePhone) {
    alert('Pilih kontak terlebih dahulu');
    return;
  }
  const input = document.getElementById('manual-reply-input');
  const text = input.value.trim();
  if (!text) return;

  try {
    const res = await fetch(`/api/admin/chats/${currentActivePhone}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    const data = await res.json();
    if (data.success) {
      input.value = '';
      currentBotStatus = 'human';
      updateTakeoverButtonUI();
      loadMessages(currentActivePhone, true);
      loadChats();
    }
  } catch (err) {
    alert('Gagal mengirim balasan: ' + err.message);
  }
}

// ─── HOTEL BOOKINGS ─────────────────────────────────────────────────────────

// ─── HOTEL BOOKINGS ─────────────────────────────────────────────────────────

async function loadBookings() {
  try {
    const res = await fetch('/api/admin/bookings');
    const data = await res.json();
    const tbody = document.getElementById('hotel-bookings-table');

    if (!data.bookings || data.bookings.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="px-5 py-8 text-center text-slate-400">Belum ada transaksi reservasi kamar</td></tr>`;
      return;
    }

    tbody.innerHTML = data.bookings.map(b => `
      <tr class="hover:bg-slate-50 transition-colors">
        <td class="px-5 py-3.5 font-bold font-mono text-xs text-slate-900">#${b.booking_code}</td>
        <td class="px-5 py-3.5 font-medium text-slate-900">${b.guest_name}<br><span class="text-[11px] font-mono text-slate-400">+${b.phone_number}</span></td>
        <td class="px-5 py-3.5"><span class="px-2 py-0.5 bg-slate-100 text-slate-800 font-semibold rounded text-[11px]">${b.room_name}</span></td>
        <td class="px-5 py-3.5">${b.check_in}</td>
        <td class="px-5 py-3.5">${b.nights} Malam</td>
        <td class="px-5 py-3.5 font-bold text-slate-900">Rp ${Number(b.total_price).toLocaleString('id-ID')}</td>
        <td class="px-5 py-3.5"><span class="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded">CONFIRMED</span></td>
        <td class="px-5 py-3.5 text-right">
          <button onclick="deleteBooking('${b.booking_code}')" class="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors" title="Hapus Booking">
            <i data-lucide="trash-2" class="w-4 h-4"></i>
          </button>
        </td>
      </tr>
    `).join('');
    if (window.lucide) lucide.createIcons();
  } catch (err) {
    console.error('Gagal load booking:', err);
  }
}

async function deleteBooking(code) {
  if (!confirm(`Apakah Anda yakin ingin menghapus data booking #${code}?`)) return;
  try {
    const res = await fetch(`/api/admin/bookings/${code}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      refreshAll();
    } else {
      alert('Gagal menghapus: ' + data.error);
    }
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// ─── CAFE ORDERS ────────────────────────────────────────────────────────────

async function loadCafeOrders() {
  try {
    const res = await fetch('/api/admin/orders');
    const data = await res.json();
    const tbody = document.getElementById('cafe-orders-table');

    if (!data.orders || data.orders.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="px-5 py-8 text-center text-slate-400">Belum ada pesanan restoran masuk</td></tr>`;
      return;
    }

    tbody.innerHTML = data.orders.map(o => {
      const itemsList = o.items.map(i => `${i.item_name} (${i.qty}x)`).join(', ');
      const loc = o.order_type === 'dine_in' ? `Meja ${String(o.table_number).padStart(2, '0')}` : 'Takeaway';

      return `
        <tr class="hover:bg-slate-50 transition-colors">
          <td class="px-5 py-3.5 font-bold font-mono text-xs text-slate-900">#${o.order_code}</td>
          <td class="px-5 py-3.5 font-semibold text-slate-800">${loc}</td>
          <td class="px-5 py-3.5 text-slate-600 text-xs">${itemsList || '-'}</td>
          <td class="px-5 py-3.5 font-bold text-slate-900">Rp ${Number(o.total_amount).toLocaleString('id-ID')}</td>
          <td class="px-5 py-3.5"><span class="px-2 py-0.5 bg-blue-100 text-blue-800 text-[10px] font-bold rounded">DAPUR</span></td>
          <td class="px-5 py-3.5 font-mono text-slate-400 text-[11px]">${o.created_at.slice(11, 16)}</td>
          <td class="px-5 py-3.5 text-right">
            <button onclick="deleteOrder('${o.order_code}')" class="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors" title="Hapus Pesanan">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </td>
        </tr>
      `;
    }).join('');
    if (window.lucide) lucide.createIcons();
  } catch (err) {
    console.error('Gagal load cafe orders:', err);
  }
}

async function deleteOrder(code) {
  if (!confirm(`Apakah Anda yakin ingin menghapus data pesanan #${code}?`)) return;
  try {
    const res = await fetch(`/api/admin/orders/${code}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      refreshAll();
    } else {
      alert('Gagal menghapus: ' + data.error);
    }
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// ─── CAFE RESERVATIONS ──────────────────────────────────────────────────────

async function loadReservations() {
  try {
    const res = await fetch('/api/admin/reservations');
    const data = await res.json();
    const tbody = document.getElementById('cafe-res-table');

    if (!data.reservations || data.reservations.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="px-5 py-8 text-center text-slate-400">Belum ada reservasi meja</td></tr>`;
      return;
    }

    tbody.innerHTML = data.reservations.map(r => `
      <tr class="hover:bg-slate-50 transition-colors">
        <td class="px-5 py-3.5 font-bold font-mono text-xs text-slate-900">#${r.id}</td>
        <td class="px-5 py-3.5 font-mono">+${r.phone_number}</td>
        <td class="px-5 py-3.5 font-semibold">${r.pax} Orang</td>
        <td class="px-5 py-3.5">${r.time}</td>
        <td class="px-5 py-3.5 text-slate-500">${r.notes || '-'}</td>
        <td class="px-5 py-3.5 text-right">
          <button onclick="deleteReservation('${r.id}')" class="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors" title="Hapus Reservasi">
            <i data-lucide="trash-2" class="w-4 h-4"></i>
          </button>
        </td>
      </tr>
    `).join('');
    if (window.lucide) lucide.createIcons();
  } catch (err) {
    console.error('Gagal load reservasi:', err);
  }
}

async function deleteReservation(id) {
  if (!confirm(`Apakah Anda yakin ingin menghapus data reservasi #${id}?`)) return;
  try {
    const res = await fetch(`/api/admin/reservations/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      refreshAll();
    } else {
      alert('Gagal menghapus: ' + data.error);
    }
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// ─── CATALOG & TARIFFS ──────────────────────────────────────────────────────

async function loadCatalog() {
  try {
    const res = await fetch('/api/admin/catalog');
    const data = await res.json();

    const roomEl = document.getElementById('room-list');
    roomEl.innerHTML = data.rooms.map(r => `
      <div class="p-3.5 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
        <div>
          <h4 class="font-bold text-xs text-slate-900">${r.name}</h4>
          <p class="text-[11px] text-slate-500">${r.description}</p>
        </div>
        <div class="text-right">
          <div class="font-bold text-xs text-slate-900">Rp ${Number(r.price).toLocaleString('id-ID')}</div>
          <span class="text-[10px] text-slate-400">/ malam</span>
        </div>
      </div>
    `).join('');

    const menuEl = document.getElementById('menu-list');
    menuEl.innerHTML = data.menu.map(m => `
      <div class="p-2.5 bg-slate-50 border border-slate-200 rounded-md flex items-center justify-between">
        <div>
          <span class="text-[9px] uppercase font-bold text-slate-400 tracking-wider">${m.category}</span>
          <h5 class="text-xs font-semibold text-slate-800">${m.name}</h5>
        </div>
        <div class="font-bold text-xs text-slate-900 font-mono">
          Rp ${Number(m.price).toLocaleString('id-ID')}
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Gagal load catalog:', err);
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.innerText = text;
  return div.innerHTML;
}
