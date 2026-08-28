let currentActivePhone = null;
let currentBotStatus = 'bot';

// Inisialisasi
document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) lucide.createIcons();
  refreshAll();
  checkSystemStatus();
  checkAIStatus();

  // Polling data berkala
  setInterval(() => {
    loadStats();
    loadChats();
    if (currentActivePhone) {
      loadMessages(currentActivePhone, false);
    }
  }, 3000);

  // Polling status gateway & AI benchmark
  setInterval(checkSystemStatus, 8000);
  setInterval(checkAIStatus, 15000);
});

function refreshAll() {
  loadStats();
  loadChats();
  loadBookings();
  loadCafeOrders();
  loadReservations();
  loadCatalog();
  checkSystemStatus();
  checkAIStatus();
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

// ─── CUSTOM MODAL & TOAST UI ────────────────────────────────────────────────

let confirmActionCallback = null;

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
  document.getElementById('confirm-modal').classList.add('hidden');
  confirmActionCallback = null;
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  const isErr = type === 'error';
  const isWarn = type === 'warning';

  const bgColor = isErr ? 'bg-red-950/90 border-red-800 text-red-200' : (isWarn ? 'bg-amber-950/90 border-amber-800 text-amber-200' : 'bg-slate-900/95 border-slate-700 text-emerald-300');
  const iconName = isErr ? 'alert-circle' : (isWarn ? 'alert-triangle' : 'check-circle-2');

  toast.className = `pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border shadow-2xl backdrop-blur-sm text-xs font-medium transform transition-all duration-200 animate-in fade-in slide-in-from-bottom-2 ${bgColor}`;
  toast.innerHTML = `
    <i data-lucide="${iconName}" class="w-4 h-4 shrink-0"></i>
    <span class="leading-relaxed">${message}</span>
  `;

  container.appendChild(toast);
  if (window.lucide) lucide.createIcons();

  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 250);
  }, 3500);
}

// ─── HOTEL BOOKINGS ─────────────────────────────────────────────────────────

let cachedBookings = [];
let cachedOrders = [];

