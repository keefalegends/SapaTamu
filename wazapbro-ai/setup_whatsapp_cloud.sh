#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────
# WazapBro AI — WhatsApp Cloud API Setup
# Buat inbox WhatsApp di Chatwoot & assign AgentBot
# ─────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Colors ───────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

success() { echo -e "  ${GREEN}✓${NC} $1"; }
error()   { echo -e "  ${RED}✗${NC} $1" >&2; exit 1; }
warn()    { echo -e "  ${YELLOW}⚠${NC} $1"; }
info()    { echo -e "  ${CYAN}ℹ${NC} $1"; }

trap 'echo -e "\n  ${RED}✗ Script gagal di baris $LINENO${NC}" >&2' ERR
trap 'echo -e "\n${YELLOW}Dibatalkan.${NC}"; exit 130' INT

# ── Variables (set via flags or prompts) ─────────────────────
PHONE_NUMBER="${PHONE_NUMBER:-}"
PHONE_NUMBER_ID="${PHONE_NUMBER_ID:-}"
BUSINESS_ACCOUNT_ID="${BUSINESS_ACCOUNT_ID:-}"
API_KEY="${API_KEY:-}"
INBOX_NAME="${INBOX_NAME:-}"
CHATWOOT_BASE_URL="${CHATWOOT_BASE_URL:-}"
CHATWOOT_API_TOKEN="${CHATWOOT_API_TOKEN:-}"
CHATWOOT_ACCOUNT_ID="${CHATWOOT_ACCOUNT_ID:-}"

# Results
INBOX_ID=""
WEBHOOK_VERIFY_TOKEN=""
AGENT_BOT_ID=""

# ── check_deps ───────────────────────────────────────────────
check_deps() {
    local missing=()
    command -v curl &>/dev/null || missing+=("curl")
    command -v jq   &>/dev/null || missing+=("jq")

    if [[ ${#missing[@]} -gt 0 ]]; then
        error "Dependensi tidak ditemukan: ${missing[*]}
       Install: sudo dnf install ${missing[*]}  (atau apt/brew)"
    fi
    success "Dependensi OK (curl, jq)"
}

# ── load_env_defaults ────────────────────────────────────────
load_env_defaults() {
    local env_file="${SCRIPT_DIR}/.env"
    if [[ -f "$env_file" ]]; then
        # Baca .env tanpa export (hanya grep nilai)
        DEFAULT_CHATWOOT_BASE_URL=$(grep -oP '(?<=^CHATWOOT_BASE_URL=).*' "$env_file" 2>/dev/null | tr -d '"' || true)
        DEFAULT_CHATWOOT_API_TOKEN=$(grep -oP '(?<=^CHATWOOT_API_TOKEN=).*' "$env_file" 2>/dev/null | tr -d '"' || true)
        DEFAULT_CHATWOOT_ACCOUNT_ID=$(grep -oP '(?<=^CHATWOOT_ACCOUNT_ID=).*' "$env_file" 2>/dev/null | tr -d '"' || true)
        info "Default dibaca dari ${env_file}"
    fi

    DEFAULT_CHATWOOT_BASE_URL="${DEFAULT_CHATWOOT_BASE_URL:-http://localhost:3000}"
    DEFAULT_CHATWOOT_API_TOKEN="${DEFAULT_CHATWOOT_API_TOKEN:-}"
    DEFAULT_CHATWOOT_ACCOUNT_ID="${DEFAULT_CHATWOOT_ACCOUNT_ID:-1}"
}

# ── show_usage ───────────────────────────────────────────────
show_usage() {
    echo -e "${BOLD}WazapBro AI — WhatsApp Cloud API Setup${NC}"
    cat <<EOF

Usage: $0 [OPTIONS]

Options:
  --phone PHONE          Nomor WhatsApp (E.164, contoh: +6281234567890)
  --phone-id ID          Meta Phone Number ID
  --waba-id ID           WhatsApp Business Account ID
  --token TOKEN          System User permanent token
  --inbox-name NAME      Nama inbox (default: WhatsApp)
  --chatwoot-url URL     Chatwoot base URL (default: dari .env)
  --chatwoot-token TOKEN Chatwoot API token (default: dari .env)
  --account-id ID        Chatwoot account ID (default: dari .env)
  -h, --help             Tampilkan bantuan ini

Prasyarat dari Meta Business:
  1. Facebook App dengan WhatsApp product
  2. WhatsApp Business Account (WABA) → business_account_id
  3. Phone number terdaftar di WABA → phone_number_id
  4. System User token dengan permissions:
     - whatsapp_business_messaging
     - whatsapp_business_management

EOF
    exit 0
}

# ── parse_args ───────────────────────────────────────────────
parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --phone)          PHONE_NUMBER="$2";       shift 2 ;;
            --phone-id)       PHONE_NUMBER_ID="$2";    shift 2 ;;
            --waba-id)        BUSINESS_ACCOUNT_ID="$2"; shift 2 ;;
            --token)          API_KEY="$2";             shift 2 ;;
            --inbox-name)     INBOX_NAME="$2";          shift 2 ;;
            --chatwoot-url)   CHATWOOT_BASE_URL="$2";   shift 2 ;;
            --chatwoot-token) CHATWOOT_API_TOKEN="$2";  shift 2 ;;
            --account-id)     CHATWOOT_ACCOUNT_ID="$2"; shift 2 ;;
            -h|--help)        show_usage ;;
            *)                echo -e "  ${RED}✗${NC} Flag tidak dikenal: $1" >&2
                              echo "       Gunakan --help" >&2
                              exit 1 ;;
        esac
    done
}

