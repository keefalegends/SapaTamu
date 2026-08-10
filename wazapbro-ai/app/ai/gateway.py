from openai import AsyncOpenAI
from app.config import settings

# Singleton instance of the AsyncOpenAI client
_ai_client: AsyncOpenAI | None = None

def get_ai_client() -> AsyncOpenAI:
    """
    Menginisialisasi dan me-return instance AsyncOpenAI yang dikonfigurasi
    untuk mengarah ke 9Router (bukan langsung ke OpenAI).
    """
    global _ai_client
    if _ai_client is None:
        _ai_client = AsyncOpenAI(
            base_url=settings.NINEROUTER_BASE_URL,
            api_key=settings.NINEROUTER_API_KEY,
        )
    return _ai_client
