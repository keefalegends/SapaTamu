#!/bin/bash

# ==============================================================================
# SCRIPT DEPLOYMENT WAZAPBRO AI (VPS / UBUNTU)
# ==============================================================================
# Script ini akan:
# 1. Menginstal dependensi sistem (Python 3, Nginx, Certbot)
# 2. Mengatur virtual environment & menginstal package Python
# 3. Membuat file Systemd (agar aplikasi jalan otomatis di background 24/7)
# 4. Mengonfigurasi Nginx sebagai reverse proxy
# ==============================================================================

set -e

# --- KONFIGURASI (UBAH BAGIAN INI SEBELUM DIJALANKAN) ---
DOMAIN="api.domainanda.com"              # Ganti dengan domain/subdomain VPS Anda
EMAIL_SSL="admin@domainanda.com"         # Email untuk notifikasi SSL Let's Encrypt
APP_PORT="8001"                          # Port yang akan dipakai FastAPI internal
APP_DIR="$(pwd)/wazapbro-ai"             # Lokasi direktori aplikasi
SERVICE_NAME="wazapbro"                  # Nama service systemd
# ---------------------------------------------------------

echo -e "\e[34m[1/6] Memperbarui sistem dan menginstal dependensi dasar...\e[0m"
sudo apt update
sudo apt install -y python3-venv python3-pip nginx certbot python3-certbot-nginx sqlite3

echo -e "\e[34m[2/6] Menyiapkan Virtual Environment Python...\e[0m"
cd $APP_DIR
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi
source venv/bin/activate
pip install -r requirements.txt

echo -e "\e[34m[3/6] Menyiapkan file .env (Jika belum ada)...\e[0m"
if [ ! -f ".env" ]; then
    cp .env.example .env
    echo -e "\e[33mPERINGATAN: File .env baru saja dibuat. Anda HARUS mengeditnya nanti!\e[0m"
fi

echo -e "\e[34m[4/6] Membuat Systemd Service untuk menjalankan aplikasi di background...\e[0m"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
sudo bash -c "cat > $SERVICE_FILE" <<EOL
[Unit]
Description=WazapBro AI FastAPI Application
After=network.target

[Service]
User=$USER
Group=www-data
WorkingDirectory=$APP_DIR
Environment="PATH=$APP_DIR/venv/bin"
ExecStart=$APP_DIR/venv/bin/uvicorn app.main:app --host 127.0.0.1 --port $APP_PORT

Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOL

sudo systemctl daemon-reload
sudo systemctl enable $SERVICE_NAME
sudo systemctl restart $SERVICE_NAME
echo -e "\e[32mService $SERVICE_NAME berhasil dijalankan (Port: $APP_PORT)\e[0m"

echo -e "\e[34m[5/6] Mengonfigurasi Nginx sebagai Reverse Proxy...\e[0m"
NGINX_CONF="/etc/nginx/sites-available/${SERVICE_NAME}"
sudo bash -c "cat > $NGINX_CONF" <<EOL
server {
    listen 80;
    server_name $DOMAIN;

    location / {
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOL

# Aktifkan config nginx (hapus default jika masih ada)
sudo ln -sf $NGINX_CONF /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx

echo -e "\e[34m[6/6] Menyiapkan SSL / HTTPS dengan Certbot...\e[0m"
echo -e "\e[33mCatatan: Jika domain $DOMAIN belum diarahkan ke IP VPS ini, proses ini akan gagal.\e[0m"
# Otomatis install SSL, uncomment baris di bawah jika DNS sudah diarahkan
sudo certbot --nginx -d $DOMAIN --non-interactive --agree-tos -m $EMAIL_SSL || echo -e "\e[31mSSL Gagal. Pastikan domain $DOMAIN sudah diarahkan (A Record) ke IP VPS ini.\e[0m"

echo -e "\e[32m======================================================================\e[0m"
echo -e "\e[32mDEPLOYMENT SELESAI!\e[0m"
echo -e "Aplikasi Anda sekarang berjalan di: \e[1mhttps://$DOMAIN\e[0m"
echo -e "URL Webhook untuk Meta API:       \e[1mhttps://$DOMAIN/webhook\e[0m"
echo -e "======================================================================"
echo -e "\e[33mLangkah selanjutnya:\e[0m"
echo -e "1. Edit file credentials: \e[1mnano $APP_DIR/.env\e[0m"
echo -e "   (Isi token WA, API Key 9Router, dll)"
echo -e "2. Restart aplikasi jika merubah .env: \e[1msudo systemctl restart $SERVICE_NAME\e[0m"
echo -e "3. Cek log jika ada error: \e[1msudo journalctl -u $SERVICE_NAME -f\e[0m"
