# 🤖 SapaTamu Rasa AI Chatbot Engine

Modul Chatbot Conversational AI berbasis **Rasa Open Source 3.x** untuk menangani alur otomatisasi **Reservasi Kamar Hotel** dan **Pemesanan Menu Kafe & Restoran** pada aplikasi SapaTamu.

---

## 🎯 Fitur Utama

### 1. 🏨 Chat Booking Kamar Hotel
- Mengidentifikasi tipe kamar:
  - **Deluxe Room** (Rp 550.000 / malam)
  - **Executive Suite** (Rp 950.000 / malam)
  - **Presidential Suite** (Rp 1.800.000 / malam)
- **Form Slot Filling**: Menanyakan data yang belum lengkap secara otomatis:
  - Tipe kamar
  - Tanggal check-in
  - Nama pemesan
  - Nomor WhatsApp
- **Output**: Kalkulasi biaya otomatis + kode booking unik (`#ST-HTL-XXXX`).

### 2. ☕ Chat Order Menu Kafe & Resto
- Menampilkan daftar menu dan harga resmi:
  - **Kopi**: Espresso, Americano, Caffe Latte, Cappuccino
  - **Non-Kopi**: Matcha Latte, Es Teh Manis, Jeruk Peras
  - **Makanan**: Butter Croissant, Roti Bakar, Spaghetti Carbonara, Nasi Goreng Spesial
- **Form Slot Filling**: Menangkap pesanan item, kuantitas (porsi), dan nama pemesan.
- **Output**: Kalkulasi subtotal otomatis + nomor pesanan kafe (`#ST-CAFE-XXXX`).

---

## 📂 Struktur Direktori

```text
rasa_bot/
├── actions/
│   ├── __init__.py
│   └── actions.py        # Custom Action Server (hitung harga & invoice)
├── data/
│   ├── nlu.yml           # Dataset training intent & entity (Bahasa Indonesia)
│   ├── rules.yml         # Aturan logika form dan percakapan baku
│   └── stories.yml       # Skenario alur interaksi pengguna
├── config.yml            # Pipeline NLP (DIETClassifier, Featurizers)
├── domain.yml            # Kamus intents, entities, slots, forms, dan responses
├── endpoints.yml         # Konfigurasi Action Server endpoint
└── credentials.yml       # Konfigurasi Channel REST API
```

---

## 🚀 Cara Menjalankan & Menguji

### 1. Training Model Rasa
```bash
cd rasa_bot
.\venv\Scripts\activate
rasa train
```

### 2. Menjalankan Action Server (Terminal 1)
```bash
cd rasa_bot
.\venv\Scripts\activate
rasa run actions
```

### 3. Menguji Chat Interaktif di Terminal (Terminal 2)
```bash
cd rasa_bot
.\venv\Scripts\activate
rasa shell
```

### 4. Menjalankan Rasa sebagai REST API Server (Untuk Backend Node.js)
```bash
cd rasa_bot
.\venv\Scripts\activate
rasa run --enable-api --cors "*" --port 5005
```

---

## 🐳 Cara Menjalankan Menggunakan Docker (Khusus Linux / VPS)

Bagi pengguna Linux (Ubuntu, Debian, Arch, CentOS, dll.) atau yang ingin menjalankan di server VPS tanpa perlu menginstal Python / venv manual:

### 1. Menjalankan Chat Interaktif di Terminal (Langsung Ngobrol)
```bash
cd rasa_bot
chmod +x docker-shell.sh
./docker-shell.sh
```

### 2. Menjalankan Server API Rasa 24/7 (Background Daemon)
```bash
cd rasa_bot
docker compose up -d
```
* **Rasa API Server**: `http://localhost:5005`
* **Rasa Action Server**: `http://localhost:5055`

### 3. Re-train Model Baru di Docker
```bash
cd rasa_bot
docker compose run --rm rasa_server train
```

---

## 🤝 Integrasi ke WhatsApp & Backend SapaTamu
Saat webhook WhatsApp aktif, backend Node.js cukup meneruskan pesan teks dari tamu ke endpoint REST Rasa:
`POST http://localhost:5005/webhooks/rest/webhook`
```json
{
  "sender": "6281234567890",
  "message": "Mau booking kamar deluxe buat besok atas nama Bagus"
}
```
Respons balasan dari Rasa otomatis dikirimkan kembali ke nomor WhatsApp tamu melalui Meta WhatsApp Cloud API langsung.
