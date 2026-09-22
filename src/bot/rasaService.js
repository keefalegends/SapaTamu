const axios = require('axios');

const RASA_URL = process.env.RASA_API_URL || 'http://localhost:5005/webhooks/rest/webhook';

/**
 * Meneruskan pesan teks WhatsApp ke Rasa AI Server
 * @param {string} senderPhone - Nomor telepon pengguna (misal: 628123456789)
 * @param {string} text - Kalimat pesan masuk dari tamu
 * @returns {Promise<{handled: boolean, messages?: string[], error?: string}>}
 */
async function sendToRasa(senderPhone, text) {
  try {
    const response = await axios.post(
      RASA_URL,
      {
        sender: String(senderPhone),
        message: text,
      },
      { timeout: 4000 }
    );

    if (Array.isArray(response.data) && response.data.length > 0) {
      const texts = response.data.map((m) => m.text).filter(Boolean);
      return {
        handled: texts.length > 0,
        messages: texts,
      };
    }

    return { handled: false };
  } catch (err) {
    // Rasa offline atau request timeout
    return { handled: false, error: err.message };
  }
}

module.exports = {
  sendToRasa,
};
