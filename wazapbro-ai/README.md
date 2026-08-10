# WazapBro Agent Bot (Chatwoot Integration)

WazapBro Agent Bot adalah sistem AI chatbot (FAQ Handler & Escalation) untuk industri hospitality yang berjalan sebagai **Agent Bot** di dalam ekosistem [Chatwoot](https://www.chatwoot.com/).

## Konsep Integrasi
- Pesan WhatsApp diterima oleh Inbox Chatwoot.
- Chatwoot meneruskan pesan ke backend ini via Webhook.
- Backend memiliki **Session State Manager** (`idle` → `cs_active` → `escalated`).
- AI (via 9Router) membalas FAQ menggunakan format JSON dan memutuskan kapan harus eskalasi ke staf manusia.
- Saat eskalasi, sistem memanggil API Chatwoot untuk meng-assign conversation ke Agent/Team manusia.

## Persyaratan
- Python 3.11+
- Server Chatwoot (Self-hosted)
- 9Router AI Gateway

## Setup & Instalasi

1. Clone & buat virtual env:
   ```bash
   python -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Konfigurasi `.env`:
   ```bash
   cp .env.example .env
   ```
   Isi data Chatwoot Anda (`CHATWOOT_BASE_URL`, `CHATWOOT_API_TOKEN`, dll) serta API Key AI Anda.

3. Jalankan aplikasi:
   ```bash
   uvicorn app.main:app --reload --port 8000
   ```

## Setup di Chatwoot

1. Dapatkan **Account ID** (ada di URL Chatwoot Anda: `/app/accounts/{ACCOUNT_ID}/...`).
2. Dapatkan **Agent Token** (Profile Settings > Access Token).
3. Buat **Team** di Chatwoot khusus untuk eskalasi, lalu catat **Team ID**-nya.
4. Daftarkan URL backend ini (`https://domain-anda.com/webhook/chatwoot`) sebagai **Agent Bot Webhook** di Chatwoot menggunakan Rails Console / API Chatwoot.
5. Hubungkan Agent Bot tersebut ke Inbox WhatsApp yang Anda inginkan.

## Skenario Uji Coba
- **Trigger Awal:** Ketik "bantuan" atau "cs". AI akan membalas dengan sapaan awal.
- **FAQ:** Tanya "jam buka berapa?" → AI akan merespons dari Knowledge Base.
- **Eskalasi Manual:** Tanya sesuatu yang aneh, atau ketik kata kunci "komplain". Chatwoot akan otomatis meng-assign chat tersebut ke Team Eskalasi dan AI akan berhenti membalas.
