#!/usr/bin/env node
/**
 * setup_agent_bot.js
 * Script satu kali untuk mendaftarkan Agent Bot ke Chatwoot
 * dan menghubungkannya ke Inbox WhatsApp.
 *
 * Usage: node setup_agent_bot.js
 */

const axios = require('axios');
require('dotenv').config();

const BASE_URL   = process.env.CHATWOOT_BASE_URL  || 'http://localhost:3001';
const API_TOKEN  = process.env.CHATWOOT_API_TOKEN || '';
const ACCOUNT_ID = parseInt(process.env.CHATWOOT_ACCOUNT_ID || '2', 10);

const headers = {
  'api_access_token': API_TOKEN,
  'Content-Type': 'application/json',
};

async function createAgentBot(name, webhookUrl) {
  console.log(`\n[*] Mendaftarkan Agent Bot "${name}"...`);
  try {
    const res = await axios.post(
      `${BASE_URL}/api/v1/agent_bots`,
      { name, outgoing_url: webhookUrl },
      { headers }
    );
    const bot = res.data;
    console.log(`[+] Berhasil! Agent Bot ID: ${bot.id}`);
    return bot.id;
  } catch (err) {
    console.error(`[-] Gagal buat Agent Bot:`, err.response?.data || err.message);
    process.exit(1);
  }
}

async function listInboxes() {
  try {
    const res = await axios.get(
      `${BASE_URL}/api/v1/accounts/${ACCOUNT_ID}/inboxes`,
      { headers }
    );
    const inboxes = res.data?.payload || [];
    console.log('\n[*] Daftar Inbox:');
    inboxes.forEach(inbox => {
      console.log(`    ID: ${inbox.id} | Nama: ${inbox.name} | Channel: ${inbox.channel_type}`);
    });
    return inboxes;
  } catch (err) {
    console.error(`[-] Gagal ambil daftar Inbox:`, err.response?.data || err.message);
    process.exit(1);
  }
}

async function connectBotToInbox(botId, inboxId) {
  console.log(`\n[*] Menghubungkan Bot ${botId} ke Inbox ${inboxId}...`);
  try {
    const res = await axios.post(
      `${BASE_URL}/api/v1/accounts/${ACCOUNT_ID}/agent_bots/${botId}/inboxes`,
      { inbox_ids: [inboxId] },
      { headers }
    );
    console.log(`[+] Bot berhasil disambungkan ke Inbox!`);
  } catch (err) {
    // Cara alternatif jika endpoint di atas tidak tersedia di versi Chatwoot ini
    console.warn(`[!] Endpoint otomatis gagal (${err.response?.status}). Coba manual:`);
    console.warn(`    Chatwoot → Settings → Inboxes → Edit Inbox → Collaborators → pilih "WazapBro AI" di dropdown Agent Bot`);
  }
}

async function main() {
  console.log('='.repeat(50));
  console.log('🤖 SETUP CHATWOOT AGENT BOT (WAZAPBRO AI)');
  console.log('='.repeat(50));

  if (!API_TOKEN) {
    console.error('ERROR: CHATWOOT_API_TOKEN belum diset di .env!');
    process.exit(1);
  }

  // Minta URL backend dari user
  const readline = require('readline').createInterface({ input: process.stdin, output: process.stdout });

  readline.question(
    '\nMasukkan URL backend kamu (tunnel URL, diakhiri /webhook/chatwoot)\nContoh: https://xyz.trycloudflare.com/webhook/chatwoot\nWebhook URL: ',
    async (webhookUrl) => {
      webhookUrl = webhookUrl.trim();
      if (!webhookUrl) {
        console.log('Dibatalkan.');
        readline.close();
        return;
      }

      const botId  = await createAgentBot('WazapBro AI', webhookUrl);
      const inboxes = await listInboxes();

      if (inboxes.length === 0) {
        console.log('\nTidak ada inbox. Buat inbox WhatsApp di Chatwoot dulu!');
        readline.close();
        return;
      }

      readline.question('\nMasukkan ID Inbox WhatsApp yang ingin dihubungkan: ', async (inboxId) => {
        if (inboxId && !isNaN(inboxId)) {
          await connectBotToInbox(botId, parseInt(inboxId, 10));
        }
        console.log('\n✅ Setup selesai! Pesan masuk ke inbox akan dikirim ke webhook kamu.');
        console.log(`\n💡 SIMPAN Bot ID ini: ${botId}`);
        readline.close();
      });
    }
  );
}

main();
