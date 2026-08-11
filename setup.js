/**
 * SapaTamu - Auto Setup Script
 * Jalankan setiap kali restart: node setup.js <tunnel_backend> <tunnel_chatwoot>
 * 
 * Contoh:
 * node setup.js https://abc.trycloudflare.com https://xyz.trycloudflare.com
 */

require('dotenv').config();
const axios = require('axios');

const [,, backendTunnel, chatwootTunnel] = process.argv;

if (!backendTunnel || !chatwootTunnel) {
  console.log(`
╔══════════════════════════════════════════════════════╗
║          SapaTamu Auto Setup Script                  ║
╚══════════════════════════════════════════════════════╝

Usage:
  node setup.js <backend_tunnel> <chatwoot_tunnel>

Contoh:
  node setup.js https://abc-xyz.trycloudflare.com https://def-ghi.trycloudflare.com

Cara dapat URL tunnel:
  Terminal 1 → cloudflared tunnel --url http://localhost:3000  (backend)
  Terminal 2 → cloudflared tunnel --url http://localhost:3001  (chatwoot)
`);
  process.exit(1);
}

const headers = { 'api_access_token': process.env.CHATWOOT_API_TOKEN };
const base    = `${process.env.CHATWOOT_BASE_URL}/api/v1/accounts/${process.env.CHATWOOT_ACCOUNT_ID}`;
const wabaId  = '1546403117284602';
const phoneEncoded = '%2B6281958992884';

console.log('\n╔══════════════════════════════════════════════════════╗');
console.log('║          SapaTamu Auto Setup                         ║');
console.log('╚══════════════════════════════════════════════════════╝\n');
console.log(`🔗 Backend  : ${backendTunnel}`);
console.log(`🔗 Chatwoot : ${chatwootTunnel}\n`);

async function setup() {
  let ok = 0;

  // ── 1. Update Agent Bot webhook URL ────────────────────────────────────────
  try {
    const bots = await axios.get(`${base}/agent_bots`, { headers });
    const bot  = bots.data[0];
    const webhookUrl = `${backendTunnel}/webhook/chatwoot`;

    await axios.patch(`${base}/agent_bots/${bot.id}`,
      { outgoing_url: webhookUrl },
      { headers }
    );
    console.log(`✅ [1/4] Agent Bot webhook → ${webhookUrl}`);
    ok++;
  } catch (e) {
    console.error(`❌ [1/4] Agent Bot webhook gagal:`, e.response?.data || e.message);
  }

  // ── 2. Update Meta WABA webhook ke tunnel Chatwoot ─────────────────────────
  try {
    const chatwootWebhook = `${chatwootTunnel}/webhooks/whatsapp/${phoneEncoded}`;
    await axios.post(
      `https://graph.facebook.com/v20.0/${wabaId}/subscribed_apps`,
      { override_callback_uri: chatwootWebhook, verify_token: '490a61067dfa2f14ef0f6b1412e3b84f' },
      { headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` } }
    );
    console.log(`✅ [2/4] Meta WABA webhook → ${chatwootWebhook}`);
    ok++;
  } catch (e) {
    // Fallback: subscribe tanpa override
    try {
      await axios.post(
        `https://graph.facebook.com/v20.0/${wabaId}/subscribed_apps`,
        {},
        { headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` } }
      );
      console.log(`✅ [2/4] Meta WABA subscribed (fallback - tanpa override URL)`);
      ok++;
    } catch (e2) {
      console.error(`❌ [2/4] Meta WABA gagal:`, e2.response?.data?.error?.message);
    }
  }

  // ── 3. Test 9router AI ─────────────────────────────────────────────────────
  try {
    const { jawab } = require('./src/ai/handler');
    const r = await jawab('tes');
    if (r.jawaban || r.eskalasi) {
      console.log(`✅ [3/4] 9router AI → ${process.env.NINER_ROUTER_URL}`);
      ok++;
    }
  } catch (e) {
    console.error(`❌ [3/4] 9router AI gagal:`, e.message);
  }

  // ── 4. Reset sessions ──────────────────────────────────────────────────────
  try {
    const { getDb } = require('./src/db/session');
    const db = getDb();
    const result = db.prepare('DELETE FROM session_state').run();
    console.log(`✅ [4/4] Sessions direset (${result.changes} dihapus)`);
    ok++;
  } catch (e) {
    console.error(`❌ [4/4] Session reset gagal:`, e.message);
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(54));
  if (ok === 4) {
    console.log(`🎉 SEMUA SIAP! (${ok}/4) Bot SapaTamu siap menerima pesan!\n`);
    console.log('Langkah berikutnya:');
    console.log('  1. Jalankan server: npm run dev');
    console.log('  2. Test: kirim "halo" dari WhatsApp\n');
  } else {
    console.log(`⚠️  Setup selesai dengan ${ok}/4 berhasil. Cek error di atas.\n`);
  }
}

setup().catch(console.error);
