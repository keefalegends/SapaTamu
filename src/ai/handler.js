/**
 * AI Handler — menggunakan 9router (openai-compatible API)
 * Knowledge base dibaca dari src/knowledge/data.json
 * AI HANYA boleh menjawab berdasarkan data tersebut.
 */

const OpenAI = require('openai');
const path   = require('path');
const fs     = require('fs');

const client = new OpenAI({
  baseURL: process.env.NINER_ROUTER_URL || 'http://localhost:20128/v1',
  apiKey : process.env.NINER_ROUTER_KEY || process.env.GEMINI_API_KEY || 'no-key',
  timeout: 45000, // 45 detik timeout — 9router VPS bisa lambat tapi masih jalan
  defaultHeaders: {
    'HTTP-Referer': 'https://sapatamu.local',
    'X-Title'     : 'SapaTamu Bot',
  },
});

const MODEL = process.env.NINER_ROUTER_MODEL || 'gc/gemini-2.5-flash';

// ─── Load knowledge base dari data.json ──────────────────────────────────────

function buildSystemPrompt() {
  try {
    const dataPath = path.join(__dirname, '../knowledge/data.json');
    const rawData  = fs.readFileSync(dataPath, 'utf-8');
    const topics   = JSON.parse(rawData);

    const knowledgeText = topics
      .map((item, i) => `${i + 1}. [${item.topik}]\n   ${item.jawaban}`)
      .join('\n\n');

    return `Kamu adalah AI Customer Service dari SapaTamu (Hotel & Kafe).

KNOWLEDGE BASE (SATU-SATUNYA SUMBER JAWABAN):
${knowledgeText}

ATURAN WAJIB:
1. Jawab HANYA berdasarkan knowledge base di atas. JANGAN mengarang atau menambah informasi di luar data tersebut.
2. Jawab dalam Bahasa Indonesia yang sopan dan ramah.
3. Jawab SINGKAT dan PADAT (maks 3-4 kalimat).
4. Jika pertanyaan TIDAK ada dalam knowledge base → eskalasi ke staf.
5. Jika user minta bicara dengan manusia/staf → eskalasi ke staf.
6. Jika ada keluhan/komplain serius → eskalasi ke staf.
7. SELALU balas dalam format JSON:
   - Jawaban normal : {"jawaban": "...", "eskalasi": false}
   - Eskalasi       : {"eskalasi": true, "alasan": "di_luar_jangkauan" | "minta_manusia" | "komplain"}`;

  } catch (err) {
    console.error('⚠️ [AI] Gagal load knowledge/data.json:', err.message);
    // Fallback minimal jika file tidak ada
    return `Kamu adalah AI Customer Service SapaTamu.
Jawab dalam JSON: {"jawaban":"...","eskalasi":false} atau {"eskalasi":true,"alasan":"..."}
Jika tidak tahu → {"eskalasi":true,"alasan":"di_luar_jangkauan"}`;
  }
}

// Build sekali saat startup (cached), reload jika file berubah lewat SIGUSR2
let SYSTEM_PROMPT = buildSystemPrompt();
console.log(`✅ [AI] Knowledge base dimuat — ${SYSTEM_PROMPT.split('\n').length} baris`);

// Hot-reload knowledge base tanpa restart server (opsional)
process.on('SIGUSR2', () => {
  SYSTEM_PROMPT = buildSystemPrompt();
  console.log('🔄 [AI] Knowledge base di-reload!');
});

// ─── Main function ────────────────────────────────────────────────────────────

/**
 * Tanya AI dan dapatkan jawaban terstruktur
 * @param {string} pertanyaan
 * @returns {{ jawaban: string|null, eskalasi: boolean, alasan: string|null }}
 */
