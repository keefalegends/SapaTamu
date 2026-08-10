from pydantic import BaseModel, Field
from typing import Any

class ChatwootSender(BaseModel):
    id: int
    name: str | None = None
    type: str | None = None # "contact" or "user"

class ChatwootConversation(BaseModel):
    id: int
    status: str | None = None

class ChatwootWebhookPayload(BaseModel):
    event: str
    message_type: str | None = None # "incoming" / "outgoing"
    content: str | None = None
    conversation: ChatwootConversation
    sender: ChatwootSender | None = None
