const fs = require('fs');

// 1. HOTEL CATALOG (Sesuai Template Meta Commerce Hotels / Hospitality)
const hotelHeader = 'id,name,description,brand,custom_label_0,custom_label_1,custom_label_2,custom_label_3,custom_label_4,title,price,link,hotel_category,address.addr1,address.city,address.region,address.postal_code,address.country,star_rating,number_of_rooms,image[0].url,image[0].tag[0]';

const hotelRows = [
  'H_DELUXE_01,Deluxe Room,"Kasur King Size, Smart TV 43 Inch, AC Dingin, Balkon Pribadi, Termasuk Sarapan untuk 2 pax",SapaTamu Hotel,Kamar Hotel,Deluxe,Balkon & AC,King Bed,Sarapan 2 Pax,Deluxe Room - SapaTamu Hotel,550000.00 IDR,https://sapatamu.com/rooms/deluxe,hotel,Jl. Pemuda No. 45,Surabaya,Jawa Timur,60271,Indonesia,4.5,20,https://raw.githubusercontent.com/keefalegends/SapaTamu/prod/public/images/kamar_deluxe.jpg,Bedroom',
  'H_EXEC_02,Executive Suite,"Ruang Tamu Terpisah, Jacuzzi Pribadi, Espresso Machine, Akses Lounge Eksklusif, Sarapan 2 pax",SapaTamu Hotel,Kamar Hotel,Executive Suite,Jacuzzi & Lounge,King Bed,Sarapan 2 Pax,Executive Suite - SapaTamu Hotel,950000.00 IDR,https://sapatamu.com/rooms/executive,hotel,Jl. Pemuda No. 45,Surabaya,Jawa Timur,60271,Indonesia,5.0,10,https://raw.githubusercontent.com/keefalegends/SapaTamu/prod/public/images/kamar_executive.jpg,Suite Room',
  'H_SUITE_03,Presidential Suite,"2 Kamar Tidur Mewah, Dining Room Pribadi, Mini Bar Gratis, Layanan 24 Jam Butler Pribadi, Jacuzzi",SapaTamu Hotel,Kamar Hotel,Presidential Suite,Penthouse & Butler,2 King Beds,Sarapan 4 Pax,Presidential Suite - SapaTamu Hotel,1800000.00 IDR,https://sapatamu.com/rooms/presidential,hotel,Jl. Pemuda No. 45,Surabaya,Jawa Timur,60271,Indonesia,5.0,5,https://raw.githubusercontent.com/keefalegends/SapaTamu/prod/public/images/kamar_suite.jpg,Presidential Suite'
];

fs.writeFileSync('catalog_hotel.csv', [hotelHeader, ...hotelRows].join('\n'), 'utf-8');
console.log('✅ Generated: catalog_hotel.csv');

// 2. RESTORAN & KAFE CATALOG (Format Meta Commerce Standard Product Feed / WABA Product Messages)
const restoHeader = 'id,title,description,availability,condition,price,link,image_link,brand,google_product_category,fb_product_category,custom_label_0';

