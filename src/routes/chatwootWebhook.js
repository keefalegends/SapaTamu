const express  = require('express');
const router   = express.Router();
const config   = require('../config/env');

const { getStatus, setStatus } = require('../session/manager');
const { cekEskalasi }          = require('../escalation/detector');
const { eksekusiEskalasi }     = require('../escalation/service');
const { jawab }                = require('../ai/handler');
const { sendMessage, sendMenuMessage } = require('../chatwoot/client');

// ─── MENU DEFINITIONS ─────────────────────────────────────────────────────────

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

const MENU_HOTEL = {
  text:
    '🏨 *Hotel SapaTamu*\n\n' +
    'Saya siap membantu kebutuhan hotel Anda.\n\n' +
    'Pilih layanan:',
  items: [
    { title: '🛏️ Reservasi Kamar',  value: 'hotel_reservasi'   },
    { title: 'ℹ️ Info & Fasilitas', value: 'hotel_fasilitas'   },
    { title: '🍽️ Room Service',     value: 'hotel_roomservice' },
    { title: '🎧 Customer Service', value: 'menu_cs'           },
    { title: '🔙 Menu Utama',       value: 'goto_main'         },
  ],
};

const MENU_KAFE = {
  text:
    '☕ *Kafe SapaTamu*\n\n' +
    'Kami buka setiap hari 07.00 – 22.00 WIB.\n\n' +
    'Pilih layanan:',
  items: [
    { title: '📋 Menu & Harga',     value: 'kafe_menu'      },
    { title: '🪑 Reservasi Meja',   value: 'kafe_reservasi' },
    { title: '🎧 Customer Service', value: 'menu_cs'        },
    { title: '🔙 Menu Utama',       value: 'goto_main'      },
  ],
};

// Tombol follow-up setelah AI menjawab
const TOMBOL_LANJUT = [
  { title: '🔄 Tanya Lagi',           value: 'ai_tanya_lagi'  },
  { title: '👨‍💼 Hubungi Staf Manusia', value: 'escalate_human' },
  { title: '🔙 Menu Utama',           value: 'goto_main'      },
];

// ─── STATIC REPLY TEXTS ───────────────────────────────────────────────────────

const STATIC = {
  hotel_reservasi:
    '🛏️ *Reservasi Kamar Hotel*\n\n' +
    'Silakan kirim data reservasi:\n\n' +
    '*Format:* Nama / Tipe Kamar / Check-in / Check-out / Jumlah Tamu\n\n' +
    '_Contoh: Budi / Deluxe / 10 Agustus / 12 Agustus / 2 orang_\n\n' +
    '📌 Harga Kamar:\n' +
    '• Deluxe Room        — Rp 550.000/malam\n' +
    '• Executive Suite    — Rp 950.000/malam\n' +
    '• Presidential Suite — Rp 1.800.000/malam\n\n' +
    '_Harga sudah termasuk sarapan 2 orang._\n\n' +
    'Tim kami akan mengkonfirmasi ketersediaan. 🙏',

  hotel_fasilitas:
    'ℹ️ *Fasilitas Hotel SapaTamu*\n\n' +
    '🏊 Kolam Renang     : 06.00 – 21.00\n' +
    '💪 Gym              : 05.00 – 22.00\n' +
    '🍽️ Restoran         : 06.00 – 22.00\n' +
    '🕐 Check-In         : 14.00 WIB\n' +
    '🕛 Check-Out        : 12.00 WIB\n' +
    '📶 WiFi             : Gratis di seluruh area\n' +
    '🅿️ Parkir           : Gratis\n' +
    '🛎️ Room Service     : 24 jam\n' +
    '👔 Laundry Express  : Tersedia\n\n' +
    'Ada pertanyaan lain? Ketik saja! 😊',

  hotel_roomservice:
    '🍽️ *Room Service SapaTamu*\n\n' +
    'Room Service tersedia 24 jam.\n\n' +
    'Silakan ketik pesanan Anda atau hubungi resepsionis di ext. 100.\n\n' +
    '_Staf kami akan menghubungi Anda untuk konfirmasi._',

  kafe_menu:
    '📋 *Menu Kafe SapaTamu*\n\n' +
    '☕ *Minuman:*\n' +
    '• Espresso / Americano    — Rp 22.000\n' +
    '• Caffe Latte / Cappuccino — Rp 28.000\n' +
    '• Matcha Latte             — Rp 25.000\n' +
    '• Es Teh / Jeruk Peras    — Rp 15.000\n\n' +
    '🥐 *Makanan:*\n' +
    '• Butter Croissant        — Rp 20.000\n' +
    '• Roti Bakar Spesial      — Rp 18.000\n' +
    '• Spaghetti Carbonara     — Rp 45.000\n' +
    '• Nasi Goreng Spesial     — Rp 35.000\n\n' +
    'Ketik menu yang ingin dipesan! 🛎️',

  kafe_reservasi:
    '🪑 *Reservasi Meja Kafe*\n\n' +
    'Silakan kirim data reservasi:\n\n' +
    '*Format:* Nama / Jumlah Orang / Tanggal / Jam\n\n' +
    '_Contoh: Siti / 4 orang / 10 Agustus / 19.00_\n\n' +
    'Tim kami akan mengkonfirmasi reservasi Anda. 🙏',
};

