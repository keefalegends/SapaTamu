from sqlmodel import Field, SQLModel
from datetime import datetime, timezone

class SessionState(SQLModel, table=True):
    """
    Model untuk menyimpan status percakapan (idle, cs_active, escalated).
    PK menggunakan conversation_id dari Chatwoot.
    """
    __tablename__ = "session_state" # type: ignore

    conversation_id: int = Field(primary_key=True)
    status: str = Field(default="idle", index=True) # "idle" | "cs_active" | "escalated"
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
