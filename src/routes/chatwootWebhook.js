const express  = require('express');
const router   = express.Router();
const config   = require('../config/env');
const fs       = require('fs');
const path     = require('path');

const { getStatus, setStatus, getDraft, setDraft, clearDraft } = require('../session/manager');
const { cekEskalasi }          = require('../escalation/detector');
const { eksekusiEskalasi }     = require('../escalation/service');
const { jawab, parseBookingInput } = require('../ai/handler');
const { sendMessage, sendMenuMessage, sendImageMessage } = require('../chatwoot/client');
const {
  ROOM_CATALOG,
  formatRupiah,
  findRoom,
  updateBookingDraft,
  formatDraftInvoice,
  saveConfirmedBooking,
  formatEVoucher,
} = require('../booking/service');

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
    'Selamat datang di layanan perhotelan SapaTamu. Kami menyediakan akomodasi nyaman bintang 4 dengan pelayanan 24 jam.\n\n' +
    'Silakan pilih layanan yang Anda butuhkan:',
  items: [
    { title: '🛏️ Reservasi Kamar',  value: 'hotel_reservasi'   },
    { title: 'ℹ️ Info & Fasilitas', value: 'hotel_fasilitas'   },
    { title: '🍽️ Room Service',     value: 'hotel_roomservice' },
    { title: '🎧 Customer Service', value: 'menu_cs'           },
    { title: '🔙 Menu Utama',       value: 'goto_main'         },
  ],
};

const MENU_PILIH_KAMAR = {
  text:
    '🛏️ *Pilihan Kamar Hotel SapaTamu*\n\n' +
    'Nikmati pengalaman menginap nyaman & berkelas bintang 4 dengan fasilitas lengkap:\n\n' +
    '📌 *Daftar & Tarif Kamar:*\n' +
    '• 🛏️ *Deluxe Room* — Rp 550.000 / malam\n' +
    '  _Kasur King Size, AC, Smart TV 43", Balkon_\n\n' +
    '• 🌟 *Executive Suite* — Rp 950.000 / malam\n' +
    '  _Ruang Tamu, Jacuzzi, Espresso Maker, Lounge Access_\n\n' +
    '• 👑 *Presidential Suite* — Rp 1.800.000 / malam\n' +
    '  _2 Kamar Tidur, Dining Room, Mini Bar Gratis, 24h Butler_\n\n' +
    '✨ _Semua tarif sudah termasuk sarapan, akses kolam renang, gym & WiFi._\n\n' +
    '👇 *Silakan pilih tipe kamar yang Anda inginkan di bawah:*',
  items: [
    { title: '🛏️ Deluxe (Rp 550rb)',    value: 'book_room_deluxe'    },
    { title: '🌟 Executive (Rp 950rb)', value: 'book_room_executive' },
    { title: '👑 Suite (Rp 1.8jt)',      value: 'book_room_suite'     },
    { title: '🔙 Menu Utama',            value: 'goto_main'           },
  ],
};

const MENU_DRAFT_ACTION = [
  { title: '💳 Lanjut Bayar',   value: 'booking_pay_step'    },
  { title: '✏️ Ganti Tanggal',  value: 'booking_change_date' },
  { title: '❌ Batalkan',        value: 'booking_cancel'      },
];

const MENU_PAYMENT_METHOD = {
  text:
    '💳 *Pilih Metode Pembayaran (Demo):*\n\n' +
    'Silakan pilih cara pembayaran simulasi di bawah ini:',
  items: [
    { title: '📱 QRIS (Demo)',    value: 'pay_method_qris' },
    { title: '🏦 VA BCA (Demo)',  value: 'pay_method_va'   },
    { title: '❌ Batalkan',       value: 'booking_cancel'  },
  ],
};

