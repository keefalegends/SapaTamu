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
    { title: '☕ Kafe',            value: 'menu_kafe'   },
    { title: '🏨 Hotel',           value: 'menu_hotel'  },
    { title: '🎧 Customer Service', value: 'menu_cs'     },
  ],
};

const MENU_HOTEL = {
  text:
    '🏨 *Hotel SapaTamu*\n\n' +
    'Saya siap membantu kebutuhan hotel Anda.\n\n' +
    'Pilih layanan:',
  items: [
    { title: '🛏️ Reservasi Kamar',    value: 'hotel_reservasi'   },
    { title: 'ℹ️ Info & Fasilitas',   value: 'hotel_fasilitas'   },
    { title: '🍽️ Room Service',       value: 'hotel_roomservice' },
    { title: '🎧 Customer Service',   value: 'menu_cs'           },
    { title: '🔙 Menu Utama',         value: 'goto_main'         },
  ],
};

const MENU_KAFE = {
  text:
    '☕ *Kafe SapaTamu*\n\n' +
    'Kami buka setiap hari 07.00 – 22.00 WIB.\n\n' +
    'Pilih layanan:',
  items: [
    { title: '📋 Menu & Harga',       value: 'kafe_menu'         },
    { title: '🪑 Reservasi Meja',     value: 'kafe_reservasi'    },
    { title: '🎧 Customer Service',   value: 'menu_cs'           },
    { title: '🔙 Menu Utama',         value: 'goto_main'         },
  ],
};

const MENU_CS_AI = {
  text:
    '🎧 *Customer Service SapaTamu*\n\n' +
    'Halo! Saya AI asisten CS SapaTamu.\n' +
    'Silakan tanyakan apa saja — saya akan bantu sebaik mungkin! 🤖\n\n' +
    'Atau jika ingin berbicara langsung dengan staf kami:',
  items: [
    { title: '👨‍💼 Hubungi Staf Manusia', value: 'escalate_human' },
    { title: '🔙 Menu Utama',            value: 'goto_main'      },
  ],
};

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
    '🕐 Check-In: 14.00 | Check-Out: 12.00\n' +
    '🏊 Kolam Renang: 06.00 – 21.00\n' +
    '🍽️ Restoran: 06.00 – 22.00\n' +
    '💪 Gym: 05.00 – 22.00\n' +
    '📶 WiFi gratis di seluruh area\n' +
    '🅿️ Parkir gratis\n' +
    '🛎️ Room Service 24 jam\n' +
    '👔 Laundry express\n\n' +
    'Ada pertanyaan lain? Pilih Customer Service! 😊',

  hotel_roomservice:
    '🍽️ *Room Service SapaTamu*\n\n' +
    'Room Service tersedia 24 jam.\n\n' +
    'Silakan ketik pesanan Anda atau hubungi resepsionis di ext. 100.\n\n' +
    '_Staf kami akan menghubungi Anda untuk konfirmasi._',

  kafe_menu:
    '📋 *Menu Kafe SapaTamu*\n\n' +
    '☕ *Minuman:*\n' +
    '• Espresso / Americano   — Rp 22.000\n' +
    '• Caffe Latte / Cappuccino — Rp 28.000\n' +
    '• Matcha Latte           — Rp 25.000\n' +
    '• Es Teh / Jeruk Peras   — Rp 15.000\n\n' +
    '🥐 *Makanan:*\n' +
    '• Butter Croissant       — Rp 20.000\n' +
    '• Roti Bakar Spesial     — Rp 18.000\n' +
    '• Spaghetti Carbonara    — Rp 45.000\n' +
    '• Nasi Goreng Spesial    — Rp 35.000\n\n' +
    'Ketik menu yang ingin dipesan! 🛎️',

  kafe_reservasi:
    '🪑 *Reservasi Meja Kafe*\n\n' +
    'Silakan kirim data reservasi:\n\n' +
    '*Format:* Nama / Jumlah Orang / Tanggal / Jam\n\n' +
    '_Contoh: Siti / 4 orang / 10 Agustus / 19.00_\n\n' +
    'Tim kami akan mengkonfirmasi reservasi Anda. 🙏',
};

// ─── BUTTON ACTION MATCHER ────────────────────────────────────────────────────
// Chatwoot kirim JUDUL tombol (title) sebagai content, bukan value.
// Matching pakai substring yang paling unik dari setiap judul.

