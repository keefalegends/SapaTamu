#!/usr/bin/env python3
"""
Script untuk meregistrasikan WazapBro AI sebagai Agent Bot di Chatwoot,
serta menghubungkannya ke Inbox yang Anda pilih.
"""

import httpx
import sys
import os
from dotenv import load_dotenv

# Load env variables
load_dotenv(".env")

CHATWOOT_BASE_URL = os.getenv("CHATWOOT_BASE_URL", "https://app.chatwoot.com")
CHATWOOT_API_TOKEN = os.getenv("CHATWOOT_API_TOKEN")
# Gunakan token superadmin (Platform API) atau user token dengan akses administrator
# Chatwoot mewajibkan token dengan otorisasi cukup untuk membuat Agent Bot

def get_headers():
    if not CHATWOOT_API_TOKEN:
        print("Error: CHATWOOT_API_TOKEN belum diatur di .env")
        sys.exit(1)
    return {
        "api_access_token": CHATWOOT_API_TOKEN,
        "Content-Type": "application/json"
    }

def create_agent_bot(name: str, webhook_url: str):
    """Membuat Agent Bot global di Chatwoot"""
    url = f"{CHATWOOT_BASE_URL}/api/v1/agent_bots"
    payload = {
        "name": name,
        "outgoing_url": webhook_url
    }

    print(f"[*] Mencoba mendaftarkan Agent Bot '{name}'...")
    print(f"    Webhook URL: {webhook_url}")

    response = httpx.post(url, headers=get_headers(), json=payload)

    if response.status_code in [200, 201]:
        bot_data = response.json()
        print(f"[+] Berhasil! Agent Bot ID: {bot_data.get('id')}")
        return bot_data.get('id')
    else:
        print(f"[-] Gagal membuat bot. Status: {response.status_code}")
        print(f"    Respons: {response.text}")
        sys.exit(1)

def list_inboxes(account_id: int):
    """Mendapatkan daftar inbox untuk dihubungkan"""
    url = f"{CHATWOOT_BASE_URL}/api/v1/accounts/{account_id}/inboxes"
    response = httpx.get(url, headers=get_headers())

    if response.status_code == 200:
        inboxes = response.json().get("payload", [])
        print("\n[*] Daftar Inbox Tersedia:")
        for inbox in inboxes:
            print(f"    - ID: {inbox['id']} | Nama: {inbox['name']} | Channel: {inbox['channel_type']}")
        return inboxes
    else:
        print(f"[-] Gagal mengambil daftar Inbox. Status: {response.status_code}")
        sys.exit(1)

def connect_bot_to_inbox(account_id: int, inbox_id: int, bot_id: int):
    """Menghubungkan Agent Bot ke Inbox tertentu"""
    # Catatan: API Chatwoot menggunakan endpoint pembaruan Inbox atau lewat AgentBot Inbox
    # Kita menggunakan POST /api/v1/accounts/{account_id}/agent_bots/{bot_id}/inboxes (tergantung versi)

    url = f"{CHATWOOT_BASE_URL}/api/v1/accounts/{account_id}/agent_bots/{bot_id}/inboxes"
    payload = {
        "inbox_ids": [inbox_id]
    }

    response = httpx.post(url, headers=get_headers(), json=payload)

    if response.status_code in [200, 201]:
        print(f"[+] Bot (ID: {bot_id}) berhasil disambungkan ke Inbox (ID: {inbox_id})!")
    else:
        # Jika endpoint di atas gagal (beda versi Chatwoot), coba cara manual
        print(f"[-] Gagal menghubungkan otomatis (Status {response.status_code}).")
        print("    Silakan masuk ke Chatwoot Dashboard -> Settings -> Inboxes -> Settings -> Collaborators")
        print("    lalu pilih 'WazapBro AI' dari dropdown Agent Bot.")

def main():
    print("="*50)
    print("🤖 SETUP CHATWOOT AGENT BOT (WAZAPBRO AI)")
    print("="*50)

    # 1. Tanya URL webhook backend Anda
    print("\nMasukkan URL VPS backend Python Anda (wajib HTTPS, berakhiran /webhook/chatwoot)")
    print("Contoh: https://api.wazapbro.com/webhook/chatwoot")
    webhook_url = input("Webhook URL: ").strip()

    if not webhook_url:
        print("Webhook URL dibatalkan.")
        return

    # 2. Buat Bot
    bot_id = create_agent_bot("WazapBro AI", webhook_url)

    # 3. Minta Account ID
    account_id = os.getenv("CHATWOOT_ACCOUNT_ID", "1")
    acc_input = input(f"\nMasukkan Account ID Anda (Enter untuk default '{account_id}'): ").strip()
    if acc_input:
        account_id = acc_input

    # 4. Tampilkan Inboxes
    inboxes = list_inboxes(int(account_id))

    if not inboxes:
        print("Tidak ada inbox ditemukan. Setup selesai, tapi bot belum terhubung ke channel apapun.")
        return

    # 5. Hubungkan ke Inbox
    print("\nMasukkan ID Inbox yang ingin dihubungkan dengan Bot ini:")
    inbox_input = input("Inbox ID: ").strip()

    if inbox_input.isdigit():
        connect_bot_to_inbox(int(account_id), int(inbox_input), bot_id)

    print("\n✅ Proses Registrasi Selesai!")
    print("Pesan yang masuk ke inbox tersebut kini akan dilempar Chatwoot ke webhook Anda.")

if __name__ == "__main__":
    main()
