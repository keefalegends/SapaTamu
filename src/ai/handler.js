/**
 * AI Handler — menggunakan OpenRouter (openai-compatible API)
 * Models gratis: google/gemini-2.0-flash-exp:free, meta-llama/llama-3.3-70b-instruct:free
 */

const OpenAI = require('openai');
const config = require('../config/env');

const client = new OpenAI({
  baseURL: process.env.NINER_ROUTER_URL || 'http://localhost:20128/v1',
  apiKey : process.env.NINER_ROUTER_KEY || process.env.GEMINI_API_KEY || 'no-key',
  defaultHeaders: {
    'HTTP-Referer': 'https://sapatamu.local',
    'X-Title'     : 'SapaTamu Bot',
  },
});

const MODEL = process.env.NINER_ROUTER_MODEL || 'gc/gemini-2.5-flash';

const SYSTEM_PROMPT = `Kamu adalah AI Customer Service asisten dari SapaTamu — sebuah resort yang memiliki Hotel dan Kafe.

INFORMASI BISNIS:
=== HOTEL ===
- Harga Kamar: Deluxe Rp 550.000/malam | Executive Suite Rp 950.000/malam | Presidential Suite Rp 1.800.000/malam
- Check-In: 14.00 | Check-Out: 12.00
- Fasilitas: Kolam Renang (06-21), Restoran (06-22), Gym (05-22), WiFi gratis, Parkir gratis, Room Service 24 jam, Laundry express

=== KAFE ===
- Jam Buka: 07.00 – 22.00 WIB
- Minuman: Espresso/Americano Rp 22.000 | Caffe Latte/Cappuccino Rp 28.000 | Matcha Latte Rp 25.000 | Es Teh/Jeruk Peras Rp 15.000
- Makanan: Butter Croissant Rp 20.000 | Roti Bakar Spesial Rp 18.000 | Spaghetti Carbonara Rp 45.000 | Nasi Goreng Spesial Rp 35.000

ATURAN MENJAWAB:
1. Jawab dalam Bahasa Indonesia yang sopan dan ramah
2. Jawab SINGKAT dan PADAT (max 3-4 kalimat)
3. Jika pertanyaan di luar informasi di atas atau menyangkut komplain serius → kembalikan {"eskalasi": true, "alasan": "di_luar_jangkauan"}
4. Jika user meminta bicara dengan manusia/staf → kembalikan {"eskalasi": true, "alasan": "minta_manusia"}
5. Selalu balas dalam format JSON: {"jawaban": "...", "eskalasi": false} ATAU {"eskalasi": true, "alasan": "..."}`;

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
      temperature     : 0.3,
      response_format : { type: 'json_object' },
    });

    const raw = completion.choices[0]?.message?.content?.trim();
    console.log(`🤖 [AI Raw] ${raw}`);

    // Strip markdown code block kalau ada (```json ... ```)
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const parsed = JSON.parse(cleaned);

    if (parsed.eskalasi === true) {
      return { jawaban: null, eskalasi: true, alasan: parsed.alasan || 'ai_eskalasi' };
    }

    return {
      jawaban : parsed.jawaban || null,
      eskalasi: false,
      alasan  : null,
    };

  } catch (err) {
    console.error(`❌ [AI] Error:`, err.message || err);
    return { jawaban: null, eskalasi: true, alasan: 'ai_error' };
  }
}

module.exports = { jawab };
