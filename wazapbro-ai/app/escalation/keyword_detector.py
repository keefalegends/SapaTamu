def cek_eskalasi(pesan: str, keywords: list[str]) -> bool:
    """
    Cek apakah pesan mengandung kata kunci eskalasi.
    Pengecekan dilakukan secara case-insensitive menggunakan substring match.

    Args:
        pesan: Pesan dari pelanggan
        keywords: Daftar kata kunci yang memicu eskalasi

    Returns:
        True jika ditemukan kata kunci eskalasi, False jika tidak
    """
    if not pesan or not keywords:
        return False

    pesan_lower = pesan.lower()

    for keyword in keywords:
        # Pengecekan substring sederhana
        if keyword.lower() in pesan_lower:
            return True

    return False
