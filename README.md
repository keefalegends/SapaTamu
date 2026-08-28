# 🏨☕ SapaTamu WABA (v3.0 Pure API)
> **Arsitektur Murni API WhatsApp Cloud API via OpenKoneksi.com (Tanpa Docker Chatwoot) & Custom Admin Dashboard**

---

## 🏛️ 1. Diagram Arsitektur Baru

```
[ WhatsApp User ] 
       ↕️ (Pesan WhatsApp & Menu Interaktif)
[ OpenKoneksi.com ] (WABA Gateway Infrastructure Layer)
       ↕️ (Inbound Webhook POST JSON / Outbound REST API POST /v1/messages)
[ SapaTamu Developer Backend ] (Node.js + Express.js Port 3000)
       ├── 🤖 Core Bot Engine & State Machine (Hotel & Kafe)
       ├── 🗄️ SQLite Database (better-sqlite3)
       └── 🖥️ Custom Admin Dashboard (Live Chat, CS Takeover, Order, Catalog)
```

❌ **Eliminasi Chatwoot:** Docker Rails/Redis/Postgres tidak lagi digunakan, beban server turun dari **~4GB RAM** menjadi **~50MB RAM**.

---

## 📌 Fitur Utama

### 💬 Live Chat & CS Takeover (Pengganti Chatwoot)
- **Inbox Real-time**: Memantau seluruh chat pelanggan WhatsApp.
- **Ambil Alih CS (Human Takeover)**: Tombol satu-klik untuk mematikan respons otomatis bot dan membalas chat secara manual oleh staf.
- **Aktifkan Bot Kembali**: Mengembalikan kendali percakapan ke AI bot otomatis.

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
- 🛒 **Smart Cart Management** — Tambah item via tombol atau teks bebas (*"pesan 1 nasi goreng dan 2 espresso"*).
- 📅 **Reservasi Meja Kafe** — Form jumlah orang (pax) dan waktu kedatangan ➡️ terbit ID Reservasi (`#RES-XXXX`).

---

## 🚀 Cara Menjalankan

```bash
# 1. Masuk ke direktori
cd c:\kerjaanwoe\PKL-Desnet\SapaTamu_prod

# 2. Jalankan server
npm start
# atau development mode
npm run dev
```

Buka browser ke: **`http://localhost:3000`** untuk membuka **Custom Admin Dashboard & Live Demo Simulator**.