async function jawab(pertanyaan) {
  try {
    const completion = await client.chat.completions.create({
      model   : MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: pertanyaan     },
      ],
      max_tokens      : 400,
      temperature     : 0.2,   // Lebih rendah = lebih konsisten/tidak ngarang
      response_format : { type: 'json_object' },
    });

    const raw = completion.choices[0]?.message?.content?.trim();
    console.log(`🤖 [AI Raw] ${raw}`);

    // Strip markdown code block kalau ada (```json ... ```)
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const parsed  = JSON.parse(cleaned);

    if (parsed.eskalasi === true) {
      return { jawaban: null, eskalasi: true, alasan: parsed.alasan || 'ai_eskalasi' };
    }

    return {
      jawaban : parsed.jawaban || null,
      eskalasi: false,
      alasan  : null,
    };

  } catch (err) {
    const errMsg = err.message || String(err);
    // Timeout atau koneksi putus
    if (errMsg.includes('timeout') || errMsg.includes('ECONNREFUSED') ||
        errMsg.includes('530') || errMsg.includes('network') ||
        errMsg.includes('fetch failed') || err.status >= 500) {
      console.error(`⏰ [AI] Timeout/Down — 9router tidak bisa dijangkau`);
      return { jawaban: null, eskalasi: false, alasan: 'ai_down',
               fallback: '⚠️ Maaf, layanan AI sedang tidak tersedia. Silakan coba lagi atau hubungi staf kami.' };
    }
    console.error(`❌ [AI] Error:`, errMsg);
    return { jawaban: null, eskalasi: true, alasan: 'ai_error' };
  }
}

/**
 * Ekstrak entitas booking (tanggal, malam, nama, tipe kamar) dari input teks bebas
 */
async function parseBookingInput(text) {
  const t = text.trim();
  const lower = t.toLowerCase();

  const result = {
    roomKey: null,
    nights: 1,
    checkInDate: null,
    customerName: null,
  };

  // 1. Ekstrak tipe kamar
  if (lower.includes('presidential') || lower.includes('suite') || lower.includes('presiden')) {
    result.roomKey = 'suite';
  } else if (lower.includes('executive') || lower.includes('eksekutif')) {
    result.roomKey = 'executive';
  } else if (lower.includes('deluxe')) {
    result.roomKey = 'deluxe';
  }

  // 2. Ekstrak rentang tanggal: "20 Agustus sampai 21 Agustus" atau "20 - 22 Agustus"
  const rangeMatch = t.match(/(\d{1,2})\s*(?:[A-Za-z]+)?\s*(?:sampai|-|s\/d|hingga)\s*(\d{1,2})\s*([A-Za-z]+(?:\s+\d{2,4})?)/i);
  if (rangeMatch) {
    const d1 = parseInt(rangeMatch[1]);
    const d2 = parseInt(rangeMatch[2]);
    const monthYear = rangeMatch[3];
    if (d2 > d1) {
      result.nights = d2 - d1;
    }
    result.checkInDate = `${d1} ${monthYear}`;
  } else {
    // Tanggal tunggal
    const dateMatch = t.match(/(\d{1,2}\s+(?:jan|feb|mar|apr|mei|jun|jul|agu|agt|sep|okt|nov|des)[a-z]*(?:\s+\d{2,4})?|\d{1,2}[-/]\d{1,2}(?:[-/]\d{2,4})?|besok|lusa|hari ini)/i);
    if (dateMatch) {
      result.checkInDate = dateMatch[1].trim();
    }
  }

  // 3. Ekstrak durasi jika ditulis eksplisit: "X malam" / "X hari"
  const nightMatch = lower.match(/(\d+)\s*(malam|hari|night)/i);
  if (nightMatch) {
    result.nights = parseInt(nightMatch[1]) || 1;
  }

  // 4. Ekstrak nama
  // Pola A: "atas nama X" / "nama: X" / "a/n X"
  const explicitName = t.match(/\b(?:atas\s+nama|a\/n|nama)\b\s*[:=]?\s*([A-Za-z\s]{2,30})/i);
  if (explicitName) {
    result.customerName = explicitName[1].trim();
  } else if (result.checkInDate) {
    // Pola B: Nama ditaruh di awal sebelum tanggal, contoh "Keefa Youra Pambudi 20 Agustus..."
    const firstWordOfDate = result.checkInDate.split(' ')[0];
    const idx = t.toLowerCase().indexOf(firstWordOfDate.toLowerCase());
    if (idx > 2) {
      const potentialName = t.substring(0, idx).trim().replace(/[,\-:]+$/, '').trim();
      if (potentialName.length >= 3 && !/^(mau|pesan|booking|saya|tolong|kamar)\b/i.test(potentialName)) {
        result.customerName = potentialName;
      }
    }
  }

  // Fallback tanggal jika tidak terdeteksi
  if (!result.checkInDate && t.length < 40 && !result.customerName) {
    result.checkInDate = t;
  }

  return result;
}

module.exports = { jawab, parseBookingInput };
