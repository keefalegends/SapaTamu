// SapaTamu Operations Console - Core Application Logic
let currentActivePhone = null;
let currentBotStatus = 'bot';

// Caches & Filters
let cachedChats = [];
let chatFilter = 'all';
let chatSearchQuery = '';

let cachedBookings = [];
let hotelSearchQuery = '';

let cachedOrders = [];
let cafeSearchQuery = '';

let cachedReservations = [];

let cachedCatalog = { rooms: [], menu: [] };
let menuActiveCategory = 'all';

let confirmActionCallback = null;

// Photo mappings
const ROOM_PHOTO_MAP = {
  'deluxe': '/images/kamar_deluxe.jpg',
  'executive': '/images/kamar_executive.jpg',
  'suite': '/images/kamar_suite.jpg',
};

const MENU_PHOTO_MAP = {
  'esp': '/images/espresso.jpg',
  'ame': '/images/americano.jpg',
  'lat': '/images/caffeelattee.jpg',
  'cap': '/images/cappucino.jpg',
  'mat': '/images/matchalatte.jpg',
  'teh': '/images/esteh.jpg',
  'jer': '/images/jerukperas.jpg',
  'cro': '/images/butter_croisant.jpg',
  'rot': '/images/roti_bakar.jpg',
  'car': '/images/Spaghetti_Carbonara_Creamy.jpg',
  'nas': '/images/nasigoreng.jpg',
};

// ─── INITIALIZATION ─────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) lucide.createIcons();

  startLiveClock();
  refreshAll();
  checkSystemStatus();
  checkAIStatus();
  checkWooCommerceStatus();

  // Keyboard shortcut listener
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeDetailModal();
      closeConfirmModal();
    }
  });

  // Polling data berkala (Real-time updates)
  setInterval(() => {
    loadStats();
    loadChats();
    if (currentActivePhone) {
      loadMessages(currentActivePhone, false);
    }
  }, 3000);

  // Polling status gateway
  setInterval(checkSystemStatus, 8000);
  // Catatan: checkAIStatus tidak di-polling otomatis untuk hemat kuota token 9Router
});

function startLiveClock() {
  const clockEl = document.getElementById('live-clock');
  const update = () => {
    if (!clockEl) return;
    const now = new Date();
    clockEl.innerText = `${now.toLocaleTimeString('id-ID', { hour12: false })} WIB`;
  };
  update();
  setInterval(update, 1000);
}

function refreshAll() {
  const icon = document.getElementById('icon-refresh-all');
  if (icon) icon.classList.add('animate-spin');

  Promise.all([
    loadStats(),
    loadChats(),
    loadBookings(),
    loadCafeOrders(),
    loadReservations(),
    loadCatalog(),
    checkSystemStatus(),
    checkWooCommerceStatus()
  ]).finally(() => {
    setTimeout(() => {
      if (icon) icon.classList.remove('animate-spin');
      if (window.lucide) lucide.createIcons();
    }, 400);
  });
}

// ─── TAB NAVIGATION ─────────────────────────────────────────────────────────

function switchTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  const activeTabEl = document.getElementById(tabId);
  if (activeTabEl) {
    activeTabEl.classList.remove('hidden');
  }

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('bg-[#d4f65c]', 'text-[#0b0e14]', 'font-bold', 'shadow-sm');
    btn.classList.add('text-slate-400', 'hover:text-white', 'hover:bg-slate-900', 'font-semibold');
  });

  const activeBtn = document.getElementById('btn-' + tabId);
  if (activeBtn) {
    activeBtn.classList.add('bg-[#d4f65c]', 'text-[#0b0e14]', 'font-bold', 'shadow-sm');
    activeBtn.classList.remove('text-slate-400', 'hover:text-white', 'hover:bg-slate-900', 'font-semibold');
  }

  if (window.lucide) lucide.createIcons();
}

function handleGlobalSearch(e) {
  const q = e.target.value.toLowerCase().trim();
  const chatInput = document.getElementById('chat-search-input');
  const hotelInput = document.getElementById('hotel-search-input');
  const cafeInput = document.getElementById('cafe-search-input');

  if (chatInput) { chatInput.value = q; filterChats(); }
  if (hotelInput) { hotelInput.value = q; filterBookings(); }
  if (cafeInput) { cafeInput.value = q; filterCafeOrders(); }
}

// ─── SYSTEM HEALTH & GATEWAY STATUS ─────────────────────────────────────────

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

    // 2. Meta WhatsApp Cloud API Gateway Status
    const badgeEl = document.getElementById('nav-gateway-badge');
    const dotEl = document.getElementById('nav-gateway-dot');
    const statusEl = document.getElementById('nav-gateway-status');
    const alertBanner = document.getElementById('system-alert-banner');
    const alertText = document.getElementById('system-alert-text');
    const cfgBox = document.getElementById('cfg-status-box');
    const sidebarGatewayDot = document.getElementById('sidebar-gateway-dot');

    if (sys.waba.connected) {
      badgeEl.className = 'flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200/80 rounded-lg text-[11px] font-medium';
      dotEl.className = 'w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-sm';
      statusEl.innerText = 'Connected';
      alertBanner.classList.add('hidden');
      if (sidebarGatewayDot) sidebarGatewayDot.className = 'w-2 h-2 rounded-full bg-emerald-400';

      if (cfgBox) {
        cfgBox.className = 'p-4 rounded-xl border bg-emerald-50/80 border-emerald-200 text-emerald-950 text-xs';
        cfgBox.innerHTML = `
          <div class="flex items-center gap-2 font-bold text-emerald-900 mb-1">
            <i data-lucide="check-circle" class="w-4 h-4 text-emerald-600"></i>
            <span>Meta WhatsApp Cloud API Terhubung</span>
          </div>
          <p class="text-emerald-800">
            Token Meta WhatsApp Cloud API aktif. Pesan konfirmasi reservasi kamar, pesanan kafe, dan balasan bot AI dikirimkan langsung ke aplikasi WhatsApp tamu.
          </p>
        `;
      }
    } else {
      badgeEl.className = 'flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 text-amber-900 border border-amber-200/80 rounded-lg text-[11px] font-medium';
      dotEl.className = 'w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse';
      statusEl.innerText = 'Disconnected';
      if (sidebarGatewayDot) sidebarGatewayDot.className = 'w-2 h-2 rounded-full bg-amber-400 animate-pulse';

      alertBanner.classList.remove('hidden');
      alertText.innerText = `Peringatan Gateway: ${sys.waba.message}`;

      if (cfgBox) {
        cfgBox.className = 'p-4 rounded-xl border bg-amber-50 border-amber-200 text-amber-950 text-xs';
        cfgBox.innerHTML = `
          <div class="flex items-center gap-2 font-bold text-amber-900 mb-1">
            <i data-lucide="alert-triangle" class="w-4 h-4 text-amber-600"></i>
            <span>Meta WA Token Belum Aktif</span>
          </div>
          <p class="text-amber-800">
            Pesan masuk dari tamu tetap tersimpan dan dijawab oleh bot di database lokal. Namun pengiriman pesan keluar ke nomor WhatsApp pelanggan menggunakan mode simulasi sampai <code>META_WA_TOKEN</code> di <code>.env</code> diisi.
          </p>
        `;
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

    if (window.lucide) lucide.createIcons();

  } catch (err) {
    console.error('Gagal memeriksa status gateway:', err);
  }
}

// ─── STATS OVERVIEW LOADER ──────────────────────────────────────────────────

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

      // Update sidebar counter badges
      const sideChat = document.getElementById('sidebar-chat-badge');
      if (sideChat) sideChat.innerText = s.chats || 0;
      const sideHotel = document.getElementById('sidebar-hotel-badge');
      if (sideHotel) sideHotel.innerText = s.hotel.count || 0;
      const sideCafe = document.getElementById('sidebar-cafe-badge');
      if (sideCafe) sideCafe.innerText = s.cafe.count || 0;
      const sideRes = document.getElementById('sidebar-res-badge');
      if (sideRes) sideRes.innerText = s.reservations || 0;
    }
  } catch (err) {
    console.error('Gagal load stats:', err);
  }
}

// ─── LIVE CHAT & CS TAKEOVER ────────────────────────────────────────────────

async function loadChats() {
  try {
    const res = await fetch('/api/admin/chats');
    const data = await res.json();
    cachedChats = data.chats || [];
    renderChatList();
  } catch (err) {
    console.error('Gagal load chats:', err);
  }
}