# ── prompt_inputs ────────────────────────────────────────────
prompt_one() {
    local varname="$1" prompt="$2" default="${3:-}" validate="${4:-}"
    local value

    while true; do
        if [[ -n "$default" ]]; then
            read -rp "  $prompt [$default]: " value
            value="${value:-$default}"
        else
            read -rp "  $prompt: " value
        fi

        # Validasi
        if [[ -n "$validate" ]]; then
            case "$validate" in
                e164)
                    value=$(echo "$value" | tr -d ' -')
                    if [[ ! "$value" =~ ^\+[0-9]{7,15}$ ]]; then
                        warn "Format harus E.164 (contoh: +6281234567890)"
                        continue
                    fi
                    ;;
                nonempty)
                    if [[ -z "$value" ]]; then
                        warn "Tidak boleh kosong"
                        continue
                    fi
                    ;;
                token)
                    if [[ ${#value} -lt 20 ]]; then
                        warn "Token terlalu pendek (minimal 20 karakter)"
                        continue
                    fi
                    ;;
            esac
        fi

        eval "$varname='$value'"
        break
    done
}

prompt_inputs() {
    echo ""
    echo -e "${BOLD}📋 Data WhatsApp Cloud API${NC}"
    echo ""

    [[ -z "$PHONE_NUMBER" ]]       && prompt_one PHONE_NUMBER       "Nomor WhatsApp (E.164, contoh: +6281234567890)" "" "e164"
    [[ -z "$PHONE_NUMBER_ID" ]]    && prompt_one PHONE_NUMBER_ID    "Meta Phone Number ID" "" "nonempty"
    [[ -z "$BUSINESS_ACCOUNT_ID" ]] && prompt_one BUSINESS_ACCOUNT_ID "WhatsApp Business Account (WABA) ID" "" "nonempty"
    [[ -z "$API_KEY" ]]            && prompt_one API_KEY            "System User permanent token" "" "token"

    echo ""
    echo -e "${BOLD}⚙️  Konfigurasi Chatwoot${NC}"
    echo ""

    [[ -z "$INBOX_NAME" ]]         && prompt_one INBOX_NAME         "Nama inbox" "WhatsApp"
    [[ -z "$CHATWOOT_BASE_URL" ]]  && prompt_one CHATWOOT_BASE_URL  "Chatwoot base URL" "$DEFAULT_CHATWOOT_BASE_URL"
    [[ -z "$CHATWOOT_API_TOKEN" ]] && prompt_one CHATWOOT_API_TOKEN "Chatwoot API token (admin)" "$DEFAULT_CHATWOOT_API_TOKEN" "nonempty"
    [[ -z "$CHATWOOT_ACCOUNT_ID" ]] && prompt_one CHATWOOT_ACCOUNT_ID "Chatwoot account ID" "$DEFAULT_CHATWOOT_ACCOUNT_ID"

    echo ""
}

# ── validate_meta_credentials ────────────────────────────────
validate_meta_credentials() {
    info "Validasi kredensial Meta API..."

    local response http_code body
    response=$(curl -s -w "\n%{http_code}" \
        "https://graph.facebook.com/v21.0/${BUSINESS_ACCOUNT_ID}/message_templates?access_token=${API_KEY}&limit=1" \
        2>/dev/null) || error "Tidak bisa terhubung ke graph.facebook.com. Cek koneksi internet."

    http_code=$(echo "$response" | tail -1)
    body=$(echo "$response" | sed '$d')

    if [[ "$http_code" == "200" ]]; then
        success "Kredensial Meta valid"
        return
    fi

    local err_msg
    err_msg=$(echo "$body" | jq -r '.error.message // "Unknown error"' 2>/dev/null || echo "$body")
    local err_code
    err_code=$(echo "$body" | jq -r '.error.code // ""' 2>/dev/null || echo "")

    case "$err_code" in
        190) error "Token expired atau invalid. Buat ulang System User token di Meta Business.\n       Detail: $err_msg" ;;
        100) error "Business Account ID tidak valid: ${BUSINESS_ACCOUNT_ID}\n       Cek di Meta Business Manager.\n       Detail: $err_msg" ;;
        *)   error "Meta API error (HTTP $http_code): $err_msg" ;;
    esac
}

