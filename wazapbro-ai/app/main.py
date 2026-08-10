import logging
from fastapi import FastAPI, Request, HTTPException, Header
from app.db import init_db
from app.config import settings
from app.chatwoot.webhook_schema import ChatwootWebhookPayload
from app.session.state_manager import get_status, set_status
from app.session.entry_detector import is_cs_entry
from app.escalation.keyword_detector import cek_eskalasi
from app.escalation.escalation_service import eksekusi_eskalasi
from app.ai.faq_handler import jawab
from app.chatwoot.client import send_message, send_menu_message

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

app = FastAPI(title="WazapBro Agent Bot (Chatwoot v2)")

# ====== KONSTANTA MENU PILIHAN ======
GREETING_UTAMA_TEXT = (
    "*Selamat Datang di WazapBro* 👋\n\n"
    "Halo! Saya asisten virtual yang siap bantu Anda 24/7.\n\n"
    "Silakan pilih layanan di bawah ini:\n\n"
    "_Ketik \"staf\" kapan saja untuk bicara langsung_"
)
GREETING_UTAMA_ITEMS = [
    {"title": "☕ Kafe", "value": "pilih_kafe"},
    {"title": "🏨 Hotel", "value": "pilih_hotel"},
    {"title": "💬 Bicara Staf", "value": "bicara_staf"},
]

GREETING_KAFE_TEXT = (
    "*Selamat Datang di Kafe* ☕\n\n"
    "Saya asisten virtual, siap bantu 24/7. Pilih layanan di bawah:"
)
GREETING_KAFE_ITEMS = [
    {"title": "🪑 Reservasi Meja", "value": "kafe_reservasi"},
    {"title": "📱 Self-Order QR", "value": "kafe_selforder"},
    {"title": "📋 Lihat Menu & Harga", "value": "kafe_menu"},
    {"title": "⭐ Cek Poin Loyalti", "value": "kafe_poin"},
    {"title": "💬 Bicara dengan Staf", "value": "bicara_staf"},
]

GREETING_HOTEL_TEXT = (
    "*Selamat Datang di Hotel* 🏨\n\n"
    "Saya bisa bantu reservasi, info fasilitas, atau room service.\n\n"
    "_Untuk situasi darurat, ketik \"darurat\" kapan saja_"
)
GREETING_HOTEL_ITEMS = [
    {"title": "🛏️ Pesan Kamar", "value": "hotel_reservasi"},
    {"title": "ℹ️ Info Fasilitas", "value": "hotel_fasilitas"},
    {"title": "Lainnya", "value": "hotel_lainnya"},
]

CALLBACK_ACTIONS = {
    "pilih_kafe": "menu_kafe",
    "pilih_hotel": "menu_hotel",
    "bicara_staf": "escalate_staf",
    "kafe_reservasi": "msg_kafe_reservasi",
    "hotel_reservasi": "msg_hotel_reservasi",
    "kafe_selforder": "msg_unimplemented",
    "kafe_menu": "msg_unimplemented",
    "kafe_poin": "msg_unimplemented",
    "hotel_fasilitas": "msg_unimplemented",
    "hotel_lainnya": "msg_unimplemented",
}

@app.on_event("startup")
async def startup_event():
    logger.info("Starting WazapBro Agent Bot...")
    init_db()

@app.get("/")
def health_check():
    return {"status": "ok", "service": "WazapBro Agent Bot"}

