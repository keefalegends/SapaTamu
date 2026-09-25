const OpenAI = require('openai');
const path = require('path');
const fs = require('fs');
const config = require('../config/env');
const { db } = require('../db/database');

const client = new OpenAI({
  baseURL: config.ai.baseUrl,
  apiKey: config.ai.apiKey,
  timeout: 8000, // Maksimal 8 detik agar respons WhatsApp cepat dan tidak hanging
});

// Cache knowledge base di memori satu kali saja (mencegah blocking disk I/O)
const dataPath = path.join(__dirname, '../knowledge/data.json');
let topicsCache = [];
try {
  topicsCache = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
} catch (e) {
  topicsCache = [];
}

function safeJsonParse(rawContent) {
  if (!rawContent) return null;
  // Bersihkan markdown code block jika model mengembalikannya dalam ```json ... ```
  const cleaned = String(rawContent)
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    return null;
  }
}

function buildSystemPrompt() {
  try {
    const topics = topicsCache;

    // Ambil katalog kamar & menu dari SQLite database
    const rooms = db.prepare('SELECT * FROM room_catalog').all();
    const roomText = rooms.map(r => {
      const isOut = r.stock_status === 'outofstock' || (r.manage_stock === 1 && r.stock_quantity !== null && r.stock_quantity <= 0);
      const stockBadge = isOut ? '[❌ STATUS: KAMAR PENUH / HABIS]' : `[✅ Tersedia: ${r.stock_quantity ?? 5} kamar]`;
      return `- ${r.name}: Rp ${r.price.toLocaleString('id-ID')}/malam (${r.description}) ${stockBadge}`;
    }).join('\n');

    const menus = db.prepare('SELECT * FROM menu_catalog').all();
    const menuText = menus.map(m => {
      const isOut = m.stock_status === 'outofstock' || (m.manage_stock === 1 && m.stock_quantity !== null && m.stock_quantity <= 0);
      const stockBadge = isOut ? '[❌ STATUS: STOK HABIS / KOSONG - JANGAN DITAWARKAN / DITERIMA]' : `[✅ Tersedia: ${m.stock_quantity ?? 'Ada'}]`;
      return `- ${m.name} (${m.category}): Rp ${m.price.toLocaleString('id-ID')} ${stockBadge}`;
    }).join('\n');

    const knowledgeText = topics
      .map((item, i) => `${i + 1}. [${item.topik}]\n   ${item.jawaban}`)
      .join('\n\n');

    return `Kamu adalah SapaTamu, Asisten AI Virtual resmi yang ramah, hangat, dan solutif untuk Hotel & Kafe SapaTamu.

PERSONA & TONE OF VOICE:
- Bersikap ramah, profesional, solutif, dan natural layaknya concierge hotel bintang 4 dan barista kafe berpengalaman.
- Gunakan Bahasa Indonesia santai tapi sopan (sapa dengan "Kak", gunakan emoji secukupnya seperti 😊, 🏨, ☕, 🙏). Hindari jawaban kaku seperti robot template.

ATURAN CONTEXT HANDLING & TOPIC SWITCHING:
1. PEMBERSIHAN KONTEKS LAMA (ISOLASI TRANSAKSI):
   - Jika transaksi atau booking sebelumnya sudah selesai (sudah dapat voucher/lunas), LUPAKAN seluruh data pemesanan lama.
   - Jangan pernah menanyakan kamar atau melanjutkan formulir booking hotel kecuali pelanggan secara eksplisit memintanya kembali.
2. PERPINDAHAN TOPIK KAFE (PRIORITAS TINGGI):
   - Jika pelanggan menyebutkan kata terkait kafe, makanan, minuman, kopi, nongkrong, atau menu (contoh: "kafe", "mau kafe", "kopi", "makan", "croissant"), LANGSUNG pindahkan konteks ke layanan Kafe & Resto SapaTamu.
   - Sambut dengan antusias mengenai kafe (tawarkan kopi/makanan atau jenis pesanan dine-in/takeaway). JANGAN SEKALI-KALI menanyakan tipe kamar hotel!
3. RESPON BINGUNG / AMBIGU:
   - Jika pelanggan bingung atau berkata singkat ("menu", "bantuan"), berikan pilihan ringkas layanan SapaTamu (Hotel, Kafe, atau CS) tanpa memaksa pelanggan memilih tipe kamar.
4. PENGECEKAN KETERSEDIAAN STOK (SANGAT KETAT & WAJIB):
   - Perhatikan tanda [❌ STATUS: STOK HABIS / KOSONG] pada katalog menu dan kamar.
   - JANGAN PERNAH menyarankan, menawarkan, atau menerima pesanan untuk menu/kamar yang stoknya habis (misalnya: jika Espresso berstatus STOK HABIS, jangan rekomendasikan Espresso!).
   - Jika pelanggan menanyakan menu yang sedang habis (contoh: "ada espresso?", "mau pesan espresso dong"), jelaskan dengan ramah bahwa menu tersebut saat ini sedang HABIS/KOSONG, lalu rekomendasikan menu alternatif yang masih tersedia (misalnya Americano, Caffe Latte, atau Cappuccino).

KNOWLEDGE BASE & KATALOG RESMI:
${knowledgeText}

KATALOG KAMAR HOTEL:
${roomText}

KATALOG MENU KAFE:
${menuText}

ATURAN ESKALASI & FORMAT:
1. Eskalasi ke Staf Manusia (CS/Resepsionis) hanya jika:
   - Pelanggan secara jelas meminta bicara dengan manusia, staf, admin, CS, atau resepsionis.
   - Pelanggan menyampaikan keluhan/komplain berat/marah/darurat.
   - Pertanyaan benar-benar di luar konteks hotel, kafe, atau layanan SapaTamu.
2. SELALU balas dalam format JSON murni:
   - Jawaban normal : {"jawaban": "...", "eskalasi": false}
   - Eskalasi       : {"eskalasi": true, "alasan": "di_luar_jangkauan" | "minta_manusia" | "komplain"}`;
  } catch (err) {
    console.error('⚠️ [AI] Gagal build prompt:', err.message);
    return `Kamu adalah AI SapaTamu. Jawab dalam JSON: {"jawaban":"...","eskalasi":false}`;
  }
}

