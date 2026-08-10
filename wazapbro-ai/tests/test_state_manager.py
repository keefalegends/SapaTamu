import pytest
from sqlmodel import create_engine, SQLModel

# Create in-memory SQLite engine for test isolation
test_engine = create_engine("sqlite:///:memory:")

# Monkeypatch the engine in app.db and app.session.state_manager
import app.db
import app.session.state_manager
app.db.engine = test_engine
app.session.state_manager.engine = test_engine

from app.session.state_manager import get_status, set_status

@pytest.fixture(autouse=True)
def setup_db():
    SQLModel.metadata.create_all(test_engine)
    yield
    SQLModel.metadata.drop_all(test_engine)

def test_get_default_status():
    assert get_status(999) == "idle"

def test_set_and_get_status():
    set_status(123, "cs_active")
    assert get_status(123) == "cs_active"

    set_status(123, "escalated")
    assert get_status(123) == "escalated"
