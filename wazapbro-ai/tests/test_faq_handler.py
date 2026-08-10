import pytest
from unittest.mock import AsyncMock, patch
from app.ai.faq_handler import jawab

class MockMessage:
    def __init__(self, content):
        self.content = content

class MockChoice:
    def __init__(self, content):
        self.message = MockMessage(content)

class MockResponse:
    def __init__(self, content):
        self.choices = [MockChoice(content)]

@pytest.mark.asyncio
async def test_jawab_success():
    """Test AI membalas dengan JSON yang valid."""
    json_str = '{"jawaban": "Buka jam 8", "eskalasi": false, "alasan": null}'
    mock_create = AsyncMock(return_value=MockResponse(json_str))

    with patch('app.ai.faq_handler.get_ai_client') as mock_get_client:
        mock_client = mock_get_client.return_value
        mock_client.chat.completions.create = mock_create

        hasil = await jawab("Jam berapa buka?")

        assert hasil["eskalasi"] is False
        assert hasil["jawaban"] == "Buka jam 8"

@pytest.mark.asyncio
async def test_jawab_eskalasi_dari_ai():
    """Test saat AI merespons butuh eskalasi."""
    json_str = '{"jawaban": null, "eskalasi": true, "alasan": "minta_manusia"}'
    mock_create = AsyncMock(return_value=MockResponse(json_str))

    with patch('app.ai.faq_handler.get_ai_client') as mock_get_client:
        mock_client = mock_get_client.return_value
        mock_client.chat.completions.create = mock_create

        hasil = await jawab("Mau ngomong sama cs")

        assert hasil["eskalasi"] is True
        assert hasil["alasan"] == "minta_manusia"

@pytest.mark.asyncio
async def test_jawab_error_fallback():
    """Test fail-safe jika API error atau output bukan JSON."""
    mock_create = AsyncMock(side_effect=Exception("API Error"))

    with patch('app.ai.faq_handler.get_ai_client') as mock_get_client:
        mock_client = mock_get_client.return_value
        mock_client.chat.completions.create = mock_create

        hasil = await jawab("Test error")

        # Harus fallback ke mode eskalasi
        assert hasil["eskalasi"] is True
        assert hasil["alasan"] == "ai_error_or_timeout"
