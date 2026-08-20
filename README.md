# 🏨 SapaTamu Bot

> **WhatsApp Customer Service Bot untuk Hotel & Kafe SapaTamu**  
> Sistem Hybrid **BOT + AI** — Tombol Interaktif untuk Layanan Terstruktur, Natural Language Processing untuk Teks Bebas, dan Eskalasi Cerdas ke Staf Manusia dengan Sistem Antrian Real-Time.

---

## 📌 Fitur Utama

- 🤖 **AI Customer Service** — Menjawab pertanyaan umum dari Knowledge Base lokal secara instan.
- 👨‍💼 **Sistem Antrian CS FIFO** — Deteksi live percakapan terbuka di Chatwoot & notifikasi nomor antrian transparan ke WhatsApp tamu.
- 🏷️ **Label Identitas Pesan** — `🤖 Dijawab oleh AI` / `👨‍💼 Staf Manusia` tercatat jelas di dashboard Chatwoot.
- ♻️ **Auto Reset Percakapan** — Saat staf me-resolve chat di Chatwoot, bot mengirimkan ucapan terima kasih dan kembali aktif otomatis.

### 🏨 Domain Hotel (Pemesanan Kamar End-to-End)
- 🛏️ **Katalog & Foto Kamar Interaktif**:
  - **Deluxe Room** (Rp 550.000 / malam) — `kamar_deluxe.jpg`
  - **Executive Suite** (Rp 950.000 / malam) — `kamar_executive.jpg`
  - **Presidential Suite** (Rp 1.800.000 / malam) — `kamar_suite.jpg`
- 🧠 **Smart Entity Parser** — Tamu bebas mengetik tanggal (*"25 Agustus 2 malam atas nama Budi"*) ➡️ kalkulasi otomatis durasi, tanggal check-in & check-out.
- 📋 **Draft Invoice Otomatis** — Rincian harga per malam, total tagihan, sarapan, dan jam check-in/out.
- 💳 **Simulasi Pembayaran (Demo)** — Pilihan pembayaran via **QRIS Demo** atau **Virtual Account BCA Demo**.
- 🎟️ **Penerbitan E-Voucher Resmi** — Nomor booking unik (`SPT-YYMMDD-XXXX`) terbit instan & tersimpan di database SQLite.

### ☕ Domain Kafe (Self-Ordering & Reservasi)
- 🍽️ **Self-Ordering via QR Meja** — Scan QR di meja kafe (misal `Meja 04`) ➡️ langsung masuk flow pemesanan meja terkait.
- 🛍️ **Pemesanan Takeaway** — Pesan bungkus tanpa meja, ambil di kasir.
- 📅 **Reservasi Meja Kafe** — Input jumlah orang (pax) + preferensi (*outdoor/indoor*) ➡️ tanggal & jam ➡️ konfirmasi instan.
- 🛒 **Cart via Chat** — Ketik nama item (*"Espresso 2"*) atau hapus item (*"hapus Latte"*) langsung dari chat.
- 🎁 **Loyalty Points** — Otomatis mendapatkan 1 poin per kelipatan transaksi Rp 10.000.
- 📢 **Notifikasi Pesanan ke Staf** — Rincian pesanan baru langsung terkirim ke dashboard Chatwoot staf.
- 🔲 **QR Code Generator CLI** — Tool otomatis untuk generate gambar QR Code & file PDF siap cetak untuk semua meja kafe.

---

## 🏗️ Arsitektur Sistem

```
                 WhatsApp User
                       │
                       ▼
    Meta WhatsApp Cloud API (Graph v20.0)
                       │
                       ▼
               Chatwoot (Port 3001)
                       │  (Agent Bot Webhook)
                       ▼
           SapaTamu Backend (Port 3000)
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
   🏨 HOTEL        ☕ KAFE       👨‍💼 CS QUEUE
  • Booking       • Self-Order   • FIFO Queue
  • Invoice       • Takeaway     • Chatwoot
  • E-Voucher     • Reservasi      Escalation
  • Direct Media  • Loyalty      • Live Stats
        │              │              │
        └──────────────┬──────────────┘
                       ▼
          🗄️ SQLite Database (session.db)
```