const MENU_PAYMENT_CONFIRM = [
  { title: '✅ Sudah Bayar', value: 'confirm_payment_paid' },
  { title: '❌ Batalkan',    value: 'booking_cancel'       },
];

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

  // Cek value persis
  const VALUE_MAP = {
    'menu_kafe':            'menu_kafe',
    'menu_hotel':           'menu_hotel',
    'menu_cs':              'menu_cs',
    'hotel_reservasi':      'hotel_reservasi',
    'hotel_fasilitas':      'hotel_fasilitas',
    'hotel_roomservice':    'hotel_roomservice',
    'kafe_menu':            'kafe_menu',
    'kafe_reservasi':       'kafe_reservasi',
    'goto_main':            'goto_main',
    'escalate_human':       'escalate_human',
    'ai_tanya_lagi':        'ai_tanya_lagi',
    'book_room_deluxe':     'book_room_deluxe',
    'book_room_executive':  'book_room_executive',
    'book_room_suite':      'book_room_suite',
    'booking_pay_step':     'booking_pay_step',
    'booking_change_date':  'booking_change_date',
    'booking_cancel':       'booking_cancel',
    'pay_method_qris':      'pay_method_qris',
    'pay_method_va':        'pay_method_va',
    'confirm_payment_paid': 'confirm_payment_paid',
  };
  if (VALUE_MAP[t] || VALUE_MAP[lower]) return VALUE_MAP[t] || VALUE_MAP[lower];

  // ── Matching case-insensitive ───────────────────────────────────────────────

  // CS / escalate
  if (lower.includes('customer service'))                          return 'menu_cs';
  if (lower.includes('hubungi staf') || lower.includes('staf manusia') ||
      (lower.includes('staf') && lower.includes('manusia')))      return 'escalate_human';

  // Booking room selections
  if (lower.includes('deluxe') && (lower.includes('550') || lower.includes('kamar') || lower.includes('room') || lower.includes('pilih'))) return 'book_room_deluxe';
  if (lower.includes('executive') && (lower.includes('950') || lower.includes('suite') || lower.includes('pilih'))) return 'book_room_executive';
  if (lower.includes('presidential') || (lower.includes('suite') && lower.includes('1.8'))) return 'book_room_suite';

  // Booking actions
  if (lower.includes('lanjut bayar') || lower.includes('lanjut pembayaran')) return 'booking_pay_step';
  if (lower.includes('ganti tanggal') || lower.includes('ubah tanggal')) return 'booking_change_date';
  if (lower.includes('batalkan') || lower.includes('batal pemesanan') || lower.includes('batal booking')) return 'booking_cancel';
  if (lower.includes('qris')) return 'pay_method_qris';
  if (lower.includes('virtual account') || lower.includes('va bca') || lower.includes('transfer bank')) return 'pay_method_va';
  if (lower.includes('saya sudah bayar') || lower.includes('sudah bayar') || lower.includes('konfirmasi bayar')) return 'confirm_payment_paid';

  // Hotel submenus
  if (lower.includes('reservasi kamar') || (lower.includes('reservasi') && lower.includes('kamar')) || lower.includes('booking kamar') || lower.includes('pesan kamar')) return 'hotel_reservasi';
  if (lower.includes('room service')) return 'hotel_roomservice';
  if ((lower.includes('info') || lower.includes('fasilitas')) && (lower.includes('hotel') || lower.includes('fasilitas'))) return 'hotel_fasilitas';
  if (lower === 'fasilitas' || lower === 'info & fasilitas') return 'hotel_fasilitas';

  // Kafe submenus
  if (lower.includes('reservasi meja') || (lower.includes('reservasi') && lower.includes('meja'))) return 'kafe_reservasi';
  if ((lower.includes('menu') && lower.includes('harga')) || lower === 'menu & harga') return 'kafe_menu';

  // Menus
  if ((lower.includes('hotel') || lower.includes('menu hotel') || lower.includes('tampilkan hotel')) && !lower.includes('customer') && !lower.includes('room service')) return 'menu_hotel';
  if ((lower.includes('kafe') || lower.includes('menu kafe') || lower.includes('cafe') || lower.includes('tampilkan kafe')) && !lower.includes('customer')) return 'menu_kafe';

  // Menu utama
  if (lower === 'menu' || lower === 'tampilkan menu' || lower === 'menu utama' || lower.includes('menu utama') || lower.includes('kembali ke menu') || lower.includes('🔙')) return 'goto_main';

  // Tanya lagi
  if (lower.includes('tanya lagi') || lower.includes('tanya')) return 'ai_tanya_lagi';

  return null;
}

