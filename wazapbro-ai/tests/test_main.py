import pytest
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, patch, ANY
from sqlmodel import create_engine, SQLModel

# Create in-memory SQLite engine for test isolation
from sqlalchemy.pool import StaticPool
test_engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool
)

from app.main import app as fastapi_app
import app.db
import app.session.state_manager
from app.session.state_manager import get_status, set_status

client = TestClient(fastapi_app)

@pytest.fixture(autouse=True)
def setup_db(monkeypatch):
    monkeypatch.setattr(app.db, "engine", test_engine)
    monkeypatch.setattr(app.session.state_manager, "engine", test_engine)
    SQLModel.metadata.create_all(test_engine)
    yield
    SQLModel.metadata.drop_all(test_engine)

def test_health_check():
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "WazapBro Agent Bot"}

def test_ignore_non_incoming_messages():
    payload = {
        "event": "message_created",
        "message_type": "outgoing",
        "content": "hello",
        "conversation": {"id": 123}
    }
    response = client.post("/webhook/chatwoot", json=payload)
    assert response.status_code == 200
    assert response.json() == {"status": "ignored"}

def test_ignore_non_message_created_events():
    payload = {
        "event": "conversation_status_changed",
        "conversation": {"id": 123}
    }
    response = client.post("/webhook/chatwoot", json=payload)
    assert response.status_code == 200
    assert response.json() == {"status": "ignored"}

@patch("app.main.send_menu_message", new_callable=AsyncMock)
def test_idle_start_flow(mock_send_menu):
    # Initial status is idle
    assert get_status(123) == "idle"

    payload = {
        "event": "message_created",
        "message_type": "incoming",
        "content": "/start",
        "conversation": {"id": 123},
        "sender": {"id": 2, "name": "Bagus"}
    }
    response = client.post("/webhook/chatwoot", json=payload)
    assert response.status_code == 200
    assert response.json() == {"status": "success"}

    # Status should transition to cs_active
    assert get_status(123) == "cs_active"
    mock_send_menu.assert_called_once()
    assert "Selamat Datang di WazapBro" in mock_send_menu.call_args[0][1]

@patch("app.main.send_menu_message", new_callable=AsyncMock)
@patch("app.main.send_message", new_callable=AsyncMock)
@patch("app.main.eksekusi_eskalasi", new_callable=AsyncMock)
def test_cs_active_menu_callbacks(mock_escalate, mock_send_msg, mock_send_menu):
    set_status(123, "cs_active")

    # test pilih_kafe
    payload = {
        "event": "message_created",
        "message_type": "incoming",
        "content": "pilih_kafe",
        "conversation": {"id": 123},
        "sender": {"id": 2}
    }
    response = client.post("/webhook/chatwoot", json=payload)
    assert response.status_code == 200
    # Ensure it is called with 123, the text and item lists
    mock_send_menu.assert_any_call(123, ANY, ANY)
    assert "Selamat Datang di Kafe" in mock_send_menu.call_args_list[-1][0][1]

    # test pilih_hotel
    payload["content"] = "pilih_hotel"
    response = client.post("/webhook/chatwoot", json=payload)
    assert response.status_code == 200
    assert "Selamat Datang di Hotel" in mock_send_menu.call_args_list[-1][0][1]

    # test bicara_staf callback
    payload["content"] = "bicara_staf"
    response = client.post("/webhook/chatwoot", json=payload)
    assert response.status_code == 200
    mock_escalate.assert_called_with(
        123,
        alasan="tombol_cs",
        custom_reply="💬 Menghubungkan Anda ke staf kami, mohon tunggu sebentar..."
    )

    # test kafe_reservasi callback
    payload["content"] = "kafe_reservasi"
    response = client.post("/webhook/chatwoot", json=payload)
    assert response.status_code == 200
    mock_send_msg.assert_any_call(123, "Silakan pilih tanggal & jam kunjungan Anda:")