// ─── BUTTON ACTION MATCHER ────────────────────────────────────────────────────

function detectButtonAction(content) {
  const t     = content.trim();
  const lower = t.toLowerCase();

  // Cek value persis (untuk test manual)
  const VALUE_MAP = {
    'menu_kafe':        'menu_kafe',
    'menu_hotel':       'menu_hotel',
    'menu_cs':          'menu_cs',
    'hotel_reservasi':  'hotel_reservasi',
    'hotel_fasilitas':  'hotel_fasilitas',
    'hotel_roomservice':'hotel_roomservice',
    'kafe_menu':        'kafe_menu',
    'kafe_reservasi':   'kafe_reservasi',
    'goto_main':        'goto_main',
    'escalate_human':   'escalate_human',
    'ai_tanya_lagi':    'ai_tanya_lagi',
  };
  if (VALUE_MAP[t] || VALUE_MAP[lower]) return VALUE_MAP[t] || VALUE_MAP[lower];

  // ── Matching case-insensitive (tombol klik + natural language commands) ─────

  // CS / escalate
  if (lower.includes('customer service'))                          return 'menu_cs';
  if (lower.includes('hubungi staf') || lower.includes('staf manusia') ||
      (lower.includes('staf') && lower.includes('manusia')))      return 'escalate_human';

  // Hotel submenus (cek spesifik dulu sebelum generic 'hotel')
  if (lower.includes('reservasi') && lower.includes('kamar'))     return 'hotel_reservasi';
  if (lower.includes('reservasi kamar'))                          return 'hotel_reservasi';
  if (lower.includes('room service'))                             return 'hotel_roomservice';
  if ((lower.includes('info') || lower.includes('fasilitas')) &&
      (lower.includes('hotel') || lower.includes('fasilitas')))   return 'hotel_fasilitas';
  if (lower === 'fasilitas' || lower === 'info & fasilitas')      return 'hotel_fasilitas';

  // Kafe submenus
  if (lower.includes('reservasi meja') || lower.includes('reservasi') && lower.includes('meja')) return 'kafe_reservasi';
  if ((lower.includes('menu') && lower.includes('harga')) ||
      lower === 'menu & harga')                                   return 'kafe_menu';

  // Hotel menu (generic) — case-insensitive, natural language
  if ((lower.includes('hotel') || lower.includes('menu hotel') ||
       lower.includes('tampilkan hotel')) &&
      !lower.includes('customer') && !lower.includes('room service')) return 'menu_hotel';

  // Kafe menu (generic) — case-insensitive, natural language
  if ((lower.includes('kafe') || lower.includes('menu kafe') ||
       lower.includes('cafe') || lower.includes('tampilkan kafe')) &&
      !lower.includes('customer'))                                return 'menu_kafe';

  // Menu utama / kembali
  if (lower === 'menu' || lower === 'tampilkan menu' || lower === 'menu utama' ||
      lower.includes('menu utama') || lower.includes('kembali ke menu') ||
      lower.includes('🔙'))                                       return 'goto_main';

  // Tanya lagi
  if (lower.includes('tanya lagi') || lower.includes('tanya'))   return 'ai_tanya_lagi';

  return null; // bukan tombol/command — free text untuk AI
}

// ─── GREETING DETECTION ───────────────────────────────────────────────────────

function isGreeting(content) {
  const lower = content.toLowerCase().trim();
  const greetings = ['halo', 'hai', 'hi', 'hello', 'start', 'mulai', 'menu', 'selamat'];
  return greetings.some(g => lower === g || lower.startsWith(g + ' '));
}

// ─── HELPER: Balas AI + tombol lanjut ────────────────────────────────────────