function detectButtonAction(content) {
  const t = content.trim();
  // Cek value persis dulu (untuk test manual)
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
  };
  if (VALUE_MAP[t]) return VALUE_MAP[t];

  // Cek title (yang dikirim Chatwoot)
  if (t.includes('Kafe'))                        return 'menu_kafe';
  if (t.includes('Hotel'))                       return 'menu_hotel';
  if (t.includes('Customer Service'))            return 'menu_cs';
  if (t.includes('Reservasi Kamar') || t.includes('Reservasi') && t.includes('Kamar')) return 'hotel_reservasi';
  if (t.includes('Info') && t.includes('Fasilitas') || t.includes('Fasilitas')) return 'hotel_fasilitas';
  if (t.includes('Room Service'))                return 'hotel_roomservice';
  if (t.includes('Menu') && t.includes('Harga') || t.includes('Menu & Harga')) return 'kafe_menu';
  if (t.includes('Reservasi Meja'))              return 'kafe_reservasi';
  if (t.includes('Staf Manusia') || t.includes('Staf') && t.includes('Manusia')) return 'escalate_human';
  if (t.includes('Menu Utama') || t.includes('Kembali') || t.includes('🔙')) return 'goto_main';
  if (t.includes('Tanya Lagi') || t.includes('Tanya') && t.includes('Lagi'))  return 'cs_ai_continue';

  return null; // bukan tombol
}

// ─── TRIGGER DETECTION ────────────────────────────────────────────────────────

