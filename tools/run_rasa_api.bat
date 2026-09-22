@echo off
echo ======================================================================
echo [SAPATAMU AI] Menjalankan Rasa API & Action Server untuk WhatsApp...
echo ======================================================================
cd /d "%~dp0..\rasa_bot"

echo [1/2] Memulai Action Server di background (Port 5055)...
start "SapaTamu Rasa Action Server" cmd /k "venv\Scripts\activate.bat && rasa run actions --port 5055"

timeout /t 3 /nobreak >nul

echo [2/2] Memulai Rasa Core API Server (Port 5005)...
call venv\Scripts\activate.bat
rasa run --enable-api --cors "*" --port 5005