@app.post("/webhook/chatwoot")
async def chatwoot_webhook(request: Request):
    try:
        body = await request.json()
        logger.info(f"Menerima Webhook Chatwoot: {body}")
    except Exception as e:
        logger.error(f"Gagal parse JSON body: {e}")
        return {"status": "error", "message": "invalid_json"}

    # Ekstrak data secara aman dengan default fallback
    event = body.get("event")

    # Dapatkan ID Conversation
    conversation = body.get("conversation") or {}
    conversation_id = conversation.get("id") or body.get("id")

    # Handle event resolusi percakapan untuk reset status lokal ke idle
    if event in ("conversation_resolved", "conversation_status_changed"):
        status_value = body.get("status") or conversation.get("status")
        if status_value == "resolved" and conversation_id:
            logger.info(f"Conversation {conversation_id} resolved di Chatwoot. Resetting local state to idle.")
            set_status(conversation_id, "idle")
            return {"status": "success", "message": "reset_to_idle"}
        return {"status": "ignored"}

    message_type = body.get("message_type")

    # Deteksi event message_created & incoming
    if event != "message_created" or message_type != "incoming":
        return {"status": "ignored"}

    # Dapatkan content teks
    content = body.get("content") or ""
    content_clean = content.strip()

    if not conversation_id:
        logger.warning("Webhook tidak memiliki conversation_id.")
        return {"status": "ignored"}

    status = get_status(conversation_id)

    if status == "idle":
        if is_cs_entry(content_clean) or content_clean == "/start":
            logger.info(f"Conv {conversation_id} masuk ke flow CS.")
            set_status(conversation_id, "cs_active")
            await send_menu_message(conversation_id, GREETING_UTAMA_TEXT, GREETING_UTAMA_ITEMS)
        return {"status": "success"}

    elif status == "escalated":
        return {"status": "ignored"}

    elif status == "cs_active":
        # 1. Cek apakah ini callback dari tombol menu
        if content_clean in CALLBACK_ACTIONS:
            action = CALLBACK_ACTIONS[content_clean]
            logger.info(f"Conv {conversation_id} memicu callback action: {action}")
            if action == "menu_kafe":
                await send_menu_message(conversation_id, GREETING_KAFE_TEXT, GREETING_KAFE_ITEMS)
            elif action == "menu_hotel":
                await send_menu_message(conversation_id, GREETING_HOTEL_TEXT, GREETING_HOTEL_ITEMS)
            elif action == "escalate_staf":
                await eksekusi_eskalasi(
                    conversation_id,
                    alasan="tombol_cs",
                    custom_reply="💬 Menghubungkan Anda ke staf kami, mohon tunggu sebentar..."
                )
            elif action == "msg_kafe_reservasi":
                await send_message(conversation_id, "Silakan pilih tanggal & jam kunjungan Anda:")
            elif action == "msg_hotel_reservasi":
                await send_message(conversation_id, "Silakan pilih tanggal check-in Anda:")
            elif action == "msg_unimplemented":
                await send_message(conversation_id, "Fitur ini masih dalam pengembangan 🚧")
            return {"status": "success"}

        # 2. Cek keyword direct-redirect (darurat, alergi, staf)
        content_lower = content_clean.lower()
        if "darurat" in content_lower or "alergi" in content_lower:
            logger.info(f"Conv {conversation_id} eskalasi direct keyword: darurat/alergi")
            await eksekusi_eskalasi(
                conversation_id,
                alasan="keyword_darurat",
                custom_reply="🚨 Kami sedang menghubungkan Anda dengan staf kami, mohon tunggu 🙏"
            )
            return {"status": "success"}
        elif "staf" in content_lower:
            logger.info(f"Conv {conversation_id} eskalasi direct keyword: staf")
            await eksekusi_eskalasi(
                conversation_id,
                alasan="keyword_staf",
                custom_reply="💬 Menghubungkan Anda ke staf kami, mohon tunggu sebentar..."
            )
            return {"status": "success"}

        
        if cek_eskalasi(content_clean, settings.escalation_keywords_list):
            logger.info(f"Conv {conversation_id} eskalasi keyword umum")
            await eksekusi_eskalasi(conversation_id, alasan="keyword_eskalasi")
            return {"status": "success"}

       
        ai_response = await jawab(content_clean)

        if ai_response.get("eskalasi") is True:
            alasan_ai = ai_response.get("alasan", "ai_decision")
            logger.info(f"Conv {conversation_id} eskalasi karena AI (Alasan: {alasan_ai})")
            custom_reply = None
            if alasan_ai == "minta_manusia":
                custom_reply = "💬 Menghubungkan Anda ke staf kami, mohon tunggu sebentar..."
            await eksekusi_eskalasi(conversation_id, alasan=alasan_ai, custom_reply=custom_reply)
        else:
            
            jawaban_teks = ai_response.get("jawaban")
            if jawaban_teks:
                await send_message(conversation_id, jawaban_teks)

        return {"status": "success"}

    return {"status": "unknown_state"}
