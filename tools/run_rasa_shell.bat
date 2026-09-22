@echo off
echo ===================================================
echo [SAPATAMU AI] Memulai Interactive Chat Terminal Rasa...
echo (Pastikan Action Server sudah jalan di terminal lain!)
echo ===================================================
cd /d "%~dp0..\rasa_bot"
call venv\Scripts\activate.bat
rasa shell
pause
