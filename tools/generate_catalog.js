const fs = require('fs');

const imgDeluxe = 'https://iili.io/nHXxrOb.jpg';
const imgExec = 'https://iili.io/nHXzg4I.jpg';
const imgSuite = 'https://iili.io/nHXz6YX.jpg';
const imgKafe = 'https://iili.io/nHXIB6B.jpg';
const imgCafePlace = 'https://iili.io/nHXTkfp.jpg';

// 1. FORMAT UNIVERSAL LENGKAP (Kompatibel untuk Katalog Utama, WhatsApp Business, dan Inventaris Lokal)
const header = 'id,retailer_id,title,description,availability,condition,price,link,image_link,brand,store_code,hotel_address,address.addr1,address.city,address.region,address.postal_code,address.country';

const hotelRows = [
  `ROOM_DELUXE,ROOM_DELUXE,Deluxe Room - SapaTamu Hotel,"Kasur King Size Smart TV 43 Inch AC Balkon Pribadi Termasuk Sarapan 2 pax.",in stock,new,550000 IDR,https://sapatamu.com/rooms/deluxe,${imgDeluxe},SapaTamu Hotel,STORE_01,"Jl. Pemuda No. 45, Surabaya, Jawa Timur, 60271, Indonesia",Jl. Pemuda No. 45,Surabaya,Jawa Timur,60271,Indonesia`,
  `ROOM_EXEC,ROOM_EXEC,Executive Suite - SapaTamu Hotel,"Ruang Tamu Terpisah Jacuzzi Espresso Machine Akses Lounge Sarapan 2 pax.",in stock,new,950000 IDR,https://sapatamu.com/rooms/executive,${imgExec},SapaTamu Hotel,STORE_01,"Jl. Pemuda No. 45, Surabaya, Jawa Timur, 60271, Indonesia",Jl. Pemuda No. 45,Surabaya,Jawa Timur,60271,Indonesia`,
  `ROOM_SUITE,ROOM_SUITE,Presidential Suite - SapaTamu Hotel,"Penthouse Mewah 2 Kamar Tidur Dining Room Mini Bar 24h Butler Jacuzzi.",in stock,new,1800000 IDR,https://sapatamu.com/rooms/presidential,${imgSuite},SapaTamu Hotel,STORE_01,"Jl. Pemuda No. 45, Surabaya, Jawa Timur, 60271, Indonesia",Jl. Pemuda No. 45,Surabaya,Jawa Timur,60271,Indonesia`
];

fs.writeFileSync('catalog_hotel.csv', [header, ...hotelRows].join('\r\n'), 'utf-8');