async function replyAI(convId, content) {
  // Cek keyword darurat sebelum kirim ke AI
  const lower = content.toLowerCase();
  if (lower.includes('darurat') || lower.includes('alergi') || lower.includes('komplain')) {
    await eksekusiEskalasi(convId, 'darurat_keyword',
      '🚨 Kami segera menghubungkan Anda dengan staf. Mohon tunggu 🙏');
    return;
  }
  if (lower.includes('staf') || lower.includes('manusia') || lower.includes('orang asli')) {
    await eksekusiEskalasi(convId, 'minta_staf_keyword',
      '👨‍💼 Menghubungkan Anda ke staf kami, mohon tunggu... 🙏');
    return;
  }
  if (cekEskalasi(content, config.escalationKeywords)) {
    await eksekusiEskalasi(convId, 'eskalasi_keyword');
    return;
  }

  console.log(`🤖 [AI] Bertanya untuk Conv ${convId}: "${content.substring(0, 50)}"`);
  const aiResp = await jawab(content);

  if (aiResp.alasan === 'ai_down') {
    // 9router/AI sedang mati — tampilkan pesan fallback + tawarkan staf
    console.error(`⏰ [AI DOWN] Conv ${convId} — AI tidak tersedia, tampilkan fallback`);
    await sendMessage(convId,
      '⚠️ *Maaf, asisten AI sedang tidak tersedia saat ini.*\n\n' +
      'Anda bisa:\n' +
      '• Coba tanya lagi dalam beberapa saat\n' +
      '• Atau langsung hubungi staf kami'
    );
    await sendMenuMessage(convId, 'Pilih opsi:', [
      { title: '🔄 Coba Lagi',           value: 'ai_tanya_lagi'  },
      { title: '👨‍💼 Hubungi Staf',        value: 'escalate_human' },
      { title: '🔙 Menu Utama',           value: 'goto_main'      },
    ]);
  } else if (aiResp.eskalasi === true) {
    const customReply = aiResp.alasan === 'minta_manusia'
      ? '👨‍💼 *Dialihkan ke Staf Manusia:*\n\nMenghubungkan Anda ke staf kami... 🙏'
      : '🤔 *Pertanyaan ini perlu ditangani oleh staf kami.*\n\nMohon tunggu, kami segera menghubungkan... 🙏';
    await eksekusiEskalasi(convId, aiResp.alasan || 'ai_eskalasi', customReply);
  } else if (aiResp.jawaban) {
    await sendMessage(convId, `🤖 *Dijawab oleh AI:*\n\n${aiResp.jawaban}`);
    await sendMenuMessage(convId, '💬 _Masih ada pertanyaan?_', TOMBOL_LANJUT);
  }
}

// ─── MAIN WEBHOOK HANDLER ─────────────────────────────────────────────────────

