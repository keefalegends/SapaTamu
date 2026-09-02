const fs = require('fs');

// 1. CATALOG RESTO (Ultra-clean standard Meta Commerce Product Feed)
const restoHeader = 'id,title,description,availability,condition,price,link,image_link,brand';
const restoRows = [
  'FOOD_ESP,Espresso - SapaTamu Kafe,"Single shot espresso murni dari biji kopi arabika pilihan dengan crema tebal.",in stock,new,22000 IDR,https://sapatamu.com/menu/esp,https://raw.githubusercontent.com/keefalegends/SapaTamu/prod/public/images/menu_kafe.jpg,SapaTamu Kafe',
  'FOOD_AME,Americano - SapaTamu Kafe,"Espresso arabika dipadukan dengan air mineral murni segar kaya rasa.",in stock,new,22000 IDR,https://sapatamu.com/menu/ame,https://raw.githubusercontent.com/keefalegends/SapaTamu/prod/public/images/menu_kafe.jpg,SapaTamu Kafe',
  'FOOD_LAT,Caffe Latte - SapaTamu Kafe,"Perpaduan lembut espresso arabika dengan steamed milk creamy.",in stock,new,28000 IDR,https://sapatamu.com/menu/lat,https://raw.githubusercontent.com/keefalegends/SapaTamu/prod/public/images/menu_kafe.jpg,SapaTamu Kafe',
  'FOOD_CAP,Cappuccino - SapaTamu Kafe,"Kombinasi klasik espresso steamed milk dan busa susu tebal lembut.",in stock,new,28000 IDR,https://sapatamu.com/menu/cap,https://raw.githubusercontent.com/keefalegends/SapaTamu/prod/public/images/menu_kafe.jpg,SapaTamu Kafe',
  'FOOD_MAT,Matcha Latte - SapaTamu Kafe,"Bubuk matcha premium Jepang dipadukan dengan susu segar manis gurih.",in stock,new,25000 IDR,https://sapatamu.com/menu/mat,https://raw.githubusercontent.com/keefalegends/SapaTamu/prod/public/images/menu_kafe.jpg,SapaTamu Kafe',
  'FOOD_TEH,Es Teh Manis Segar,"Teh melati pilihan diseduh tradisional dengan gula tebu asli menyegarkan.",in stock,new,15000 IDR,https://sapatamu.com/menu/teh,https://raw.githubusercontent.com/keefalegends/SapaTamu/prod/public/images/menu_kafe.jpg,SapaTamu Kafe',
  'FOOD_JER,Jeruk Peras Alami,"Perasan jeruk segar asli tanpa pemanis buatan kaya vitamin C.",in stock,new,15000 IDR,https://sapatamu.com/menu/jer,https://raw.githubusercontent.com/keefalegends/SapaTamu/prod/public/images/menu_kafe.jpg,SapaTamu Kafe',
  'FOOD_CRO,Butter Croissant - SapaTamu Bakery,"Pastry khas Prancis berlapis renyah di luar dan lembut beraroma butter.",in stock,new,20000 IDR,https://sapatamu.com/menu/cro,https://raw.githubusercontent.com/keefalegends/SapaTamu/prod/public/images/cafe_sapatamu.jpg,SapaTamu Resto',
  'FOOD_ROT,Roti Bakar Spesial SapaTamu,"Roti tawar tebal panggang dengan isian cokelat keju melimpah.",in stock,new,18000 IDR,https://sapatamu.com/menu/rot,https://raw.githubusercontent.com/keefalegends/SapaTamu/prod/public/images/cafe_sapatamu.jpg,SapaTamu Resto',
  'FOOD_CAR,Spaghetti Carbonara Creamy,"Pasta spaghetti al dente dengan saus krim keju parmesan gurih dan smoked beef.",in stock,new,45000 IDR,https://sapatamu.com/menu/car,https://raw.githubusercontent.com/keefalegends/SapaTamu/prod/public/images/cafe_sapatamu.jpg,SapaTamu Resto',
  'FOOD_NAS,Nasi Goreng Spesial SapaTamu,"Nasi goreng bumbu rempah nusantara dengan suwiran ayam telur dan kerupuk.",in stock,new,35000 IDR,https://sapatamu.com/menu/nas,https://raw.githubusercontent.com/keefalegends/SapaTamu/prod/public/images/cafe_sapatamu.jpg,SapaTamu Resto'
];
fs.writeFileSync('catalog_resto.csv', [restoHeader, ...restoRows].join('\r\n'), 'utf-8');

// 2. CATALOG HOTEL (Standard Product Feed untuk Catalog_SapaTamu)
const hotelHeader = 'id,title,description,availability,condition,price,link,image_link,brand';
const hotelRows = [
  'ROOM_DELUXE,Deluxe Room - SapaTamu Hotel,"Kasur King Size Smart TV 43 Inch AC Balkon Pribadi Termasuk Sarapan 2 pax.",in stock,new,550000 IDR,https://sapatamu.com/rooms/deluxe,https://raw.githubusercontent.com/keefalegends/SapaTamu/prod/public/images/kamar_deluxe.jpg,SapaTamu Hotel',
  'ROOM_EXEC,Executive Suite - SapaTamu Hotel,"Ruang Tamu Terpisah Jacuzzi Espresso Machine Akses Lounge Sarapan 2 pax.",in stock,new,950000 IDR,https://sapatamu.com/rooms/executive,https://raw.githubusercontent.com/keefalegends/SapaTamu/prod/public/images/kamar_executive.jpg,SapaTamu Hotel',
  'ROOM_SUITE,Presidential Suite - SapaTamu Hotel,"Penthouse Mewah 2 Kamar Tidur Dining Room Mini Bar 24h Butler Jacuzzi.",in stock,new,1800000 IDR,https://sapatamu.com/rooms/presidential,https://raw.githubusercontent.com/keefalegends/SapaTamu/prod/public/images/kamar_suite.jpg,SapaTamu Hotel'
];
fs.writeFileSync('catalog_hotel.csv', [hotelHeader, ...hotelRows].join('\r\n'), 'utf-8');

// 3. CATALOG GABUNGAN SEMUA ITEM (ALL IN ONE)
fs.writeFileSync('catalog_sapatamu_all.csv', [restoHeader, ...hotelRows, ...restoRows].join('\r\n'), 'utf-8');

console.log('✅ Updated all CSVs with CRLF and clean standard fields!');