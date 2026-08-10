from app.config import settings

def is_cs_entry(text: str) -> bool:
    """
    Mengecek apakah pesan text cocok dengan salah satu trigger entry CS.
    Ini digunakan saat status masih 'idle' untuk memulai flow.
    Pengecekan dilakukan secara case-insensitive substring match.
    """
    if not text:
        return False

    text_lower = text.lower()
    for trigger in settings.cs_entry_triggers_list:
        if trigger in text_lower:
            return True

    return False
