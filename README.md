# 🏨 SapaTamu Bot

> WhatsApp Customer Service Bot untuk Hotel & Kafe SapaTamu  
> Hybrid **BOT + AI** — tombol = static menu, teks bebas = AI menjawab

---

## 📌 Fitur

- 🤖 **AI Customer Service** — menjawab pertanyaan dari knowledge base secara otomatis
- 👨‍💼 **Escalation ke Staf** — tombol CS atau AI tidak sanggup → langsung ke human agent
- 📋 **Menu Interaktif** — tombol Kafe / Hotel / Customer Service via WhatsApp
- 🧠 **Knowledge Base** — data di `src/knowledge/data.json`, mudah diedit tanpa ubah kode
- 🏷️ **Label Pesan** — `🤖 Dijawab oleh AI` / `👨‍💼 Staf Manusia` jelas terlihat
- ♻️ **Auto Reset** — setelah CS resolve, bot aktif kembali + notif ke user

---

## 🏗️ Arsitektur

```
WhatsApp User
     │
     ▼
Meta Cloud API ──► Chatwoot (port 3001) ──► SapaTamu Backend (port 3000)
                                                      │
                                          ┌───────────┴───────────┐
                                          │                       │
                                    Tombol (BOT)           Teks bebas (AI)
                                    Static menu            9router → Gemini
```

### State Machine

| State | Trigger | Perilaku |
|---|---|---|
| `idle` | Percakapan baru / setelah resolve | Kirim welcome + menu |
| `ai_active` | Setelah welcome | Tombol → submenu; Teks → AI |
| `escalated` | Klik CS / AI tidak sanggup | Bot diam, staf menangani |

---

## ⚙️ Tech Stack

