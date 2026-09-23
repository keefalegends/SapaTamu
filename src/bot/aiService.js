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
    const roomText = rooms.map(r => `- ${r.name}: Rp ${r.price.toLocaleString('id-ID')}/malam (${r.description})`).join('\n');

    const menus = db.prepare('SELECT * FROM menu_catalog').all();
    const menuText = menus.map(m => `- ${m.name} (${m.category}): Rp ${m.price.toLocaleString('id-ID')}`).join('\n');

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

async function jawabAI(userText) {
  try {
    const response = await client.chat.completions.create({
      model: config.ai.model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userText },
      ],
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
        return {
          jawaban: match.jawaban,
          eskalasi: false,
          alasan: 'local_knowledge_fallback',
        };
      }
    } catch (e) {}

    return {
      jawaban: 'Halo! Ada yang bisa kami bantu seputar Hotel atau Kafe SapaTamu? Silakan pilih menu di bawah ini atau ketik pertanyaan Anda.',
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