router.post('/', async (req, res) => {
  res.status(200).json({ status: 'received' });

  const body = req.body;
  if (!body) return;

  const event      = body.event;
  const convId     = body.conversation?.id || body.id;
  const content    = (body.content || '').trim();
  const msgType    = body.message_type;
  const convStatus = body.conversation?.status;

  console.log(`\n📨 [CHATWOOT] Event: ${event} | Conv: ${convId}`);

  // ── Reset session saat percakapan di-resolve / reopen ─────────────────────
  if (event === 'conversation_resolved' || event === 'conversation_status_changed') {
    if (convStatus === 'resolved' && convId) {
      console.log(`♻️ [SESSION] Conv ${convId} resolved → kirim notif penutup + menu`);
      setStatus(convId, 'ai_active');

      // 1. Notifikasi penutup dari bot
      await sendMessage(convId,
        '✅ *Percakapan dengan staf kami telah selesai.*\n\n' +
        'Terima kasih telah menghubungi SapaTamu! 😊\n' +
        'Semoga kami dapat membantu Anda kembali.'
      ).catch(() => {});

      // 2. Tampilkan menu utama kembali
      await sendMenuMessage(convId,
        '🤖 *Bot SapaTamu aktif kembali.*\nAda lagi yang bisa kami bantu?',
        MENU_UTAMA.items
      ).catch(() => {});

    } else if ((convStatus === 'pending' || convStatus === 'open') && convId) {
      // Staff reopen / pending → bot ambil alih lagi
      const curStatus = getStatus(convId);
      if (curStatus === 'escalated') {
        console.log(`🔄 [SESSION] Conv ${convId} reopened → reset ke ai_active`);
        setStatus(convId, 'ai_active');
        sendMessage(convId,
          '🤖 *Bot SapaTamu kembali aktif!*\n\n' +
          'Ketik pertanyaan Anda atau pilih menu:'
        ).catch(() => {});
        sendMenuMessage(convId, '', MENU_UTAMA.items).catch(() => {});
      }
    }
    return;
  }

  // Hanya proses message_created incoming
  if (event !== 'message_created' || msgType !== 'incoming') return;
  if (!content || !convId) return;

  const session = getStatus(convId);
  console.log(`📊 [SESSION] Conv ${convId} | Status: ${session} | Pesan: "${content.substring(0, 40)}"`);

  try {

    // ═══ STATE: escalated ════════════════════════════════════════════════════
    if (session === 'escalated') {
      console.log(`⏸️ [SESSION] Conv ${convId} sedang ditangani staf, AI diam.`);
      return;
    }

    // ═══ STATE: idle ═════════════════════════════════════════════════════════
    if (session === 'idle') {
      console.log(`🚀 [SESSION] Conv ${convId} idle → ai_active`);
      setStatus(convId, 'ai_active');

      if (isGreeting(content) || detectButtonAction(content)) {
        // Salam biasa → kirim welcome + menu
        await sendMenuMessage(convId, MENU_UTAMA.text, MENU_UTAMA.items);
      } else {
        // Free text langsung → kirim welcome singkat + AI jawab pertanyaannya
        await sendMenuMessage(convId,
          '👋 *Selamat Datang di SapaTamu!*\n\n' +
          'Halo! Saya asisten virtual SapaTamu. Izinkan saya menjawab pertanyaan Anda:',
          MENU_UTAMA.items
        );
        await replyAI(convId, content);
      }
      return;
    }

    // ═══ STATE: ai_active ═══════════════════════════════════════════════════
    if (session === 'ai_active') {
      const action = detectButtonAction(content);

      // ── Tombol diklik → BOT handles (submenu static) ──────────────────────
      if (action) {
        console.log(`🔘 [BUTTON] Conv ${convId} | Action: ${action}`);

        switch (action) {
          case 'menu_kafe':
            await sendMenuMessage(convId, MENU_KAFE.text, MENU_KAFE.items);
            return;

          case 'menu_hotel':
            await sendMenuMessage(convId, MENU_HOTEL.text, MENU_HOTEL.items);
            return;

          case 'menu_cs':
          case 'escalate_human':
            // CS button → langsung ke human
            await eksekusiEskalasi(convId, 'tombol_cs',
              '👨‍💼 *Menghubungkan ke Staf Manusia...*\n\n' +
              'Staf kami akan segera membalas. Mohon tunggu sebentar 🙏');
            return;

          case 'hotel_reservasi':
            await sendMessage(convId, STATIC.hotel_reservasi);
            return;

          case 'hotel_fasilitas':
            await sendMessage(convId, STATIC.hotel_fasilitas);
            return;

          case 'hotel_roomservice':
            await sendMessage(convId, STATIC.hotel_roomservice);
            return;

          case 'kafe_menu':
            await sendMessage(convId, STATIC.kafe_menu);
            return;

          case 'kafe_reservasi':
            await sendMessage(convId, STATIC.kafe_reservasi);
            return;

          case 'goto_main':
            await sendMenuMessage(convId, MENU_UTAMA.text, MENU_UTAMA.items);
            return;

          case 'ai_tanya_lagi':
            await sendMessage(convId, '💬 Silakan ketik pertanyaan Anda:');
            return;

          default:
            await sendMenuMessage(convId, MENU_UTAMA.text, MENU_UTAMA.items);
            return;
        }
      }

      // ── Free text → cek greeting dulu, baru AI ───────────────────────────
      console.log(`🤖 [AI MODE] Conv ${convId} — free text → AI`);

      // Kalau user kirim ulang salam → cukup tampilkan menu lagi
      if (isGreeting(content)) {
        await sendMenuMessage(convId,
          '😊 Halo lagi! Silakan pilih layanan yang Anda butuhkan:',
          MENU_UTAMA.items
        );
        return;
      }

      await replyAI(convId, content);
      return;
    }

  } catch (err) {
    console.error(`❌ [WEBHOOK ERROR] Conv ${convId}:`, err.message || err);
  }
});

router.post('/status', (req, res) => res.json({ status: 'ok', version: '3.0-hybrid' }));

module.exports = router;
