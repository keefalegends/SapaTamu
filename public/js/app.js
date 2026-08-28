let currentActivePhone = null;
let currentBotStatus = 'bot';

// Inisialisasi ikon Lucide
document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) lucide.createIcons();
  refreshAll();
  // Auto refresh chat & stats setiap 3 detik
  setInterval(() => {
    loadStats();
    loadChats();
    if (currentActivePhone) {
      loadMessages(currentActivePhone, false);
    }
  }, 3000);
});

function refreshAll() {
  loadStats();
  loadChats();
  loadBookings();
  loadCafeOrders();
  loadReservations();
  loadCatalog();
}

// ─── TAB NAVIGATION ─────────────────────────────────────────────────────────

function switchTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  document.getElementById(tabId)?.classList.remove('hidden');

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('bg-emerald-50', 'text-emerald-700', 'border-emerald-200');
    btn.classList.add('text-slate-600');
  });

  const activeBtn = document.getElementById('btn-' + tabId);
  if (activeBtn) {
    activeBtn.classList.add('bg-emerald-50', 'text-emerald-700', 'border-emerald-200');
    activeBtn.classList.remove('text-slate-600');
  }

  if (window.lucide) lucide.createIcons();
}

// ─── STATS LOADER ───────────────────────────────────────────────────────────