const restoRows = [
  `FOOD_ESP,FOOD_ESP,Espresso - SapaTamu Kafe,"Single shot espresso murni dari biji kopi arabika pilihan dengan crema tebal.",in stock,new,22000 IDR,https://sapatamu.com/menu/esp,${imgKafe},SapaTamu Kafe,STORE_01,"Jl. Pemuda No. 45, Surabaya, Jawa Timur, 60271, Indonesia",Jl. Pemuda No. 45,Surabaya,Jawa Timur,60271,Indonesia`,
  `FOOD_AME,FOOD_AME,Americano - SapaTamu Kafe,"Espresso arabika dipadukan dengan air mineral murni segar kaya rasa.",in stock,new,22000 IDR,https://sapatamu.com/menu/ame,${imgKafe},SapaTamu Kafe,STORE_01,"Jl. Pemuda No. 45, Surabaya, Jawa Timur, 60271, Indonesia",Jl. Pemuda No. 45,Surabaya,Jawa Timur,60271,Indonesia`,
  `FOOD_LAT,FOOD_LAT,Caffe Latte - SapaTamu Kafe,"Perpaduan lembut espresso arabika dengan steamed milk creamy.",in stock,new,28000 IDR,https://sapatamu.com/menu/lat,${imgKafe},SapaTamu Kafe,STORE_01,"Jl. Pemuda No. 45, Surabaya, Jawa Timur, 60271, Indonesia",Jl. Pemuda No. 45,Surabaya,Jawa Timur,60271,Indonesia`,
  `FOOD_CAP,FOOD_CAP,Cappuccino - SapaTamu Kafe,"Kombinasi klasik espresso steamed milk dan busa susu tebal lembut.",in stock,new,28000 IDR,https://sapatamu.com/menu/cap,${imgKafe},SapaTamu Kafe,STORE_01,"Jl. Pemuda No. 45, Surabaya, Jawa Timur, 60271, Indonesia",Jl. Pemuda No. 45,Surabaya,Jawa Timur,60271,Indonesia`,
  `FOOD_MAT,FOOD_MAT,Matcha Latte - SapaTamu Kafe,"Bubuk matcha premium Jepang dipadukan dengan susu segar manis gurih.",in stock,new,25000 IDR,https://sapatamu.com/menu/mat,${imgKafe},SapaTamu Kafe,STORE_01,"Jl. Pemuda No. 45, Surabaya, Jawa Timur, 60271, Indonesia",Jl. Pemuda No. 45,Surabaya,Jawa Timur,60271,Indonesia`,
  `FOOD_TEH,FOOD_TEH,Es Teh Manis Segar,"Teh melati pilihan diseduh tradisional dengan gula tebu asli menyegarkan.",in stock,new,15000 IDR,https://sapatamu.com/menu/teh,${imgKafe},SapaTamu Kafe,STORE_01,"Jl. Pemuda No. 45, Surabaya, Jawa Timur, 60271, Indonesia",Jl. Pemuda No. 45,Surabaya,Jawa Timur,60271,Indonesia`,
  `FOOD_JER,FOOD_JER,Jeruk Peras Alami,"Perasan jeruk segar asli tanpa pemanis buatan kaya vitamin C.",in stock,new,15000 IDR,https://sapatamu.com/menu/jer,${imgKafe},SapaTamu Kafe,STORE_01,"Jl. Pemuda No. 45, Surabaya, Jawa Timur, 60271, Indonesia",Jl. Pemuda No. 45,Surabaya,Jawa Timur,60271,Indonesia`,
  `FOOD_CRO,FOOD_CRO,Butter Croissant - SapaTamu Bakery,"Pastry khas Prancis berlapis renyah di luar dan lembut beraroma butter.",in stock,new,20000 IDR,https://sapatamu.com/menu/cro,${imgCafePlace},SapaTamu Resto,STORE_01,"Jl. Pemuda No. 45, Surabaya, Jawa Timur, 60271, Indonesia",Jl. Pemuda No. 45,Surabaya,Jawa Timur,60271,Indonesia`,
  `FOOD_ROT,FOOD_ROT,Roti Bakar Spesial SapaTamu,"Roti tawar tebal panggang dengan isian cokelat keju melimpah.",in stock,new,18000 IDR,https://sapatamu.com/menu/rot,${imgCafePlace},SapaTamu Resto,STORE_01,"Jl. Pemuda No. 45, Surabaya, Jawa Timur, 60271, Indonesia",Jl. Pemuda No. 45,Surabaya,Jawa Timur,60271,Indonesia`,
  `FOOD_CAR,FOOD_CAR,Spaghetti Carbonara Creamy,"Pasta spaghetti al dente dengan saus krim keju parmesan gurih dan smoked beef.",in stock,new,45000 IDR,https://sapatamu.com/menu/car,${imgCafePlace},SapaTamu Resto,STORE_01,"Jl. Pemuda No. 45, Surabaya, Jawa Timur, 60271, Indonesia",Jl. Pemuda No. 45,Surabaya,Jawa Timur,60271,Indonesia`,
  `FOOD_NAS,FOOD_NAS,Nasi Goreng Spesial SapaTamu,"Nasi goreng bumbu rempah nusantara dengan suwiran ayam telur dan kerupuk.",in stock,new,35000 IDR,https://sapatamu.com/menu/nas,${imgCafePlace},SapaTamu Resto,STORE_01,"Jl. Pemuda No. 45, Surabaya, Jawa Timur, 60271, Indonesia",Jl. Pemuda No. 45,Surabaya,Jawa Timur,60271,Indonesia`
];

fs.writeFileSync('catalog_resto.csv', [header, ...restoRows].join('\r\n'), 'utf-8');
fs.writeFileSync('catalog_sapatamu_all.csv', [header, ...hotelRows, ...restoRows].join('\r\n'), 'utf-8');

console.log('✅ REGENERATED ALL CSVs WITH UNIVERSAL COMPATIBILITY (PRIMARY & LOCAL FEED)!');