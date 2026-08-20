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
- Docker Desktop aktif (untuk Chatwoot)
- Node.js ≥ 18
- `cloudflared` CLI terinstall
- 9router AI aktif di VPS

---

### 📋 Ringkasan 4 Langkah Cepat

```
Terminal 1 (Docker)   : docker compose up -d
Terminal 2 (Backend)  : npm run dev
Terminal 3 (Tunnel 1) : cloudflared tunnel --url http://localhost:3000
Terminal 4 (Tunnel 2) : cloudflared tunnel --url http://localhost:3001
Terminal 5 (Sync)     : node setup.js <URL_TUNNEL_3000> <URL_TUNNEL_3001>
```

---

### Step 1 — Jalankan Chatwoot (Docker)

Pastikan Docker Desktop aktif, lalu jalankan:
```powershell
docker compose up -d
```
> Cek status: `docker ps` (pastikan container `chatwoot-rails-1`, `chatwoot-sidekiq-1`, dll. berstatus `Up`).

---

### Step 2 — Jalankan SapaTamu Backend

Buka terminal di folder project:
```powershell
cd C:\kerjaanwoe\PKL-Desnet\SapaTamu
npm run dev
```
> Tunggu pesan: `✅ SapaTamu Backend berjalan di http://localhost:3000`

---

### Step 3 — Buka Dua Tunnel Cloudflare

> ⚠️ *URL tunnel selalu berganti baru setiap kali dijalankan.*

**Terminal A — Tunnel Backend (Port 3000):**
```powershell
cloudflared tunnel --url http://localhost:3000
```
*(Copy URL yang muncul, contoh: `https://contoh-backend.trycloudflare.com`)*

**Terminal B — Tunnel Chatwoot (Port 3001):**
```powershell
cloudflared tunnel --url http://localhost:3001
```
*(Copy URL yang muncul, contoh: `https://contoh-chatwoot.trycloudflare.com`)*

---

### Step 4 — Sinkronisasi Otomatis (1 Perintah Saja)

Buka terminal baru, jalankan script setup dengan kedua URL tunnel tadi:

```powershell
node setup.js <URL_TUNNEL_3000> <URL_TUNNEL_3001>
```

**Contoh:**
```powershell
node setup.js https://contoh-backend.trycloudflare.com https://contoh-chatwoot.trycloudflare.com
```

Script ini otomatis mengerjakan semua setup:
- [1/4] Update Webhook Agent Bot di Chatwoot
- [2/4] Update Webhook WhatsApp Cloud API di Meta Graph
- [3/4] Test & Validasi Koneksi AI 9router
- [4/4] Reset Session percakapan lama ke status bersih

---

### ⚠️ Jika AI 9router Timeout / Down (Error 530)
1. Hubungi admin VPS 9router untuk memastikan tunnel / service 9router di VPS aktif.
2. Jika URL 9router diperbarui, edit `.env`:
   ```env
   NINER_ROUTER_URL=https://URL-BARU-DARI-VPS/v1
   ```
3. Jalankan ulang `node setup.js ...` untuk verifikasi.

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
