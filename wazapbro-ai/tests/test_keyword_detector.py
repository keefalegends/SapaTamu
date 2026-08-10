import pytest
from app.escalation.keyword_detector import cek_eskalasi
from app.config import Settings

# Bikin dummy settings buat testing
settings = Settings(ESCALATION_KEYWORDS="komplain,refund,batal,bicara sama orang,urgent,kecewa")
KEYWORDS = settings.escalation_keywords_list

def test_cek_eskalasi_positif():
    """Test pesan yang mengandung keyword eskalasi."""
    assert cek_eskalasi("Saya mau komplain soal pesanan", KEYWORDS) is True
    assert cek_eskalasi("Tolong refund dana saya", KEYWORDS) is True
    assert cek_eskalasi("Bisa batal gak?", KEYWORDS) is True
    assert cek_eskalasi("Ini urgent tolong dibalas", KEYWORDS) is True
    assert cek_eskalasi("Saya kecewa dengan pelayanan", KEYWORDS) is True

def test_cek_eskalasi_negatif():
    """Test pesan yang TIDAK mengandung keyword eskalasi."""
    assert cek_eskalasi("Jam buka jam berapa?", KEYWORDS) is False
    assert cek_eskalasi("Gimana cara booking?", KEYWORDS) is False
    assert cek_eskalasi("Lokasi dimana ya?", KEYWORDS) is False
    assert cek_eskalasi("Halo min", KEYWORDS) is False

def test_cek_eskalasi_case_insensitive():
    """Test case insensitivity."""
    assert cek_eskalasi("REFUND dong", KEYWORDS) is True
    assert cek_eskalasi("KomPlaiN", KEYWORDS) is True
    assert cek_eskalasi("bAtAlin pesanan", KEYWORDS) is True

def test_cek_eskalasi_multi_word():
    """Test multi-word keyword."""
    assert cek_eskalasi("Saya mau bicara sama orang", KEYWORDS) is True
    assert cek_eskalasi("Tolong hubungkan saya untuk bicara sama orang asli", KEYWORDS) is True

def test_cek_eskalasi_empty_input():
    """Test edge cases: empty input."""
    assert cek_eskalasi("", KEYWORDS) is False
    assert cek_eskalasi(None, KEYWORDS) is False # type: ignore
    assert cek_eskalasi("Saya mau refund", []) is False