# ── create_whatsapp_inbox ────────────────────────────────────
create_whatsapp_inbox() {
    info "Membuat inbox WhatsApp di Chatwoot..."

    local payload
    payload=$(jq -n \
        --arg name "$INBOX_NAME" \
        --arg phone "$PHONE_NUMBER" \
        --arg api_key "$API_KEY" \
        --arg phone_id "$PHONE_NUMBER_ID" \
        --arg biz_id "$BUSINESS_ACCOUNT_ID" \
        '{
            name: $name,
            channel: {
                type: "whatsapp",
                phone_number: $phone,
                provider: "whatsapp_cloud",
                provider_config: {
                    api_key: $api_key,
                    phone_number_id: $phone_id,
                    business_account_id: $biz_id
                }
            }
        }')

    local response http_code body
    response=$(curl -s -w "\n%{http_code}" \
        -X POST \
        -H "Content-Type: application/json" \
        -H "api_access_token: ${CHATWOOT_API_TOKEN}" \
        -d "$payload" \
        "${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/inboxes" \
        2>/dev/null) || error "Tidak bisa terhubung ke Chatwoot di ${CHATWOOT_BASE_URL}"

    http_code=$(echo "$response" | tail -1)
    body=$(echo "$response" | sed '$d')

    if [[ "$http_code" != "200" ]]; then
        local err_msg
        err_msg=$(echo "$body" | jq -r '.message // .error // "Unknown error"' 2>/dev/null || echo "$body")

        case "$http_code" in
            401|403) error "Token Chatwoot tidak punya akses admin.\n       Detail: $err_msg" ;;
            422)     error "Inbox dengan nomor $PHONE_NUMBER mungkin sudah ada.\n       Cek di Chatwoot Settings > Inboxes.\n       Detail: $err_msg" ;;
            *)       error "Gagal membuat inbox (HTTP $http_code): $err_msg" ;;
        esac
    fi

    INBOX_ID=$(echo "$body" | jq -r '.id // empty')
    if [[ -z "$INBOX_ID" ]]; then
        error "Response tidak mengandung inbox ID. Response:\n       $body"
    fi

    # Coba extract webhook_verify_token
    WEBHOOK_VERIFY_TOKEN=$(echo "$body" | jq -r '.channel.provider_config.webhook_verify_token // empty' 2>/dev/null || true)

    # Jika tidak ada di response, fetch ulang
    if [[ -z "$WEBHOOK_VERIFY_TOKEN" ]]; then
        local inbox_resp
        inbox_resp=$(curl -s \
            -H "api_access_token: ${CHATWOOT_API_TOKEN}" \
            "${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/inboxes/${INBOX_ID}" \
            2>/dev/null || true)
        WEBHOOK_VERIFY_TOKEN=$(echo "$inbox_resp" | jq -r '.channel.provider_config.webhook_verify_token // empty' 2>/dev/null || true)
    fi

    success "Inbox dibuat — ID: ${INBOX_ID}"
}

