const config      = require('../config/env');
const { setStatus } = require('../session/manager');
const {
  sendMessage,
  assignConversation,
  changeConversationStatus,
} = require('../chatwoot/client');

const DEFAULT_REPLY =
  'Baik, pesan Anda telah kami teruskan ke Tim Customer Service kami. Staf kami akan segera membantu Anda. Mohon tunggu sebentar 🙏';

/**
 * Eksekusi alur eskalasi:
 * 1. Assign percakapan ke tim CS
 * 2. Buka/set status percakapan di Chatwoot → open
 * 3. Kirim pesan notifikasi ke user
 * 4. Kunci status lokal → escalated (AI berhenti proses)
 */
async function eksekusiEskalasi(conversationId, alasan = 'keyword', customReply = null) {
  console.log(`🚨 [ESKALASI] Conv ${conversationId} — Alasan: ${alasan}`);

  await assignConversation(conversationId, config.chatwootEscalationTeam);
  await changeConversationStatus(conversationId, 'open');
  await sendMessage(conversationId, customReply || DEFAULT_REPLY);
  setStatus(conversationId, 'escalated');

  console.log(`🔒 [ESKALASI] Conv ${conversationId} dikunci (escalated)`);
}

module.exports = { eksekusiEskalasi };
