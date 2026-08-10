import httpx
import logging
from app.config import settings

logger = logging.getLogger(__name__)

def _get_headers() -> dict:
    return {
        "api_access_token": settings.CHATWOOT_API_TOKEN,
        "Content-Type": "application/json"
    }

async def send_message(conversation_id: int, text: str) -> bool:
    """
    Kirim pesan balasan ke Chatwoot (sebagai bot).
    """
    if not text:
        return False

    url = f"{settings.CHATWOOT_BASE_URL}/api/v1/accounts/{settings.CHATWOOT_ACCOUNT_ID}/conversations/{conversation_id}/messages"
    payload = {
        "content": text,
        "message_type": "outgoing",
        "private": False
    }

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(url, headers=_get_headers(), json=payload, timeout=10.0)
            response.raise_for_status()
            logger.info(f"Pesan terkirim ke Chatwoot (Conv ID: {conversation_id})")
            return True
    except Exception as e:
        logger.error(f"Gagal kirim pesan ke Chatwoot: {e}")
        return False

async def assign_conversation(conversation_id: int, team_id: int) -> bool:
    """
    Assign percakapan ke tim/manusia tertentu saat terjadi eskalasi.
    """
    if not team_id or team_id <= 0:
        logger.info("CHATWOOT_ESCALATION_TEAM_ID tidak valid atau bernilai 0. Melewati penugasan tim.")
        return False

    url = f"{settings.CHATWOOT_BASE_URL}/api/v1/accounts/{settings.CHATWOOT_ACCOUNT_ID}/conversations/{conversation_id}/assignments"
    payload = {
        "team_id": team_id
    }

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(url, headers=_get_headers(), json=payload, timeout=10.0)
            if response.status_code == 404:
                logger.warning(f"Gagal assign conversation di Chatwoot: Team/Conversation tidak ditemukan (404 Not Found) untuk Team ID {team_id}.")
                return False
            response.raise_for_status()
            logger.info(f"Percakapan {conversation_id} berhasil diassign ke Team ID {team_id}")
            return True
    except Exception as e:
        logger.error(f"Gagal assign conversation di Chatwoot: {e}")
        return False

async def change_conversation_status(conversation_id: int, status: str) -> bool:
    """
    Mengubah status percakapan di Chatwoot (misal: 'open', 'resolved', 'pending').
    """
    url = f"{settings.CHATWOOT_BASE_URL}/api/v1/accounts/{settings.CHATWOOT_ACCOUNT_ID}/conversations/{conversation_id}/toggle_status"
    payload = {
        "status": status
    }

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(url, headers=_get_headers(), json=payload, timeout=10.0)
            response.raise_for_status()
            logger.info(f"Status percakapan {conversation_id} berhasil diubah menjadi {status}")
            return True
    except Exception as e:
        logger.error(f"Gagal mengubah status percakapan di Chatwoot: {e}")
        return False

async def send_menu_message(conversation_id: int, text: str, items: list[dict]) -> bool:
    """
    Kirim pesan berupa menu pilihan (inline keyboard) ke Chatwoot.
    items: list dari dict dengan format: [{"title": "Label Tombol", "value": "callback_value"}]
    """
    if not text or not items:
        return False

    url = f"{settings.CHATWOOT_BASE_URL}/api/v1/accounts/{settings.CHATWOOT_ACCOUNT_ID}/conversations/{conversation_id}/messages"
    payload = {
        "content": text,
        "message_type": "outgoing",
        "private": False,
        "content_type": "input_select",
        "content_attributes": {
            "items": items
        }
    }

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(url, headers=_get_headers(), json=payload, timeout=10.0)
            response.raise_for_status()
            logger.info(f"Pesan menu terkirim ke Chatwoot (Conv ID: {conversation_id})")
            return True
    except Exception as e:
        logger.error(f"Gagal kirim pesan menu ke Chatwoot: {e}")
        return False
