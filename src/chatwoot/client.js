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
 * Assign percakapan ke Tim CS saat terjadi eskalasi.
 */
async function assignConversation(conversationId, teamId) {
  if (!teamId || teamId <= 0) return false;
  try {
    await axios.post(
      `${BASE()}/conversations/${conversationId}/assignments`,
      { team_id: teamId },
      { headers: getHeaders(), timeout: 10000 }
    );
    console.log(`✅ [Chatwoot] Conv ${conversationId} di-assign ke Team ${teamId}`);
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

module.exports = { sendMessage, sendMenuMessage, assignConversation, changeConversationStatus };