const restoRows = [
  'FOOD_ESP,Espresso - SapaTamu Kafe,"Single shot espresso murni dari biji kopi arabika pilihan dengan crema tebal dan aroma pekat.",in stock,new,22000.00 IDR,https://sapatamu.com/menu/esp,https://raw.githubusercontent.com/keefalegends/SapaTamu/prod/public/images/menu_kafe.jpg,SapaTamu Kafe,Food & Beverages > Beverages > Coffee,beverages,Minuman Kopi',
  'FOOD_AME,Americano - SapaTamu Kafe,"Espresso arabika dipadukan dengan air mineral murni, segar dan kaya rasa (Tersedia Panas / Dingin).",in stock,new,22000.00 IDR,https://sapatamu.com/menu/ame,https://raw.githubusercontent.com/keefalegends/SapaTamu/prod/public/images/menu_kafe.jpg,SapaTamu Kafe,Food & Beverages > Beverages > Coffee,beverages,Minuman Kopi',
  'FOOD_LAT,Caffe Latte - SapaTamu Kafe,"Perpaduan lembut espresso arabika dengan steamed milk creamy dan microfoam lembut.",in stock,new,28000.00 IDR,https://sapatamu.com/menu/lat,https://raw.githubusercontent.com/keefalegends/SapaTamu/prod/public/images/menu_kafe.jpg,SapaTamu Kafe,Food & Beverages > Beverages > Coffee,beverages,Minuman Kopi',
  'FOOD_CAP,Cappuccino - SapaTamu Kafe,"Kombinasi klasik espresso, steamed milk, dan busa susu tebal dengan taburan bubuk kakao.",in stock,new,28000.00 IDR,https://sapatamu.com/menu/cap,https://raw.githubusercontent.com/keefalegends/SapaTamu/prod/public/images/menu_kafe.jpg,SapaTamu Kafe,Food & Beverages > Beverages > Coffee,beverages,Minuman Kopi',
  'FOOD_MAT,Matcha Latte - SapaTamu Kafe,"Bubuk matcha premium Jepang dipadukan dengan susu segar manis gurih yang menenangkan.",in stock,new,25000.00 IDR,https://sapatamu.com/menu/mat,https://raw.githubusercontent.com/keefalegends/SapaTamu/prod/public/images/menu_kafe.jpg,SapaTamu Kafe,Food & Beverages > Beverages > Tea,beverages,Minuman Non-Kopi',
  'FOOD_TEH,Es Teh Manis Segar,"Teh melati pilihan diseduh tradisional dengan gula tebu asli dan es kristal menyegarkan.",in stock,new,15000.00 IDR,https://sapatamu.com/menu/teh,https://raw.githubusercontent.com/keefalegends/SapaTamu/prod/public/images/menu_kafe.jpg,SapaTamu Kafe,Food & Beverages > Beverages > Tea,beverages,Minuman Segar',
  'FOOD_JER,Jeruk Peras Alami,"Perasan jeruk segar asli tanpa pemanis buatan, kaya vitamin C dan menyegarkan dahaga.",in stock,new,15000.00 IDR,https://sapatamu.com/menu/jer,https://raw.githubusercontent.com/keefalegends/SapaTamu/prod/public/images/menu_kafe.jpg,SapaTamu Kafe,Food & Beverages > Beverages > Juice,beverages,Minuman Segar',
  'FOOD_CRO,Butter Croissant - SapaTamu Bakery,"Pastry khas Prancis berlapis renyah di luar dan lembut beraroma butter di dalam.",in stock,new,20000.00 IDR,https://sapatamu.com/menu/cro,https://raw.githubusercontent.com/keefalegends/SapaTamu/prod/public/images/cafe_sapatamu.jpg,SapaTamu Resto,Food & Beverages > Bakery,bakery,Makanan Ringan',
  'FOOD_ROT,Roti Bakar Spesial SapaTamu,"Roti tawar tebal panggang dengan isian cokelat keju melimpah dan susu kental manis.",in stock,new,18000.00 IDR,https://sapatamu.com/menu/rot,https://raw.githubusercontent.com/keefalegends/SapaTamu/prod/public/images/cafe_sapatamu.jpg,SapaTamu Resto,Food & Beverages > Bakery,bakery,Makanan Ringan',
  'FOOD_CAR,Spaghetti Carbonara Creamy,"Pasta spaghetti al dente dengan saus krim keju parmesan gurih, smoked beef, dan oregano.",in stock,new,45000.00 IDR,https://sapatamu.com/menu/car,https://raw.githubusercontent.com/keefalegends/SapaTamu/prod/public/images/cafe_sapatamu.jpg,SapaTamu Resto,Food & Beverages > Prepared Meals,food,Makanan Utama',
  'FOOD_NAS,Nasi Goreng Spesial SapaTamu,"Nasi goreng bumbu rempah nusantara dengan suwiran ayam, telur mata sapi, sate ayam, dan kerupuk.",in stock,new,35000.00 IDR,https://sapatamu.com/menu/nas,https://raw.githubusercontent.com/keefalegends/SapaTamu/prod/public/images/cafe_sapatamu.jpg,SapaTamu Resto,Food & Beverages > Prepared Meals,food,Makanan Utama'
];

fs.writeFileSync('catalog_resto.csv', [restoHeader, ...restoRows].join('\n'), 'utf-8');
console.log('✅ Generated: catalog_resto.csv');

// 3. HOTEL E-COMMERCE FEED (Sebagai alternatif format E-Commerce untuk WhatsApp Catalog)
const hotelEcommerceHeader = 'id,title,description,availability,condition,price,link,image_link,brand,google_product_category,fb_product_category,custom_label_0';

const hotelEcommerceRows = [
  'ROOM_DELUXE,Deluxe Room - SapaTamu Hotel,"Kamar Deluxe dengan Kasur King Size, Smart TV 43 Inch, AC Dingin, Balkon Pribadi, Termasuk Sarapan untuk 2 orang.",in stock,new,550000.00 IDR,https://sapatamu.com/rooms/deluxe,https://raw.githubusercontent.com/keefalegends/SapaTamu/prod/public/images/kamar_deluxe.jpg,SapaTamu Hotel,Travel & Luggage > Lodging,hotel_room,Kamar Hotel',
  'ROOM_EXEC,Executive Suite - SapaTamu Hotel,"Suite Mewah dengan Ruang Tamu Terpisah, Jacuzzi Pribadi, Espresso Machine, Akses Lounge Eksklusif, Sarapan 2 pax.",in stock,new,950000.00 IDR,https://sapatamu.com/rooms/executive,https://raw.githubusercontent.com/keefalegends/SapaTamu/prod/public/images/kamar_executive.jpg,SapaTamu Hotel,Travel & Luggage > Lodging,hotel_room,Kamar Hotel',
  'ROOM_SUITE,Presidential Suite - SapaTamu Hotel,"Penthouse Mewah 2 Kamar Tidur, Dining Room Pribadi, Mini Bar Gratis, Layanan 24 Jam Butler Pribadi, Jacuzzi.",in stock,new,1800000.00 IDR,https://sapatamu.com/rooms/presidential,https://raw.githubusercontent.com/keefalegends/SapaTamu/prod/public/images/kamar_suite.jpg,SapaTamu Hotel,Travel & Luggage > Lodging,hotel_room,Kamar Hotel'
];

fs.writeFileSync('catalog_hotel_ecommerce.csv', [hotelEcommerceHeader, ...hotelEcommerceRows].join('\n'), 'utf-8');
console.log('✅ Generated: catalog_hotel_ecommerce.csv');