async function loadBookings() {
  try {
    const res = await fetch('/api/admin/bookings');
    const data = await res.json();
    const tbody = document.getElementById('hotel-bookings-table');
    cachedBookings = data.bookings || [];

    if (!cachedBookings || cachedBookings.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="px-5 py-8 text-center text-slate-400">Belum ada transaksi reservasi kamar</td></tr>`;
      return;
    }

    tbody.innerHTML = cachedBookings.map(b => {
      const isCheckedIn = b.status === 'checked_in';
      const isCompleted = b.status === 'completed' || b.status === 'checked_out';
      let badgeClass = 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800';
      let statusLabel = (b.status || 'CONFIRMED').toUpperCase();

      if (isCheckedIn) {
        badgeClass = 'bg-blue-100 hover:bg-blue-200 text-blue-800';
        statusLabel = 'CHECKED-IN';
      } else if (isCompleted) {
        badgeClass = 'bg-slate-100 hover:bg-slate-200 text-slate-700';
        statusLabel = 'SELESAI';
      }

      return `
        <tr class="hover:bg-slate-50 transition-colors">
          <td class="px-5 py-3.5 font-bold font-mono text-xs text-slate-900">#${b.booking_code}</td>
          <td class="px-5 py-3.5 font-medium text-slate-900">${b.guest_name}<br><span class="text-[11px] font-mono text-slate-400">+${b.phone_number}</span></td>
          <td class="px-5 py-3.5"><span class="px-2 py-0.5 bg-slate-100 text-slate-800 font-semibold rounded text-[11px]">${b.room_name}</span></td>
          <td class="px-5 py-3.5">${b.check_in}</td>
          <td class="px-5 py-3.5">${b.nights} Malam</td>
          <td class="px-5 py-3.5 font-bold text-slate-900">Rp ${Number(b.total_price).toLocaleString('id-ID')}</td>
          <td class="px-5 py-3.5">
            <span onclick="showBookingDetail('${b.booking_code}')" class="px-2.5 py-1 ${badgeClass} text-[10px] font-bold rounded cursor-pointer transition-colors inline-flex items-center gap-1 shadow-sm" title="Klik untuk lihat rincian lengkap">
              <span>${statusLabel}</span>
              <i data-lucide="external-link" class="w-2.5 h-2.5 opacity-70"></i>
            </span>
          </td>
          <td class="px-5 py-3.5 text-right">
            <div class="flex items-center justify-end gap-1">
              <button onclick="showBookingDetail('${b.booking_code}')" class="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors" title="Lihat Rincian Lengkap">
                <i data-lucide="eye" class="w-4 h-4"></i>
              </button>
              <button onclick="deleteBooking('${b.booking_code}')" class="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors" title="Hapus Booking">
                <i data-lucide="trash-2" class="w-4 h-4"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
    if (window.lucide) lucide.createIcons();
  } catch (err) {
    console.error('Gagal load booking:', err);
  }
}

function showBookingDetail(code) {
  const b = cachedBookings.find(x => x.booking_code === code || x.booking_code === code.replace(/^#/, ''));
  if (!b) return;

  document.getElementById('detail-modal-title').innerText = 'Rincian Reservasi Kamar';
  document.getElementById('detail-modal-subtitle').innerText = `Kode Booking: #${b.booking_code}`;
  document.getElementById('detail-modal-icon').innerHTML = '<i data-lucide="bed" class="w-5 h-5 text-emerald-600"></i>';

  const checkOutDisplay = b.check_out || `Hari ke-${(b.nights || 1) + 1}`;

  document.getElementById('detail-modal-content').innerHTML = `
    <!-- Card 1: Status & Summary -->
    <div class="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
      <div>
        <span class="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Status Pemesanan</span>
        <div class="text-xs font-bold text-slate-900 mt-0.5">Terkonfirmasi & Terdaftar</div>
      </div>
      <span class="px-2.5 py-1 bg-emerald-100 text-emerald-800 font-bold rounded text-xs">
        ${(b.status || 'CONFIRMED').toUpperCase()}
      </span>
    </div>

    <!-- Card 2: Tamu & Kontak -->
    <div class="p-3.5 bg-white border border-slate-200 rounded-xl space-y-2">
      <h4 class="text-xs font-bold text-slate-900 border-b border-slate-100 pb-1.5 flex items-center gap-1.5">
        <i data-lucide="user" class="w-3.5 h-3.5 text-slate-400"></i>
        <span>Informasi Tamu</span>
      </h4>
      <div class="grid grid-cols-2 gap-2 text-xs">
        <div>
          <span class="text-slate-400 text-[11px] block">Nama Lengkap:</span>
          <strong class="text-slate-800">${b.guest_name || 'Tamu'}</strong>
        </div>
        <div>
          <span class="text-slate-400 text-[11px] block">Nomor WhatsApp:</span>
          <strong class="text-slate-800 font-mono">+${b.phone_number}</strong>
        </div>
      </div>
    </div>

    <!-- Card 3: Jadwal & Kamar -->
    <div class="p-3.5 bg-white border border-slate-200 rounded-xl space-y-2">
      <h4 class="text-xs font-bold text-slate-900 border-b border-slate-100 pb-1.5 flex items-center gap-1.5">
        <i data-lucide="calendar" class="w-3.5 h-3.5 text-slate-400"></i>
        <span>Jadwal & Akomodasi</span>
      </h4>
      <div class="grid grid-cols-2 gap-2 text-xs">
        <div>
          <span class="text-slate-400 text-[11px] block">Tipe Kamar:</span>
          <strong class="text-slate-800">${b.room_name}</strong>
        </div>
        <div>
          <span class="text-slate-400 text-[11px] block">Durasi Menginap:</span>
          <strong class="text-slate-800">${b.nights} Malam</strong>
        </div>
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

    <!-- Card 4: Pembayaran -->
    <div class="p-3.5 bg-white border border-slate-200 rounded-xl space-y-2">
      <h4 class="text-xs font-bold text-slate-900 border-b border-slate-100 pb-1.5 flex items-center gap-1.5">
        <i data-lucide="credit-card" class="w-3.5 h-3.5 text-slate-400"></i>
        <span>Rincian Pembayaran</span>
      </h4>
      <div class="flex items-center justify-between text-xs pt-1">
        <span class="text-slate-500">Metode Pembayaran:</span>
        <span class="font-semibold text-slate-700">${b.payment_method || 'Simulasi QRIS/VA'}</span>
      </div>
      <div class="flex items-center justify-between text-xs">
        <span class="text-slate-500">Status Pembayaran:</span>
        <span class="text-emerald-700 font-bold">LUNAS (PAID)</span>
      </div>
      <div class="flex items-center justify-between text-xs pt-2 border-t border-slate-100">
        <span class="font-bold text-slate-700">Total Biaya:</span>
        <span class="text-sm font-bold text-slate-900 font-mono">Rp ${Number(b.total_price).toLocaleString('id-ID')}</span>
      </div>
    </div>
  `;

  // Action button in footer
  const actionsEl = document.getElementById('detail-modal-actions');
  actionsEl.innerHTML = `
    ${b.status !== 'checked_in' && b.status !== 'completed' ? `
      <button onclick="updateBookingStatus('${b.booking_code}', 'checked_in')" class="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors">
        <i data-lucide="log-in" class="w-3.5 h-3.5"></i>
        <span>Tandai Check-In</span>
      </button>
    ` : ''}
    ${b.status === 'checked_in' ? `
      <button onclick="updateBookingStatus('${b.booking_code}', 'completed')" class="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors">
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
      showToast(data.message || 'Status berhasil diperbarui', 'success');
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
    `Apakah Anda yakin ingin menghapus data booking <strong>#${code}</strong>? Tindakan ini akan menghapus data dari database sistem.`,
    async () => {
      try {
        const res = await fetch(`/api/admin/bookings/${encodeURIComponent(code)}`, { method: 'DELETE' });
        if (!res.ok) {
          showToast(`Server perlu di-restart untuk memuat rute hapus. Silakan restart server di terminal (Ctrl+C lalu npm start).`, 'error');
          return;
        }
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

// ─── CAFE ORDERS ────────────────────────────────────────────────────────────

async function loadCafeOrders() {
  try {
    const res = await fetch('/api/admin/orders');
    const data = await res.json();
    const tbody = document.getElementById('cafe-orders-table');
    cachedOrders = data.orders || [];

    if (!cachedOrders || cachedOrders.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="px-5 py-8 text-center text-slate-400">Belum ada pesanan restoran masuk</td></tr>`;
      return;
    }

    tbody.innerHTML = cachedOrders.map(o => {
      const itemsList = o.items.map(i => `${i.item_name} (${i.qty}x)`).join(', ');
      const loc = o.order_type === 'dine_in' ? `Meja ${String(o.table_number).padStart(2, '0')}` : 'Takeaway';
      const isCompleted = o.status === 'completed';

      return `
        <tr class="hover:bg-slate-50 transition-colors">
          <td class="px-5 py-3.5 font-bold font-mono text-xs text-slate-900">#${o.order_code}</td>
          <td class="px-5 py-3.5 font-semibold text-slate-800">${loc}</td>
          <td class="px-5 py-3.5 text-slate-600 text-xs">${itemsList || '-'}</td>
          <td class="px-5 py-3.5 font-bold text-slate-900">Rp ${Number(o.total_amount).toLocaleString('id-ID')}</td>
          <td class="px-5 py-3.5">
            <span onclick="showOrderDetail('${o.order_code}')" class="px-2.5 py-1 ${isCompleted ? 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800' : 'bg-blue-100 hover:bg-blue-200 text-blue-800'} text-[10px] font-bold rounded cursor-pointer transition-colors inline-flex items-center gap-1 shadow-sm" title="Klik untuk lihat rincian pesanan">
              <span>${isCompleted ? 'SELESAI' : 'DAPUR'}</span>
              <i data-lucide="external-link" class="w-2.5 h-2.5 opacity-70"></i>
            </span>
          </td>
          <td class="px-5 py-3.5 font-mono text-slate-400 text-[11px]">${o.created_at.slice(11, 16)}</td>
          <td class="px-5 py-3.5 text-right">
            <div class="flex items-center justify-end gap-1">
              <button onclick="showOrderDetail('${o.order_code}')" class="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors" title="Lihat Rincian Pesanan">
                <i data-lucide="eye" class="w-4 h-4"></i>
              </button>
              <button onclick="deleteOrder('${o.order_code}')" class="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors" title="Hapus Pesanan">
                <i data-lucide="trash-2" class="w-4 h-4"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
    if (window.lucide) lucide.createIcons();
  } catch (err) {
    console.error('Gagal load cafe orders:', err);
  }
}

function showOrderDetail(code) {
  const o = cachedOrders.find(x => x.order_code === code || x.order_code === code.replace(/^#/, ''));
  if (!o) return;

  document.getElementById('detail-modal-title').innerText = 'Rincian Pesanan Restoran & Kafe';
  document.getElementById('detail-modal-subtitle').innerText = `Kode Pesanan: #${o.order_code}`;
  document.getElementById('detail-modal-icon').innerHTML = '<i data-lucide="utensils" class="w-5 h-5 text-amber-600"></i>';

  const loc = o.order_type === 'dine_in' ? `Makan di Tempat (Meja ${String(o.table_number).padStart(2, '0')})` : 'Takeaway (Bawa Pulang)';
  const isCompleted = o.status === 'completed';

  const itemsHtml = (o.items || []).map(i => `
    <div class="flex items-center justify-between text-xs py-1.5 border-b border-slate-100 last:border-0">
      <div>
        <strong class="text-slate-800">${i.item_name}</strong>
        <span class="text-slate-400 text-[11px] ml-1">(${i.qty}x @ Rp ${Number(i.price).toLocaleString('id-ID')})</span>
      </div>
      <span class="font-mono font-semibold text-slate-900">Rp ${Number(i.subtotal).toLocaleString('id-ID')}</span>
    </div>
  `).join('') || '<div class="text-slate-400 py-2">Tidak ada data item</div>';

  document.getElementById('detail-modal-content').innerHTML = `
    <!-- Card 1: Status & Lokasi -->
    <div class="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
      <div>
        <span class="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Tipe Pesanan / Lokasi</span>
        <div class="text-xs font-bold text-slate-900 mt-0.5">${loc}</div>
      </div>
      <span class="px-2.5 py-1 ${isCompleted ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'} font-bold rounded text-xs">
        ${isCompleted ? 'SELESAI SAJI' : 'PROSES DAPUR'}
      </span>
    </div>

    <!-- Card 2: Detail Kontak & Waktu -->
    <div class="p-3.5 bg-white border border-slate-200 rounded-xl space-y-2">
      <div class="grid grid-cols-2 gap-2 text-xs">
        <div>
          <span class="text-slate-400 text-[11px] block">No. WhatsApp Pemesan:</span>
          <strong class="text-slate-800 font-mono">+${o.phone_number}</strong>
        </div>
        <div>
          <span class="text-slate-400 text-[11px] block">Waktu Pesanan Masuk:</span>
          <strong class="text-slate-800 font-mono">${o.created_at || '-'}</strong>
        </div>
      </div>
    </div>

    <!-- Card 3: Daftar Item Menu -->
    <div class="p-3.5 bg-white border border-slate-200 rounded-xl space-y-2">
      <h4 class="text-xs font-bold text-slate-900 border-b border-slate-100 pb-1.5 flex items-center gap-1.5">
        <i data-lucide="shopping-bag" class="w-3.5 h-3.5 text-slate-400"></i>
        <span>Rincian Item Dipesan</span>
      </h4>
      <div class="space-y-1">
        ${itemsHtml}
      </div>
    </div>

    <!-- Card 4: Tagihan Pembayaran -->
    <div class="p-3.5 bg-white border border-slate-200 rounded-xl space-y-2">
      <div class="flex items-center justify-between text-xs">
        <span class="text-slate-500">Status Pembayaran:</span>
        <span class="text-emerald-700 font-bold">LUNAS (${(o.payment_status || 'PAID').toUpperCase()})</span>
      </div>
      <div class="flex items-center justify-between text-xs pt-2 border-t border-slate-100">
        <span class="font-bold text-slate-700">Total Pembayaran:</span>
        <span class="text-sm font-bold text-slate-900 font-mono">Rp ${Number(o.total_amount).toLocaleString('id-ID')}</span>
      </div>
    </div>
  `;

  // Action button in footer
  const actionsEl = document.getElementById('detail-modal-actions');
  actionsEl.innerHTML = `
    ${!isCompleted ? `
      <button onclick="updateOrderStatus('${o.order_code}', 'completed')" class="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors">
        <i data-lucide="check" class="w-3.5 h-3.5"></i>
        <span>Tandai Selesai Saji</span>
      </button>
    ` : `
      <button onclick="updateOrderStatus('${o.order_code}', 'new')" class="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors">
        <i data-lucide="rotate-ccw" class="w-3.5 h-3.5"></i>
        <span>Kembalikan ke Dapur</span>
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
      showToast(data.message || 'Status pesanan diperbarui', 'success');
      closeDetailModal();
      refreshAll();
    } else {
      showToast('Gagal memperbarui status: ' + data.error, 'error');
    }
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

function closeDetailModal() {
  document.getElementById('detail-modal').classList.add('hidden');
}

function deleteOrder(code) {
  showConfirmModal(
    'Hapus Pesanan Restoran',
    `Apakah Anda yakin ingin menghapus pesanan <strong>#${code}</strong> beserta rincian itemnya?`,
    async () => {
      try {
        const res = await fetch(`/api/admin/orders/${encodeURIComponent(code)}`, { method: 'DELETE' });
        if (!res.ok) {
          showToast(`Server perlu di-restart untuk memuat rute hapus. Silakan restart server di terminal (Ctrl+C lalu npm start).`, 'error');
          return;
        }
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

function deleteReservation(id) {
  showConfirmModal(
    'Hapus Reservasi Meja',
    `Apakah Anda yakin ingin menghapus data reservasi meja <strong>#${id}</strong>?`,
    async () => {
      try {
        const res = await fetch(`/api/admin/reservations/${encodeURIComponent(id)}`, { method: 'DELETE' });
        if (!res.ok) {
          showToast(`Server perlu di-restart untuk memuat rute hapus. Silakan restart server di terminal (Ctrl+C lalu npm start).`, 'error');
          return;
        }
        const data = await res.json();
        if (data.success) {
          showToast(`Reservasi #${id} berhasil dihapus.`, 'success');
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

// ─── AI 9ROUTER PLAYGROUND & DIAGNOSTICS ────────────────────────────────────

async function checkAIStatus() {
  try {
    const res = await fetch('/api/admin/ai-benchmark');
    const contentType = res.headers.get('content-type') || '';
    if (!res.ok || !contentType.includes('application/json')) {
      console.warn('Backend server belum memuat rute AI (perlu restart server di terminal: Ctrl+C lalu npm start).');
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

    if (b.status === 'online') {
      if (navAiStatus) navAiStatus.innerText = `9Router (${b.latencyMs}ms)`;
      if (navAiDot) navAiDot.className = 'w-2 h-2 rounded-full bg-emerald-400 animate-pulse';
      if (aiCardStatus) aiCardStatus.innerText = 'Online (Active)';
      if (aiCardDot) aiCardDot.className = 'w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse';
      if (aiCardLatency) aiCardLatency.innerText = `${b.latencyMs} ms`;
    } else {
      if (navAiStatus) navAiStatus.innerText = '9Router (Offline)';
      if (navAiDot) navAiDot.className = 'w-2 h-2 rounded-full bg-red-400';
      if (aiCardStatus) aiCardStatus.innerText = 'Offline (Fallback Ready)';
      if (aiCardDot) aiCardDot.className = 'w-2.5 h-2.5 rounded-full bg-amber-500';
      if (aiCardLatency) aiCardLatency.innerText = 'Timeout / Err';
    }

    if (aiCardModel && b.model) aiCardModel.innerText = b.model;
    if (aiCardEndpoint && b.baseUrl) aiCardEndpoint.innerText = b.baseUrl;
    if (aiCardTime) aiCardTime.innerText = `Dicek: ${new Date().toLocaleTimeString('id-ID')}`;
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
    const res = await fetch('/api/admin/ai-benchmark');
    const contentType = res.headers.get('content-type') || '';
    if (!res.ok || !contentType.includes('application/json')) {
      showToast('Server perlu di-restart untuk memuat rute AI baru. Di terminal tekan Ctrl+C lalu ketik npm start.', 'error');
      return;
    }
    const data = await res.json();
    if (data.success && data.benchmark) {
      checkAIStatus();
      showToast(`Benchmark 9Router berhasil: Latensi ${data.benchmark.latencyMs} ms`, data.benchmark.status === 'online' ? 'success' : 'warning');
    } else {
      showToast('Gagal melakukan ping AI: ' + (data.error || 'Unknown error'), 'error');
    }
  } catch (err) {
    showToast('Error koneksi ke 9Router: ' + err.message, 'error');
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
    showToast('Ketik atau pilih pertanyaan terlebih dahulu', 'warning');
    return;
  }

  const btn = document.getElementById('btn-submit-ai-test');
  const btnLabel = document.getElementById('btn-submit-ai-label');
  const resultBody = document.getElementById('ai-result-body');
  const badgeContainer = document.getElementById('ai-result-badge-container');

  if (btn) btn.disabled = true;
  if (btnLabel) btnLabel.innerText = 'Menghubungi 9Router...';

  // Loading skeleton
  resultBody.innerHTML = `
    <div class="w-full py-12 flex flex-col items-center justify-center space-y-3">
      <div class="w-8 h-8 border-2 border-slate-200 border-t-slate-900 rounded-full animate-spin"></div>
      <p class="text-xs text-slate-600 font-medium">Mengirim prompt ke 9Router (${document.getElementById('ai-card-model')?.innerText || 'LLM'})...</p>
      <span class="text-[10px] text-slate-400 font-mono">Mengukur latensi dan mengevaluasi konteks topik</span>
    </div>
  `;
  badgeContainer.innerHTML = `<span class="px-2.5 py-1 bg-slate-100 text-slate-500 text-[11px] font-semibold rounded-md">Menganalisis...</span>`;

  try {
    const res = await fetch('/api/admin/ai-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });
    const contentType = res.headers.get('content-type') || '';
    if (!res.ok || !contentType.includes('application/json')) {
      showToast('Server perlu di-restart untuk memuat rute AI baru. Di terminal tekan Ctrl+C lalu ketik npm start.', 'error');
      badgeContainer.innerHTML = `<span class="px-2.5 py-1 bg-red-100 text-red-700 text-[11px] font-bold rounded-md">Server Belum Restart</span>`;
      resultBody.innerHTML = `
        <div class="w-full text-left p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
          <div class="flex items-center gap-2 text-amber-800 font-bold text-xs">
            <i data-lucide="alert-triangle" class="w-4 h-4 text-amber-600"></i>
            <span>Server Perlu Di-restart</span>
          </div>
          <p class="text-xs text-amber-900 leading-relaxed">
            Instance server Node.js di terminal masih menjalankan sesi lama sebelum rute AI ditambahkan.
          </p>
          <div class="text-[11px] text-amber-800 bg-white/70 p-2.5 rounded-lg border border-amber-200 font-mono">
            1. Buka terminal VS Code tempat server berjalan<br>
            2. Tekan <strong>Ctrl + C</strong><br>
            3. Ketik <strong>npm start</strong>
          </div>
        </div>
      `;
      if (window.lucide) lucide.createIcons();
      return;
    }
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
    showToast('Error request AI test: ' + err.message, 'error');
    resultBody.innerHTML = `<div class="p-4 text-xs text-red-600">Gagal request: ${escapeHtml(err.message)}</div>`;
  } finally {
    if (btn) btn.disabled = false;
    if (btnLabel) btnLabel.innerText = 'Kirim & Analisis AI';
    if (window.lucide) lucide.createIcons();
  }
}

function renderAIPlaygroundResult(data, prompt) {
  const resultBody = document.getElementById('ai-result-body');
  const badgeContainer = document.getElementById('ai-result-badge-container');

  const latencyBadge = `
    <div class="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 text-[11px] text-slate-500 font-mono">
      <span class="flex items-center gap-1 text-emerald-700 font-semibold"><i data-lucide="zap" class="w-3 h-3"></i> ${data.latencyMs} ms</span>
      <span>•</span>
      <span class="truncate">Model: ${escapeHtml(data.model)}</span>
      <span>•</span>
      <span>Source: ${data.source === 'local_cache' ? 'Local Knowledge Fallback' : '9Router Live'}</span>
    </div>
  `;

  const rawJsonAccordion = `
    <details class="w-full text-left mt-3 bg-slate-50 border border-slate-200 rounded-lg text-xs overflow-hidden">
      <summary class="px-3 py-2 cursor-pointer font-mono text-[11px] text-slate-600 font-semibold hover:bg-slate-100 transition-colors flex items-center justify-between">
        <span>Raw JSON Model Payload</span>
        <span class="text-[10px] text-slate-400 font-sans">Klik untuk buka/tutup</span>
      </summary>
      <pre class="p-3 text-[10px] font-mono text-slate-100 bg-slate-900 overflow-x-auto">${escapeHtml(JSON.stringify(data.rawJson || data, null, 2))}</pre>
    </details>
  `;

  if (data.type === 'in_topic') {
    badgeContainer.innerHTML = `
      <span class="px-2.5 py-1 bg-emerald-100 text-emerald-800 text-[11px] font-bold rounded-md flex items-center gap-1.5 shadow-sm">
        <i data-lucide="check-circle-2" class="w-3.5 h-3.5 text-emerald-600"></i>
        <span>IN-TOPIC (Layanan Hotel & Resto)</span>
      </span>
    `;

    resultBody.innerHTML = `
      <div class="w-full text-left space-y-3">
        <div class="p-4 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-[10px] font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
              <i data-lucide="bot" class="w-3.5 h-3.5 text-emerald-700"></i>
              Jawaban AI Resmi SapaTamu
            </span>
            <span class="text-[10px] font-semibold px-2 py-0.5 bg-emerald-200 text-emerald-900 rounded">Valid Context</span>
          </div>
          <div class="text-xs text-slate-800 leading-relaxed font-sans whitespace-pre-wrap">${escapeHtml(data.jawaban || '-')}</div>
        </div>
        ${latencyBadge}
        ${rawJsonAccordion}
      </div>
    `;

  } else if (data.type === 'out_of_topic') {
    badgeContainer.innerHTML = `
      <span class="px-2.5 py-1 bg-red-100 text-red-800 text-[11px] font-bold rounded-md flex items-center gap-1.5 shadow-sm">
        <i data-lucide="alert-octagon" class="w-3.5 h-3.5 text-red-600"></i>
        <span>PERINGATAN: OUT OF TOPIC</span>
      </span>
    `;

    resultBody.innerHTML = `
      <div class="w-full text-left space-y-3">
        <div class="p-4 bg-red-50 border border-red-200 rounded-xl space-y-3">
          <div class="flex items-center gap-2 text-red-800 font-bold text-xs">
            <i data-lucide="alert-triangle" class="w-4 h-4 text-red-600 shrink-0"></i>
            <span>PERINGATAN SISTEM: PERTANYAAN DI LUAR LINGKUP SAPATAMU</span>
          </div>
          
          <p class="text-xs text-red-800 leading-relaxed">
            Model AI mengklasifikasikan pertanyaan ini <strong>DI LUAR LINGKUP LAYANAN HOTEL & RESTORAN</strong> (Alasan: <code class="px-1.5 py-0.5 bg-red-100 rounded font-mono font-bold text-red-900">${data.alasan || 'di_luar_jangkauan'}</code>).
          </p>

          <div class="p-3 bg-white/90 border border-red-200 rounded-lg text-xs space-y-1.5 text-slate-700">
            <div class="font-bold text-red-900 flex items-center gap-1.5">
              <i data-lucide="shield-alert" class="w-3.5 h-3.5 text-red-600"></i>
              <span>Perilaku di Sesi WhatsApp Tamu Riil:</span>
            </div>
            <p class="text-[11px] text-slate-600 leading-relaxed">
              Jika pertanyaan ini dikirimkan oleh tamu melalui WhatsApp, AI <strong>tidak akan berhalusinasi atau meladeni topik acak</strong>. Bot secara otomatis mengalihkan tamu ke <strong>Customer Service Staf Manusia (*Human CS Takeover*)</strong> agar layanan tetap sopan dan profesional.
            </p>
          </div>
        </div>
        ${latencyBadge}
        ${rawJsonAccordion}
      </div>
    `;

  } else if (data.type === 'escalation') {
    badgeContainer.innerHTML = `
      <span class="px-2.5 py-1 bg-amber-100 text-amber-900 text-[11px] font-bold rounded-md flex items-center gap-1.5 shadow-sm">
        <i data-lucide="headphones" class="w-3.5 h-3.5 text-amber-700"></i>
        <span>PERMINTAAN ESKALASI CS</span>
      </span>
    `;

    resultBody.innerHTML = `
      <div class="w-full text-left space-y-3">
        <div class="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-3">
          <div class="flex items-center gap-2 text-amber-900 font-bold text-xs">
            <i data-lucide="user-check" class="w-4 h-4 text-amber-700 shrink-0"></i>
            <span>PERMINTAAN STAF MANUSIA / KOMPLAIN TERDETEKSI</span>
          </div>

          <p class="text-xs text-amber-800 leading-relaxed">
            Pesan tamu meminta bantuan staf manusia atau menyampaikan keluhan darurat (Alasan: <code class="px-1.5 py-0.5 bg-amber-100 rounded font-mono font-bold text-amber-900">${data.alasan || 'minta_manusia'}</code>).
          </p>

          <div class="p-3 bg-white/90 border border-amber-200 rounded-lg text-xs space-y-1.5 text-slate-700">
            <div class="font-bold text-amber-900 flex items-center gap-1.5">
              <i data-lucide="info" class="w-3.5 h-3.5 text-amber-700"></i>
              <span>Perilaku di Sesi WhatsApp Tamu Riil:</span>
            </div>
            <p class="text-[11px] text-slate-600 leading-relaxed">
              Bot langsung dimatikan seketika (*silenced*), status kontak diubah menjadi <code>human</code>, dan staf hotel/resto dapat langsung membalas chat tamu dari tab <strong>Live Chat & CS</strong>.
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
