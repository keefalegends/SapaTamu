@echo off
title SapaTamu Webhook Tunnel (Cloudflare)
echo =======================================================
echo    Menjalankan Cloudflare Tunnel ke Port 3000
echo    Gunakan URL https://... yang muncul di bawah
echo    sebagai Webhook URL di Meta for Developers!
echo    Contoh: https://xxxx-xxxx.trycloudflare.com/api/webhook/whatsapp
echo =======================================================
echo.
"C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --url http://localhost:3000
pause