// ─── GREETING DETECTION ───────────────────────────────────────────────────────

function isGreeting(content) {
  const lower = content.toLowerCase().trim();
  const greetings = ['halo', 'hai', 'hi', 'hello', 'start', 'mulai', 'menu', 'selamat'];
  return greetings.some(g => lower === g || lower.startsWith(g + ' '));
}

// ─── HELPER: Balas AI + tombol lanjut ────────────────────────────────────────

async function replyAI(convId, content) {
  const lower = content.toLowerCase();
  if (lower.includes('darurat') || lower.includes('alergi') || lower.includes('komplain')) {
    await eksekusiEskalasi(convId, 'darurat_keyword', '🚨 Kami segera menghubungkan Anda dengan staf. Mohon tunggu 🙏');
    return;
  }
  if (lower.includes('staf') || lower.includes('manusia') || lower.includes('orang asli')) {
    await eksekusiEskalasi(convId, 'minta_staf_keyword', '👨‍💼 Menghubungkan Anda ke staf kami, mohon tunggu... 🙏');
    return;
  }
  if (cekEskalasi(content, config.escalationKeywords)) {
    await eksekusiEskalasi(convId, 'eskalasi_keyword');
    return;
  }

  console.log(`🤖 [AI] Bertanya untuk Conv ${convId}: "${content.substring(0, 50)}"`);
  const aiResp = await jawab(content);

  if (aiResp.alasan === 'ai_down') {
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

function getImageIfExists(baseName) {
  const extensions = ['.jpg', '.jpeg', '.png', '.webp'];
  const dir = path.join(__dirname, '../../public/images');
  for (const ext of extensions) {
    const fullPath = path.join(dir, `${baseName}${ext}`);
    if (fs.existsSync(fullPath)) return fullPath;
  }
  return null;
}

async function sendWelcomeWithImage(convId, senderPhone) {
  const hotelImg = getImageIfExists('hotel_sapatamu');
  if (hotelImg && senderPhone) {
    await sendImageMessage(
      convId,
      hotelImg,
      '👋 *Selamat Datang di SapaTamu!*\n\nHalo! Saya asisten virtual SapaTamu, siap membantu Anda 24/7.',
      senderPhone
    );
    await sendMenuMessage(convId, 'Pilih layanan yang Anda butuhkan:', MENU_UTAMA.items);
  } else {
    await sendMenuMessage(convId, MENU_UTAMA.text, MENU_UTAMA.items);
  }
}

// ─── MAIN WEBHOOK HANDLER ─────────────────────────────────────────────────────

router.post('/', async (req, res) => {
  res.status(200).json({ status: 'received' });

  const body = req.body;
  if (!body) return;

  const event       = body.event;
  const convId      = body.conversation?.id || body.id;
  const content     = (body.content || '').trim();
  const msgType     = body.message_type;
  const senderPhone = body.conversation?.meta?.sender?.phone_number || body.conversation?.contact_inbox?.source_id || body.sender?.phone_number || '';
  const senderName  = body.conversation?.meta?.sender?.name || body.conversation?.contact_inbox?.name || body.sender?.name || '';
  const convStatus  = body.conversation?.status || body.status;

  console.log(`\n📨 [CHATWOOT] Event: ${event} | Conv: ${convId}`);

  // ── conversation_resolved → kirim notif penutup + menu ─────────────────────
  if (event === 'conversation_resolved') {
    if (!convId) return;
    console.log(`♻️ [SESSION] Conv ${convId} resolved → kirim notif penutup + menu`);
    setStatus(convId, 'ai_active');
    clearDraft(convId);

    await sendMessage(convId,
      '✅ *Percakapan dengan staf kami telah selesai.*\n\n' +
      'Terima kasih telah menghubungi SapaTamu! 😊\n' +
      'Semoga kami dapat membantu Anda kembali.'
    ).catch(() => {});

    await sendMenuMessage(convId,
      '🤖 *Bot SapaTamu aktif kembali.*\nAda lagi yang bisa kami bantu?',
      MENU_UTAMA.items
    ).catch(() => {});
    return;
  }

  // ── conversation_status_changed → hanya tangani reopen ─────────────────────
  if (event === 'conversation_status_changed') {
    console.log(`🔍 [STATUS CHANGE] Conv ${convId} → status: ${convStatus}`);
    if ((convStatus === 'pending' || convStatus === 'open') && convId) {
      const curStatus = getStatus(convId);
      if (curStatus === 'escalated') {
        console.log(`🔄 [SESSION] Conv ${convId} reopened → reset ke ai_active`);
        setStatus(convId, 'ai_active');
        sendMessage(convId, '🤖 *Bot SapaTamu kembali aktif!*\n\nKetik pertanyaan Anda atau pilih menu:').catch(() => {});
        sendMenuMessage(convId, '', MENU_UTAMA.items).catch(() => {});
      }
    }
    return;
  }

  // Hanya proses message_created incoming
  if (event !== 'message_created' || msgType !== 'incoming') return;
  if (!content || !convId) return;

  let session = getStatus(convId);
  console.log(`📊 [SESSION] Conv ${convId} | Status: ${session} | Pesan: "${content.substring(0, 40)}"`);

  try {

    // ═══ STATE: escalated ════════════════════════════════════════════════════
    if (session === 'escalated') {
      console.log(`⏸️ [SESSION] Conv ${convId} sedang ditangani staf, AI diam.`);
      return;
    }

    const action = detectButtonAction(content);

    // ═══ STATE: booking_await_date (User sedang input tanggal) ════════════════
    if (session === 'booking_await_date' && !action) {
      console.log(`📅 [BOOKING DATE] Conv ${convId} Parsing tanggal: "${content}"`);
      const parsed = await parseBookingInput(content);
      if (!parsed.customerName && senderName) {
        parsed.customerName = senderName;
      }
      const draft  = updateBookingDraft(convId, parsed);

      setStatus(convId, 'booking_confirm_draft');
      await sendMessage(convId, formatDraftInvoice(draft));
      await sendMenuMessage(convId, 'Lanjutkan pemesanan:', MENU_DRAFT_ACTION);
      return;
    }

    // ═══ STATE: idle ═════════════════════════════════════════════════════════
    if (session === 'idle') {
      console.log(`🚀 [SESSION] Conv ${convId} idle → ai_active`);
      setStatus(convId, 'ai_active');

      if (action) {
        console.log(`🔘 [BUTTON dari IDLE] Conv ${convId} | Action: ${action}`);
        session = 'ai_active'; // fall-through
      } else if (isGreeting(content)) {
        await sendWelcomeWithImage(convId, senderPhone);
        return;
      } else {
        await sendMenuMessage(convId,
          '👋 *Selamat Datang di SapaTamu!*\n\n' +
          'Halo! Saya asisten virtual SapaTamu. Izinkan saya menjawab pertanyaan Anda:',
          MENU_UTAMA.items
        );
        await replyAI(convId, content);
        return;
      }
    }

    // ═══ STATE: ai_active & booking states ═══════════════════════════════════
    if (session.startsWith('booking_') || session === 'ai_active') {

      // ── Tombol / Actions diklik ────────────────────────────────────────────
      if (action) {
        console.log(`🔘 [BUTTON/ACTION] Conv ${convId} | Action: ${action}`);

        // Validasi: Cegah klik tombol dari pesan lama jika sesi booking sudah selesai/dibatalkan
        const bookingStepActions = ['booking_pay_step', 'booking_change_date', 'pay_method_qris', 'pay_method_va', 'confirm_payment_paid'];
        if (bookingStepActions.includes(action) && !getDraft(convId)) {
          console.log(`⚠️ [BOOKING EXPIRED] Conv ${convId} Tombol pemesanan lama diklik tanpa active draft`);
          await sendMessage(convId, 'ℹ️ *Sesi pemesanan sebelumnya telah selesai atau dibatalkan.*\n\nSilakan mulai pemesanan baru melalui menu Hotel.');
          await sendWelcomeWithImage(convId, senderPhone);
          return;
        }

        switch (action) {

          // 🏨 Menu Utama Hotel
          case 'menu_hotel': {
            const hotelImg = getImageIfExists('lobby_hotel') || getImageIfExists('hotel_sapatamu');
            if (hotelImg && senderPhone) {
              await sendImageMessage(convId, hotelImg, '🏨 *Hotel SapaTamu*\n\nSaya siap membantu kebutuhan hotel Anda.', senderPhone);
              await sendMenuMessage(convId, 'Pilih layanan hotel:', MENU_HOTEL.items);
            } else {
              await sendMenuMessage(convId, MENU_HOTEL.text, MENU_HOTEL.items);
            }
            return;
          }

          // 🛏️ Step 1: Reservasi Kamar → Tampilkan pilihan kamar
          case 'hotel_reservasi': {
            setStatus(convId, 'booking_pick_room');
            await sendMenuMessage(convId, MENU_PILIH_KAMAR.text, MENU_PILIH_KAMAR.items);
            return;
          }

          // 🛏️ Step 2: Pilih Kamar Deluxe
          case 'book_room_deluxe': {
            const room = ROOM_CATALOG.deluxe;
            updateBookingDraft(convId, { roomKey: 'deluxe' });
            setStatus(convId, 'booking_await_date');

            const imgPath = getImageIfExists('kamar_deluxe');
            const caption =
              `🏨 *${room.name}*\n\n` +
              `💵 *Harga:* ${formatRupiah(room.price)} / malam (Termasuk Sarapan)\n\n` +
              `ℹ️ *Fasilitas:*\n${room.facilities.map(f => '• ' + f).join('\n')}\n\n` +
              `📝 *Deskripsi:*\n${room.description}`;

            if (imgPath && senderPhone) {
              await sendImageMessage(convId, imgPath, caption, senderPhone);
            } else {
              await sendMessage(convId, caption);
            }

            await sendMessage(convId,
              '📅 *Kapan Anda ingin menginap & berapa malam?*\n\n' +
              'Boleh juga sertakan nama Anda.\n' +
              '_Contoh: 25 Agustus 2 malam atas nama Budi Santoso_'
            );
            return;
          }

          // 🌟 Step 2: Pilih Kamar Executive
          case 'book_room_executive': {
            const room = ROOM_CATALOG.executive;
            updateBookingDraft(convId, { roomKey: 'executive' });
            setStatus(convId, 'booking_await_date');

            const imgPath = getImageIfExists('kamar_executive');
            const caption =
              `🌟 *${room.name}*\n\n` +
              `💵 *Harga:* ${formatRupiah(room.price)} / malam (Termasuk Sarapan)\n\n` +
              `ℹ️ *Fasilitas:*\n${room.facilities.map(f => '• ' + f).join('\n')}\n\n` +
              `📝 *Deskripsi:*\n${room.description}`;

            if (imgPath && senderPhone) {
              await sendImageMessage(convId, imgPath, caption, senderPhone);
            } else {
              await sendMessage(convId, caption);
            }

            await sendMessage(convId,
              '📅 *Kapan Anda ingin menginap & berapa malam?*\n\n' +
              'Boleh juga sertakan nama Anda.\n' +
              '_Contoh: 25 Agustus 2 malam atas nama Budi Santoso_'
            );
            return;
          }

          // 👑 Step 2: Pilih Kamar Suite
          case 'book_room_suite': {
            const room = ROOM_CATALOG.suite;
            updateBookingDraft(convId, { roomKey: 'suite' });
            setStatus(convId, 'booking_await_date');

            const imgPath = getImageIfExists('kamar_suite');
            const caption =
              `👑 *${room.name}*\n\n` +
              `💵 *Harga:* ${formatRupiah(room.price)} / malam (Termasuk Sarapan)\n\n` +
              `ℹ️ *Fasilitas:*\n${room.facilities.map(f => '• ' + f).join('\n')}\n\n` +
              `📝 *Deskripsi:*\n${room.description}`;

            if (imgPath && senderPhone) {
              await sendImageMessage(convId, imgPath, caption, senderPhone);
            } else {
              await sendMessage(convId, caption);
            }

            await sendMessage(convId,
              '📅 *Kapan Anda ingin menginap & berapa malam?*\n\n' +
              'Boleh juga sertakan nama Anda.\n' +
              '_Contoh: 25 Agustus 2 malam atas nama Budi Santoso_'
            );
            return;
          }

          // ✏️ Ubah Tanggal
          case 'booking_change_date': {
            setStatus(convId, 'booking_await_date');
            await sendMessage(convId,
              '✏️ Silakan ketik kembali tanggal menginap & durasi baru Anda:\n\n_Contoh: 28 Agustus 1 malam atas nama Budi_'
            );
            return;
          }

          // 💳 Step 3: Lanjut Pembayaran → Pilih Metode
          case 'booking_pay_step': {
            setStatus(convId, 'booking_select_payment');
            await sendMenuMessage(convId, MENU_PAYMENT_METHOD.text, MENU_PAYMENT_METHOD.items);
            return;
          }

          // 📱 Step 4A: Bayar QRIS (Demo)
          case 'pay_method_qris': {
            setStatus(convId, 'booking_await_payment');
            const draft = getDraft(convId) || {};
            const total = draft.totalPrice ? formatRupiah(draft.totalPrice) : 'Rp 550.000';

            await sendMessage(convId,
              '📱 *SIMULASI PEMBAYARAN QRIS (DEMO)*\n' +
              '════════════════════════\n' +
              `🏨 *Kamar*        : ${draft.roomName || 'Deluxe Room'}\n` +
              `💵 *Total Tagihan*: *${total}*\n` +
              '════════════════════════\n\n' +
              '📌 *Instruksi Scan QRIS:*\n' +
              '1. Buka aplikasi BCA / GoPay / OVO / Dana / ShopeePay Anda.\n' +
              '2. Scan QRIS resmi SapaTamu Resort.\n' +
              '3. Pastikan nominal pembayaran sesuai.\n\n' +
              '_Setelah transfer/simulasi selesai, tekan tombol di bawah:_'
            );
            await sendMenuMessage(convId, 'Konfirmasi pembayaran:', MENU_PAYMENT_CONFIRM);
            return;
          }

          // 🏦 Step 4B: Bayar Virtual Account (Demo)
          case 'pay_method_va': {
            setStatus(convId, 'booking_await_payment');
            const draft = getDraft(convId) || {};
            const total = draft.totalPrice ? formatRupiah(draft.totalPrice) : 'Rp 550.000';

            await sendMessage(convId,
              '🏦 *SIMULASI VIRTUAL ACCOUNT BCA (DEMO)*\n' +
              '════════════════════════\n' +
              '🏦 *Bank*          : BCA Virtual Account\n' +
              '🔢 *No. Rekening*  : *8808-0822-1947-2360*\n' +
              '👤 *Nama Penerima* : *SapaTamu Hotel Resort*\n' +
              `💵 *Total Tagihan* : *${total}*\n` +
              '════════════════════════\n\n' +
              '📌 *Instruksi Transfer:*\n' +
              '1. Masuk ke m-BCA / KlikBCA ➡️ Transfer ➡️ BCA Virtual Account.\n' +
              '2. Masukkan nomor VA di atas.\n' +
              '3. Konfirmasi pembayaran Anda.\n\n' +
              '_Setelah transfer selesai, tekan tombol di bawah:_'
            );
            await sendMenuMessage(convId, 'Konfirmasi pembayaran:', MENU_PAYMENT_CONFIRM);
            return;
          }

          // ✅ Step 5: Konfirmasi Pembayaran Sukses → Terbitkan E-Voucher
          case 'confirm_payment_paid': {
            const booking = saveConfirmedBooking(convId, 'QRIS/VA (Demo)', senderPhone);
            setStatus(convId, 'ai_active');

            if (booking) {
              await sendMessage(convId, formatEVoucher(booking));
            } else {
              await sendMessage(convId, '✅ Pembayaran Anda telah terverifikasi. Terima kasih!');
            }
            await sendMenuMessage(convId, 'Ada yang ingin Anda tanyakan lagi?', TOMBOL_LANJUT);
            return;
          }

          // ❌ Batal Booking
          case 'booking_cancel': {
            clearDraft(convId);
            setStatus(convId, 'ai_active');
            await sendMessage(convId, '❌ *Pemesanan kamar telah dibatalkan.*');
            await sendWelcomeWithImage(convId, senderPhone);
            return;
          }

          // ☕ Kafe
          case 'menu_kafe': {
            const cafeImg = getImageIfExists('cafe_sapatamu');
            if (cafeImg && senderPhone) {
              await sendImageMessage(convId, cafeImg, '☕ *Kafe SapaTamu*\n\nKami buka setiap hari 07.00 – 22.00 WIB.', senderPhone);
              await sendMenuMessage(convId, 'Pilih layanan kafe:', MENU_KAFE.items);
            } else {
              await sendMenuMessage(convId, MENU_KAFE.text, MENU_KAFE.items);
            }
            return;
          }

          // 📋 Kafe Menu
          case 'kafe_menu': {
            const imgPath = getImageIfExists('menu_kafe') || getImageIfExists('kafe_menu');
            if (imgPath) {
              await sendImageMessage(convId, imgPath, STATIC.kafe_menu, senderPhone);
            } else {
              await sendMessage(convId, STATIC.kafe_menu);
            }
            return;
          }

          case 'kafe_reservasi':
            await sendMessage(convId, STATIC.kafe_reservasi);
            return;

          case 'hotel_fasilitas': {
            const imgPath = getImageIfExists('hotel_fasilitas');
            if (imgPath) {
              await sendImageMessage(convId, imgPath, STATIC.hotel_fasilitas, senderPhone);
            } else {
              await sendMessage(convId, STATIC.hotel_fasilitas);
            }
            return;
          }

          case 'hotel_roomservice':
            await sendMessage(convId, STATIC.hotel_roomservice);
            return;

          case 'menu_cs':
          case 'escalate_human':
            await eksekusiEskalasi(convId, 'tombol_cs',
              '👨‍💼 *Menghubungkan ke Staf Manusia...*\n\nStaf kami akan segera membalas. Mohon tunggu sebentar 🙏');
            return;

          case 'goto_main':
            clearDraft(convId);
            setStatus(convId, 'ai_active');
            await sendWelcomeWithImage(convId, senderPhone);
            return;

          case 'ai_tanya_lagi':
            await sendMessage(convId, '💬 Silakan ketik pertanyaan Anda:');
            return;

          default:
            await sendWelcomeWithImage(convId, senderPhone);
            return;
        }
      }

      // ── Free text saat ai_active ──────────────────────────────────────────
      console.log(`🤖 [AI MODE] Conv ${convId} — free text: "${content}"`);

      // Cek salam
      if (isGreeting(content)) {
        await sendWelcomeWithImage(convId, senderPhone);
        return;
      }

      // Cek jika user ngetik pesan pemesanan langsung (misal: "mau booking kamar deluxe 2 malam")
      const lower = content.toLowerCase();
      if (lower.includes('booking') || lower.includes('pesan kamar') || lower.includes('reservasi kamar')) {
        const parsed = await parseBookingInput(content);
        if (!parsed.customerName && senderName) {
          parsed.customerName = senderName;
        }
        const roomKey = parsed.roomKey || 'deluxe';
        const draft = updateBookingDraft(convId, { ...parsed, roomKey });

        if (parsed.checkInDate && parsed.nights) {
          setStatus(convId, 'booking_confirm_draft');
          await sendMessage(convId, formatDraftInvoice(draft));
          await sendMenuMessage(convId, 'Lanjutkan pemesanan:', MENU_DRAFT_ACTION);
        } else {
          setStatus(convId, 'booking_await_date');
          const room = ROOM_CATALOG[roomKey];
          const imgPath = getImageIfExists(`kamar_${roomKey}`);
          if (imgPath && senderPhone) {
            await sendImageMessage(convId, imgPath, `🏨 *${room.name}* (${formatRupiah(room.price)}/malam)`, senderPhone);
          }
          await sendMessage(convId,
            '📅 *Silakan ketik tanggal check-in, jumlah malam, dan nama pemesan:*\n\n' +
            '_Contoh: 25 Agustus 2 malam atas nama Budi Santoso_'
          );
        }
        return;
      }

      // Tanya AI
      await replyAI(convId, content);
      return;
    }

  } catch (err) {
    console.error(`❌ [WEBHOOK ERROR] Conv ${convId}:`, err.message || err);
  }
});

router.post('/status', (req, res) => res.json({ status: 'ok', version: '4.0-hybrid-booking' }));

module.exports = router;
