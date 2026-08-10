const express  = require('express');
const router   = express.Router();
const config   = require('../config/env');

const { getStatus, setStatus }  = require('../session/manager');
const { isCsEntry }             = require('../session/entryDetector');
const { cekEskalasi }           = require('../escalation/detector');
const { eksekusiEskalasi }      = require('../escalation/service');
const { jawab }                 = require('../ai/handler');
const {
  sendMessage,
  sendMenuMessage,
} = require('../chatwoot/client');

// ─── DEFINISI MENU ────────────────────────────────────────────────────────────

const MENU_UTAMA_TEXT = (
  '*Selamat Datang di WazapBro* 👋\n\n' +
  'Halo! Saya asisten virtual SapaTamu, siap bantu Anda 24/7.\n\n' +
  'Silakan pilih layanan:\n\n' +
  '_Ketik "staf" kapan saja untuk bicara langsung dengan CS_'
);
const MENU_UTAMA_ITEMS = [
  { title: '☕ Kafe',           value: 'pilih_kafe'   },
  { title: '🏨 Hotel',          value: 'pilih_hotel'  },
  { title: '💬 Bicara Staf',    value: 'bicara_staf'  },
];

const MENU_HOTEL_TEXT = (
  '*Selamat Datang di Hotel SapaTamu* 🏨\n\n' +
  'Saya bisa bantu reservasi, info fasilitas, atau room service.\n\n' +
  '_Ketik "darurat" untuk penanganan segera_'
);
const MENU_HOTEL_ITEMS = [
  { title: '🛏️ Reservasi Kamar',   value: 'hotel_reservasi'  },
  { title: 'ℹ️ Info Fasilitas',    value: 'hotel_fasilitas'  },
  { title: '🍽️ Room Service',      value: 'hotel_roomservice'},
  { title: '💬 Bicara Staf',       value: 'bicara_staf'      },
];

const MENU_KAFE_TEXT = (
  '*Selamat Datang di Kafe SapaTamu* ☕\n\n' +
  'Saya bisa bantu reservasi meja, info menu, atau pesanan khusus.'
);
const MENU_KAFE_ITEMS = [
  { title: '🪑 Reservasi Meja',    value: 'kafe_reservasi'  },
  { title: '📋 Lihat Menu & Harga',value: 'kafe_menu'       },
  { title: '💬 Bicara Staf',       value: 'bicara_staf'     },
];

// ─── CALLBACK ACTION MAP ──────────────────────────────────────────────────────

const CALLBACK_ACTIONS = {
  pilih_kafe:         'menu_kafe',
  pilih_hotel:        'menu_hotel',
  bicara_staf:        'escalate_staf',
  hotel_reservasi:    'msg_hotel_reservasi',
  hotel_fasilitas:    'msg_hotel_fasilitas',
  hotel_roomservice:  'msg_hotel_roomservice',
  kafe_reservasi:     'msg_kafe_reservasi',
  kafe_menu:          'msg_kafe_menu',
};

// ─── TEKS RESPONS STATIS ──────────────────────────────────────────────────────

const STATIC_REPLIES = {
  msg_hotel_reservasi: (
    '🛏️ *Reservasi Kamar Hotel*\n\n' +
    'Silakan kirim data reservasi dengan format:\n\n' +
    '*Nama / Tipe Kamar / Check-in / Check-out / Jumlah Tamu*\n\n' +
    'Contoh:\n_Budi / Deluxe / 10 Agustus / 12 Agustus / 2 orang_\n\n' +
    'Tim kami akan segera mengkonfirmasi ketersediaan kamar.'
  ),
  msg_hotel_fasilitas: (
    'ℹ️ *Fasilitas Hotel SapaTamu*\n\n' +
    '🕐 Check-In: 14.00 | Check-Out: 12.00\n' +
    '🏊 Kolam Renang: 06.00–21.00\n' +
    '🍽️ Restoran: 06.00–22.00\n' +
    '💪 Gym: 05.00–22.00\n' +
    '📶 WiFi gratis di seluruh area\n' +
    '🅿️ Parkir gratis\n' +
    '🛎️ Room Service 24 jam\n\n' +
    'Ada yang ingin ditanyakan lebih lanjut? Ketik pertanyaan Anda!'
  ),
  msg_hotel_roomservice: (
    '🍽️ *Room Service SapaTamu*\n\n' +
    'Room Service tersedia 24 jam.\n\n' +
    'Silakan ketik pesanan Anda atau hubungi resepsionis di ext. 100.\n\n' +
    '_Staf kami akan menghubungi Anda untuk konfirmasi._'
  ),
  msg_kafe_reservasi: (
    '🪑 *Reservasi Meja Kafe*\n\n' +
    'Silakan kirim data reservasi dengan format:\n\n' +
    '*Nama / Jumlah Orang / Tanggal / Jam*\n\n' +
    'Contoh:\n_Siti / 4 orang / 10 Agustus / 19.00_\n\n' +
    'Tim kami akan mengkonfirmasi reservasi Anda.'
  ),
  msg_kafe_menu: (
    '📋 *Menu Kafe SapaTamu*\n\n' +
    '☕ *Minuman:*\n' +
    '• Espresso / Americano  — Rp 22.000\n' +
    '• Caffe Latte / Cappuccino — Rp 28.000\n' +
    '• Matcha Latte          — Rp 25.000\n' +
    '• Es Teh / Jeruk Peras  — Rp 15.000\n\n' +
    '🥐 *Makanan:*\n' +
    '• Butter Croissant      — Rp 20.000\n' +
    '• Roti Bakar Spesial    — Rp 18.000\n' +
    '• Spaghetti Carbonara   — Rp 45.000\n' +
    '• Nasi Goreng Spesial   — Rp 35.000\n\n' +
    'Ketik menu yang ingin dipesan!'
  ),
};