# ── assign_agent_bot ─────────────────────────────────────────
assign_agent_bot() {
    info "Mencari AgentBot..."

    local bots_resp
    bots_resp=$(curl -s \
        -H "api_access_token: ${CHATWOOT_API_TOKEN}" \
        "${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/agent_bots" \
        2>/dev/null || true)

    local bot_count
    bot_count=$(echo "$bots_resp" | jq 'if type == "array" then length else 0 end' 2>/dev/null || echo "0")

    if [[ "$bot_count" -eq 0 ]]; then
        warn "Tidak ada AgentBot ditemukan. Skip assignment."
        warn "Jalankan setup_chatwoot_bot.py terlebih dahulu, lalu assign manual."
        return
    fi

    if [[ "$bot_count" -eq 1 ]]; then
        AGENT_BOT_ID=$(echo "$bots_resp" | jq -r '.[0].id')
        local bot_name
        bot_name=$(echo "$bots_resp" | jq -r '.[0].name')
        info "Auto-select bot: ${bot_name} (ID: ${AGENT_BOT_ID})"
    else
        echo ""
        echo -e "  ${BOLD}Pilih AgentBot:${NC}"
        echo "$bots_resp" | jq -r 'to_entries[] | "    \(.key + 1). \(.value.name) (ID: \(.value.id))"'

        local choice
        while true; do
            read -rp "  Pilih nomor (1-${bot_count}): " choice
            if [[ "$choice" =~ ^[0-9]+$ ]] && [[ "$choice" -ge 1 ]] && [[ "$choice" -le "$bot_count" ]]; then
                AGENT_BOT_ID=$(echo "$bots_resp" | jq -r ".[$((choice - 1))].id")
                break
            fi
            warn "Pilihan tidak valid"
        done
    fi

    # Assign bot ke inbox
    local assign_resp assign_code
    assign_resp=$(curl -s -w "\n%{http_code}" \
        -X POST \
        -H "Content-Type: application/json" \
        -H "api_access_token: ${CHATWOOT_API_TOKEN}" \
        -d "{\"agent_bot\": ${AGENT_BOT_ID}}" \
        "${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/inboxes/${INBOX_ID}/set_agent_bot" \
        2>/dev/null || true)

    assign_code=$(echo "$assign_resp" | tail -1)

    if [[ "$assign_code" == "200" || "$assign_code" == "204" ]]; then
        success "AgentBot (ID: ${AGENT_BOT_ID}) di-assign ke inbox ${INBOX_ID}"
    else
        warn "Gagal assign AgentBot (HTTP ${assign_code}). Assign manual di Chatwoot."
    fi
}