@patch("app.main.eksekusi_eskalasi", new_callable=AsyncMock)
def test_cs_active_direct_keywords(mock_escalate):
    set_status(123, "cs_active")

    # test 'darurat' keyword
    payload = {
        "event": "message_created",
        "message_type": "incoming",
        "content": "Ini keadaan darurat!",
        "conversation": {"id": 123},
        "sender": {"id": 2}
    }
    response = client.post("/webhook/chatwoot", json=payload)
    assert response.status_code == 200
    mock_escalate.assert_called_with(
        123,
        alasan="keyword_darurat",
        custom_reply="🚨 Kami sedang menghubungkan Anda dengan staf kami, mohon tunggu 🙏"
    )

    # test 'staf' keyword
    payload["content"] = "bisa bicara dengan staf?"
    response = client.post("/webhook/chatwoot", json=payload)
    assert response.status_code == 200
    mock_escalate.assert_called_with(
        123,
        alasan="keyword_staf",
        custom_reply="💬 Menghubungkan Anda ke staf kami, mohon tunggu sebentar..."
    )

@patch("app.main.eksekusi_eskalasi", new_callable=AsyncMock)
def test_cs_active_general_keywords(mock_escalate):
    set_status(123, "cs_active")

    # 'refund' is in Settings.ESCALATION_KEYWORDS
    payload = {
        "event": "message_created",
        "message_type": "incoming",
        "content": "saya minta refund sekarang!",
        "conversation": {"id": 123},
        "sender": {"id": 2}
    }
    response = client.post("/webhook/chatwoot", json=payload)
    assert response.status_code == 200
    mock_escalate.assert_called_with(123, alasan="keyword_eskalasi")

@patch("app.main.jawab", new_callable=AsyncMock)
@patch("app.main.send_message", new_callable=AsyncMock)
@patch("app.main.eksekusi_eskalasi", new_callable=AsyncMock)
def test_cs_active_ai_faq(mock_escalate, mock_send_msg, mock_jawab):
    set_status(123, "cs_active")

    # 1. AI decides to escalate
    mock_jawab.return_value = {"eskalasi": True, "alasan": "minta_manusia"}
    payload = {
        "event": "message_created",
        "message_type": "incoming",
        "content": "tanya cara bayar",
        "conversation": {"id": 123},
        "sender": {"id": 2}
    }
    response = client.post("/webhook/chatwoot", json=payload)
    assert response.status_code == 200
    mock_escalate.assert_called_with(
        123,
        alasan="minta_manusia",
        custom_reply="💬 Menghubungkan Anda ke staf kami, mohon tunggu sebentar..."
    )

    # 2. AI answers successfully
    mock_jawab.return_value = {"eskalasi": False, "jawaban": "Cara bayar adalah cash."}
    response = client.post("/webhook/chatwoot", json=payload)
    assert response.status_code == 200
    mock_send_msg.assert_called_with(123, "Cara bayar adalah cash.")

def test_escalated_state_ignored():
    set_status(123, "escalated")

    payload = {
        "event": "message_created",
        "message_type": "incoming",
        "content": "halo",
        "conversation": {"id": 123},
        "sender": {"id": 2}
    }
    response = client.post("/webhook/chatwoot", json=payload)
    assert response.status_code == 200
    assert response.json() == {"status": "ignored"}

def test_conversation_resolved_resets_state():
    set_status(123, "escalated")
    assert get_status(123) == "escalated"

    payload = {
        "event": "conversation_resolved",
        "conversation": {
            "id": 123,
            "status": "resolved"
        }
    }
    response = client.post("/webhook/chatwoot", json=payload)
    assert response.status_code == 200
    assert response.json() == {"status": "success", "message": "reset_to_idle"}
    assert get_status(123) == "idle"

def test_conversation_status_changed_resolved_resets_state():
    set_status(123, "cs_active")
    assert get_status(123) == "cs_active"

    payload = {
        "event": "conversation_status_changed",
        "conversation": {
            "id": 123,
            "status": "resolved"
        }
    }
    response = client.post("/webhook/chatwoot", json=payload)
    assert response.status_code == 200
    assert response.json() == {"status": "success", "message": "reset_to_idle"}
    assert get_status(123) == "idle"

def test_conversation_status_changed_other_status_ignored():
    set_status(123, "cs_active")
    assert get_status(123) == "cs_active"

    payload = {
        "event": "conversation_status_changed",
        "conversation": {
            "id": 123,
            "status": "open"
        }
    }
    response = client.post("/webhook/chatwoot", json=payload)
    assert response.status_code == 200
    assert response.json() == {"status": "ignored"}
    assert get_status(123) == "cs_active"
