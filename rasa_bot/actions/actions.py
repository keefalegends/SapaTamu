from typing import Any, Text, Dict, List
from rasa_sdk import Action, Tracker
from rasa_sdk.executor import CollectingDispatcher
from rasa_sdk.events import SlotSet, AllSlotsReset
import random
import os
import sqlite3
import re
import sys

try:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

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

# Katalog menu lengkap dengan sinonim & variasi typo untuk multi-item parser
MENU_ITEMS_CATALOG = [
    {
        "name": "Nasi Goreng Spesial",
        "price": 35000,
        "aliases": ["nasi goreng spesial", "nasi goreng", "nasgor", "nasi gorng spesial", "nasi gorng", "nasigoreng", "gorng"]
    },
    {
        "name": "Spaghetti Carbonara",
        "price": 45000,
        "aliases": ["spaghetti carbonara", "spaghetti", "carbonara", "spageti carbonara", "spageti", "pasta"]
    },
    {
        "name": "Butter Croissant",
        "price": 20000,
        "aliases": ["butter croissant", "croissant", "croisant", "roti croissant"]
    },
    {
        "name": "Roti Bakar Spesial",
        "price": 18000,
        "aliases": ["roti bakar spesial", "roti bakar"]
    },
    {
        "name": "Matcha Latte",
        "price": 25000,
        "aliases": ["matcha latte", "matcha", "macha", "greentea", "green tea", "teh hijau"]
    },
    {
        "name": "Caffe Latte",
        "price": 28000,
        "aliases": ["caffe latte", "cafe latte", "kopi latte", "latte", "kopi susu", "coffee latte"]
    },
    {
        "name": "Cappuccino",
        "price": 28000,
        "aliases": ["cappuccino", "capuccino", "kapucino"]
    },
    {
        "name": "Americano",
        "price": 22000,
        "aliases": ["americano", "kopi hitam", "black coffee"]
    },
    {
        "name": "Espresso",
        "price": 22000,
        "aliases": ["espresso", "espreso"]
    },
    {
        "name": "Es Teh Manis Segar",
        "price": 15000,
        "aliases": ["es teh manis segar", "es teh manis", "es teh", "teh manis", "esteh", "es teh segar"]
    },
    {
        "name": "Jeruk Peras Alami",
        "price": 15000,
        "aliases": ["jeruk peras alami", "jeruk peras", "es jeruk", "jus jeruk"]
    }
]