function isGreetingTrigger(content) {
  const lower = content.toLowerCase().trim();
  const triggers = ['halo', 'hai', 'hi', 'hello', 'start', 'mulai', 'menu', 'bantuan', 'cs'];
  return triggers.some(t => lower.includes(t));
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

  // ── Reset session saat percakapan di-resolve / pending / reopen ────────────
  if (event === 'conversation_resolved' || event === 'conversation_status_changed') {
    if (convStatus === 'resolved' && convId) {
      // Staff selesai / resolve → reset total ke idle
      console.log(`♻️ [SESSION] Conv ${convId} resolved → reset idle`);
      setStatus(convId, 'idle');
    } else if ((convStatus === 'pending' || convStatus === 'open') && convId) {
      // Staff reopen / pending → bot ambil alih lagi dari menu
      const curStatus = getStatus(convId);
      if (curStatus === 'escalated') {
        console.log(`🔄 [SESSION] Conv ${convId} reopened → reset ke menu (bot ambil alih)`);
        setStatus(convId, 'menu');
        // Kirim pesan bahwa bot aktif kembali
        sendMessage(convId,
          '🤖 Bot SapaTamu kembali aktif!\n\n' +
          'Ketik apa saja untuk kembali ke menu utama.'
        ).catch(() => {});
      }
    }
    return;
  }

  // ── Hanya proses message_created incoming ─────────────────────────────────
  if (event !== 'message_created' || msgType !== 'incoming') return;
  if (!content || !convId) return;

  const session = getStatus(convId);
  console.log(`📊 [SESSION] Conv ${convId} | Status: ${session} | Pesan: "${content.substring(0, 40)}"`);

  try {
    // ═══ STATE: idle ═══════════════════════════════════════════════════════
    if (session === 'idle') {
      if (isGreetingTrigger(content)) {
        console.log(`🚀 [SESSION] Conv ${convId} idle → menu`);
        setStatus(convId, 'menu');
        await sendMenuMessage(convId, MENU_UTAMA.text, MENU_UTAMA.items);
      }
      // Pesan lain di idle diabaikan
      return;
    }

    // ═══ STATE: escalated ══════════════════════════════════════════════════
    if (session === 'escalated') {
      console.log(`⏸️ [SESSION] Conv ${convId} sedang ditangani staf, AI diam.`);
      return;
    }

    // ═══ STATE: menu ═══════════════════════════════════════════════════════
    if (session === 'menu') {
      const action = detectButtonAction(content);
      console.log(`🔘 [MENU] Conv ${convId} | Detected action: ${action || 'none'}`);

      if (action) {
        switch (action) {
          case 'menu_kafe':
            await sendMenuMessage(convId, MENU_KAFE.text, MENU_KAFE.items);
            return;

          case 'menu_hotel':
            await sendMenuMessage(convId, MENU_HOTEL.text, MENU_HOTEL.items);
            return;

          case 'menu_cs':
            // Naik ke mode CS AI
            console.log(`🎧 [SESSION] Conv ${convId} menu → cs_ai`);
            setStatus(convId, 'cs_ai');
            await sendMenuMessage(convId, MENU_CS_AI.text, MENU_CS_AI.items);
            return;

          case 'goto_main':
            await sendMenuMessage(convId, MENU_UTAMA.text, MENU_UTAMA.items);
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

          default:
            await sendMenuMessage(convId, MENU_UTAMA.text, MENU_UTAMA.items);
            return;
        }
      }

      // Bukan tombol — cek keyword darurat, lalu tawarin menu utama
      const lower = content.toLowerCase();
      if (lower.includes('darurat') || lower.includes('alergi')) {
        await eksekusiEskalasi(convId, 'darurat_keyword',
          '🚨 Kami segera menghubungkan Anda dengan staf. Mohon tunggu 🙏');
        return;
      }

      // Teks bebas di mode menu → redirect ke menu utama
      await sendMenuMessage(convId,
        '😊 Silakan gunakan menu di bawah untuk melanjutkan:',
        MENU_UTAMA.items);
      return;
    }

    // ═══ STATE: cs_ai ══════════════════════════════════════════════════════
    if (session === 'cs_ai') {
      // Cek tombol khusus
      const action = detectButtonAction(content);

      if (action === 'escalate_human') {
        await eksekusiEskalasi(convId, 'tombol_staf_manusia',
          '👨‍💼 Menghubungkan Anda ke staf kami, mohon tunggu sebentar... 🙏');
        return;
      }
      if (action === 'goto_main') {
        console.log(`🔙 [SESSION] Conv ${convId} cs_ai → menu`);
        setStatus(convId, 'menu');
        await sendMenuMessage(convId, MENU_UTAMA.text, MENU_UTAMA.items);
        return;
      }
      if (action === 'cs_ai_continue') {
        // User klik "Tanya Lagi" — tetap di cs_ai, tampilkan prompt
        await sendMessage(convId, '💬 Silakan ketik pertanyaan Anda berikutnya:');
        return;
      }

      // Keyword darurat
      const lower = content.toLowerCase();
      if (lower.includes('darurat') || lower.includes('alergi')) {
        await eksekusiEskalasi(convId, 'darurat_cs_ai',
          '🚨 Darurat terdeteksi! Menghubungkan ke staf segera... 🙏');
        return;
      }
      if (lower.includes('staf') || lower.includes('manusia') || lower.includes('orang asli')) {
        await eksekusiEskalasi(convId, 'minta_staf_keyword',
          '👨‍💼 Menghubungkan Anda ke staf kami, mohon tunggu... 🙏');
        return;
      }

      // Keyword eskalasi umum
      if (cekEskalasi(content, config.escalationKeywords)) {
        await eksekusiEskalasi(convId, 'eskalasi_keyword');
        return;
      }

      // 🤖 Tanya AI Gemini
      console.log(`🤖 [AI] Bertanya Gemini untuk Conv ${convId}: "${content.substring(0, 50)}"`);
      const aiResp = await jawab(content);

      if (aiResp.eskalasi === true) {
        const customReply = aiResp.alasan === 'minta_manusia'
          ? '👨‍💼 Menghubungkan Anda ke staf kami... 🙏'
          : '🤔 Pertanyaan ini perlu ditangani oleh staf kami. Mohon tunggu 🙏';
        await eksekusiEskalasi(convId, aiResp.alasan || 'ai_eskalasi', customReply);
      } else if (aiResp.jawaban) {
        // Kirim jawaban AI + tampilkan tombol lanjut
        await sendMessage(convId, aiResp.jawaban);
        await sendMenuMessage(convId,
          '💬 _Masih ada pertanyaan?_',
          [
            { title: '🔄 Tanya Lagi',           value: 'cs_ai_tanya' },
            { title: '👨‍💼 Hubungi Staf Manusia', value: 'escalate_human' },
            { title: '🔙 Menu Utama',            value: 'goto_main' },
          ]
        );
      }
      return;
    }

  } catch (err) {
    console.error(`❌ [WEBHOOK ERROR] Conv ${convId}:`, err.message || err);
  }
});

// ─── KEEP ALIVE: reset session saat resolved (event kedua) ───────────────────
router.post('/status', (req, res) => res.json({ status: 'ok' }));

module.exports = router;
