from typing import Any, Text, Dict, List
from rasa_sdk import Action, Tracker
from rasa_sdk.executor import CollectingDispatcher
from rasa_sdk.events import SlotSet, AllSlotsReset
import random
import os
import sqlite3

# Lokasi database SQLite SapaTamu
DB_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "sapatamu_waba.db"))

# Database harga kamar & menu kafe SapaTamu
HOTEL_ROOMS = {
    "deluxe": {"name": "Deluxe Room", "price": 550000, "desc": "Kasur King Size, Smart TV 43\", AC, Balkon, Sarapan 2 pax"},
    "executive": {"name": "Executive Suite", "price": 950000, "desc": "Ruang Tamu, Jacuzzi, Espresso Machine, Lounge, Sarapan 2 pax"},
    "presidential": {"name": "Presidential Suite", "price": 1800000, "desc": "Penthouse 2 Kamar, Dining Room, Mini Bar, Butler 24h, Jacuzzi"}
}

CAFE_MENU = {
    # Kopi
    "espresso": {"name": "Espresso", "price": 22000, "cat": "Kopi"},
    "americano": {"name": "Americano", "price": 22000, "cat": "Kopi"},
    "caffe latte": {"name": "Caffe Latte", "price": 28000, "cat": "Kopi"},
    "latte": {"name": "Caffe Latte", "price": 28000, "cat": "Kopi"},
    "cappuccino": {"name": "Cappuccino", "price": 28000, "cat": "Kopi"},
    # Non-Kopi
    "matcha latte": {"name": "Matcha Latte", "price": 25000, "cat": "Non-Kopi"},
    "matcha": {"name": "Matcha Latte", "price": 25000, "cat": "Non-Kopi"},
    "es teh manis": {"name": "Es Teh Manis Segar", "price": 15000, "cat": "Non-Kopi"},
    "es teh": {"name": "Es Teh Manis Segar", "price": 15000, "cat": "Non-Kopi"},
    "jeruk peras": {"name": "Jeruk Peras Alami", "price": 15000, "cat": "Non-Kopi"},
    "es jeruk": {"name": "Jeruk Peras Alami", "price": 15000, "cat": "Non-Kopi"},
    # Makanan & Bakery
    "butter croissant": {"name": "Butter Croissant", "price": 20000, "cat": "Makanan Ringan"},
    "croissant": {"name": "Butter Croissant", "price": 20000, "cat": "Makanan Ringan"},
    "roti bakar": {"name": "Roti Bakar Spesial", "price": 18000, "cat": "Makanan Ringan"},
    "spaghetti carbonara": {"name": "Spaghetti Carbonara", "price": 45000, "cat": "Makanan Utama"},
    "carbonara": {"name": "Spaghetti Carbonara", "price": 45000, "cat": "Makanan Utama"},
    "spaghetti": {"name": "Spaghetti Carbonara", "price": 45000, "cat": "Makanan Utama"},
    "nasi goreng": {"name": "Nasi Goreng Spesial", "price": 35000, "cat": "Makanan Utama"},
    "nasi goreng spesial": {"name": "Nasi Goreng Spesial", "price": 35000, "cat": "Makanan Utama"}
}


class ActionShowMenu(Action):
    def name(self) -> Text:
        return "action_show_menu"

    def run(self, dispatcher: CollectingDispatcher,
            tracker: Tracker,
            domain: Dict[Text, Any]) -> List[Dict[Text, Any]]:

        menu_text = (
            "🍽️ *DAFTAR MENU SAPATAMU KAFE & RESTO* ☕\n\n"
            "☕ *Kopi Pilihan:*\n"
            "• Espresso — Rp 22.000\n"
            "• Americano (Ice/Hot) — Rp 22.000\n"
            "• Caffe Latte — Rp 28.000\n"
            "• Cappuccino — Rp 28.000\n\n"
            "🍵 *Non-Kopi Segar:*\n"
            "• Matcha Latte — Rp 25.000\n"
            "• Es Teh Manis Segar — Rp 15.000\n"
            "• Jeruk Peras Alami — Rp 15.000\n\n"
            "🥐 *Makanan & Snack:*\n"
            "• Butter Croissant — Rp 20.000\n"
            "• Roti Bakar Spesial — Rp 18.000\n"
            "• Spaghetti Carbonara — Rp 45.000\n"
            "• Nasi Goreng Spesial — Rp 35.000\n\n"
            "Mau pesan yang mana kak? Cukup ketik misalnya: *'Pesan 2 Nasi Goreng Spesial dan 1 Caffe Latte'* ya!"
        )
        dispatcher.utter_message(text=menu_text)
        return []


