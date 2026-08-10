import pytest
from app.session.entry_detector import is_cs_entry
from app.config import Settings

def test_is_cs_entry():
    # Menggunakan triggers default dari config.py
    assert is_cs_entry("customer service") is True
    assert is_cs_entry("CS") is True
    assert is_cs_entry("tolong bantuan dong") is True
    assert is_cs_entry("jam buka") is False
    assert is_cs_entry("") is False
