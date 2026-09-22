import asyncio
import os
import sys

# Tambahkan path ke rasa_bot
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "rasa_bot")))

from rasa.core.agent import Agent

async def test_nlu():
    model_path = os.path.join(os.path.dirname(__file__), "..", "rasa_bot", "models", "sapatamu_model.tar.gz")
    print(f"🤖 Memuat model Rasa dari: {model_path}...")
    agent = Agent.load(model_path)

    test_sentences = [
        "Halo selamat pagi min",
        "Ada pilihan kamar apa saja ya?",
        "Saya mau booking kamar Deluxe Room untuk tanggal 25 September",
        "Bisa lihat daftar menu kafe?",
        "Mau pesan 2 Nasi Goreng Spesial dong",
        "Nama saya Bagus Arya nomor 081234567890",
        "Terima kasih infonya ya"
    ]

    print("\n==========================================================")
    print("🧠 [NLU PREDICTION TEST - BAHASA INDONESIA]")
    print("==========================================================")
    for text in test_sentences:
        res = await agent.parse_message(text)
        intent = res.get("intent", {}).get("name")
        conf = res.get("intent", {}).get("confidence", 0.0)
        entities = [{"entity": e["entity"], "value": e["value"]} for e in res.get("entities", [])]
        print(f"\n💬 Input  : \"{text}\"")
        print(f"🎯 Intent : {intent} (Confidence: {conf*100:.1f}%)")
        if entities:
            print(f"🏷️ Entities: {entities}")

if __name__ == "__main__":
    asyncio.run(test_nlu())
