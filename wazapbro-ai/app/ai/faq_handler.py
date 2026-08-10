import logging
import json
from app.config import settings
from app.ai.gateway import get_ai_client
from app.knowledge.loader import get_knowledge_text

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """Kamu adalah asisten virtual (AI) untuk layanan pelanggan.
Jawab HANYA berdasarkan informasi (Knowledge Base) berikut:

{knowledge}

Aturan penting:
1. Jawab dengan ramah, profesional, dan ringkas.
2. JANGAN pernah mengarang informasi di luar Knowledge Base.
3. Kamu HARUS SELALU membalas dalam format JSON yang valid.
4. Schema JSON yang WAJIB kamu gunakan:
   {{
     "jawaban": "isi jawaban ke pelanggan, atau null jika eskalasi",
     "eskalasi": true / false,
     "alasan": "tidak_ada_di_knowledge_base" / "minta_manusia" / null
   }}

Kondisi untuk eskalasi (eskalasi = true):
- Jika pelanggan menanyakan sesuatu yang tidak ada di Knowledge Base.
- Jika pelanggan secara eksplisit meminta bicara dengan CS manusia / staf.
Dalam kondisi ini, isi "jawaban" dengan null.
"""

def clean_json_string(text: str) -> str:
    """
    Membersihkan string JSON dari markdown code blocks (```json ... ```)
    yang sering ditambahkan oleh beberapa LLM.
    """
    text = text.strip()
    if text.startswith("```"):
        # Hapus baris pertama jika itu ```json atau ```
        lines = text.split("\n")
        if lines[0].startswith("```"):
            lines = lines[1:]
        # Hapus baris terakhir jika itu ```
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines).strip()
    return text

async def jawab(pesan: str) -> dict:
    """
    Memanggil AI dan mengembalikan dictionary hasil parse JSON.
    Jika terjadi error/gagal parsing, fail-safe mengembalikan dict eskalasi.
    """
    fail_safe_response = {
        "jawaban": None,
        "eskalasi": True,
        "alasan": "ai_error_or_timeout"
    }

    if not pesan:
        return fail_safe_response

    knowledge = get_knowledge_text()
    system_prompt_text = SYSTEM_PROMPT.format(knowledge=knowledge)

    try:
        client = get_ai_client()
        response = await client.chat.completions.create(
            model=settings.AI_MODEL,
            messages=[
                {"role": "system", "content": system_prompt_text},
                {"role": "user", "content": pesan}
            ],
            temperature=0.0,
            response_format={"type": "json_object"},
            max_tokens=300
        )

        content = response.choices[0].message.content
        if content:
            # Bersihkan markdown code blocks jika ada
            cleaned_content = clean_json_string(content)
            # Parse response JSON dari AI
            parsed_json = json.loads(cleaned_content)
            # Pastikan key yang diharapkan ada
            if "eskalasi" not in parsed_json:
                raise ValueError("Format JSON AI tidak memiliki field 'eskalasi'")
            return parsed_json

        return fail_safe_response

    except json.JSONDecodeError as e:
        logger.error(f"Gagal mem-parse JSON dari AI: {e}")
        return fail_safe_response
    except Exception as e:
        logger.error(f"Error AI Gateway: {e}")
        return fail_safe_response
