import logging
from app.config import settings
from app.session.state_manager import set_status
from app.chatwoot.client import send_message, assign_conversation, change_conversation_status

logger = logging.getLogger(__name__)

ESCALATION_REPLY = "Baik, pesan Anda telah kami teruskan. Tim Customer Service kami akan segera membantu Anda."

async def eksekusi_eskalasi(conversation_id: int, alasan: str = "keyword", custom_reply: str = None) -> None:
    """
    Menjalankan alur eskalasi:
    1. Assign percakapan ke tim CS di Chatwoot.
    2. Ubah status percakapan di Chatwoot menjadi open agar muncul di dashboard human agent.
    3. Kirim pesan notifikasi standar ke tamu.
    4. Ubah status lokal menjadi 'escalated'.
    """
    logger.info(f"Mengeksekusi eskalasi untuk Conv ID: {conversation_id} (Alasan: {alasan})")

    # 1. Assign ke CS Team
    await assign_conversation(conversation_id, settings.CHATWOOT_ESCALATION_TEAM_ID)

    # 2. Ubah status di Chatwoot ke open
    await change_conversation_status(conversation_id, "open")

    # 3. Kirim balasan ke user (bisa custom atau default)
    reply_text = custom_reply if custom_reply else ESCALATION_REPLY
    await send_message(conversation_id, reply_text)

    # 4. Kunci status percakapan agar AI berhenti memproses
    set_status(conversation_id, "escalated")
    logger.info(f"Percakapan {conversation_id} berhasil dikunci (escalated).")
