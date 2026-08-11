# ╔══════════════════════════════════════════════════════╗
# ║       SapaTamu - Startup Checklist                   ║
# ╚══════════════════════════════════════════════════════╝
#
# Jalankan script ini setelah dapat kedua tunnel URL

param(
    [string]$BackendUrl,
    [string]$ChatwootUrl
)

if (-not $BackendUrl -or -not $ChatwootUrl) {
    Write-Host ""
    Write-Host "╔══════════════════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "║       SapaTamu - Quick Start Guide                   ║" -ForegroundColor Cyan
    Write-Host "╚══════════════════════════════════════════════════════╝" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "LANGKAH STARTUP (lakukan berurutan):" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  [1] Start Docker (Chatwoot)" -ForegroundColor Green
    Write-Host "      docker compose up -d" -ForegroundColor White
    Write-Host ""
    Write-Host "  [2] Start backend server" -ForegroundColor Green
    Write-Host "      npm run dev" -ForegroundColor White
    Write-Host ""
    Write-Host "  [3] Buka Terminal Baru - Tunnel BACKEND (port 3000)" -ForegroundColor Green
    Write-Host "      cloudflared tunnel --url http://localhost:3000" -ForegroundColor White
    Write-Host "      → Copy URL yang muncul (contoh: https://abc.trycloudflare.com)" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  [4] Buka Terminal Baru - Tunnel CHATWOOT (port 3001)" -ForegroundColor Green
    Write-Host "      cloudflared tunnel --url http://localhost:3001" -ForegroundColor White
    Write-Host "      → Copy URL yang muncul (contoh: https://xyz.trycloudflare.com)" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  [5] Jalankan auto-setup dengan kedua URL tadi:" -ForegroundColor Green
    Write-Host "      .\start.ps1 -BackendUrl https://abc.trycloudflare.com -ChatwootUrl https://xyz.trycloudflare.com" -ForegroundColor White
    Write-Host ""
    Write-Host "  [6] Test: Kirim 'halo' dari WhatsApp 🎉" -ForegroundColor Green
    Write-Host ""
    exit 0
}

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║       SapaTamu Auto Setup                            ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""
Write-Host "Backend  : $BackendUrl" -ForegroundColor White
Write-Host "Chatwoot : $ChatwootUrl" -ForegroundColor White
Write-Host ""

# Jalankan setup.js
node setup.js $BackendUrl $ChatwootUrl

Write-Host "Done!" -ForegroundColor Green