def parse_order_text(text: str) -> List[Dict[str, Any]]:
    """Mengekstrak banyak item makanan/minuman beserta kuantitas dari teks bebas."""
    if not text:
        return []
    clean = " " + text.lower() + " "
    found_items = []
    
    # Kumpulkan semua pasangan (alias, item) diurutkan dari yang terpanjang
    all_alias_entries = []
    for item in MENU_ITEMS_CATALOG:
        for al in item["aliases"]:
            all_alias_entries.append((al, item))
    all_alias_entries.sort(key=lambda x: len(x[0]), reverse=True)
    
    occupied_spans = []
    for alias, item in all_alias_entries:
        pattern = r'(?:\b|_)' + re.escape(alias) + r'(?:\b|_)'
        for m in re.finditer(pattern, clean):
            start, end = m.span()
            if any(s <= start < e or s < end <= e for s, e in occupied_spans):
                continue
            occupied_spans.append((start, end))
            
            before = clean[:start]
            after = clean[end:]
            
            qty = 1
            # Cek angka di depan (misal: "1 nasi goreng")
            qty_before = re.findall(r'(\d+)\s*(?:porsi|gelas|cup|item|x)?\s*$', before)
            if qty_before:
                try:
                    qty = int(qty_before[-1])
                except Exception:
                    qty = 1
            else:
                # Cek angka di belakang (misal: "spaghetti 2")
                qty_after = re.match(r'^\s*(?:x\s*)?(\d+)(?:\s*(?:porsi|gelas|cup|item))?', after)
                if qty_after:
                    try:
                        qty = int(qty_after.group(1))
                    except Exception:
                        qty = 1
            
            # Cek apakah item sudah ada di daftar, jika ada tambahkan kuantitasnya
            existing = next((x for x in found_items if x["name"] == item["name"]), None)
            if existing:
                existing["qty"] += qty
                existing["subtotal"] = existing["price"] * existing["qty"]
            else:
                found_items.append({
                    "name": item["name"],
                    "price": item["price"],
                    "qty": qty,
                    "subtotal": item["price"] * qty
                })
                
    return found_items


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
                if clean_phone.startswith("08"):
                    clean_phone = "628" + clean_phone[2:]
                cur.execute("""
                    INSERT OR REPLACE INTO hotel_bookings 
                    (booking_code, phone_number, guest_name, room_key, room_name, nights, check_in, total_price, payment_method, status)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (booking_code, clean_phone, name, room_key, room_info['name'], 1, checkin, room_info['price'], 'Pay at Hotel', 'confirmed'))
                conn.commit()
                conn.close()
        except Exception as e:
            print(f"[DB SAVE ERROR] hotel_bookings: {e}")

        phone_display = f"+{clean_phone}" if clean_phone else str(phone)
        msg = (
            f"🎉 *RESERVASI KAMAR BERHASIL!* 🏨✨\n\n"
            f"📋 *Kode Booking:* `{booking_code}`\n"
            f"👤 *Nama Tamu:* {name}\n"
            f"📱 *No. WhatsApp:* {phone_display}\n"
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

        # 1. Cari pesan pemesanan dari riwayat pesan pengguna (user events)
        items = []
        user_texts = []
        for ev in reversed(tracker.events):
            if ev.get("event") == "user":
                t = ev.get("text", "")
                if t:
                    user_texts.append(t)
                    parsed = parse_order_text(t)
                    if parsed:
                        items = parsed
                        break

        # Fallback jika dari riwayat teks belum dapat, gunakan slot
        if not items:
            raw_food = str(tracker.get_slot("food_item") or "Nasi Goreng Spesial")
            raw_qty = tracker.get_slot("quantity") or "1"
            items = parse_order_text(f"{raw_qty} {raw_food}")

        # Fallback terakhir jika tetap kosong: matching satu per satu ke CAFE_MENU
        if not items:
            raw_food = str(tracker.get_slot("food_item") or "Nasi Goreng Spesial").lower().strip()
            raw_qty = tracker.get_slot("quantity") or "1"
            try:
                qty = int("".join([c for c in str(raw_qty) if c.isdigit()]) or 1)
            except Exception:
                qty = 1
            matched = {"name": raw_food.title(), "price": 25000}
            for k, v in CAFE_MENU.items():
                if k in raw_food or raw_food in k:
                    matched = v
                    break
            items = [{
                "name": matched["name"],
                "price": matched["price"],
                "qty": qty,
                "subtotal": matched["price"] * qty
            }]

        # 2. Parsing Nama Pelanggan
        name = tracker.get_slot("guest_name")
        if not name or str(name).strip().lower() in ["pelanggan", "tamu", "none", "", "null"]:
            # Jika user baru saja mengetikkan namanya pada prompt form
            latest_text = tracker.latest_message.get("text", "").strip()
            if latest_text and len(latest_text) <= 30 and not any(k in latest_text.lower() for k in ["pesan", "order", "beli", "kopi", "nasi", "menu"]):
                name = latest_text.title()
            else:
                name = "Pelanggan"
        else:
            name = str(name).strip().title()

        # 3. Parsing Nomor Telepon WhatsApp
        raw_phone = tracker.get_slot("phone_number") or str(tracker.sender_id or "")
        clean_phone = "".join([c for c in str(raw_phone) if c.isdigit()])
        if clean_phone.startswith("08"):
            clean_phone = "628" + clean_phone[2:]

        # 4. Hitung Total & Buat Kode Pesanan
        grand_total = sum(i["subtotal"] for i in items)
        grand_total_str = f"Rp {grand_total:,}".replace(",", ".")
        order_code = f"ST-CAFE-{random.randint(1000, 9999)}"

        # 5. Simpan ke SQLite Database SapaTamu (Tabel cafe_orders & cafe_order_items)
        try:
            if os.path.exists(DB_PATH):
                conn = sqlite3.connect(DB_PATH, timeout=5)
                cur = conn.cursor()
                cur.execute("""
                    INSERT OR REPLACE INTO cafe_orders 
                    (order_code, phone_number, customer_name, table_number, order_type, total_amount, payment_status, status)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (order_code, clean_phone, name, 1, 'dine_in', grand_total, 'paid', 'new'))
                
                for it in items:
                    cur.execute("""
                        INSERT INTO cafe_order_items (order_code, item_name, qty, price, subtotal)
                        VALUES (?, ?, ?, ?, ?)
                    """, (order_code, it['name'], it['qty'], it['price'], it['subtotal']))
                
                conn.commit()
                conn.close()
                print(f"[DB SAVE SUCCESS] Cafe Order {order_code} ({name}, {len(items)} items, Rp {grand_total})")
        except Exception as e:
            print(f"[DB SAVE ERROR] cafe_orders: {e}")

        # 6. Format Rincian Item untuk WhatsApp
        items_lines = []
        for it in items:
            subtotal_str = f"Rp {it['subtotal']:,}".replace(",", ".")
            items_lines.append(f"• *{it['name']}* x {it['qty']} — {subtotal_str}")
        items_detail = "\n".join(items_lines)

        phone_display = f"+{clean_phone}" if clean_phone else "-"

        msg = (
            f"🧾 *PESANAN KAFE BERHASIL DIBUAT!* ☕🍽️\n\n"
            f"📋 *No. Pesanan:* `{order_code}`\n"
            f"👤 *Atas Nama:* {name}\n"
            f"📱 *No. WhatsApp:* {phone_display}\n\n"
            f"🍱 *Rincian Pesanan:*\n{items_detail}\n\n"
            f"💰 *Total Bayar:* *{grand_total_str}*\n\n"
            f"✅ Pesanan Anda segera disiapkan oleh barista & dapur SapaTamu!\n"
            f"Ada yang bisa kami bantu lagi kak? Ketik *'menu'* untuk kembali ke menu utama 😊"
        )
        dispatcher.utter_message(text=msg)
        return [AllSlotsReset()]
