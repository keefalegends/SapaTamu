const config      = require('../config/env');
const { setStatus } = require('../session/manager');
const {
  sendMessage,
  assignConversation,
  changeConversationStatus,
  getQueueInfo,
} = require('../chatwoot/client');

/**
 * Format pesan antrian ramah & transparan berdasarkan posisi antrian di Chatwoot
 */
function formatQueueMessage(queueInfo) {
  if (queueInfo.isDirect) {
    return (
      '👨‍💼 *Menghubungkan ke Staf Customer Service...*\n\n' +
      'Halo! Anda terhubung langsung dengan tim kami.\n\n' +
      '🟢 *Status:* Staf Siap Membantu\n\n' +
      '_Staf kami akan segera membalas pesan Anda. Mohon ditunggu ya_ 🙏'
    );
  }

  return (
    '👨‍💼 *Menghubungkan ke Staf Customer Service...*\n\n' +
    'Saat ini semua staf kami sedang melayani tamu lain.\n\n' +
    `🔢 *Posisi Antrian Anda:* *Ke-${queueInfo.position}*\n` +
    '⏳ *Status:* Menunggu Giliran\n\n' +
    '_Mohon tunggu sebentar, pesan Anda akan segera dibalas oleh tim kami sesuai urutan antrian. Terima kasih atas kesabarannya!_ 🙏'
  );
}

/**
 * Eksekusi alur eskalasi:
 * 1. Assign percakapan ke tim CS
 * 2. Buka/set status percakapan di Chatwoot → open
 * 3. Hitung nomor antrian live dari Chatwoot dan kirim notifikasi
 * 4. Kunci status lokal → escalated (AI berhenti proses)
 */
async function eksekusiEskalasi(conversationId, alasan = 'keyword', customReply = null) {
  console.log(`🚨 [ESKALASI] Conv ${conversationId} — Alasan: ${alasan}`);

  await assignConversation(conversationId, config.chatwootEscalationTeam);
  await changeConversationStatus(conversationId, 'open');

  let messageToSend = customReply;
  if (!messageToSend) {
    const queueInfo = await getQueueInfo(conversationId);
    console.log(`🔢 [QUEUE] Conv ${conversationId} | Posisi: ${queueInfo.position} | Total Open: ${queueInfo.totalOpen}`);
    messageToSend = formatQueueMessage(queueInfo);
  }

  await sendMessage(conversationId, messageToSend);
  setStatus(conversationId, 'escalated');

  console.log(`🔒 [ESKALASI] Conv ${conversationId} dikunci (escalated)`);
}

module.exports = { eksekusiEskalasi, formatQueueMessage };