async function loadStats() {
  try {
    const res = await fetch('/api/admin/stats');
    const data = await res.json();
    if (data.success) {
      const s = data.stats;
      document.getElementById('stat-chats').innerText = s.chats || 0;
      document.getElementById('stat-hotel-count').innerText = `${s.hotel.count || 0} Kamar`;
      document.getElementById('stat-hotel-rev').innerText = `Rp ${Number(s.hotel.revenue || 0).toLocaleString('id-ID')}`;
      document.getElementById('stat-cafe-count').innerText = `${s.cafe.count || 0} Pesanan`;
      document.getElementById('stat-cafe-rev').innerText = `Rp ${Number(s.cafe.revenue || 0).toLocaleString('id-ID')}`;
      document.getElementById('stat-res-count').innerText = `${s.reservations || 0} Tamu`;
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
          <i data-lucide="message-circle" class="w-8 h-8 mx-auto mb-2 opacity-50"></i>
          Belum ada percakapan masuk.<br>Gunakan tab <strong>Simulator</strong> untuk uji coba!
        </div>
      `;
      if (window.lucide) lucide.createIcons();
      return;
    }

    listEl.innerHTML = data.chats.map(c => {
      const isActive = c.phone_number === currentActivePhone;
      const isHuman = c.bot_status === 'human';
      const initial = (c.name || 'T')[0].toUpperCase();

      return `
        <div onclick="selectChat('${c.phone_number}', '${c.name || `Tamu ${c.phone_number}`}', '${c.bot_status}')"
             class="p-4 cursor-pointer hover:bg-slate-100/80 transition-colors flex items-center gap-3 ${isActive ? 'bg-white border-l-4 border-emerald-500 shadow-sm' : ''}">
          <div class="w-10 h-10 rounded-full ${isHuman ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'} flex items-center justify-center font-bold text-sm shrink-0">
            ${initial}
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between">
              <h4 class="text-sm font-semibold text-slate-900 truncate">${c.name || `+${c.phone_number}`}</h4>
              <span class="text-[10px] px-2 py-0.5 rounded-full font-bold ${isHuman ? 'bg-amber-100 text-amber-700 border border-amber-300' : 'bg-emerald-50 text-emerald-600'}">
                ${isHuman ? '👤 CS Staf' : '🤖 Bot'}
              </span>
            </div>
            <p class="text-xs text-slate-500 truncate mt-0.5">${c.last_message || '-'}</p>
          </div>
        </div>
      `;
    }).join('');

    if (window.lucide) lucide.createIcons();
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
    label.innerText = 'Mode: 👤 Staf CS Aktif (Bot Mati)';
    label.className = 'text-xs font-bold text-amber-600';
    btn.className = 'px-3 py-1.5 text-xs font-bold rounded-lg border flex items-center gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700';
    btn.innerHTML = '<i data-lucide="bot" class="w-3.5 h-3.5"></i><span>Aktifkan Bot Lagi</span>';
  } else {
    label.innerText = 'Mode: 🤖 Bot Aktif Otomatis';
    label.className = 'text-xs font-semibold text-slate-500';
    btn.className = 'px-3 py-1.5 text-xs font-bold rounded-lg border flex items-center gap-1.5 bg-amber-500 text-white hover:bg-amber-600';
    btn.innerHTML = '<i data-lucide="user-check" class="w-3.5 h-3.5"></i><span>Ambil Alih CS (Matikan Bot)</span>';
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
      const senderBadge = m.sender === 'admin' ? '👤 Staf CS' : (m.sender === 'bot' ? '🤖 Bot AI' : 'Tamu');

      return `
        <div class="flex flex-col ${isUser ? 'items-start' : 'items-end'}">
          <span class="text-[10px] font-semibold text-slate-400 px-1 mb-1">${senderBadge}</span>
          <div class="max-w-[80%] rounded-2xl px-4 py-2.5 text-xs shadow-sm ${isUser ? 'bg-white text-slate-800 border border-slate-200 rounded-tl-sm' : (m.sender === 'admin' ? 'bg-amber-600 text-white rounded-tr-sm' : 'bg-emerald-600 text-white rounded-tr-sm')}">
            <p class="whitespace-pre-wrap leading-relaxed">${escapeHtml(m.content)}</p>
          </div>
          <span class="text-[9px] text-slate-400 mt-1 px-1">${m.created_at.slice(11, 16)}</span>
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

async function loadBookings() {
  try {
    const res = await fetch('/api/admin/bookings');
    const data = await res.json();
    const tbody = document.getElementById('hotel-bookings-table');

    if (!data.bookings || data.bookings.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="px-6 py-8 text-center text-slate-400">Belum ada reservasi kamar</td></tr>`;
      return;
    }

    tbody.innerHTML = data.bookings.map(b => `
      <tr class="hover:bg-slate-50 transition-colors">
        <td class="px-6 py-4 font-bold text-slate-900 font-mono text-xs">#${b.booking_code}</td>
        <td class="px-6 py-4 font-medium text-slate-900">${b.guest_name}<br><span class="text-xs text-slate-400">+${b.phone_number}</span></td>
        <td class="px-6 py-4"><span class="px-2.5 py-1 bg-purple-50 text-purple-700 font-semibold rounded-lg text-xs">${b.room_name}</span></td>
        <td class="px-6 py-4">${b.check_in}</td>
        <td class="px-6 py-4">${b.nights} Malam</td>
        <td class="px-6 py-4 font-bold text-slate-900">Rp ${Number(b.total_price).toLocaleString('id-ID')}</td>
        <td class="px-6 py-4"><span class="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-full">Lunas (Confirmed)</span></td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Gagal load booking:', err);
  }
}

// ─── CAFE ORDERS ────────────────────────────────────────────────────────────

async function loadCafeOrders() {
  try {
    const res = await fetch('/api/admin/orders');
    const data = await res.json();
    const tbody = document.getElementById('cafe-orders-table');

    if (!data.orders || data.orders.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-8 text-center text-slate-400">Belum ada pesanan kafe masuk</td></tr>`;
      return;
    }

    tbody.innerHTML = data.orders.map(o => {
      const itemsList = o.items.map(i => `${i.item_name} (${i.qty}x)`).join(', ');
      const loc = o.order_type === 'dine_in' ? `🍳 Meja ${String(o.table_number).padStart(2, '0')}` : '🛍️ Takeaway';

      return `
        <tr class="hover:bg-slate-50 transition-colors">
          <td class="px-6 py-4 font-bold text-slate-900 font-mono text-xs">#${o.order_code}</td>
          <td class="px-6 py-4 font-semibold text-slate-800">${loc}</td>
          <td class="px-6 py-4 text-slate-600 text-xs">${itemsList || '-'}</td>
          <td class="px-6 py-4 font-bold text-slate-900">Rp ${Number(o.total_amount).toLocaleString('id-ID')}</td>
          <td class="px-6 py-4"><span class="px-2 py-0.5 bg-blue-100 text-blue-800 text-xs font-bold rounded-full">Diterima Dapur</span></td>
          <td class="px-6 py-4 text-xs text-slate-400">${o.created_at.slice(11, 16)}</td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('Gagal load cafe orders:', err);
  }
}

// ─── CAFE RESERVATIONS ──────────────────────────────────────────────────────

async function loadReservations() {
  try {
    const res = await fetch('/api/admin/reservations');
    const data = await res.json();
    const tbody = document.getElementById('cafe-res-table');

    if (!data.reservations || data.reservations.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="px-6 py-8 text-center text-slate-400">Belum ada reservasi meja kafe</td></tr>`;
      return;
    }

    tbody.innerHTML = data.reservations.map(r => `
      <tr class="hover:bg-slate-50 transition-colors">
        <td class="px-6 py-4 font-bold font-mono text-xs text-slate-900">#${r.id}</td>
        <td class="px-6 py-4">+${r.phone_number}</td>
        <td class="px-6 py-4 font-semibold">${r.pax} Orang</td>
        <td class="px-6 py-4">${r.time}</td>
        <td class="px-6 py-4 text-xs text-slate-500">${r.notes || '-'}</td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Gagal load reservasi kafe:', err);
  }
}

// ─── CATALOG & TARIFFS ──────────────────────────────────────────────────────

async function loadCatalog() {
  try {
    const res = await fetch('/api/admin/catalog');
    const data = await res.json();

    const roomEl = document.getElementById('room-list');
    roomEl.innerHTML = data.rooms.map(r => `
      <div class="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
        <div>
          <h4 class="font-bold text-sm text-slate-900">${r.name}</h4>
          <p class="text-xs text-slate-500">${r.description}</p>
        </div>
        <div class="text-right">
          <div class="font-bold text-sm text-emerald-600">Rp ${Number(r.price).toLocaleString('id-ID')}</div>
          <span class="text-[10px] text-slate-400">per malam</span>
        </div>
      </div>
    `).join('');

    const menuEl = document.getElementById('menu-list');
    menuEl.innerHTML = data.menu.map(m => `
      <div class="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
        <div>
          <span class="text-[10px] uppercase font-bold text-slate-400">${m.category}</span>
          <h5 class="text-xs font-semibold text-slate-800">${m.name}</h5>
        </div>
        <div class="font-bold text-xs text-slate-900">
          Rp ${Number(m.price).toLocaleString('id-ID')}
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Gagal load catalog:', err);
  }
}

// ─── SIMULATOR (PRESENTATION LIVE DEMO) ──────────────────────────────────────

function setSimText(txt) {
  document.getElementById('sim-text').value = txt;
}

async function runSimulation(e) {
  e.preventDefault();
  const phone = document.getElementById('sim-phone').value.trim();
  const text = document.getElementById('sim-text').value.trim();
  if (!text) return;

  const btn = document.getElementById('btn-sim-send');
  btn.disabled = true;
  btn.innerText = 'Mengirim & Memproses...';

  try {
    const res = await fetch('/api/admin/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, text, senderName: 'Tamu Demo' }),
    });
    const data = await res.json();
    if (data.success) {
      document.getElementById('sim-text').value = '';
      refreshAll();
      // Pindah ke tab live chat otomatis agar penguji melihat balasan bot
      switchTab('tab-chats');
      selectChat(phone, 'Tamu Demo', 'bot');
    }
  } catch (err) {
    alert('Simulasi gagal: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i data-lucide="send" class="w-4 h-4"></i><span>Kirimkan Pesan Masuk (Trigger Webhook)</span>';
    if (window.lucide) lucide.createIcons();
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.innerText = text;
  return div.innerHTML;
}