# ── show_webhook_instructions ────────────────────────────────
show_webhook_instructions() {
    local webhook_url="${CHATWOOT_BASE_URL}/webhooks/whatsapp/${PHONE_NUMBER}"

    echo ""
    echo -e "${BOLD}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}║           WEBHOOK SETUP (Langkah Manual di Meta)            ║${NC}"
    echo -e "${BOLD}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    if [[ "$CHATWOOT_BASE_URL" == *"localhost"* || "$CHATWOOT_BASE_URL" == *"127.0.0.1"* ]]; then
        echo -e "  ${RED}⚠  WARNING: Chatwoot URL masih localhost!${NC}"
        echo -e "  ${RED}   Meta TIDAK bisa mengirim webhook ke localhost.${NC}"
        echo -e "  ${RED}   Kamu perlu:${NC}"
        echo -e "  ${RED}   • Domain publik + HTTPS (Nginx + Let's Encrypt)${NC}"
        echo -e "  ${RED}   • Atau tunnel (ngrok/cloudflared) untuk testing${NC}"
        echo -e "  ${RED}   Update FRONTEND_URL di .env Chatwoot agar sesuai.${NC}"
        echo ""
    fi

    echo -e "  ${CYAN}1.${NC} Buka: ${BOLD}https://developers.facebook.com/apps${NC}"
    echo -e "  ${CYAN}2.${NC} Pilih App → WhatsApp → Configuration"
    echo -e "  ${CYAN}3.${NC} Set Callback URL:"
    echo ""
    echo -e "     ${GREEN}${webhook_url}${NC}"
    echo ""
    echo -e "  ${CYAN}4.${NC} Set Verify Token:"
    echo ""
    if [[ -n "$WEBHOOK_VERIFY_TOKEN" ]]; then
        echo -e "     ${GREEN}${WEBHOOK_VERIFY_TOKEN}${NC}"
    else
        echo -e "     ${YELLOW}(Tidak tersedia — cek di Chatwoot > Settings > Inboxes > ${INBOX_NAME})${NC}"
    fi
    echo ""
    echo -e "  ${CYAN}5.${NC} Subscribe webhook fields:"
    echo -e "     ${GREEN}✓${NC} messages"
    echo -e "     ${GREEN}✓${NC} messaging_postbacks"
    echo ""
}

# ── show_summary ─────────────────────────────────────────────
show_summary() {
    echo -e "${BOLD}══════════════════════════════════════════════════════════════${NC}"
    echo -e "  ${GREEN}✓ SETUP SELESAI${NC}"
    echo -e "${BOLD}══════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "  ${BOLD}Inbox:${NC}"
    echo -e "    Nama:       ${INBOX_NAME}"
    echo -e "    Inbox ID:   ${INBOX_ID}"
    echo -e "    Channel:    WhatsApp Cloud API"
    echo -e "    Nomor:      ${PHONE_NUMBER}"
    echo ""
    if [[ -n "$AGENT_BOT_ID" ]]; then
        echo -e "  ${BOLD}AgentBot:${NC}"
        echo -e "    Bot ID:     ${AGENT_BOT_ID}"
        echo -e "    Assigned:   ${GREEN}✓${NC} ke inbox ${INBOX_ID}"
        echo ""
    fi
    echo -e "  ${BOLD}Langkah Selanjutnya:${NC}"
    echo -e "    1. Konfigurasi webhook di Meta App Dashboard (lihat di atas)"
    echo -e "    2. Pastikan Chatwoot dapat diakses publik via HTTPS"
    echo -e "    3. Kirim pesan test ke ${PHONE_NUMBER} dari WhatsApp"
    echo -e "    4. Cek inbox Chatwoot untuk conversation masuk"
    echo -e "    5. Bot otomatis merespons jika AgentBot ter-assign"
    echo ""
    echo -e "${BOLD}══════════════════════════════════════════════════════════════${NC}"
}

# ── main ─────────────────────────────────────────────────────
main() {
    # Handle --help early, sebelum print header
    for arg in "$@"; do
        [[ "$arg" == "-h" || "$arg" == "--help" ]] && show_usage
    done

    echo ""
    echo -e "${BOLD}🤖 WazapBro AI — WhatsApp Cloud API Setup${NC}"
    echo ""

    parse_args "$@"
    check_deps
    load_env_defaults
    prompt_inputs
    validate_meta_credentials
    create_whatsapp_inbox
    assign_agent_bot
    show_webhook_instructions
    show_summary
}

main "$@"