---

### 📊 State Machine

#### 1. Core State
| State | Trigger | Perilaku |
|---|---|---|
| `idle` | Chat baru / reset | Kirim salam pembuka (`hotel_sapatamu.jpg`) + Menu Utama |
| `ai_active` | Setelah salam pembuka | Tombol ➡️ Submenu; Teks Bebas ➡️ AI 9router |
| `escalated` | Klik CS / AI eskalasi | Bot diam, sistem menghitung nomor antrian & staf menangani |

#### 2. Hotel Booking State
| State | Trigger | Perilaku |
|---|---|---|
| `booking_pick_room` | Klik Reservasi Kamar | Tampilkan katalog kamar + harga + fasilitas |
| `booking_await_date` | Pilih tipe kamar | Kirim foto kamar resmi + minta tanggal & nama tamu |
| `booking_confirm_draft` | Input tanggal / nama | Tampilkan Draft Invoice + tombol Lanjut Bayar |
| `booking_select_payment` | Klik Lanjut Bayar | Pilihan metode bayar (QRIS Demo / VA BCA Demo) |
| `booking_await_payment` | Pilih metode bayar | Kirim panduan transfer + tombol Konfirmasi Bayar |

#### 3. Kafe Ordering & Reservation State
| State | Trigger | Perilaku |
|---|---|---|
| `kafe_choose_type` | Klik Kafe dari Menu Utama | Pilih: Makan di Tempat / Takeaway / Reservasi |
| `kafe_ordering` | Pilih layanan / Scan QR Meja | Cart loop: tambah menu, ubah quantity, review keranjang |
| `kafe_confirm` | Selesai pesan | Review ringkasan pesanan + konfirmasi |
| `kafe_payment_pending` | Konfirmasi pesanan | Panduan bayar ➡️ Verifikasi & penambahan Loyalty Points |
| `kafe_book_ask_pax` | Pilih Reservasi Meja | Tanya jumlah tamu & preferensi area |
| `kafe_book_ask_datetime`| Input jumlah tamu | Tanya tanggal dan jam kedatangan |
| `kafe_book_confirm` | Input tanggal & jam | Konfirmasi data reservasi & catat ke DB |

---

## 🗄️ Struktur Database SQLite (`session.db`)

Sistem menggunakan SQLite lokal performa tinggi (`better-sqlite3`) dengan 6 tabel utama:

| Tabel | Fungsi |
|---|---|
| `session_state` | Menyimpan status percakapan aktif & draft JSON per conversation ID |
| `bookings` | Rekapitulasi data booking kamar hotel, kode voucher, dan status lunas |
| `cafe_orders` | Data pesanan kafe (Dine-in/Takeaway), nomor meja, dan total bayar |
| `cafe_order_items` | Rincian item menu makanan/minuman per ID pesanan |
| `cafe_reservations` | Data reservasi meja kafe, jumlah tamu (pax), tanggal, dan jam |
| `loyalty_points` | Saldo poin loyalitas pelanggan berdasarkan nomor telepon |

---

## 🚀 Panduan Menjalankan (Startup Guide)

### Prasyarat
- Docker Desktop aktif (untuk Chatwoot)
- Node.js ≥ 18
- `cloudflared` CLI terinstall di sistem
- 9router AI aktif di VPS

---

### 📋 4 Langkah Cepat

```
Terminal 1 (Docker)   : docker compose up -d
Terminal 2 (Backend)  : npm run dev
Terminal 3 (Tunnel 1) : cloudflared tunnel --url http://localhost:3000
Terminal 4 (Tunnel 2) : cloudflared tunnel --url http://localhost:3001
Terminal 5 (Sync)     : node setup.js <URL_TUNNEL_3000> <URL_TUNNEL_3001>
```

