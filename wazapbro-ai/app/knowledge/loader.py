import json
import os
from typing import Any

# Cache to avoid reloading the file on every request
_knowledge_base: list[dict[str, Any]] | None = None
_knowledge_text: str | None = None

def load_knowledge_base() -> list[dict[str, Any]]:
    """
    Load the knowledge base from data.json.
    Returns the parsed JSON data.
    """
    global _knowledge_base
    if _knowledge_base is not None:
        return _knowledge_base

    current_dir = os.path.dirname(os.path.abspath(__file__))
    file_path = os.path.join(current_dir, "data.json")

    try:
        with open(file_path, "r", encoding="utf-8") as f:
            _knowledge_base = json.load(f)
    except Exception as e:
        # Fallback empty list if file not found or invalid
        print(f"Error loading knowledge base: {e}")
        _knowledge_base = []

    return _knowledge_base

def get_knowledge_text() -> str:
    """
    Format the knowledge base into a single string for the AI system prompt.
    """
    global _knowledge_text
    if _knowledge_text is not None:
        return _knowledge_text

    data = load_knowledge_base()

    formatted_items = []
    for item in data:
        topik = item.get("topik", "")
        jawaban = item.get("jawaban", "")
        if topik and jawaban:
            formatted_items.append(f"Topik: {topik}\nJawaban: {jawaban}")

    _knowledge_text = "\n\n".join(formatted_items)
    return _knowledge_text

def clear_cache() -> None:
    """Clear the cached knowledge base (useful for testing or reloading)."""
    global _knowledge_base, _knowledge_text
    _knowledge_base = None
    _knowledge_text = None
