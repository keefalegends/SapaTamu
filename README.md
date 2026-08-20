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

### 🏨 Hotel
- 🛏️ **Booking Kamar** — pilih tipe kamar → input tanggal → review invoice → bayar → E-Voucher
- 3 tipe kamar: Deluxe (Rp 550rb), Executive (Rp 950rb), Presidential Suite (Rp 1.8jt)
- State machine 6 step lengkap sampai e-voucher dengan booking code

### ☕ Kafe
- 🍽️ **Self-Ordering** — scan QR meja → pilih menu → tambah ke keranjang → bayar
- 🛍️ **Takeaway** — order tanpa meja, ambil di kasir
- 📅 **Reservasi Meja** — 3 step: jumlah orang + preferensi → tanggal/jam → konfirmasi
- 📝 **Natural Language** — "4 orang, outdoor dekat taman" → auto-parse pax + notes
- 🛒 **Cart via Chat** — ketik "Espresso 3" atau "hapus Latte" langsung dari chat
- 🎁 **Loyalty Points** — otomatis +poin tiap transaksi (1 poin per Rp 10rb)
- 📢 **Notif Staf** — pesanan masuk langsung tampil di Chatwoot
- 🔲 **QR Generator** — CLI tool generate QR code per meja untuk print

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

**Core:**

| State | Trigger | Perilaku |
|---|---|---|
| `idle` | Percakapan baru / setelah resolve | Kirim welcome + menu |
| `ai_active` | Setelah welcome | Tombol → submenu; Teks → AI |
| `escalated` | Klik CS / AI tidak sanggup | Bot diam, staf menangani |

**Hotel Booking:**

| State | Trigger | Perilaku |
|---|---|---|
| `booking_pick_room` | Klik Reservasi Kamar | Tampil pilihan kamar |
| `booking_await_date` | Pilih kamar | Tunggu input tanggal/lama |
| `booking_confirm_draft` | Input tanggal | Tampil invoice draft |
| `booking_select_payment` | Lanjut bayar | Pilih metode (QRIS/VA) |
| `booking_await_payment` | Pilih metode | Tunggu konfirmasi bayar → E-Voucher |

**Kafe Ordering:**

| State | Trigger | Perilaku |
|---|---|---|
| `kafe_choose_type` | Klik Kafe dari menu | Pilih: Dine-in / Takeaway / Reservasi |
| `kafe_ordering` | Pilih tipe / scan QR | Cart loop: pilih item, tambah/hapus, selesai |
| `kafe_confirm` | Selesai pesan | Review order summary → konfirmasi/ubah/batal |
| `kafe_payment_pending` | Konfirmasi order | Placeholder payment → "Sudah Bayar" |

**Kafe Reservasi:**

| State | Trigger | Perilaku |
|---|---|---|
| `kafe_book_ask_pax` | Pilih Reservasi | Tanya jumlah orang + preferensi |
| `kafe_book_ask_datetime` | Input pax | Tanya tanggal & jam |
| `kafe_book_confirm` | Input datetime | Review & konfirmasi reservasi |

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
| Klik **Kafe** | Pilih: Makan di Tempat / Takeaway / Reservasi Meja |
| Kirim `Meja 04` | Langsung masuk ordering kafe (QR scan flow) |
| Pilih item → Selesai Pesan → Bayar | Order tersimpan + poin loyalty masuk |
| Ketik `Espresso 3` saat ordering | Cart: Espresso x3 ditambahkan |
| Pilih **Reservasi Meja** | Flow: jumlah orang → tanggal/jam → konfirmasi |
| Klik **Customer Service** | Escalate ke staf di Chatwoot |
| CS resolve di Chatwoot | ✅ Notif "Terima kasih" + menu di WA |
| Tanya di luar KB | 🤔 AI eskalasi ke staf |

---

## 🔲 QR Code Generator (Meja Kafe)

Generate QR code per meja kafe. Saat di-scan, otomatis buka WhatsApp dengan template "Meja 04".

```bash
# Install dependencies (sekali saja)
npm install

# Generate QR untuk 20 meja
node tools/generate-qr.js --tables 20 --phone 628123456789

# Dengan PDF untuk print
node tools/generate-qr.js --tables 20 --phone 628123456789 --pdf

# Mulai dari meja 5
node tools/generate-qr.js --tables 10 --phone 628123456789 --start 5
```

Output tersimpan di `output/qr-codes/` (folder ini di-gitignore).

| Flag | Default | Keterangan |
|---|---|---|
| `--phone` | *wajib* | Nomor WA bot (628xxx) |
| `--tables` | *wajib* | Jumlah meja |
| `--start` | 1 | Nomor meja mulai dari |
| `--prefix` | "Meja" | Label prefix |
| `--pdf` | false | Generate combined PDF |
| `--outdir` | output/qr-codes | Folder output |

---

## 🍽️ Mengedit Menu Kafe

Edit `src/cafe/menu.json` — tidak perlu restart server:

```json
{
  "categories": [
    {
      "id": "minuman",
      "name": "☕ Minuman",
      "items": [
        { "id": "esp", "name": "Espresso", "price": 22000 }
      ]
    }
  ]
}
```

> Harga dalam satuan Rupiah (integer). ID harus unik. Perubahan langsung aktif setelah restart server.

---

```
SapaTamu/
├── src/
│   ├── ai/
│   │   └── handler.js          # AI handler → 9router
│   ├── booking/
│   │   └── service.js          # Hotel booking (catalog, draft, e-voucher)
│   ├── cafe/
│   │   ├── menu.json           # ← Edit ini untuk ubah menu kafe
│   │   ├── detector.js         # Detect "Meja XX" dari QR scan
│   │   ├── handler.js          # State machine kafe (8 state)
│   │   ├── menuRenderer.js     # Format menu/cart untuk WhatsApp
│   │   └── service.js          # Cart ops, order, reservasi, loyalty
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
├── tools/
│   └── generate-qr.js          # CLI: generate QR code per meja kafe
├── public/images/               # Gambar hotel, kamar, kafe
├── .env                         # Konfigurasi (jangan di-commit!)
├── server.js                    # Entry point
└── session.db                   # Database session (auto-created)
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