| Layer | Teknologi |
|---|---|
| Backend | Node.js + Express |
| Inbox CS | [Chatwoot](https://chatwoot.com) |
| WhatsApp API | Meta Cloud API |
| AI Gateway | 9router (openai-compatible) |
| AI Model | Gemini 2.5 Flash |
| Session DB | SQLite (better-sqlite3) |
| Tunnel | Cloudflare Tunnel |

---

## 🚀 Cara Menjalankan (Startup Guide)

### Prasyarat
- Node.js ≥ 18
- Chatwoot sudah terinstall dan dikonfigurasi
- `cloudflared` CLI terinstall
- 9router aktif di VPS (hubungi admin)

---

### Step 1 — Jalankan Chatwoot

```powershell
cd C:\kerjaanwoe\PKL-Desnet\chatwoot
bundle exec rails s -p 3001
```

> Tunggu: `Listening on http://[::]:3001`

---

### Step 2 — Jalankan SapaTamu Backend

```powershell
cd C:\kerjaanwoe\PKL-Desnet\SapaTamu
npm run dev
```

> Tunggu: `✅ Server berjalan di port 3000`

---

### Step 3 — Buka Dua Tunnel

> ⚠️ **URL tunnel berubah setiap sesi** — harus diupdate di Meta & Chatwoot!

**Tunnel Backend** (untuk Meta webhook):
```powershell
cloudflared tunnel --url http://localhost:3000
```

**Tunnel Chatwoot** (untuk WhatsApp Cloud API):
```powershell
cloudflared tunnel --url http://localhost:3001
```

---

### Step 4 — Update Webhook URL

Setiap sesi baru, update 3 URL berikut:

| Target | URL |
|---|---|
| **Meta WABA Webhook** | `https://<tunnel-backend>/webhook/meta` |
| **Chatwoot → Backend Webhook** | `https://<tunnel-backend>/webhook/chatwoot` |
| **Chatwoot WhatsApp Inbox** | `https://<tunnel-chatwoot>` |

**Cara update Meta:**
1. [Meta Business Suite](https://business.facebook.com) → WhatsApp → Configuration → Webhook
2. Update Callback URL → Verify & Save

**Cara update Chatwoot webhook:**
1. Settings → Integrations → Webhooks → Edit URL

**Cara update Chatwoot inbox:**
1. Settings → Inboxes → SapaTamu → Configuration

---

### Step 5 — Pastikan 9router Aktif

```powershell
cd C:\kerjaanwoe\PKL-Desnet\SapaTamu
node -e "
require('dotenv').config();
const axios = require('axios');
axios.post(process.env.NINER_ROUTER_URL + '/chat/completions', {
  model: process.env.NINER_ROUTER_MODEL,
  messages: [{role:'user', content:'test'}]
}, { headers: { Authorization: 'Bearer ' + process.env.NINER_ROUTER_KEY }, timeout:10000 })
.then(() => console.log('✅ 9router OK'))
.catch(e => console.error('❌ 9router DOWN:', e.message));
"
```

---

### Step 6 — (Opsional) Reset Session

Kalau ada conversation stuck / state salah:

```powershell
node -e "
const {getDb} = require('./src/db/session');
getDb().prepare('DELETE FROM session_state').run();
console.log('✅ Session direset');
"
```

---

## ✅ Checklist Verifikasi

Kirim WA ke nomor bot setelah semua jalan:

| Test | Ekspektasi |
|---|---|
| Kirim `halo` | 👋 Welcome + tombol Kafe / Hotel / CS |
| Ketik `ada promo apa?` | 🤖 AI jawab dari knowledge base |
| Klik **Hotel** | Submenu Hotel (Reservasi, Fasilitas, Room Service) |
| Klik **Customer Service** | Escalate ke staf di Chatwoot |
| CS resolve di Chatwoot | ✅ Notif "Terima kasih" + menu di WA |
| Tanya di luar KB | 🤔 AI eskalasi ke staf |

---

## 📁 Struktur Project

```
SapaTamu/
├── src/
│   ├── ai/
│   │   └── handler.js          # AI handler → 9router
│   ├── chatwoot/
│   │   └── client.js           # Chatwoot API helper
│   ├── config/
│   │   └── env.js              # Load environment variables
│   ├── db/
│   │   └── session.js          # SQLite session manager
│   ├── escalation/
│   │   ├── detector.js         # Cek keyword eskalasi
│   │   └── service.js          # Eksekusi eskalasi
│   ├── knowledge/
│   │   └── data.json           # ← Edit ini untuk tambah info AI
│   ├── routes/
│   │   └── chatwootWebhook.js  # Logic utama bot (state machine)
│   └── session/
│       └── manager.js          # Wrapper session DB
├── .env                        # Konfigurasi (jangan di-commit!)
├── server.js                   # Entry point
└── session.db                  # Database session (auto-created)
```

---

## 🧠 Menambah Knowledge Base AI

Edit `src/knowledge/data.json`:

```json
[
  {
    "topik": "nama topik",
    "jawaban": "Jawaban yang akan diberikan AI ke user."
  }
]
```

> AI **hanya** menjawab berdasarkan data di file ini. Pertanyaan di luar topik → escalate ke staf.  
> Tidak perlu restart server untuk apply perubahan (hot-reload via `kill -USR2 <pid>`).

---

## 🔑 Environment Variables (.env)

```env
# Chatwoot
CHATWOOT_BASE_URL=http://localhost:3001
CHATWOOT_API_TOKEN=xxxx
CHATWOOT_ACCOUNT_ID=2
CHATWOOT_ESCALATION_TEAM_ID=1
CHATWOOT_AGENT_ID=2

# Meta WhatsApp
META_PHONE_NUMBER_ID=xxxx
META_ACCESS_TOKEN=xxxx
META_VERIFY_TOKEN=xxxx

# 9router AI
NINER_ROUTER_URL=https://xxxx.abc-tunnel.us/v1
NINER_ROUTER_KEY=sk-xxxx
NINER_ROUTER_MODEL=gc/gemini-2.5-flash

# Escalation keywords (pisah koma)
ESCALATION_KEYWORDS=alergi,komplain,darurat,refund,urgent,marah
```

---

## 👥 Tim

| Role | Nama |
|---|---|
| Developer | keefalegends |
| Pembimbing | Pak Zohan |
| AI Gateway | 9router (VPS temen) |
