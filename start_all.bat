@echo off
title SapaTamu - All-In-One Launcher
color 0A
echo ========================================================
echo   SAPATAMU - MENYALAKAN SELURUH LAYANAN SISTEM
echo ========================================================
echo.

cd /d "%~dp0"

echo [1/3] Menjalankan Rasa Action Server (Port 5055)...
start "SapaTamu - Rasa Action Server (5055)" cmd /k "cd /d ""%~dp0rasa_bot"" && .\venv\Scripts\python.exe -m rasa_sdk --actions actions --port 5055"

timeout /t 3 /nobreak >nul

echo [2/3] Menjalankan Rasa Core / NLU Server (Port 5005)...
start "SapaTamu - Rasa Core Server (5005)" cmd /k "cd /d ""%~dp0rasa_bot"" && .\venv\Scripts\python.exe -m rasa run --enable-api --cors "*" --port 5005"

timeout /t 5 /nobreak >nul

echo [3/3] Menjalankan Node.js Backend Server (Port 3000)...
start "SapaTamu - Node.js Backend (3000)" cmd /k "cd /d ""%~dp0"" && npm start"

echo.
echo ========================================================
echo   SEMUA LAYANAN TELAH DINYALAKAN DI 3 JENDELA TERPISAH!
echo   - Backend & Admin Dashboard : http://localhost:3000
echo   - Rasa Core API             : http://localhost:5005
echo   - Rasa Action Server        : http://localhost:5055
echo ========================================================
echo.
pause
