const OpenAI = require('openai');
const path = require('path');
const fs = require('fs');
const config = require('../config/env');
const { db } = require('../db/database');

const client = new OpenAI({
  baseURL: config.ai.baseUrl,
  apiKey: config.ai.apiKey,
  timeout: 30000,
});

function buildSystemPrompt() {
  try {
    const dataPath = path.join(__dirname, '../knowledge/data.json');
    const rawData = fs.readFileSync(dataPath, 'utf-8');
    const topics = JSON.parse(rawData);

    // Ambil katalog kamar & menu dari SQLite database
    const rooms = db.prepare('SELECT * FROM room_catalog').all();
    const roomText = rooms.map(r => `- ${r.name}: Rp ${r.price.toLocaleString('id-ID')}/malam (${r.description})`).join('\n');

    const menus = db.prepare('SELECT * FROM menu_catalog').all();
    const menuText = menus.map(m => `- ${m.name} (${m.category}): Rp ${m.price.toLocaleString('id-ID')}`).join('\n');

    const knowledgeText = topics
      .map((item, i) => `${i + 1}. [${item.topik}]\n   ${item.jawaban}`)
      .join('\n\n');

    return `Kamu adalah AI Customer Service resmi dari SapaTamu (Hotel & Kafe).

KNOWLEDGE BASE & KATALOG RESMI:
${knowledgeText}

KATALOG KAMAR HOTEL:
${roomText}

KATALOG MENU KAFE:
${menuText}

ATURAN WAJIB:
1. Jawab berdasarkan knowledge base dan katalog harga di atas.
2. Kamu BISA dan BOLEH melakukan perhitungan matematika sederhana (seperti menghitung total harga beberapa makanan/minuman jika user bertanya).
3. Pahami sinonim, singkatan, dan bahasa santai (contoh: "esteh" = "Es Teh", "nasgor" = "Nasi Goreng Spesial", "jeruk peras" = "Jeruk Peras", "deluxe" = "Deluxe Room", "suite" = "Presidential Suite").
4. Jawab dalam Bahasa Indonesia yang sopan, ramah, singkat dan padat (maksimal 3-4 kalimat).
5. HANYA lakukan eskalasi jika:
   - User secara jelas meminta bicara dengan manusia/staf/admin/CS.
   - User menyampaikan keluhan/komplain berat/marah/darurat.
   - Pertanyaan benar-benar tidak ada hubungannya sama sekali dengan hotel, kafe, atau layanan SapaTamu.
6. SELALU balas dalam format JSON murni:
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
    const parsed = JSON.parse(content);
    return {
      jawaban: parsed.jawaban || null,
      eskalasi: parsed.eskalasi === true,
      alasan: parsed.alasan || null,
    };
  } catch (err) {
    console.error('❌ [AI ERROR]:', err.message);
    // Fallback jika AI 9router sedang down
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

    return JSON.parse(res.choices[0]?.message?.content || '{}');
  } catch (e) {
    return {
      customerName: null,
      nights: 1,
      checkInDate: 'Hari Ini',
      roomKey: null,
    };
  }
}

module.exports = {
  jawabAI,
  parseHotelBookingInput,
  reloadPrompt: () => { SYSTEM_PROMPT = buildSystemPrompt(); },
};
