@echo off
title SapaTamu - Stop All Services
color 0C
echo ========================================================
echo   SAPATAMU - MENGHENTIKAN SELURUH LAYANAN SISTEM
echo ========================================================
echo.

echo Menghentikan proses Node.js di Port 3000...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000') do taskkill /F /PID %%a 2>nul

echo Menghentikan Rasa Core di Port 5005...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5005') do taskkill /F /PID %%a 2>nul

echo Menghentikan Rasa Action Server di Port 5055...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5055') do taskkill /F /PID %%a 2>nul

echo.
echo ========================================================
echo   SEMUA LAYANAN (PORT 3000, 5005, 5055) BERHASIL DITUTUP.
echo ========================================================
echo.
pause
