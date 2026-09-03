import csv

headers = [
    "id", "brand", "description",
    "custom_label_0", "custom_label_1", "custom_label_2", "custom_label_3", "custom_label_4",
    "custom_number_0", "custom_number_1", "custom_number_2", "custom_number_3", "custom_number_4",
    "title", "price", "link", "sale_price", "sale_price_effective_date",
    "video[0].url", "video[0].tag[0]",
    "hotel_category",
    "address.addr1", "address.addr2", "address.addr3", "address.city", "address.city_id", "address.region", "address.postal_code", "address.country", "address.unit_number",
    "latitude", "longitude",
    "neighborhood[0]",
    "star_rating", "loyalty_program", "number_of_rooms", "priority", "margin_level"
]

rows = [
    [
        "H_DELUXE_01", "SapaTamu Hotel", "Kasur King Size, Smart TV 43 Inch, AC Dingin, Balkon Pribadi, Termasuk Sarapan untuk 2 pax.",
        "Kamar Hotel", "Deluxe", "Balkon & AC", "King Bed", "Sarapan 2 Pax",
        "", "", "", "", "",
        "Deluxe Room - SapaTamu Hotel", "550000.00 IDR", "https://sapatamu.com/rooms/deluxe", "", "",
        "", "",
        "hotel",
        "Jl. Pemuda No. 45", "Gedung SapaTamu", "Lantai 2", "Surabaya", "ID_SUB", "Jawa Timur", "60271", "Indonesia", "201",
        "-7.2575", "112.7521",
        "Pusat Kota Surabaya",
        "4.5", "SapaTamu Rewards", "20", "1", "1"
    ],
    [
        "H_EXEC_02", "SapaTamu Hotel", "Ruang Tamu Terpisah, Jacuzzi Pribadi, Espresso Machine, Akses Lounge Eksklusif, Sarapan 2 pax.",
        "Kamar Hotel", "Executive Suite", "Jacuzzi & Lounge", "King Bed", "Sarapan 2 Pax",
        "", "", "", "", "",
        "Executive Suite - SapaTamu Hotel", "950000.00 IDR", "https://sapatamu.com/rooms/executive", "", "",
        "", "",
        "hotel",
        "Jl. Pemuda No. 45", "Gedung SapaTamu", "Lantai 5", "Surabaya", "ID_SUB", "Jawa Timur", "60271", "Indonesia", "501",
        "-7.2575", "112.7521",
        "Pusat Kota Surabaya",
        "5.0", "SapaTamu Rewards", "10", "1", "1"
    ],
    [
        "H_SUITE_03", "SapaTamu Hotel", "2 Kamar Tidur Mewah, Dining Room Pribadi, Mini Bar Gratis, Layanan 24 Jam Butler Pribadi, Jacuzzi.",
        "Kamar Hotel", "Presidential Suite", "Penthouse & Butler", "2 King Beds", "Sarapan 4 Pax",
        "", "", "", "", "",
        "Presidential Suite - SapaTamu Hotel", "1800000.00 IDR", "https://sapatamu.com/rooms/presidential", "", "",
        "", "",
        "hotel",
        "Jl. Pemuda No. 45", "Gedung SapaTamu", "Penthouse", "Surabaya", "ID_SUB", "Jawa Timur", "60271", "Indonesia", "PH01",
        "-7.2575", "112.7521",
        "Pusat Kota Surabaya",
        "5.0", "SapaTamu VIP", "5", "1", "1"
    ]
]

with open("catalog_hotel.csv", "w", newline="", encoding="utf-8") as f:
    writer = csv.writer(f)
    writer.writerow(headers)
    for r in rows:
        writer.writerow(r)

print("✅ catalog_hotel.csv generated with EXACT 38 Meta Hospitality Columns!")