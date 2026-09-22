@echo off
echo ===================================================
echo [SAPATAMU AI] Menjalankan Rasa Action Server (Port 5055)...
echo ===================================================
cd /d "%~dp0..\rasa_bot"
call venv\Scripts\activate.bat
rasa run actions --port 5055
pause
