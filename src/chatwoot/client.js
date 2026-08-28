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

const mediaCache = new Map();

/**
 * Kirim gambar lokal beserta caption ke WhatsApp via Meta Cloud API & catat ke Chatwoot.
 * @param {number|string} conversationId
 * @param {string} imageFilePath - Path absolut/relatif file gambar
 * @param {string} [caption] - Teks keterangan foto
 * @param {string} [recipientPhone] - Nomor WhatsApp tujuan (opsional)
 */
async function sendImageMessage(conversationId, imageFilePath, caption = '', recipientPhone = '') {
  const fullPath = path.isAbsolute(imageFilePath)
    ? imageFilePath
    : path.join(__dirname, '../../', imageFilePath);

  if (!fs.existsSync(fullPath)) {
    console.error(`❌ [Media] File gambar tidak ditemukan di: ${fullPath}`);
    if (caption) await sendMessage(conversationId, caption);
    return false;
  }

  const token   = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.PHONE_NUMBER_ID || '1289827514206711';

  try {
    // 1. Dapatkan atau upload media ke Meta WhatsApp Media API
    const fileStats = fs.statSync(fullPath);
    const cacheKey  = `${fullPath}_${fileStats.mtimeMs}`;
    let mediaId     = mediaCache.get(cacheKey);

    if (!mediaId) {
      const fileBuffer = fs.readFileSync(fullPath);
      const fileName   = path.basename(fullPath);
      const mimeType   = fileName.endsWith('.png') ? 'image/png' : 'image/jpeg';
      const blob       = new Blob([fileBuffer], { type: mimeType });

      const form = new FormData();
      form.append('messaging_product', 'whatsapp');
      form.append('file', blob, fileName);
      form.append('type', mimeType);

      const uploadRes = await axios.post(
        `https://graph.facebook.com/v20.0/${phoneId}/media`,
        form,
        { headers: { Authorization: `Bearer ${token}` }, timeout: 20000 }
      );
      mediaId = uploadRes.data?.id;
      if (mediaId) {
        mediaCache.set(cacheKey, mediaId);
        console.log(`✅ [Meta Media] Upload berhasil, mediaId: ${mediaId}`);
      }
    }

    // 2. Dapatkan nomor telepon penerima jika belum disediakan
    let targetPhone = recipientPhone;
    if (!targetPhone) {
      const convRes = await axios.get(
        `${BASE()}/conversations/${conversationId}`,
        { headers: getHeaders(), timeout: 10000 }
      );
      const meta = convRes.data?.meta;
      targetPhone = meta?.sender?.phone_number || convRes.data?.contact_inbox?.source_id;
    }

    // 3. Kirim pesan gambar langsung ke WhatsApp jika ada nomor tujuan
    if (targetPhone && mediaId) {
      const cleanPhone = targetPhone.replace(/\D/g, '');
      await axios.post(
        `https://graph.facebook.com/v20.0/${phoneId}/messages`,
        {
          messaging_product: 'whatsapp',
          recipient_type:    'individual',
          to:                cleanPhone,
          type:              'image',
          image: {
            id:      mediaId,
            caption: caption || '',
          },
        },
        {
          headers: {
            Authorization:  `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          timeout: 15000,
        }
      );
      console.log(`✅ [WhatsApp Direct] Gambar terkirim ke ${cleanPhone}`);
    }

    // 4. Catat riwayat ke Chatwoot sebagai Private Note (tidak dikirim ulang ke WhatsApp)
    if (caption) {
      await axios.post(
        `${BASE()}/conversations/${conversationId}/messages`,
        { content: `📷 [Foto Terkirim ke User]\n\n${caption}`, message_type: 'outgoing', private: true },
        { headers: getHeaders(), timeout: 10000 }
      ).catch(() => {});
    }

    return true;
  } catch (err) {
    console.error(`❌ [Media Error] Gagal kirim gambar via WhatsApp Direct:`, err.response?.data || err.message);
    // Fallback: kirim teksnya ke Chatwoot
    if (caption) await sendMessage(conversationId, caption);
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

/**
 * Dapatkan informasi nomor antrian live dari Chatwoot.
 * @param {number|string} conversationId
 * @returns {Promise<{ position: number, totalOpen: number, isDirect: boolean, waitTimeMin: number, waitTimeMax: number }>}
 */
async function getQueueInfo(conversationId) {
  try {
    const res = await axios.get(
      `${BASE()}/conversations?status=open`,
      { headers: getHeaders(), timeout: 10000 }
    );
    const payload = res.data?.data?.payload || [];
    // Filter percakapan terbuka yang aktif
    const openConvs = payload.filter(c => c.status === 'open');
    const targetId = parseInt(conversationId);

    // Sort FIFO: Urutkan dari percakapan terlama (yang antre duluan) ke terbaru
    openConvs.sort((a, b) => {
      const timeA = typeof a.created_at === 'number' ? a.created_at : parseInt(a.created_at) || a.id;
      const timeB = typeof b.created_at === 'number' ? b.created_at : parseInt(b.created_at) || b.id;
      return timeA - timeB;
    });

    // Cari posisi percakapan ini dalam antrian
    let pos = openConvs.findIndex(c => c.id === targetId);
    let position;

    if (pos !== -1) {
      position = pos + 1;
    } else {
      // Jika percakapan baru dibuka dan belum masuk payload
      position = openConvs.length + 1;
    }

    const isDirect = position <= 1;
    const waitTimeMin = isDirect ? 1 : position * 2;
    const waitTimeMax = isDirect ? 2 : position * 3;

    return {
      position,
      totalOpen: openConvs.length,
      isDirect,
      waitTimeMin,
      waitTimeMax,
    };
  } catch (err) {
    console.error(`⚠️ [Queue] Gagal cek antrian Chatwoot:`, err.message);
    return {
      position: 1,
      totalOpen: 1,
      isDirect: true,
      waitTimeMin: 1,
      waitTimeMax: 2,
    };
  }
}

module.exports = {
  sendMessage,
  sendMenuMessage,
  sendImageMessage,
  assignConversation,
  changeConversationStatus,
  getQueueInfo,
};
