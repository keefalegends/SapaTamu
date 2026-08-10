import os
from sqlmodel import SQLModel, create_engine, Session
from app.models.session_state import SessionState
import logging

logger = logging.getLogger(__name__)

# Gunakan SQLite file db di root folder wazapbro-ai
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, "session.db")
sqlite_url = f"sqlite:///{DB_PATH}"

# Buat engine
engine = create_engine(sqlite_url, echo=False)

def init_db():
    """Membuat tabel-tabel di database (jika belum ada)."""
    SQLModel.metadata.create_all(engine)
    logger.info("Database SQLite (session.db) berhasil diinisialisasi.")

def get_session():
    """Dependency / Helper untuk mendapatkan session DB."""
    with Session(engine) as session:
        yield session