function setChatFilter(filter) {
  chatFilter = filter;
  document.querySelectorAll('.chat-filter-btn').forEach(btn => {
    btn.className = 'chat-filter-btn px-2.5 py-1 text-[11px] font-semibold rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all cursor-pointer';
  });
  const activeBtn = document.getElementById('chat-filter-' + filter);
  if (activeBtn) {
    activeBtn.className = 'chat-filter-btn px-2.5 py-1 text-[11px] font-semibold rounded-md bg-slate-900 text-white transition-all cursor-pointer';
  }
  renderChatList();
}

function filterChats() {
  const input = document.getElementById('chat-search-input');
  chatSearchQuery = input ? input.value.trim().toLowerCase() : '';
  renderChatList();
}

function renderChatList() {
  const listEl = document.getElementById('chat-list');
  const countBadge = document.getElementById('chat-count-badge');
  if (!listEl) return;

  let filtered = cachedChats;

  if (chatFilter === 'human') {
    filtered = filtered.filter(c => c.bot_status === 'human');
  } else if (chatFilter === 'bot') {
    filtered = filtered.filter(c => c.bot_status !== 'human');
  }

  if (chatSearchQuery) {
    filtered = filtered.filter(c =>
      (c.name || '').toLowerCase().includes(chatSearchQuery) ||
      (c.phone_number || '').includes(chatSearchQuery) ||
      (c.last_message || '').toLowerCase().includes(chatSearchQuery)
    );
  }

  if (countBadge) {
    countBadge.innerText = `${filtered.length} kontak`;
  }

  if (!filtered || filtered.length === 0) {
    listEl.innerHTML = `
      <div class="p-8 text-center text-slate-400 text-xs">
        <i data-lucide="inbox" class="w-8 h-8 mx-auto mb-2 text-slate-300 stroke-1"></i>
        ${cachedChats.length === 0 ? 'Belum ada percakapan masuk dari tamu.' : 'Tidak ada kontak yang cocok dengan filter.'}
      </div>
    `;
    if (window.lucide) lucide.createIcons();
    return;
  }

  listEl.innerHTML = filtered.map(c => {
    const isActive = c.phone_number === currentActivePhone;
    const isHuman = c.bot_status === 'human';
    const initial = (c.name || 'T')[0].toUpperCase();
    const displayName = c.name || `+${c.phone_number}`;

    return `
      <div onclick="selectChat('${c.phone_number}', '${displayName.replace(/'/g, "\\'")}', '${c.bot_status}')"
           class="p-3 cursor-pointer hover:bg-slate-100/90 transition-all flex items-center gap-3 ${isActive ? 'bg-white border-l-4 border-slate-900 shadow-sm' : ''}">
        <div class="w-9 h-9 rounded-full ${isHuman ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-700'} flex items-center justify-center font-bold text-xs shrink-0 shadow-inner">
          ${initial}
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between gap-1">
            <h4 class="text-xs font-bold text-slate-900 truncate">${displayName}</h4>
            <span class="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${isHuman ? 'bg-amber-100 text-amber-800 border border-amber-200/60' : 'bg-slate-100 text-slate-600'}">
              ${isHuman ? 'Staf CS' : 'Bot'}
            </span>
          </div>
          <p class="text-[11px] text-slate-500 truncate mt-0.5">${escapeHtml(c.last_message || '-')}</p>
        </div>
      </div>
    `;
  }).join('');

  if (window.lucide) lucide.createIcons();
}

function selectChat(phone, name, botStatus) {
  currentActivePhone = phone;
  currentBotStatus = botStatus;

  document.getElementById('current-name').innerText = name;
  document.getElementById('current-phone').innerText = `+${phone}`;
  document.getElementById('current-avatar').innerText = name[0].toUpperCase();
  document.getElementById('takeover-control').style.display = 'flex';

  const quickBar = document.getElementById('quick-reply-bar');
  if (quickBar) quickBar.style.display = 'flex';

  const waLink = document.getElementById('current-wa-link');
  if (waLink) {
    waLink.href = `https://wa.me/${phone}`;
    waLink.classList.remove('hidden');
  }

  updateTakeoverButtonUI();
  loadMessages(phone, true);
  renderChatList();
}

function updateTakeoverButtonUI() {
  const btn = document.getElementById('btn-toggle-bot');
  const label = document.getElementById('status-label');
  const sublabel = document.getElementById('status-sublabel');

  if (currentBotStatus === 'human') {
    label.innerText = 'Mode: CS Manual (Bot Mati)';
    label.className = 'text-xs font-bold text-amber-600 block';
    if (sublabel) sublabel.innerText = 'Staf sedang menangani';
    btn.className = 'px-3.5 py-1.5 text-xs font-semibold rounded-lg border bg-slate-900 text-white hover:bg-slate-800 transition-all shadow-sm cursor-pointer';
    btn.innerHTML = '<i data-lucide="bot" class="w-3.5 h-3.5"></i><span>Aktifkan Bot</span>';
  } else {
    label.innerText = 'Mode: Bot Otomatis';
    label.className = 'text-xs font-semibold text-slate-600 block';
    if (sublabel) sublabel.innerText = 'Respon otomatis aktif';
    btn.className = 'px-3.5 py-1.5 text-xs font-semibold rounded-lg border bg-amber-600 text-white hover:bg-amber-700 transition-all shadow-sm cursor-pointer';
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
      showToast(`Mode percakapan dialihkan ke: ${newStatus === 'human' ? 'Staf CS' : 'Bot Otomatis'}`, 'success');
    }
  } catch (err) {
    showToast('Gagal mengubah mode bot: ' + err.message, 'error');
  }
}

function insertQuickReply(text) {
  const input = document.getElementById('manual-reply-input');
  if (input) {
    input.value = text;
    input.focus();
  }
}

async function loadMessages(phone, autoScroll = false) {
  try {
    const res = await fetch(`/api/admin/chats/${phone}/messages`);
    const data = await res.json();
    const container = document.getElementById('messages-container');
    if (!container) return;

    // Cek apakah posisi scroll saat ini berada di dekat bawah (agar chat baru otomatis terlihat)
    const wasNearBottom = (container.scrollHeight - container.scrollTop - container.clientHeight) < 180;

    if (!data.messages || data.messages.length === 0) {
      container.innerHTML = `
        <div class="h-full flex items-center justify-center text-slate-400 text-xs">
          Belum ada riwayat pesan dengan tamu ini.
        </div>
      `;
      return;
    }

    container.innerHTML = data.messages.map(m => {
      const isUser = m.direction === 'inbound';
      const isAgent = m.sender === 'admin';
      const senderBadge = isAgent ? 'Staf CS' : (m.sender === 'bot' ? 'Bot SapaTamu' : 'Pelanggan');

      let bubbleClass = 'bg-white text-slate-900 border border-slate-200/90 shadow-sm';
      if (!isUser) {
        bubbleClass = isAgent
          ? 'bg-slate-900 text-white shadow-sm'
          : 'bg-emerald-50/90 text-emerald-950 border border-emerald-200/80';
      }

      return `
        <div class="flex flex-col ${isUser ? 'items-start' : 'items-end'}">
          <div class="flex items-center gap-1.5 px-1 mb-1">
            <span class="text-[10px] font-bold ${isAgent ? 'text-amber-600' : (isUser ? 'text-slate-400' : 'text-emerald-700')}">
              ${senderBadge}
            </span>
          </div>
          <div class="max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed ${bubbleClass}">
            <p class="whitespace-pre-wrap">${escapeHtml(m.content)}</p>
          </div>
          <span class="text-[9px] font-mono text-slate-400 mt-1 px-1">
            ${m.created_at ? m.created_at.slice(11, 16) : ''}
          </span>
        </div>
      `;
    }).join('');

    if (autoScroll || wasNearBottom) {
      container.scrollTop = container.scrollHeight;
    }
  } catch (err) {
    console.error('Gagal load pesan:', err);
  }
}

async function sendManualReply(e) {
  if (e) e.preventDefault();
  if (!currentActivePhone) {
    showToast('Pilih kontak tamu terlebih dahulu', 'warning');
    return;
  }
  const input = document.getElementById('manual-reply-input');
  const text = input ? input.value.trim() : '';
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
      showToast('Pesan balasan manual terkirim', 'success');
    } else {
      showToast('Gagal mengirim balasan: ' + data.error, 'error');
    }
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

// ─── HOTEL ROOM BOOKINGS ────────────────────────────────────────────────────

async function loadBookings() {
  try {
    const res = await fetch('/api/admin/bookings');
    const data = await res.json();
    cachedBookings = data.bookings || [];
    renderBookingsTable();
  } catch (err) {
    console.error('Gagal load booking:', err);
  }
}