class ActionSubmitHotelBooking(Action):
    def name(self) -> Text:
        return "action_submit_hotel_booking"

    def run(self, dispatcher: CollectingDispatcher,
            tracker: Tracker,
            domain: Dict[Text, Any]) -> List[Dict[Text, Any]]:

        raw_room = str(tracker.get_slot("room_type") or "deluxe").lower()
        checkin = tracker.get_slot("checkin_date") or "Besok"
        name = tracker.get_slot("guest_name") or "Tamu SapaTamu"
        phone = tracker.get_slot("phone_number") or tracker.sender_id or "-"

        # Matching tipe kamar
        room_info = HOTEL_ROOMS["deluxe"]
        room_key = "deluxe"
        if "suite" in raw_room or "presidential" in raw_room:
            room_info = HOTEL_ROOMS["presidential"]
            room_key = "suite"
        elif "exec" in raw_room:
            room_info = HOTEL_ROOMS["executive"]
            room_key = "executive"

        booking_code = f"ST-HTL-{random.randint(1000, 9999)}"
        price_str = f"Rp {room_info['price']:,}".replace(",", ".")

        # Simpan ke SQLite Database SapaTamu
        try:
            if os.path.exists(DB_PATH):
                conn = sqlite3.connect(DB_PATH, timeout=5)
                cur = conn.cursor()
                clean_phone = "".join([c for c in str(phone) if c.isdigit()]) or str(tracker.sender_id)
                cur.execute("""
                    INSERT OR REPLACE INTO hotel_bookings 
                    (booking_code, phone_number, guest_name, room_key, room_name, nights, check_in, total_price, payment_method, status)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (booking_code, clean_phone, name, room_key, room_info['name'], 1, checkin, room_info['price'], 'Pay at Hotel', 'confirmed'))
                conn.commit()
                conn.close()
        except Exception as e:
            print(f"⚠️ [DB SAVE ERROR] hotel_bookings: {e}")

        msg = (
            f"🎉 *RESERVASI KAMAR BERHASIL!* 🏨✨\n\n"
            f"📋 *Kode Booking:* `{booking_code}`\n"
            f"👤 *Nama Tamu:* {name}\n"
            f"📱 *No. WhatsApp:* {phone}\n"
            f"🛏️ *Tipe Kamar:* {room_info['name']}\n"
            f"📅 *Check-in:* {checkin}\n"
            f"💰 *Total Biaya:* {price_str} / malam\n"
            f"✨ *Fasilitas:* {room_info['desc']}\n\n"
            f"✅ Reservasi Anda sudah tercatat di sistem admin kami.\n"
            f"Pembayaran dapat dilakukan saat check-in (Pay at Hotel) atau Transfer Bank.\n\n"
            f"Ada yang bisa kami bantu lagi kak? Ketik *'menu'* untuk kembali ke menu utama 😊"
        )
        dispatcher.utter_message(text=msg)
        return [AllSlotsReset()]


class ActionSubmitCafeOrder(Action):
    def name(self) -> Text:
        return "action_submit_cafe_order"

    def run(self, dispatcher: CollectingDispatcher,
            tracker: Tracker,
            domain: Dict[Text, Any]) -> List[Dict[Text, Any]]:

        raw_food = str(tracker.get_slot("food_item") or "Nasi Goreng Spesial").lower().strip()
        raw_qty = tracker.get_slot("quantity") or "1"
        name = tracker.get_slot("guest_name") or "Pelanggan"

        # Parsing quantity
        try:
            qty = int("".join([c for c in str(raw_qty) if c.isdigit()]) or 1)
        except Exception:
            qty = 1

        # Matching harga menu
        matched_item = {"name": raw_food.title(), "price": 25000}
        for k, v in CAFE_MENU.items():
            if k in raw_food or raw_food in k:
                matched_item = v
                break

        subtotal = matched_item["price"] * qty
        subtotal_str = f"Rp {subtotal:,}".replace(",", ".")
        price_each_str = f"Rp {matched_item['price']:,}".replace(",", ".")
        order_code = f"ST-CAFE-{random.randint(1000, 9999)}"

        # Simpan ke SQLite Database SapaTamu
        try:
            if os.path.exists(DB_PATH):
                conn = sqlite3.connect(DB_PATH, timeout=5)
                cur = conn.cursor()
                clean_phone = "".join([c for c in str(tracker.sender_id) if c.isdigit()])
                cur.execute("""
                    INSERT OR REPLACE INTO cafe_orders 
                    (order_code, phone_number, table_number, order_type, total_amount, payment_status, status)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (order_code, clean_phone, 1, 'dine_in', subtotal, 'paid', 'new'))
                cur.execute("""
                    INSERT INTO cafe_order_items (order_code, item_name, qty, price, subtotal)
                    VALUES (?, ?, ?, ?, ?)
                """, (order_code, matched_item['name'], qty, matched_item['price'], subtotal))
                conn.commit()
                conn.close()
        except Exception as e:
            print(f"⚠️ [DB SAVE ERROR] cafe_orders: {e}")

        msg = (
            f"🧾 *PESANAN KAFE BERHASIL DIBUAT!* ☕🍽️\n\n"
            f"📋 *No. Pesanan:* `{order_code}`\n"
            f"👤 *Atas Nama:* {name}\n"
            f"🍱 *Item:* {matched_item['name']} x {qty} ({price_each_str})\n"
            f"💰 *Total Bayar:* *{subtotal_str}*\n\n"
            f"✅ Pesanan Anda segera disiapkan oleh barista & dapur SapaTamu!\n"
            f"Ada yang bisa kami bantu lagi kak? Ketik *'menu'* untuk kembali ke menu utama 😊"
        )
        dispatcher.utter_message(text=msg)
        return [AllSlotsReset()]
