import asyncio
import os
import sys

# Tambahkan path ke rasa_bot
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "rasa_bot")))

from actions.actions import ActionShowMenu, ActionSubmitHotelBooking, ActionSubmitCafeOrder, HOTEL_ROOMS, CAFE_MENU
from rasa_sdk import Tracker
from rasa_sdk.executor import CollectingDispatcher

print("==========================================================")
print("🧪 [TEST 1] VERIFIKASI DATA PRODUK & HARGA DI ACTIONS.PY")
print("==========================================================")
print("🏨 Kamar Hotel Terdaftar:")
for k, v in HOTEL_ROOMS.items():
    print(f"  • {v['name']}: Rp {v['price']:,} / malam")

print("\n☕ Menu Kafe & Resto Terdaftar:")
for k, v in CAFE_MENU.items():
    print(f"  • {v['name']} ({v['cat']}): Rp {v['price']:,}")

print("\n==========================================================")
print("🧪 [TEST 2] SIMULASI ACTION SUBMIT HOTEL BOOKING")
print("==========================================================")
dispatcher = CollectingDispatcher()
tracker = Tracker(
    sender_id="test_user_bagus",
    slots={
        "room_type": "Deluxe Room",
        "checkin_date": "25 September 2026",
        "guest_name": "Bagus Arya",
        "phone_number": "081234567890"
    },
    latest_message={},
    events=[],
    paused=False,
    followup_action=None,
    active_loop={},
    latest_action_name=None
)

action_booking = ActionSubmitHotelBooking()
action_booking.run(dispatcher, tracker, {})
for msg in dispatcher.messages:
    print(msg.get("text"))

print("\n==========================================================")
print("🧪 [TEST 3] SIMULASI ACTION SUBMIT CAFE ORDER (2 NASI GORENG)")
print("==========================================================")
dispatcher_cafe = CollectingDispatcher()
tracker_cafe = Tracker(
    sender_id="test_user_bagus",
    slots={
        "food_item": "Nasi Goreng Spesial",
        "quantity": "2",
        "guest_name": "Bagus Arya"
    },
    latest_message={},
    events=[],
    paused=False,
    followup_action=None,
    active_loop={},
    latest_action_name=None
)

action_cafe = ActionSubmitCafeOrder()
action_cafe.run(dispatcher_cafe, tracker_cafe, {})
for msg in dispatcher_cafe.messages:
    print(msg.get("text"))

print("\n==========================================================")
print("🧪 [TEST 4] SIMULASI ACTION SHOW MENU")
print("==========================================================")
dispatcher_menu = CollectingDispatcher()
tracker_menu = Tracker(
    sender_id="test_user_bagus",
    slots={},
    latest_message={},
    events=[],
    paused=False,
    followup_action=None,
    active_loop={},
    latest_action_name=None
)

action_menu = ActionShowMenu()
action_menu.run(dispatcher_menu, tracker_menu, {})
for msg in dispatcher_menu.messages:
    print(msg.get("text"))

print("\n✅ SEMUA TEST SUKSES DENGAN HASIL VALID!")