function filterBookings() {
  const input = document.getElementById('hotel-search-input');
  hotelSearchQuery = input ? input.value.trim().toLowerCase() : '';
  renderBookingsTable();
}

function renderBookingsTable() {
  const tbody = document.getElementById('hotel-bookings-table');
  if (!tbody) return;

  let list = cachedBookings;
  if (hotelSearchQuery) {
    list = list.filter(b =>
      (b.booking_code || '').toLowerCase().includes(hotelSearchQuery) ||
      (b.guest_name || '').toLowerCase().includes(hotelSearchQuery) ||
      (b.phone_number || '').includes(hotelSearchQuery) ||
      (b.room_name || '').toLowerCase().includes(hotelSearchQuery)
    );
  }

  if (!list || list.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="px-5 py-12 text-center text-slate-400">
          <i data-lucide="bed" class="w-8 h-8 mx-auto mb-2 text-slate-300 stroke-1"></i>
          ${cachedBookings.length === 0 ? 'Belum ada transaksi reservasi kamar tercatat.' : 'Tidak ada data booking yang sesuai pencarian.'}
        </td>
      </tr>
    `;
    if (window.lucide) lucide.createIcons();
    return;
  }

  tbody.innerHTML = list.map(b => {
    const isCheckedIn = b.status === 'checked_in';
    const isCompleted = b.status === 'completed' || b.status === 'checked_out';
    let badgeClass = 'bg-emerald-50 text-emerald-800 border-emerald-200/80';
    let dotClass = 'bg-emerald-500';
    let statusLabel = (b.status || 'CONFIRMED').toUpperCase();

    if (isCheckedIn) {
      badgeClass = 'bg-blue-50 text-blue-800 border-blue-200/80';
      dotClass = 'bg-blue-500';
      statusLabel = 'CHECKED-IN';
    } else if (isCompleted) {
      badgeClass = 'bg-slate-100 text-slate-700 border-slate-200';
      dotClass = 'bg-slate-400';
      statusLabel = 'SELESAI';
    }

    return `
      <tr class="hover:bg-slate-50/80 transition-colors">
        <td class="px-5 py-3.5 font-bold font-mono text-xs text-slate-900">
          <button onclick="copyToClipboard('${b.booking_code}', 'Kode Booking #${b.booking_code}')" class="inline-flex items-center gap-1 hover:text-emerald-700 cursor-pointer" title="Klik untuk salin kode">
            <span>#${b.booking_code}</span>
            <i data-lucide="copy" class="w-3 h-3 opacity-40 hover:opacity-100"></i>
          </button>
          ${b.wc_order_id ? `
            <div class="mt-0.5">
              <span class="inline-flex items-center gap-1 px-1.5 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200/80 rounded font-mono text-[9px] font-semibold" title="Tercatat di WooCommerce Order #${b.wc_order_id}">
                <i data-lucide="shopping-bag" class="w-2.5 h-2.5"></i> WC #${b.wc_order_id}
              </span>
            </div>
          ` : ''}
        </td>
        <td class="px-5 py-3.5">
          <strong class="font-bold text-slate-900 block">${escapeHtml(b.guest_name || 'Tamu')}</strong>
          <a href="https://wa.me/${b.phone_number}" target="_blank" class="text-[11px] font-mono text-slate-500 hover:text-emerald-600 transition-colors inline-flex items-center gap-1">
            <span>+${b.phone_number}</span>
            <i data-lucide="external-link" class="w-2.5 h-2.5 opacity-60"></i>
          </a>
        </td>
        <td class="px-5 py-3.5">
          <span class="px-2.5 py-1 bg-slate-100 text-slate-800 font-semibold rounded-lg text-[11px] border border-slate-200/60 inline-block">
            ${escapeHtml(b.room_name || '-')}
          </span>
        </td>
        <td class="px-5 py-3.5 font-medium text-slate-700">${b.check_in || '-'}</td>
        <td class="px-5 py-3.5 text-slate-600">${b.nights || 1} Malam</td>
        <td class="px-5 py-3.5 font-bold font-mono text-slate-900 tabular-nums">
          Rp ${Number(b.total_price || 0).toLocaleString('id-ID')}
        </td>
        <td class="px-5 py-3.5">
          <span onclick="showBookingDetail('${b.booking_code}')" class="px-2.5 py-1 ${badgeClass} border text-[10px] font-bold rounded-lg cursor-pointer transition-all inline-flex items-center gap-1.5 shadow-sm hover:brightness-95" title="Buka E-Voucher Lengkap">
            <span class="w-1.5 h-1.5 rounded-full ${dotClass}"></span>
            <span>${statusLabel}</span>
          </span>
        </td>
        <td class="px-5 py-3.5 text-right">
          <div class="flex items-center justify-end gap-1">
            <button onclick="showBookingDetail('${b.booking_code}')" class="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer" title="Lihat E-Voucher Lengkap">
              <i data-lucide="file-text" class="w-4 h-4"></i>
            </button>
            <button onclick="deleteBooking('${b.booking_code}')" class="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer" title="Hapus Data Booking">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  if (window.lucide) lucide.createIcons();
}

function showBookingDetail(code) {
  const b = cachedBookings.find(x => x.booking_code === code || x.booking_code === code.replace(/^#/, ''));
  if (!b) return;

  document.getElementById('detail-modal-title').innerText = 'E-Voucher Reservasi Hotel';
  document.getElementById('detail-modal-subtitle').innerText = `Kode Booking: #${b.booking_code}`;
  document.getElementById('detail-modal-icon').innerHTML = '<i data-lucide="bed" class="w-5 h-5 text-emerald-600"></i>';

  const checkOutDisplay = b.check_out || `Hari ke-${(b.nights || 1) + 1}`;
  const roomKey = b.room_key || 'deluxe';
  const photoUrl = ROOM_PHOTO_MAP[roomKey] || '/images/kamar_deluxe.jpg';

  document.getElementById('detail-modal-content').innerHTML = `
    <!-- Voucher Banner & Photo -->
    <div class="rounded-xl overflow-hidden border border-slate-200/90 shadow-sm relative">
      <img src="${photoUrl}" alt="${escapeHtml(b.room_name)}" class="w-full h-36 object-cover" onerror="this.src='/images/hotel_sapatamu.jpg'">
      <div class="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent flex items-end p-4">
        <div>
          <span class="text-[10px] uppercase font-bold text-emerald-300 tracking-wider">Akomodasi Terkonfirmasi</span>
          <h4 class="text-sm font-bold text-white">${escapeHtml(b.room_name)}</h4>
        </div>
      </div>
    </div>

    <!-- Status & Guest Profile -->
    <div class="grid grid-cols-2 gap-3">
      <div class="p-3 bg-slate-50 border border-slate-200/80 rounded-xl">
        <span class="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Nama Tamu</span>
        <strong class="text-xs font-bold text-slate-900 block">${escapeHtml(b.guest_name || 'Tamu')}</strong>
      </div>
      <div class="p-3 bg-slate-50 border border-slate-200/80 rounded-xl">
        <span class="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">WhatsApp Tamu</span>
        <strong class="text-xs font-mono font-bold text-slate-900 block">+${b.phone_number}</strong>
      </div>
    </div>

    <!-- Stay Schedule -->
    <div class="p-3.5 bg-white border border-slate-200/80 rounded-xl space-y-2">
      <h5 class="text-xs font-bold text-slate-900 border-b border-slate-100 pb-1.5 flex items-center gap-1.5">
        <i data-lucide="calendar" class="w-3.5 h-3.5 text-slate-400"></i>
        <span>Jadwal Menginap (${b.nights} Malam)</span>
      </h5>
      <div class="grid grid-cols-2 gap-2 text-xs">
        <div>
          <span class="text-slate-400 text-[11px] block">Check-In:</span>
          <strong class="text-emerald-700 font-semibold">${b.check_in} (14.00 WIB)</strong>
        </div>
        <div>
          <span class="text-slate-400 text-[11px] block">Check-Out:</span>
          <strong class="text-slate-800 font-semibold">${checkOutDisplay} (12.00 WIB)</strong>
        </div>
      </div>
    </div>

    <!-- Payment & Invoice -->
    <div class="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl space-y-1.5">
      <div class="flex items-center justify-between text-xs">
        <span class="text-slate-500">Metode Pembayaran:</span>
        <span class="font-semibold text-slate-800">${b.payment_method || 'QRIS / VA'}</span>
      </div>
      <div class="flex items-center justify-between text-xs">
        <span class="text-slate-500">Status Pembayaran:</span>
        <span class="text-emerald-700 font-bold">LUNAS (PAID)</span>
      </div>
      <div class="flex items-center justify-between text-xs pt-2 border-t border-slate-200/80">
        <span class="font-bold text-slate-800">Total Biaya:</span>
        <span class="text-sm font-bold text-slate-900 font-mono tabular-nums">
          Rp ${Number(b.total_price || 0).toLocaleString('id-ID')}
        </span>
      </div>
    </div>
  `;

  // Action button in footer
  const actionsEl = document.getElementById('detail-modal-actions');
  actionsEl.innerHTML = `
    ${b.status !== 'checked_in' && b.status !== 'completed' ? `
      <button onclick="updateBookingStatus('${b.booking_code}', 'checked_in')" class="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer">
        <i data-lucide="log-in" class="w-3.5 h-3.5"></i>
        <span>Tandai Check-In</span>
      </button>
    ` : ''}
    ${b.status === 'checked_in' ? `
      <button onclick="updateBookingStatus('${b.booking_code}', 'completed')" class="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer">
        <i data-lucide="check" class="w-3.5 h-3.5"></i>
        <span>Tandai Selesai (Check-Out)</span>
      </button>
    ` : ''}
  `;

  document.getElementById('detail-modal').classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

async function updateBookingStatus(code, newStatus) {
  try {
    const res = await fetch(`/api/admin/bookings/${encodeURIComponent(code)}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message || 'Status reservasi diperbarui', 'success');
      closeDetailModal();
      refreshAll();
    } else {
      showToast('Gagal memperbarui status: ' + data.error, 'error');
    }
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

function deleteBooking(code) {
  showConfirmModal(
    'Hapus Reservasi Kamar',
    `Apakah Anda yakin ingin menghapus data booking <strong>#${code}</strong>? Tindakan ini akan menghapus data reservasi dari database operasional.`,
    async () => {
      try {
        const res = await fetch(`/api/admin/bookings/${encodeURIComponent(code)}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
          showToast(`Booking #${code} berhasil dihapus.`, 'success');
          refreshAll();
        } else {
          showToast('Gagal menghapus: ' + data.error, 'error');
        }
      } catch (err) {
        showToast('Error: ' + err.message, 'error');
      }
    }
  );
}

// ─── CAFE & RESTAURANT ORDERS ───────────────────────────────────────────────

async function loadCafeOrders() {
  try {
    const res = await fetch('/api/admin/orders');
    const data = await res.json();
    cachedOrders = data.orders || [];
    renderCafeOrdersTable();
  } catch (err) {
    console.error('Gagal load cafe orders:', err);
  }
}

function filterCafeOrders() {
  const input = document.getElementById('cafe-search-input');
  cafeSearchQuery = input ? input.value.trim().toLowerCase() : '';
  renderCafeOrdersTable();
}

function renderCafeOrdersTable() {
  const tbody = document.getElementById('cafe-orders-table');
  if (!tbody) return;

  let list = cachedOrders;
  if (cafeSearchQuery) {
    list = list.filter(o =>
      (o.order_code || '').toLowerCase().includes(cafeSearchQuery) ||
      (o.customer_name || '').toLowerCase().includes(cafeSearchQuery) ||
      (o.phone_number || '').includes(cafeSearchQuery) ||
      String(o.table_number || '').includes(cafeSearchQuery)
    );
  }

  if (!list || list.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="px-5 py-12 text-center text-slate-400">
          <i data-lucide="utensils" class="w-8 h-8 mx-auto mb-2 text-slate-300 stroke-1"></i>
          ${cachedOrders.length === 0 ? 'Belum ada pesanan kafe masuk.' : 'Tidak ada pesanan yang sesuai pencarian.'}
        </td>
      </tr>
    `;
    if (window.lucide) lucide.createIcons();
    return;
  }

  tbody.innerHTML = list.map(o => {
    const itemsList = (o.items || []).map(i => `${i.item_name} (${i.qty}x)`).join(', ');
    const isDineIn = o.order_type === 'dine_in';
    const loc = isDineIn ? `Meja ${String(o.table_number).padStart(2, '0')}` : 'Takeaway';
    const isCompleted = o.status === 'completed';
    const cleanPhone = (o.phone_number || '').replace(/\D/g, '');

    return `
      <tr class="hover:bg-slate-50/80 transition-colors">
        <td class="px-5 py-3.5 font-bold font-mono text-xs text-slate-900">
          <button onclick="copyToClipboard('${o.order_code}', 'Pesanan #${o.order_code}')" class="inline-flex items-center gap-1 hover:text-emerald-700 cursor-pointer" title="Klik untuk salin">
            <span>#${o.order_code}</span>
            <i data-lucide="copy" class="w-3 h-3 opacity-40 hover:opacity-100"></i>
          </button>
          ${o.wc_order_id ? `
            <div class="mt-0.5">
              <span class="inline-flex items-center gap-1 px-1.5 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200/80 rounded font-mono text-[9px] font-semibold" title="Tercatat di WooCommerce Order #${o.wc_order_id}">
                <i data-lucide="shopping-bag" class="w-2.5 h-2.5"></i> WC #${o.wc_order_id}
              </span>
            </div>
          ` : ''}
        </td>
        <td class="px-5 py-3.5">
          <strong class="font-bold text-slate-900 block">${escapeHtml(o.customer_name || 'Pelanggan')}</strong>
          ${cleanPhone ? `
            <a href="https://wa.me/${cleanPhone}" target="_blank" class="text-[11px] font-mono text-slate-500 hover:text-emerald-600 transition-colors inline-flex items-center gap-1">
              <span>+${cleanPhone}</span>
              <i data-lucide="external-link" class="w-2.5 h-2.5 opacity-60"></i>
            </a>` : '<span class="text-[11px] text-slate-400 font-mono">-</span>'}
        </td>
        <td class="px-5 py-3.5">
          <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold ${isDineIn ? 'bg-amber-50 text-amber-900 border border-amber-200/70' : 'bg-slate-100 text-slate-700 border border-slate-200'}">
            <i data-lucide="${isDineIn ? 'coffee' : 'shopping-bag'}" class="w-3 h-3"></i>
            <span>${loc}</span>
          </span>
        </td>
        <td class="px-5 py-3.5 text-slate-700 text-xs font-medium max-w-xs truncate">
          ${escapeHtml(itemsList || '-')}
        </td>
        <td class="px-5 py-3.5 font-bold font-mono text-slate-900 tabular-nums">
          Rp ${Number(o.total_amount || 0).toLocaleString('id-ID')}
        </td>
        <td class="px-5 py-3.5">
          <span onclick="showOrderDetail('${o.order_code}')" class="px-2.5 py-1 ${isCompleted ? 'bg-emerald-50 text-emerald-800 border-emerald-200/80' : 'bg-blue-50 text-blue-800 border-blue-200/80'} border text-[10px] font-bold rounded-lg cursor-pointer transition-all inline-flex items-center gap-1.5 shadow-sm hover:brightness-95" title="Lihat Tiket Dapur">
            <span class="w-1.5 h-1.5 rounded-full ${isCompleted ? 'bg-emerald-500' : 'bg-blue-500'}"></span>
            <span>${isCompleted ? 'SELESAI SAJI' : 'PROSES DAPUR'}</span>
          </span>
        </td>
        <td class="px-5 py-3.5 font-mono text-slate-400 text-[11px]">
          ${o.created_at ? o.created_at.slice(11, 16) : '-'}
        </td>
        <td class="px-5 py-3.5 text-right">
          <div class="flex items-center justify-end gap-1">
            <button onclick="showOrderDetail('${o.order_code}')" class="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer" title="Lihat Rincian Pesanan">
              <i data-lucide="eye" class="w-4 h-4"></i>
            </button>
            <button onclick="deleteOrder('${o.order_code}')" class="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer" title="Hapus Pesanan">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  if (window.lucide) lucide.createIcons();
}

function showOrderDetail(code) {
  const o = cachedOrders.find(x => x.order_code === code || x.order_code === code.replace(/^#/, ''));
  if (!o) return;

  document.getElementById('detail-modal-title').innerText = 'Tiket Pesanan Restoran & Kafe';
  document.getElementById('detail-modal-subtitle').innerText = `Kode Pesanan: #${o.order_code}`;
  document.getElementById('detail-modal-icon').innerHTML = '<i data-lucide="utensils" class="w-5 h-5 text-amber-600"></i>';

  const isDineIn = o.order_type === 'dine_in';
  const loc = isDineIn ? `Makan di Tempat (Meja ${String(o.table_number).padStart(2, '0')})` : 'Takeaway (Bawa Pulang)';
  const isCompleted = o.status === 'completed';
  const cleanPhone = (o.phone_number || '').replace(/\D/g, '');

  const itemsHtml = (o.items || []).map(i => `
    <div class="flex items-center justify-between text-xs py-2 border-b border-slate-100 last:border-0">
      <div>
        <strong class="text-slate-900 font-bold">${escapeHtml(i.item_name)}</strong>
        <span class="text-slate-400 text-[11px] ml-1">(${i.qty}x @ Rp ${Number(i.price).toLocaleString('id-ID')})</span>
      </div>
      <span class="font-mono font-bold text-slate-900 tabular-nums">
        Rp ${Number(i.subtotal || (i.price * i.qty)).toLocaleString('id-ID')}
      </span>
    </div>
  `).join('') || '<div class="text-slate-400 py-2">Tidak ada data item pesanan.</div>';

  document.getElementById('detail-modal-content').innerHTML = `
    <!-- Header Summary Card -->
    <div class="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl flex items-center justify-between">
      <div>
        <span class="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Lokasi / Tipe Servis</span>
        <div class="text-xs font-bold text-slate-900 mt-0.5">${loc}</div>
      </div>
      <span class="px-2.5 py-1 ${isCompleted ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'} font-bold rounded-lg text-xs">
        ${isCompleted ? 'SELESAI SAJI' : 'PROSES DAPUR'}
      </span>
    </div>

    <!-- Contact & Time -->
    <div class="grid grid-cols-2 gap-3">
      <div class="p-3 bg-slate-50 border border-slate-200/80 rounded-xl">
        <span class="text-slate-400 text-[11px] block">Nama Pelanggan:</span>
        <strong class="text-slate-900 font-bold text-xs">${escapeHtml(o.customer_name || 'Pelanggan')}</strong>
      </div>
      <div class="p-3 bg-slate-50 border border-slate-200/80 rounded-xl">
        <span class="text-slate-400 text-[11px] block">Nomor WhatsApp:</span>
        ${cleanPhone ? `
          <a href="https://wa.me/${cleanPhone}" target="_blank" class="text-slate-900 hover:text-emerald-600 font-mono font-bold text-xs inline-flex items-center gap-1">
            <span>+${cleanPhone}</span>
            <i data-lucide="external-link" class="w-3 h-3 opacity-60"></i>
          </a>` : '<strong class="text-slate-400 font-mono text-xs">-</strong>'}
      </div>
    </div>
    <div class="p-3 bg-slate-50 border border-slate-200/80 rounded-xl">
      <span class="text-slate-400 text-[11px] block">Waktu Pesanan:</span>
      <strong class="text-slate-900 font-mono text-xs">${o.created_at || '-'}</strong>
    </div>

    <!-- Item Details -->
    <div class="p-3.5 bg-white border border-slate-200/80 rounded-xl space-y-1">
      <h5 class="text-xs font-bold text-slate-900 border-b border-slate-100 pb-1.5 flex items-center gap-1.5">
        <i data-lucide="shopping-bag" class="w-3.5 h-3.5 text-slate-400"></i>
        <span>Rincian Item Dipesan</span>
      </h5>
      <div class="divide-y divide-slate-100">
        ${itemsHtml}
      </div>
    </div>

    <!-- Bill Total -->
    <div class="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl space-y-1.5">
      <div class="flex items-center justify-between text-xs">
        <span class="text-slate-500">Status Pembayaran:</span>
        <span class="text-emerald-700 font-bold">LUNAS (${(o.payment_status || 'PAID').toUpperCase()})</span>
      </div>
      <div class="flex items-center justify-between text-xs pt-2 border-t border-slate-200/80">
        <span class="font-bold text-slate-800">Total Tagihan:</span>
        <span class="text-sm font-bold text-slate-900 font-mono tabular-nums">
          Rp ${Number(o.total_amount || 0).toLocaleString('id-ID')}
        </span>
      </div>
    </div>
  `;

  // Action button in footer
  const actionsEl = document.getElementById('detail-modal-actions');
  actionsEl.innerHTML = `
    ${!isCompleted ? `
      <button onclick="updateOrderStatus('${o.order_code}', 'completed')" class="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer">
        <i data-lucide="check" class="w-3.5 h-3.5"></i>
        <span>Tandai Selesai Saji</span>
      </button>
    ` : `
      <button onclick="updateOrderStatus('${o.order_code}', 'new')" class="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer">
        <i data-lucide="rotate-ccw" class="w-3.5 h-3.5"></i>
        <span>Kembalikan ke Antrian</span>
      </button>
    `}
  `;

  document.getElementById('detail-modal').classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

async function updateOrderStatus(code, newStatus) {
  try {
    const res = await fetch(`/api/admin/orders/${encodeURIComponent(code)}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message || 'Status pesanan berhasil diperbarui', 'success');
      closeDetailModal();
      refreshAll();
    } else {
      showToast('Gagal memperbarui status: ' + data.error, 'error');
    }
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

function deleteOrder(code) {
  showConfirmModal(
    'Hapus Pesanan Restoran',
    `Apakah Anda yakin ingin menghapus pesanan <strong>#${code}</strong> dari dapur?`,
    async () => {
      try {
        const res = await fetch(`/api/admin/orders/${encodeURIComponent(code)}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
          showToast(`Pesanan #${code} berhasil dihapus.`, 'success');
          refreshAll();
        } else {
          showToast('Gagal menghapus: ' + data.error, 'error');
        }
      } catch (err) {
        showToast('Error: ' + err.message, 'error');
      }
    }
  );
}

// ─── CAFE TABLE RESERVATIONS ────────────────────────────────────────────────

async function loadReservations() {
  try {
    const res = await fetch('/api/admin/reservations');
    const data = await res.json();
    cachedReservations = data.reservations || [];
    renderReservationsTable();
  } catch (err) {
    console.error('Gagal load reservasi:', err);
  }
}

function renderReservationsTable() {
  const tbody = document.getElementById('cafe-res-table');
  if (!tbody) return;

  if (!cachedReservations || cachedReservations.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="px-5 py-12 text-center text-slate-400">
          <i data-lucide="calendar" class="w-8 h-8 mx-auto mb-2 text-slate-300 stroke-1"></i>
          Belum ada jadwal reservasi meja restoran tercatat.
        </td>
      </tr>
    `;
    if (window.lucide) lucide.createIcons();
    return;
  }

  tbody.innerHTML = cachedReservations.map(r => `
    <tr class="hover:bg-slate-50/80 transition-colors">
      <td class="px-5 py-3.5 font-bold font-mono text-xs text-slate-900">#${r.id}</td>
      <td class="px-5 py-3.5">
        <a href="https://wa.me/${r.phone_number}" target="_blank" class="font-mono text-xs text-slate-800 hover:text-emerald-700 transition-colors inline-flex items-center gap-1">
          <span>+${r.phone_number}</span>
          <i data-lucide="external-link" class="w-3 h-3 opacity-50"></i>
        </a>
      </td>
      <td class="px-5 py-3.5">
        <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-purple-50 text-purple-800 font-bold text-xs border border-purple-200/60">
          <i data-lucide="users" class="w-3 h-3"></i>
          <span>${r.pax} Orang</span>
        </span>
      </td>
      <td class="px-5 py-3.5 font-medium text-slate-800">${escapeHtml(r.time || '-')}</td>
      <td class="px-5 py-3.5 text-slate-500 text-xs">${escapeHtml(r.notes || '-')}</td>
      <td class="px-5 py-3.5 text-right">
        <button onclick="deleteReservation('${r.id}')" class="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer" title="Hapus Reservasi Meja">
          <i data-lucide="trash-2" class="w-4 h-4"></i>
        </button>
      </td>
    </tr>
  `).join('');

  if (window.lucide) lucide.createIcons();
}

function deleteReservation(id) {
  showConfirmModal(
    'Hapus Reservasi Meja',
    `Apakah Anda yakin ingin menghapus jadwal reservasi meja <strong>#${id}</strong>?`,
    async () => {
      try {
        const res = await fetch(`/api/admin/reservations/${encodeURIComponent(id)}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
          showToast(`Reservasi meja #${id} berhasil dihapus.`, 'success');
          refreshAll();
        } else {
          showToast('Gagal menghapus: ' + data.error, 'error');
        }
      } catch (err) {
        showToast('Error: ' + err.message, 'error');
      }
    }
  );
}

// ─── CATALOG & TARIFFS WITH REAL PHOTOGRAPHY ────────────────────────────────

async function loadCatalog() {
  try {
    const res = await fetch('/api/admin/catalog');
    const data = await res.json();
    cachedCatalog = {
      rooms: data.rooms || [],
      menu: data.menu || [],
    };

    renderRoomCatalog();
    renderMenuCatalog();
  } catch (err) {
    console.error('Gagal load catalog:', err);
  }
}

function renderRoomCatalog() {
  const roomEl = document.getElementById('room-list');
  if (!roomEl) return;

  roomEl.innerHTML = cachedCatalog.rooms.map(r => {
    const photoUrl = ROOM_PHOTO_MAP[r.room_key] || (r.image ? `/images/${r.image}` : '/images/kamar_deluxe.jpg');

    return `
      <div class="rounded-2xl border border-slate-200/90 overflow-hidden bg-white shadow-sm hover:shadow-md transition-all flex flex-col justify-between group">
        <div>
          <div class="relative h-44 overflow-hidden bg-slate-100">
            <img src="${photoUrl}" alt="${escapeHtml(r.name)}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" onerror="this.src='/images/hotel_sapatamu.jpg'">
            <div class="absolute top-3 left-3 flex items-center gap-1.5">
              <span class="px-2.5 py-1 bg-slate-950/80 backdrop-blur-sm text-white font-mono text-[10px] font-bold rounded-lg uppercase tracking-wider">
                ${r.room_key}
              </span>
              ${r.wc_sku ? `
                <span class="px-2 py-1 bg-[#d4f65c] text-slate-950 font-mono text-[9px] font-bold rounded-lg tracking-wide shadow-xs">
                  ${r.wc_sku}
                </span>
              ` : ''}
            </div>
          </div>
          <div class="p-4 space-y-2">
            <h4 class="font-bold text-sm text-slate-900">${escapeHtml(r.name)}</h4>
            <p class="text-xs text-slate-500 leading-relaxed">${escapeHtml(r.description || '')}</p>
          </div>
        </div>
        <div class="p-4 pt-0 border-t border-slate-100 mt-2 flex items-center justify-between">
          <div>
            <span class="text-[10px] text-slate-400 uppercase font-semibold block">Tarif Menginap</span>
            <div class="font-extrabold text-sm text-slate-900 font-mono tabular-nums">
              Rp ${Number(r.price).toLocaleString('id-ID')}
              <span class="text-[11px] font-normal text-slate-500 font-sans">/ malam</span>
            </div>
          </div>
          ${(() => {
            const isOut = r.stock_status === 'outofstock' || (r.manage_stock === 1 && r.stock_quantity !== null && r.stock_quantity <= 0);
            return isOut
              ? '<span class="text-[10px] font-bold px-2.5 py-1 bg-red-50 text-red-700 rounded-md border border-red-200">Penuh (0)</span>'
              : `<span class="text-[10px] font-bold px-2.5 py-1 bg-emerald-50 text-emerald-800 rounded-md border border-emerald-200">Tersedia (${r.stock_quantity ?? 5})</span>`;
          })()}
        </div>
      </div>
    `;
  }).join('');
}

function filterCatalogMenu(cat) {
  menuActiveCategory = cat;
  document.querySelectorAll('.cat-pill').forEach(btn => {
    btn.className = 'cat-pill px-3 py-1 text-xs font-semibold rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all cursor-pointer';
  });
  const activeBtn = document.getElementById('cat-btn-' + cat);
  if (activeBtn) {
    activeBtn.className = 'cat-pill px-3 py-1 text-xs font-semibold rounded-lg bg-slate-900 text-white transition-all cursor-pointer';
  }
  renderMenuCatalog();
}

function renderMenuCatalog() {
  const menuEl = document.getElementById('menu-list');
  if (!menuEl) return;

  let list = cachedCatalog.menu;
  if (menuActiveCategory === 'minuman') {
    list = list.filter(m => (m.category || '').toLowerCase().includes('minum') || ['esp', 'ame', 'lat', 'cap', 'mat', 'teh', 'jer'].includes(m.id));
  } else if (menuActiveCategory === 'makanan') {
    list = list.filter(m => (m.category || '').toLowerCase().includes('makan') || ['cro', 'rot', 'car', 'nas'].includes(m.id));
  }

  menuEl.innerHTML = list.map(m => {
    const photoUrl = MENU_PHOTO_MAP[m.id] || '/images/cafe_sapatamu.jpg';
    const isBeverage = (m.category || '').toLowerCase().includes('minum') || ['esp', 'ame', 'lat', 'cap', 'mat', 'teh', 'jer'].includes(m.id);
    const isOut = m.stock_status === 'outofstock' || (m.manage_stock === 1 && m.stock_quantity !== null && m.stock_quantity <= 0);

    return `
      <div class="p-3 bg-white border ${isOut ? 'border-red-200/90 bg-red-50/20' : 'border-slate-200/90'} rounded-xl flex items-center gap-3 shadow-sm hover:border-slate-300 transition-all">
        <div class="relative shrink-0">
          <img src="${photoUrl}" alt="${escapeHtml(m.name)}" class="w-14 h-14 rounded-lg object-cover border border-slate-100 ${isOut ? 'grayscale opacity-70' : ''}" onerror="this.src='/images/cafe_sapatamu.jpg'">
          ${isOut ? '<span class="absolute inset-0 bg-red-950/40 rounded-lg flex items-center justify-center text-[9px] font-bold text-white uppercase tracking-wider">Habis</span>' : ''}
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-1.5 mb-0.5">
            <span class="text-[9px] uppercase font-bold px-1.5 py-0.2 rounded ${isBeverage ? 'bg-amber-50 text-amber-800' : 'bg-orange-50 text-orange-800'}">
              ${isBeverage ? 'Kopi & Minuman' : 'Makanan'}
            </span>
            ${m.wc_sku ? `
              <span class="text-[9px] font-mono font-medium text-slate-500 bg-slate-100 px-1 py-0.2 rounded border border-slate-200">
                ${m.wc_sku}
              </span>
            ` : ''}
          </div>
          <h5 class="text-xs font-bold text-slate-900 truncate ${isOut ? 'line-through text-slate-400' : ''}">${escapeHtml(m.name)}</h5>
          <div class="flex items-center justify-between mt-1">
            <div class="font-bold text-xs ${isOut ? 'text-slate-400' : 'text-emerald-800'} font-mono tabular-nums">
              Rp ${Number(m.price).toLocaleString('id-ID')}
            </div>
            ${isOut
              ? '<span class="text-[9px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-800 border border-red-200">Habis (0)</span>'
              : `<span class="text-[9px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">Stok: ${m.stock_quantity ?? 'Ada'}</span>`}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ─── WOOCOMMERCE SYNC & INTEGRATION ──────────────────────────────────────────

async function checkWooCommerceStatus() {
  try {
    const res = await fetch('/api/admin/woocommerce/status');
    const data = await res.json();
    if (!data.success) return;

    const navDot = document.getElementById('nav-wc-dot');
    const navStatus = document.getElementById('nav-wc-status');
    const badge = document.getElementById('wc-status-badge');
    const lastSyncEl = document.getElementById('wc-last-sync-time');
    const countEl = document.getElementById('wc-product-count');

    if (data.online) {
      if (navDot) navDot.className = 'w-2 h-2 rounded-full bg-emerald-400 animate-pulse';
      if (navStatus) navStatus.innerText = 'Online';
      if (badge) {
        badge.className = 'px-2.5 py-0.5 text-[10px] font-bold rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1';
        badge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> TERHUBUNG';
      }
    } else {
      if (navDot) navDot.className = 'w-2 h-2 rounded-full bg-red-400';
      if (navStatus) navStatus.innerText = 'Offline';
      if (badge) {
        badge.className = 'px-2.5 py-0.5 text-[10px] font-bold rounded-full bg-red-500/20 text-red-400 border border-red-500/30 flex items-center gap-1';
        badge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-red-400"></span> TERPUTUS';
      }
    }

    if (lastSyncEl) {
      if (data.lastSync && data.lastSync.lastSyncTime) {
        const d = new Date(data.lastSync.lastSyncTime);
        lastSyncEl.innerText = `Terakhir sync: ${d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB`;
      } else {
        lastSyncEl.innerText = 'Terakhir sync: Startup';
      }
    }

    if (countEl && data.counts) {
      const total = (data.counts.rooms || 0) + (data.counts.menu || 0);
      countEl.innerText = `${total} Produk (${data.counts.rooms} Kamar, ${data.counts.menu} Menu)`;
    }
  } catch (err) {
    console.warn('Gagal cek status WooCommerce:', err.message);
  }
}

async function triggerWooCommerceSync() {
  const btn = document.getElementById('btn-sync-wc');
  const icon = document.getElementById('icon-sync-wc');
  const lbl = document.getElementById('lbl-sync-wc');

  if (btn) btn.disabled = true;
  if (icon) icon.classList.add('animate-spin');
  if (lbl) lbl.innerText = 'Menyinkronkan...';

  try {
    const res = await fetch('/api/admin/woocommerce/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await res.json();

    if (data.success) {
      showToast(data.message || 'Katalog berhasil disinkronkan dari WooCommerce!', 'success');
      await Promise.all([loadCatalog(), checkWooCommerceStatus()]);
    } else {
      showToast('Gagal sync: ' + (data.error || data.message), 'error');
    }
  } catch (err) {
    showToast('Koneksi sync terputus: ' + err.message, 'error');
  } finally {
    if (btn) btn.disabled = false;
    if (icon) icon.classList.remove('animate-spin');
    if (lbl) lbl.innerText = 'Sinkronkan Sekarang';
    if (window.lucide) lucide.createIcons();
  }
}

// ─── AI 9ROUTER PLAYGROUND & DIAGNOSTICS ────────────────────────────────────

async function checkAIStatus() {
  try {
    const res = await fetch('/api/admin/ai-benchmark');
    const contentType = res.headers.get('content-type') || '';
    if (!res.ok || !contentType.includes('application/json')) {
      return;
    }
    const data = await res.json();
    if (!data.success || !data.benchmark) return;

    const b = data.benchmark;
    const navAiStatus = document.getElementById('nav-ai-status');
    const navAiDot = document.getElementById('nav-ai-dot');
    const aiCardStatus = document.getElementById('ai-card-status');
    const aiCardDot = document.getElementById('ai-card-dot');
    const aiCardModel = document.getElementById('ai-card-model');
    const aiCardLatency = document.getElementById('ai-card-latency');
    const aiCardEndpoint = document.getElementById('ai-card-endpoint');
    const aiCardTime = document.getElementById('ai-card-time');
    const headerAiLatency = document.getElementById('header-ai-latency');

    if (b.status === 'online') {
      if (navAiStatus) navAiStatus.innerText = `9Router (${b.latencyMs}ms)`;
      if (navAiDot) navAiDot.className = 'w-2 h-2 rounded-full bg-emerald-400 animate-pulse';
      if (aiCardStatus) aiCardStatus.innerText = 'Online (Active)';
      if (aiCardDot) aiCardDot.className = 'w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse';
      if (aiCardLatency) aiCardLatency.innerText = `${b.latencyMs} ms`;
      if (headerAiLatency) headerAiLatency.innerText = `${b.latencyMs}ms`;
    } else {
      if (navAiStatus) navAiStatus.innerText = '9Router (Offline)';
      if (navAiDot) navAiDot.className = 'w-2 h-2 rounded-full bg-red-400';
      if (aiCardStatus) aiCardStatus.innerText = 'Offline (Fallback Ready)';
      if (aiCardDot) aiCardDot.className = 'w-2.5 h-2.5 rounded-full bg-amber-500';
      if (aiCardLatency) aiCardLatency.innerText = 'Timeout / Err';
      if (headerAiLatency) headerAiLatency.innerText = 'Offline';
    }

    if (aiCardModel && b.model) aiCardModel.innerText = b.model;
    if (aiCardEndpoint && b.baseUrl) aiCardEndpoint.innerText = b.baseUrl;
    if (aiCardTime) aiCardTime.innerText = `Checked: ${new Date().toLocaleTimeString('id-ID')}`;
  } catch (err) {
    console.error('Gagal benchmark AI:', err);
  }
}

async function runAIPing() {
  const btn = document.getElementById('btn-ai-ping');
  const icon = document.getElementById('icon-ai-ping');
  if (btn) btn.disabled = true;
  if (icon) icon.classList.add('animate-spin');

  try {
    const res = await fetch('/api/admin/ai-benchmark?force=true');
    const data = await res.json();
    if (data.success && data.benchmark) {
      checkAIStatus();
      showToast(`Benchmark 9Router berhasil: Latensi ${data.benchmark.latencyMs} ms`, data.benchmark.status === 'online' ? 'success' : 'warning');
    } else {
      showToast('Gagal ping AI: ' + (data.error || 'Unknown error'), 'error');
    }
  } catch (err) {
    showToast('Error koneksi 9Router: ' + err.message, 'error');
  } finally {
    if (btn) btn.disabled = false;
    if (icon) icon.classList.remove('animate-spin');
    if (window.lucide) lucide.createIcons();
  }
}

function setAIPrompt(text) {
  const input = document.getElementById('ai-prompt-input');
  if (input) {
    input.value = text;
    input.focus();
  }
}

async function submitAITest(e) {
  if (e) e.preventDefault();
  const input = document.getElementById('ai-prompt-input');
  const prompt = input ? input.value.trim() : '';
  if (!prompt) {
    showToast('Ketik pertanyaan untuk pengujian terlebih dahulu', 'warning');
    return;
  }

  const btn = document.getElementById('btn-submit-ai-test');
  const btnLabel = document.getElementById('btn-submit-ai-label');
  const resultBody = document.getElementById('ai-result-body');
  const badgeContainer = document.getElementById('ai-result-badge-container');

  if (btn) btn.disabled = true;
  if (btnLabel) btnLabel.innerText = 'Menghubungi 9Router...';

  resultBody.innerHTML = `
    <div class="w-full py-16 flex flex-col items-center justify-center space-y-3">
      <div class="w-8 h-8 border-2 border-slate-200 border-t-slate-900 rounded-full animate-spin"></div>
      <p class="text-xs text-slate-700 font-medium">Mengirim prompt ke 9Router Gateway...</p>
      <span class="text-[10px] text-slate-400 font-mono">Mengukur latensi dan mengevaluasi klasifikasi respon</span>
    </div>
  `;
  badgeContainer.innerHTML = `<span class="px-2.5 py-1 bg-slate-100 text-slate-600 text-[11px] font-semibold rounded-md">Menganalisis...</span>`;

  try {
    const res = await fetch('/api/admin/ai-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });
    const data = await res.json();

    if (!data.success && data.type === 'error') {
      badgeContainer.innerHTML = `<span class="px-2.5 py-1 bg-red-100 text-red-700 text-[11px] font-bold rounded-md">Error Gateway</span>`;
      resultBody.innerHTML = `
        <div class="w-full text-left p-4 bg-red-50 border border-red-200 rounded-xl space-y-2">
          <div class="flex items-center gap-2 text-red-800 font-bold text-xs">
            <i data-lucide="alert-circle" class="w-4 h-4 text-red-600"></i>
            <span>Gagal Menghubungi Model 9Router</span>
          </div>
          <p class="text-xs text-red-700 font-mono">${escapeHtml(data.error || 'Unknown error')}</p>
        </div>
      `;
      if (window.lucide) lucide.createIcons();
      return;
    }

    renderAIPlaygroundResult(data, prompt);

  } catch (err) {
    showToast('Error pengujian AI: ' + err.message, 'error');
    resultBody.innerHTML = `<div class="p-4 text-xs text-red-600">Gagal request: ${escapeHtml(err.message)}</div>`;
  } finally {
    if (btn) btn.disabled = false;
    if (btnLabel) btnLabel.innerText = 'Kirim & Analisis AI';
    if (window.lucide) lucide.createIcons();
  }
}

let lastAIResultData = null;

function copyLastAIJson() {
  if (!lastAIResultData) return;
  copyToClipboard(JSON.stringify(lastAIResultData, null, 2), 'JSON Payload');
}

function renderAIPlaygroundResult(data, prompt) {
  lastAIResultData = data.rawJson || data;
  const resultBody = document.getElementById('ai-result-body');
  const badgeContainer = document.getElementById('ai-result-badge-container');

  const latencyBadge = `
    <div class="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100 text-[11px] text-slate-500 font-mono">
      <span class="flex items-center gap-1 text-emerald-700 font-semibold"><i data-lucide="zap" class="w-3 h-3"></i> ${data.latencyMs || 0} ms</span>
      <span>•</span>
      <span class="truncate">Model: ${escapeHtml(data.model || '9Router')}</span>
      <span>•</span>
      <span>Source: ${data.source === 'local_cache' ? 'Local Fallback' : '9Router Live'}</span>
    </div>
  `;

  const rawJsonAccordion = `
    <details class="w-full text-left mt-3 bg-slate-50 border border-slate-200/90 rounded-xl text-xs overflow-hidden">
      <summary class="px-3.5 py-2 cursor-pointer font-mono text-[11px] text-slate-700 font-semibold hover:bg-slate-100 transition-colors flex items-center justify-between">
        <span>Raw Model Payload (JSON)</span>
        <button type="button" onclick="event.preventDefault(); copyLastAIJson();" class="text-[10px] text-slate-500 hover:text-slate-900 font-sans flex items-center gap-1">
          <i data-lucide="copy" class="w-3 h-3"></i> Salin JSON
        </button>
      </summary>
      <pre class="p-3.5 text-[10px] font-mono text-slate-100 bg-slate-950 overflow-x-auto">${escapeHtml(JSON.stringify(data.rawJson || data, null, 2))}</pre>
    </details>
  `;

  if (data.type === 'in_topic') {
    badgeContainer.innerHTML = `
      <span class="px-2.5 py-1 bg-emerald-100 text-emerald-900 text-[11px] font-bold rounded-lg flex items-center gap-1.5 shadow-sm border border-emerald-200/60">
        <i data-lucide="check-circle-2" class="w-3.5 h-3.5 text-emerald-600"></i>
        <span>IN-TOPIC (Layanan SapaTamu)</span>
      </span>
    `;

    resultBody.innerHTML = `
      <div class="w-full text-left space-y-3">
        <div class="p-4 bg-emerald-50/80 border border-emerald-200/80 rounded-xl space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-[10px] font-bold uppercase tracking-wider text-emerald-900 flex items-center gap-1.5">
              <i data-lucide="bot" class="w-3.5 h-3.5 text-emerald-700"></i>
              Jawaban AI Resmi SapaTamu
            </span>
            <span class="text-[10px] font-bold px-2 py-0.5 bg-emerald-200/80 text-emerald-950 rounded">Konteks Valid</span>
          </div>
          <div class="text-xs text-slate-800 leading-relaxed whitespace-pre-wrap">${escapeHtml(data.jawaban || '-')}</div>
        </div>
        ${latencyBadge}
        ${rawJsonAccordion}
      </div>
    `;

  } else if (data.type === 'out_of_topic') {
    badgeContainer.innerHTML = `
      <span class="px-2.5 py-1 bg-red-100 text-red-900 text-[11px] font-bold rounded-lg flex items-center gap-1.5 shadow-sm border border-red-200/60">
        <i data-lucide="alert-octagon" class="w-3.5 h-3.5 text-red-600"></i>
        <span>PERINGATAN: OUT OF TOPIC</span>
      </span>
    `;

    resultBody.innerHTML = `
      <div class="w-full text-left space-y-3">
        <div class="p-4 bg-red-50/90 border border-red-200/80 rounded-xl space-y-3">
          <div class="flex items-center gap-2 text-red-900 font-bold text-xs">
            <i data-lucide="alert-triangle" class="w-4 h-4 text-red-600 shrink-0"></i>
            <span>PERTANYAAN DI LUAR LINGKUP LAYANAN HOTEL & RESTORAN</span>
          </div>

          <p class="text-xs text-red-800 leading-relaxed">
            Model AI mendeteksi topik ini tidak berkaitan dengan perhotelan/kuliner SapaTamu (Kategori: <code class="px-1.5 py-0.5 bg-red-100 rounded font-mono font-bold text-red-950">${data.alasan || 'di_luar_jangkauan'}</code>).
          </p>

          <div class="p-3.5 bg-white/95 border border-red-200/80 rounded-lg text-xs space-y-1.5 text-slate-700">
            <div class="font-bold text-red-900 flex items-center gap-1.5">
              <i data-lucide="shield-alert" class="w-3.5 h-3.5 text-red-600"></i>
              <span>Tindakan di WhatsApp Tamu:</span>
            </div>
            <p class="text-[11px] text-slate-600 leading-relaxed">
              AI <strong>tidak meladeni topik acak atau berhalusinasi</strong>. Sistem langsung menawarkan pengalihan ke <strong>Staf Manusia (CS Takeover)</strong> agar citra layanan hotel tetap profesional dan terarah.
            </p>
          </div>
        </div>
        ${latencyBadge}
        ${rawJsonAccordion}
      </div>
    `;

  } else if (data.type === 'escalation') {
    badgeContainer.innerHTML = `
      <span class="px-2.5 py-1 bg-amber-100 text-amber-900 text-[11px] font-bold rounded-lg flex items-center gap-1.5 shadow-sm border border-amber-200/60">
        <i data-lucide="headphones" class="w-3.5 h-3.5 text-amber-700"></i>
        <span>PERMINTAAN ESKALASI CS</span>
      </span>
    `;

    resultBody.innerHTML = `
      <div class="w-full text-left space-y-3">
        <div class="p-4 bg-amber-50/90 border border-amber-200/80 rounded-xl space-y-3">
          <div class="flex items-center gap-2 text-amber-900 font-bold text-xs">
            <i data-lucide="user-check" class="w-4 h-4 text-amber-700 shrink-0"></i>
            <span>PERMINTAAN STAF MANUSIA / KOMPLAIN TERDETEKSI</span>
          </div>

          <p class="text-xs text-amber-800 leading-relaxed">
            Pesan tamu meminta bantuan staf hotel atau menyampaikan keluhan darurat (Pemicu: <code class="px-1.5 py-0.5 bg-amber-100 rounded font-mono font-bold text-amber-950">${data.alasan || 'minta_manusia'}</code>).
          </p>

          <div class="p-3.5 bg-white/95 border border-amber-200/80 rounded-lg text-xs space-y-1.5 text-slate-700">
            <div class="font-bold text-amber-900 flex items-center gap-1.5">
              <i data-lucide="info" class="w-3.5 h-3.5 text-amber-700"></i>
              <span>Tindakan di WhatsApp Tamu:</span>
            </div>
            <p class="text-[11px] text-slate-600 leading-relaxed">
              Bot seketika dimatikan (silenced), status kontak diubah menjadi <code>human</code>, dan notifikasi eskalasi muncul di tab <strong>Live Chat & CS</strong> agar staf dapat langsung merespon.
            </p>
          </div>
        </div>
        ${latencyBadge}
        ${rawJsonAccordion}
      </div>
    `;
  }

  if (window.lucide) lucide.createIcons();
}

// ─── MODALS, UTILS & TOASTS ─────────────────────────────────────────────────

function showConfirmModal(title, message, onConfirm) {
  document.getElementById('modal-title').innerText = title;
  document.getElementById('modal-message').innerHTML = message;
  confirmActionCallback = onConfirm;

  const confirmBtn = document.getElementById('modal-btn-confirm');
  confirmBtn.onclick = async () => {
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = '<span>Menghapus...</span>';
    try {
      if (confirmActionCallback) await confirmActionCallback();
    } finally {
      confirmBtn.disabled = false;
      confirmBtn.innerHTML = '<i data-lucide="trash-2" class="w-3.5 h-3.5"></i><span>Hapus Sekarang</span>';
      closeConfirmModal();
      if (window.lucide) lucide.createIcons();
    }
  };

  document.getElementById('confirm-modal').classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

function closeConfirmModal() {
  const modal = document.getElementById('confirm-modal');
  if (modal) modal.classList.add('hidden');
  confirmActionCallback = null;
}

function closeDetailModal() {
  const modal = document.getElementById('detail-modal');
  if (modal) modal.classList.add('hidden');
}

function copyToClipboard(text, label = 'Teks') {
  if (!navigator.clipboard) {
    showToast(`${label}: ${text}`, 'success');
    return;
  }
  navigator.clipboard.writeText(text).then(() => {
    showToast(`${label} disalin ke clipboard`, 'success');
  }).catch(() => {
    showToast('Gagal menyalin ke clipboard', 'error');
  });
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  const isErr = type === 'error';
  const isWarn = type === 'warning';

  let bgColor = 'bg-slate-900 text-white border-slate-800 shadow-xl';
  let iconName = 'check-circle-2';
  let iconColor = 'text-emerald-400';

  if (isErr) {
    bgColor = 'bg-red-950 text-red-100 border-red-800 shadow-xl';
    iconName = 'alert-circle';
    iconColor = 'text-red-400';
  } else if (isWarn) {
    bgColor = 'bg-amber-950 text-amber-100 border-amber-800 shadow-xl';
    iconName = 'alert-triangle';
    iconColor = 'text-amber-400';
  }

  toast.className = `pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border text-xs font-medium transform transition-all duration-200 animate-in fade-in slide-in-from-bottom-2 ${bgColor}`;
  toast.innerHTML = `
    <i data-lucide="${iconName}" class="w-4 h-4 shrink-0 ${iconColor}"></i>
    <span class="leading-relaxed font-sans">${escapeHtml(message)}</span>
  `;

  container.appendChild(toast);
  if (window.lucide) lucide.createIcons();

  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 250);
  }, 3500);
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.innerText = text;
  return div.innerHTML;
}