// ─── WEBHOOK HANDLER ──────────────────────────────────────────────────────────

/**
 * POST /webhook/chatwoot
 * Menerima event dari Chatwoot Agent Bot
 */
router.post('/', async (req, res) => {
  // Balas cepat ke Chatwoot agar tidak timeout
  res.status(200).json({ status: 'received' });

  const body = req.body;
  if (!body) return;

  const event       = body.event;
  const conversation = body.conversation || {};
  const convId      = conversation.id || body.id;

  console.log(`\n📨 [CHATWOOT WEBHOOK] Event: ${event} | Conv: ${convId}`);

  // ── Reset session jika percakapan di-resolve ─────────────────────────────
  if (event === 'conversation_resolved' || event === 'conversation_status_changed') {
    const status = body.status || conversation.status;
    if (status === 'resolved' && convId) {
      console.log(`♻️ [SESSION] Conv ${convId} resolved → reset ke idle`);
      setStatus(convId, 'idle');
    }
    return;
  }

  // ── Hanya proses event message_created incoming ───────────────────────────
  if (event !== 'message_created' || body.message_type !== 'incoming') return;

  const content = (body.content || '').trim();
  if (!content || !convId) return;

  const sessionStatus = getStatus(convId);
  console.log(`📊 [SESSION] Conv ${convId} status: ${sessionStatus} | Pesan: "${content}"`);

  try {
    // ── STATE: idle ────────────────────────────────────────────────────────
    if (sessionStatus === 'idle') {
      if (isCsEntry(content) || content === '/start') {
        console.log(`🚀 [SESSION] Conv ${convId} → cs_active`);
        setStatus(convId, 'cs_active');
        await sendMenuMessage(convId, MENU_UTAMA_TEXT, MENU_UTAMA_ITEMS);
      }
      // Pesan lain di state idle diabaikan
      return;
    }

    // ── STATE: escalated ───────────────────────────────────────────────────
    if (sessionStatus === 'escalated') {
      console.log(`⏸️ [SESSION] Conv ${convId} sedang ditangani staf, AI diam.`);
      return;
    }

    // ── STATE: cs_active ──────────────────────────────────────────────────
    if (sessionStatus === 'cs_active') {
      const contentLower = content.toLowerCase();

      // 1. Cek apakah ini callback tombol menu
      if (CALLBACK_ACTIONS[content]) {
        const action = CALLBACK_ACTIONS[content];
        console.log(`🔘 [CALLBACK] Action: ${action}`);

        if (action === 'menu_kafe') {
          await sendMenuMessage(convId, MENU_KAFE_TEXT, MENU_KAFE_ITEMS);
        } else if (action === 'menu_hotel') {
          await sendMenuMessage(convId, MENU_HOTEL_TEXT, MENU_HOTEL_ITEMS);
        } else if (action === 'escalate_staf') {
          await eksekusiEskalasi(convId, 'tombol_cs', '💬 Menghubungkan Anda ke staf kami, mohon tunggu sebentar...');
        } else if (STATIC_REPLIES[action]) {
          await sendMessage(convId, STATIC_REPLIES[action]);
        }
        return;
      }

      // 2. Cek keyword darurat/staf langsung
      if (contentLower.includes('darurat') || contentLower.includes('alergi')) {
        await eksekusiEskalasi(convId, 'keyword_darurat', '🚨 Kami segera menghubungkan Anda dengan staf. Mohon tunggu 🙏');
        return;
      }
      if (contentLower.includes('staf') || contentLower.includes('manusia') || contentLower.includes('cs')) {
        await eksekusiEskalasi(convId, 'keyword_staf', '💬 Menghubungkan Anda ke staf kami, mohon tunggu sebentar...');
        return;
      }

      // 3. Cek keyword eskalasi umum
      if (cekEskalasi(content, config.escalationKeywords)) {
        await eksekusiEskalasi(convId, 'keyword_eskalasi');
        return;
      }

      // 4. Tanya AI Gemini
      console.log(`🤖 [AI] Menanyakan Gemini untuk: "${content}"`);
      const aiResponse = await jawab(content);

      if (aiResponse.eskalasi === true) {
        const customReply = aiResponse.alasan === 'minta_manusia'
          ? '💬 Menghubungkan Anda ke staf kami, mohon tunggu sebentar...'
          : null;
        await eksekusiEskalasi(convId, aiResponse.alasan || 'ai_decision', customReply);
      } else if (aiResponse.jawaban) {
        await sendMessage(convId, aiResponse.jawaban);
      }
    }

  } catch (err) {
    console.error(`❌ [WEBHOOK ERROR] Conv ${convId}:`, err.message || err);
  }
});

// ─── META WEBHOOK VERIFICATION (tetap ada untuk Chatwoot setup) ───────────────
router.get('/meta', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === config.verifyToken) {
    console.log('✅ [Meta Webhook] Verified!');
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

module.exports = router;
