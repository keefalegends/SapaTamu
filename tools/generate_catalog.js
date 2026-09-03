const fs = require('fs');

const imgDeluxe = 'https://iili.io/nHXxrOb.jpg';
const imgExec = 'https://iili.io/nHXzg4I.jpg';
const imgSuite = 'https://iili.io/nHXz6YX.jpg';

// Header lengkap khusus Meta Hotels Data Feed
const hotelHeader = 'id,retailer_item_id,title,name,description,brand,hotel_category,price,link,image_link,image[0].url,image[0].tag[0],availability,condition,store_code,hotel_address,address.addr1,address.city,address.region,address.postal_code,address.country,latitude,longitude,star_rating,number_of_rooms';

const hotelRows = [
  `ROOM_DELUXE,ROOM_DELUXE,Deluxe Room - SapaTamu Hotel,Deluxe Room,"Kasur King Size Smart TV 43 Inch AC Balkon Pribadi Termasuk Sarapan 2 pax.",SapaTamu Hotel,hotel,550000 IDR,https://sapatamu.com/rooms/deluxe,${imgDeluxe},${imgDeluxe},Bedroom,in stock,new,STORE_01,"Jl. Pemuda No. 45, Surabaya, Jawa Timur, 60271, Indonesia",Jl. Pemuda No. 45,Surabaya,Jawa Timur,60271,Indonesia,-7.2575,112.7521,4.5,20`,
  `ROOM_EXEC,ROOM_EXEC,Executive Suite - SapaTamu Hotel,Executive Suite,"Ruang Tamu Terpisah Jacuzzi Espresso Machine Akses Lounge Sarapan 2 pax.",SapaTamu Hotel,hotel,950000 IDR,https://sapatamu.com/rooms/executive,${imgExec},${imgExec},Suite Room,in stock,new,STORE_01,"Jl. Pemuda No. 45, Surabaya, Jawa Timur, 60271, Indonesia",Jl. Pemuda No. 45,Surabaya,Jawa Timur,60271,Indonesia,-7.2575,112.7521,5.0,10`,
  `ROOM_SUITE,ROOM_SUITE,Presidential Suite - SapaTamu Hotel,Presidential Suite,"Penthouse Mewah 2 Kamar Tidur Dining Room Mini Bar 24h Butler Jacuzzi.",SapaTamu Hotel,hotel,1800000 IDR,https://sapatamu.com/rooms/presidential,${imgSuite},${imgSuite},Presidential Suite,in stock,new,STORE_01,"Jl. Pemuda No. 45, Surabaya, Jawa Timur, 60271, Indonesia",Jl. Pemuda No. 45,Surabaya,Jawa Timur,60271,Indonesia,-7.2575,112.7521,5.0,5`
];

fs.writeFileSync('catalog_hotel.csv', [hotelHeader, ...hotelRows].join('\r\n'), 'utf-8');

console.log('✅ REGENERATED catalog_hotel.csv WITH LATITUDE & LONGITUDE!');