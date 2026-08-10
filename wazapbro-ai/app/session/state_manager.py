from sqlmodel import Session, select
from app.db import engine
from app.models.session_state import SessionState
from datetime import datetime, timezone

def get_status(conversation_id: int) -> str:
    """
    Ambil status percakapan saat ini.
    Jika belum ada di database, default return "idle".
    """
    with Session(engine) as session:
        statement = select(SessionState).where(SessionState.conversation_id == conversation_id)
        result = session.exec(statement).first()
        if result:
            return result.status
        return "idle"

def set_status(conversation_id: int, new_status: str) -> None:
    """
    Update atau buat status baru untuk percakapan.
    Status yang valid: 'idle', 'cs_active', 'escalated'.
    """
    with Session(engine) as session:
        statement = select(SessionState).where(SessionState.conversation_id == conversation_id)
        result = session.exec(statement).first()

        if result:
            result.status = new_status
            result.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
            session.add(result)
        else:
            new_state = SessionState(conversation_id=conversation_id, status=new_status)
            session.add(new_state)

        session.commit()