let SYSTEM_PROMPT = buildSystemPrompt();

async function jawabAI(userText, options = {}) {
  const { chatHistory = [], guestProfile = null } = options;

  try {
    let systemContent = SYSTEM_PROMPT;

    // Injeksi Profil & Histori Tamu ke System Prompt untuk personalisasi ramah
    if (guestProfile && (guestProfile.name || guestProfile.isReturningGuest)) {
      const profileParts = [];
      if (guestProfile.name) {
        profileParts.push(`- Nama Pelanggan: Kak ${guestProfile.name}`);
      }
      if (guestProfile.pastBookings && guestProfile.pastBookings.length > 0) {
        const bList = guestProfile.pastBookings.map(b => `${b.room_name} (${b.check_in || 'Check-in'})`).join(', ');
        profileParts.push(`- Riwayat Kamar Pernah Dipesan: ${bList}`);
      }
      if (guestProfile.pastOrders && guestProfile.pastOrders.length > 0) {
        const oList = guestProfile.pastOrders.map(o => o.items).filter(Boolean).join('; ');
        if (oList) {
          profileParts.push(`- Riwayat Menu Kafe Pernah Dipesan: ${oList}`);
        }
      }
      if (profileParts.length > 0) {
        systemContent += `\n\nPROFIL & HISTORI TAMU SAAT INI (GUNAKAN UNTUK PERSONALISASI):\n${profileParts.join('\n')}\nPetunjuk: Sapa tamu dengan namanya jika terasa natural, dan manfaatkan riwayatnya untuk memberikan bantuan/rekomendasi yang hangat.`;
      }
    }

    const messages = [
      { role: 'system', content: systemContent },
    ];

    // Tambahkan sliding window riwayat chat sesi aktif (maksimal 6 pesan terakhir)
    if (Array.isArray(chatHistory) && chatHistory.length > 0) {
      const historyToInclude = [...chatHistory];
      const lastMsg = historyToInclude[historyToInclude.length - 1];
      if (lastMsg && lastMsg.sender === 'user' && lastMsg.content?.trim() === userText.trim()) {
        historyToInclude.pop();
      }

      for (const msg of historyToInclude) {
        if (msg.content && typeof msg.content === 'string') {
          let cleanContent = msg.content.trim();
          if (msg.sender !== 'user') {
            cleanContent = cleanContent.replace(/^🤖 \*AI SapaTamu:\*\s*/, '');
          }
          messages.push({
            role: msg.sender === 'user' ? 'user' : 'assistant',
            content: cleanContent,
          });
        }
      }
    }

    // Pesan pengguna terbaru
    messages.push({ role: 'user', content: userText });

    const response = await client.chat.completions.create({
      model: config.ai.model,
      messages,
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content;
    const parsed = safeJsonParse(content) || {};
    return {
      jawaban: parsed.jawaban || null,
      eskalasi: parsed.eskalasi === true,
      alasan: parsed.alasan || null,
    };
  } catch (err) {
    console.error('❌ [AI ERROR]:', err.message);
    // Fallback cerdas jika remote AI gateway sedang offline/timeout: cek knowledge base memori lokal
    try {
      const topics = topicsCache;
      const lower = userText.toLowerCase().replace(/[-_]/g, ' ');
      const match = topics.find(t => {
        const top = t.topik.toLowerCase().replace(/[-_]/g, ' ');
        return lower.includes(top) || top.split(' ').some(w => w.length >= 4 && lower.includes(w));
      });
      if (match) {
        const greetingPrefix = guestProfile?.name ? `Halo Kak ${guestProfile.name}! ` : '';
        return {
          jawaban: greetingPrefix + match.jawaban,
          eskalasi: false,
          alasan: 'local_knowledge_fallback',
        };
      }
    } catch (e) {}

    const defaultGreeting = guestProfile?.name ? `Halo Kak ${guestProfile.name}! ` : 'Halo! ';
    return {
      jawaban: defaultGreeting + 'Ada yang bisa kami bantu seputar Hotel atau Kafe SapaTamu? Silakan pilih menu di bawah ini atau ketik pertanyaan Anda.',
      eskalasi: false,
      alasan: 'ai_fallback',
    };
  }
}

/**
 * Parser Cerdas Entity Booking Kamar Hotel
 */
async function parseHotelBookingInput(text) {
  try {
    const prompt = `Ekstrak entitas booking hotel dari teks berikut: "${text}".
Format JSON yang diharapkan:
{
  "customerName": "Nama tamu jika ada, atau null",
  "nights": "Jumlah malam (integer, default 1)",
  "checkInDate": "Tanggal check-in (string seperti '25 Agustus 2026') atau null",
  "roomKey": "deluxe" | "executive" | "suite" | null
}`;

    const res = await client.chat.completions.create({
      model: config.ai.model,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    });

    return safeJsonParse(res.choices[0]?.message?.content) || {};
  } catch (e) {
    // Fallback Regex parser jika remote LLM tidak merespons
    let nights = 1;
    const nightMatch = text.match(/(\d+)\s*malam/i);
    if (nightMatch) nights = parseInt(nightMatch[1], 10);

    let customerName = null;
    const nameMatch = text.match(/(?:nama|an|a\.n\.?)\s*:?\s*([A-Za-z\s]+)/i);
    if (nameMatch) {
      customerName = nameMatch[1].trim();
    } else {
      const words = text.split(/\s+/).filter(w => !/\b(besok|hari|malam|ini|lusa|\d+)\b/i.test(w));
      if (words.length > 0) customerName = words.join(' ');
    }

    let checkInDate = 'Besok';
    if (/hari ini/i.test(text)) checkInDate = 'Hari Ini';
    else if (/lusa/i.test(text)) checkInDate = 'Lusa';
    const dateMatch = text.match(/(\d{1,2}\s+[A-Za-z]+(?:\s+\d{4})?)/);
    if (dateMatch) checkInDate = dateMatch[1];

    let roomKey = null;
    if (/deluxe/i.test(text)) roomKey = 'deluxe';
    if (/executive/i.test(text)) roomKey = 'executive';
    if (/suite|presidential/i.test(text)) roomKey = 'suite';

    return {
      customerName: customerName || 'Tamu Terhormat',
      nights: nights || 1,
      checkInDate: checkInDate,
      roomKey: roomKey,
    };
  }
}

let cachedBenchmark = null;
let lastBenchmarkTime = 0;

/**
 * Benchmark latency dan status koneksi 9Router
 */
async function benchmarkAI(force = false) {
  const now = Date.now();
  // Gunakan cache selama 10 menit jika bukan permintaan paksa (force)
  if (!force && cachedBenchmark && (now - lastBenchmarkTime < 10 * 60 * 1000)) {
    return cachedBenchmark;
  }

  const start = Date.now();
  try {
    const res = await client.chat.completions.create({
      model: config.ai.model,
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 5,
    });
    const latencyMs = Date.now() - start;
    cachedBenchmark = {
      status: 'online',
      model: config.ai.model,
      baseUrl: config.ai.baseUrl,
      latencyMs,
      timestamp: new Date().toISOString(),
    };
    lastBenchmarkTime = now;
    return cachedBenchmark;
  } catch (err) {
    const latencyMs = Date.now() - start;
    return {
      status: 'offline',
      model: config.ai.model,
      baseUrl: config.ai.baseUrl,
      latencyMs,
      error: err.message,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Diagnostic chat untuk Playground: Mendeteksi In-Topic, Out-of-Topic, dan Eskalasi
 */
async function diagnoseAIChat(userText) {
  const start = Date.now();
  try {
    const response = await client.chat.completions.create({
      model: config.ai.model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userText },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    });

    const latencyMs = Date.now() - start;
    const content = response.choices[0]?.message?.content;
    const parsed = safeJsonParse(content) || {};

    let type = 'in_topic';
    if (parsed.eskalasi === true) {
      if (parsed.alasan === 'di_luar_jangkauan') {
        type = 'out_of_topic';
      } else {
        type = 'escalation';
      }
    }

    return {
      success: true,
      type,
      jawaban: parsed.jawaban || null,
      alasan: parsed.alasan || null,
      eskalasi: parsed.eskalasi === true,
      rawJson: parsed,
      model: config.ai.model,
      baseUrl: config.ai.baseUrl,
      latencyMs,
      source: '9router_gemini',
    };
  } catch (err) {
    const latencyMs = Date.now() - start;
    // Cek local knowledge cache
    const topics = topicsCache;
    const lower = userText.toLowerCase().replace(/[-_]/g, ' ');
    const match = topics.find(t => {
      const top = t.topik.toLowerCase().replace(/[-_]/g, ' ');
      return lower.includes(top) || top.split(' ').some(w => w.length >= 4 && lower.includes(w));
    });

    if (match) {
      return {
        success: true,
        type: 'in_topic',
        jawaban: match.jawaban,
        alasan: 'local_knowledge_fallback',
        eskalasi: false,
        rawJson: { jawaban: match.jawaban, eskalasi: false, fallback: true },
        model: `${config.ai.model} (Fallback Local)`,
        baseUrl: config.ai.baseUrl,
        latencyMs,
        source: 'local_cache',
      };
    }

    return {
      success: false,
      error: err.message,
      latencyMs,
      type: 'error',
      model: config.ai.model,
      baseUrl: config.ai.baseUrl,
    };
  }
}

module.exports = {
  jawabAI,
  parseHotelBookingInput,
  benchmarkAI,
  diagnoseAIChat,
  reloadPrompt: () => { SYSTEM_PROMPT = buildSystemPrompt(); },
};