#### Step 1 — Jalankan Chatwoot (Docker)
```powershell
docker compose up -d
```
> Cek status: `docker ps` (pastikan container berstatus `Up`).

#### Step 2 — Jalankan SapaTamu Backend
```powershell
cd C:\kerjaanwoe\PKL-Desnet\SapaTamu
npm run dev
```
> Tunggu pesan: `✅ SapaTamu Backend berjalan di http://localhost:3000`

#### Step 3 — Buka Dua Tunnel Cloudflare
* **Terminal A (Port 3000):**
  ```powershell
  cloudflared tunnel --url http://localhost:3000
  ```
* **Terminal B (Port 3001):**
  ```powershell
  cloudflared tunnel --url http://localhost:3001
  ```

#### Step 4 — Sinkronisasi Otomatis
```powershell
node setup.js <URL_TUNNEL_3000> <URL_TUNNEL_3001>
```
*Contoh:*
```powershell
node setup.js https://backend-demo.trycloudflare.com https://chatwoot-demo.trycloudflare.com
```

---

## 🔲 QR Code Generator (Meja Kafe)

Generate QR code per meja kafe. Saat di-scan menggunakan kamera HP, otomatis membuka WhatsApp dengan teks format `Meja XX`.

```bash
# Install dependencies
npm install

# Generate QR untuk 20 meja
node tools/generate-qr.js --tables 20 --phone 628123456789

# Generate QR + File PDF gabungan siap print
node tools/generate-qr.js --tables 20 --phone 628123456789 --pdf
```

File hasil export akan tersimpan di folder `output/qr-codes/`.

---

## 🍽️ Mengedit Menu Kafe

Daftar menu makanan dan minuman dapat diperbarui sewaktu-waktu di `src/cafe/menu.json`:

```json
{
  "categories": [
    {
      "id": "minuman",
      "name": "☕ Minuman",
      "items": [
        { "id": "esp", "name": "Espresso", "price": 22000 },
        { "id": "lat", "name": "Caffe Latte", "price": 28000 }
      ]
    },
    {
      "id": "makanan",
      "name": "🍳 Makanan",
      "items": [
        { "id": "car", "name": "Spaghetti Carbonara", "price": 45000 }
      ]
    }
  ]
}
```

---

## 📁 Struktur Direktori

```
SapaTamu/
├── src/
│   ├── ai/
│   │   └── handler.js          # AI handler (9router + entity parser)
│   ├── booking/
│   │   └── service.js          # Hotel booking, invoice, mock payment, e-voucher
│   ├── cafe/
│   │   ├── menu.json           # Master data menu kafe & harga
│   │   ├── detector.js         # Deteksi QR scan "Meja XX"
│   │   ├── handler.js          # State machine ordering, takeaway & reservasi kafe
│   │   ├── menuRenderer.js     # Formatter menu & keranjang WhatsApp
│   │   └── service.js          # Operasi keranjang, DB order, loyalty points
│   ├── chatwoot/
│   │   └── client.js           # Chatwoot API helper, direct Meta media & live queue
│   ├── config/
│   │   └── env.js              # Loader environment variables
│   ├── db/
│   │   └── session.js          # Skema & inisialisasi SQLite database
│   ├── escalation/
│   │   ├── detector.js         # Deteksi keyword darurat / komplain
│   │   └── service.js          # Eksekusi eskalasi & notifikasi antrian FIFO
│   ├── knowledge/
│   │   └── data.json           # Knowledge Base AI
│   ├── routes/
│   │   └── chatwootWebhook.js  # Dispatcher utama & state machine bot
│   └── session/
│       └── manager.js          # Session state & draft helper
├── tools/
│   └── generate-qr.js          # CLI Generator QR meja kafe (PNG & PDF)
├── public/images/               # Aset foto hotel, lobi, kamar, dan kafe
├── .env                         # Variabel konfigurasi
├── server.js                    # Server entry point
└── session.db                   # Database SQLite lokal
```

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


