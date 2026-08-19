const axios  = require('axios');
const config = require('../config/env');

function getHeaders() {
  return {
    'api_access_token': config.chatwootApiToken,
    'Content-Type': 'application/json',
  };
}

const BASE = () => `${config.chatwootBaseUrl}/api/v1/accounts/${config.chatwootAccountId}`;

/**
 * Kirim pesan teks biasa ke Chatwoot (sebagai bot/outgoing).
 */
async function sendMessage(conversationId, text) {
  if (!text) return false;
  try {
    await axios.post(
      `${BASE()}/conversations/${conversationId}/messages`,
      { content: text, message_type: 'outgoing', private: false },
      { headers: getHeaders(), timeout: 10000 }
    );
    console.log(`✅ [Chatwoot] Pesan terkirim ke Conv ${conversationId}`);
    return true;
  } catch (err) {
    console.error(`❌ [Chatwoot] Gagal kirim pesan:`, err.response?.data || err.message);
    return false;
  }
}

const fs    = require('fs');
const path  = require('path');

/**
 * Kirim pesan menu (input_select / inline buttons) ke Chatwoot.
 * items: [{ title: 'Label', value: 'callback_value' }]
 */
async function sendMenuMessage(conversationId, text, items) {
  if (!text || !items?.length) return false;
  try {
    await axios.post(
      `${BASE()}/conversations/${conversationId}/messages`,
      {
        content: text,
        message_type: 'outgoing',
        private: false,
        content_type: 'input_select',
        content_attributes: { items },
      },
      { headers: getHeaders(), timeout: 10000 }
    );
    console.log(`✅ [Chatwoot] Menu terkirim ke Conv ${conversationId}`);
    return true;
  } catch (err) {
    console.error(`❌ [Chatwoot] Gagal kirim menu:`, err.response?.data || err.message);
    return false;
  }
}

/**
 * Kirim gambar lokal beserta caption ke Chatwoot.
 * @param {number|string} conversationId
 * @param {string} imageFilePath - Path absolut/relatif file gambar
 * @param {string} [caption] - Teks keterangan foto
 */
async function sendImageMessage(conversationId, imageFilePath, caption = '') {
  const fullPath = path.isAbsolute(imageFilePath)
    ? imageFilePath
    : path.join(__dirname, '../../', imageFilePath);

  if (!fs.existsSync(fullPath)) {
    console.error(`❌ [Chatwoot] File gambar tidak ditemukan di: ${fullPath}`);
    return false;
  }

  try {
    const fileBuffer = fs.readFileSync(fullPath);
    const fileName   = path.basename(fullPath);
    const mimeType   = fileName.endsWith('.png') ? 'image/png' : 'image/jpeg';
    const blob       = new Blob([fileBuffer], { type: mimeType });

    const form = new FormData();
    if (caption) form.append('content', caption);
    form.append('message_type', 'outgoing');
    form.append('private', 'false');
    form.append('attachments[]', blob, fileName);

    await axios.post(
      `${BASE()}/conversations/${conversationId}/messages`,
      form,
      {
        headers: {
          'api_access_token': config.chatwootApiToken,
        },
        timeout: 15000,
      }
    );
    console.log(`✅ [Chatwoot] Gambar terkirim ke Conv ${conversationId}: ${fileName}`);
    return true;
  } catch (err) {
    console.error(`❌ [Chatwoot] Gagal kirim gambar:`, err.response?.data || err.message);
    return false;
  }
}

/**
 * Assign percakapan ke Tim CS dan/atau agent individual saat terjadi eskalasi.
 */
async function assignConversation(conversationId, teamId) {
  try {
    // Assign ke team (jika dikonfigurasi)
    if (teamId && teamId > 0) {
      await axios.post(
        `${BASE()}/conversations/${conversationId}/assignments`,
        { team_id: teamId },
        { headers: getHeaders(), timeout: 10000 }
      );
      console.log(`✅ [Chatwoot] Conv ${conversationId} di-assign ke Team ${teamId}`);
    }

    // Assign ke agent individual (ambil dari env CHATWOOT_AGENT_ID)
    const agentId = parseInt(process.env.CHATWOOT_AGENT_ID || '0');
    if (agentId > 0) {
      await axios.post(
        `${BASE()}/conversations/${conversationId}/assignments`,
        { assignee_id: agentId },
        { headers: getHeaders(), timeout: 10000 }
      );
      console.log(`✅ [Chatwoot] Conv ${conversationId} di-assign ke Agent ${agentId}`);
    }
    return true;
  } catch (err) {
    console.error(`❌ [Chatwoot] Gagal assign:`, err.response?.data || err.message);
    return false;
  }
}

/**
 * Ubah status percakapan di Chatwoot (open / resolved / pending).
 */
async function changeConversationStatus(conversationId, status) {
  try {
    await axios.post(
      `${BASE()}/conversations/${conversationId}/toggle_status`,
      { status },
      { headers: getHeaders(), timeout: 10000 }
    );
    console.log(`✅ [Chatwoot] Status Conv ${conversationId} → ${status}`);
    return true;
  } catch (err) {
    console.error(`❌ [Chatwoot] Gagal ubah status:`, err.response?.data || err.message);
    return false;
  }
}

module.exports = { sendMessage, sendMenuMessage, sendImageMessage, assignConversation, changeConversationStatus };
