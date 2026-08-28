# SapaTamu WABA (v3.0 Pure API) 🏨☕
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

❌ **Eliminasi Chatwoot:** Docker Rails/Redis/Postgres tidak lagi digunakan, beban server turun dari ~4GB RAM menjadi ~50MB RAM.

---

## 🚀 2. Cara Menjalankan

```bash
# 1. Masuk ke direktori
cd c:\kerjaanwoe\PKL-Desnet\SapaTamu_WABA

# 2. Jalankan server
npm start
# atau
npm run dev
```

Buka browser ke: **`http://localhost:3000`** untuk membuka **Custom Admin Dashboard & Live Demo Simulator**.

---

## 📋 3. Endpoint API Utama

| Method | Endpoint | Fungsi |
|---|---|---|
| `GET` | `/api/webhook/openkoneksi` | Handshake verifikasi token webhook |
| `POST` | `/api/webhook/openkoneksi` | Menerima pesan masuk dari OpenKoneksi / WhatsApp |
| `GET` | `/api/admin/stats` | Statistik realtime (booking, order, revenue, chat) |
| `GET` | `/api/admin/chats` | Daftar percakapan aktif & status (Bot vs CS) |
| `POST` | `/api/admin/chats/:phone/reply` | Staf CS membalas chat manual |
| `PATCH`| `/api/admin/chats/:phone/toggle-bot` | Switch mode Bot Otomatis <-> Human CS Takeover |
| `GET` | `/api/admin/bookings` | Data reservasi kamar hotel & e-voucher |
| `GET` | `/api/admin/orders` | Antrian pesanan dapur kafe & rincian item |
| `POST` | `/api/admin/simulate` | Simulator pesan masuk untuk live demo presentasi |
