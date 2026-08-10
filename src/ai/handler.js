const config               = require('../config/env');
const { getGeminiClient }  = require('./gateway');
const { getKnowledgeText } = require('../knowledge/loader');

const FAIL_SAFE = { jawaban: null, eskalasi: true, alasan: 'ai_error' };

const SYSTEM_PROMPT = `Kamu adalah asisten virtual (AI) untuk layanan pelanggan Hotel & Kafe SapaTamu.
Jawab HANYA berdasarkan informasi (Knowledge Base) berikut:

{knowledge}

Aturan penting:
1. Jawab dengan ramah, profesional, dan ringkas dalam Bahasa Indonesia.
2. JANGAN pernah mengarang informasi di luar Knowledge Base.
3. Kamu HARUS SELALU membalas dalam format JSON yang valid.
4. Schema JSON yang WAJIB kamu gunakan:
   {
     "jawaban": "isi jawaban ke pelanggan, atau null jika eskalasi",
     "eskalasi": true atau false,
     "alasan": "tidak_ada_di_knowledge_base" atau "minta_manusia" atau null
   }

Kondisi untuk eskalasi (eskalasi = true):
- Jika pelanggan menanyakan sesuatu yang tidak ada di Knowledge Base → alasan: "tidak_ada_di_knowledge_base"
- Jika pelanggan secara eksplisit meminta bicara dengan CS manusia / staf → alasan: "minta_manusia"
Dalam kondisi ini, isi "jawaban" dengan null.`;

/**
 * Tanya Gemini untuk menjawab FAQ.
 * Returns: { jawaban: string|null, eskalasi: boolean, alasan: string|null }
 */
async function jawab(pesan) {
  if (!pesan) return FAIL_SAFE;

  const knowledge   = getKnowledgeText();
  const systemText  = SYSTEM_PROMPT.replace('{knowledge}', knowledge);

  try {
    const client = getGeminiClient();
    const model  = client.getGenerativeModel({
      model: config.geminiModel,
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0,
      },
      systemInstruction: systemText,
    });

    const result  = await model.generateContent(pesan);
    const rawText = result.response.text();

    const parsed = JSON.parse(rawText);
    if (typeof parsed.eskalasi === 'undefined') throw new Error('Field eskalasi tidak ada');

    console.log(`🤖 [AI] Response:`, JSON.stringify(parsed));
    return parsed;

  } catch (err) {
    console.error(`❌ [AI] Error:`, err.message || err);
    return FAIL_SAFE;
  }
}

module.exports = { jawab };
