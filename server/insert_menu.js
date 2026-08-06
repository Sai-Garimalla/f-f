const mysql = require('mysql2/promise');
require('dotenv').config({ path: '../.env' });

const menuItems = [
  // Biryani - Non-Veg
  { code: 'B-NV-01', name: 'Chicken Dum Biryani', category: 'Biryani - Non-Veg', price: 180 },
  { code: 'B-NV-02', name: 'Chicken Fry Piece Biryani', category: 'Biryani - Non-Veg', price: 200 },
  { code: 'B-NV-03', name: 'Chicken Lollipop Biryani', category: 'Biryani - Non-Veg', price: 230 },
  { code: 'B-NV-04', name: 'Chicken Special Biryani', category: 'Biryani - Non-Veg', price: 220 },
  { code: 'B-NV-05', name: 'Chicken Mughlai Biryani', category: 'Biryani - Non-Veg', price: 220 },
  { code: 'B-NV-06', name: 'Chicken Gongura Biryani', category: 'Biryani - Non-Veg', price: 220 },
  { code: 'B-NV-07', name: 'Egg Biryani', category: 'Biryani - Non-Veg', price: 149 },
  { code: 'B-NV-08', name: 'F&F Special Biryani (3 person)', category: 'Biryani - Non-Veg', price: 499 },
  { code: 'B-NV-09', name: 'Mutton Dum Biryani', category: 'Biryani - Non-Veg', price: 329 },
  { code: 'B-NV-10', name: 'Mutton Fry Piece Biryani', category: 'Biryani - Non-Veg', price: 339 },

  // Biryani - Veg
  { code: 'B-VG-01', name: 'Veg Biryani', category: 'Biryani - Veg', price: 159 },
  { code: 'B-VG-02', name: 'Kaju Biryani', category: 'Biryani - Veg', price: 199 },
  { code: 'B-VG-03', name: 'Mushroom Biryani', category: 'Biryani - Veg', price: 169 },
  { code: 'B-VG-04', name: 'Paneer Biryani', category: 'Biryani - Veg', price: 179 },
  { code: 'B-VG-05', name: 'Curd Rice', category: 'Biryani - Veg', price: 69 },

  // Soups
  { code: 'S-01', name: 'Chicken Corn Soup', category: 'Soups', price: 140 },
  { code: 'S-02', name: 'Chicken Hot & Sour Soup', category: 'Soups', price: 130 },
  { code: 'S-03', name: 'Manchow Soup', category: 'Soups', price: 120 },
  { code: 'S-04', name: 'Tomato Soup', category: 'Soups', price: 99 },
  { code: 'S-05', name: 'Chicken Pepper Soup', category: 'Soups', price: 110 },

  // Fried Rice / Noodles
  { code: 'FR-01', name: 'Veg Fried Rice/Noodles', category: 'Fried Rice / Noodles', price: 99 },
  { code: 'FR-02', name: 'Gobi Fried Rice/Noodles', category: 'Fried Rice / Noodles', price: 99 },
  { code: 'FR-03', name: 'Paneer Fried Rice /Noodles', category: 'Fried Rice / Noodles', price: 129 },
  { code: 'FR-04', name: 'Mushroom Fried Rice /Noodles', category: 'Fried Rice / Noodles', price: 119 },
  { code: 'FR-05', name: 'Special Veg Fried Rice /Noodles', category: 'Fried Rice / Noodles', price: 139 },
  { code: 'FR-06', name: 'Kaju Fried Rice /Noodles', category: 'Fried Rice / Noodles', price: 149 },
  { code: 'FR-07', name: 'Egg Fried Rice/Noodles', category: 'Fried Rice / Noodles', price: 110 },
  { code: 'FR-08', name: 'Chicken Fried Rice /Noodles', category: 'Fried Rice / Noodles', price: 120 },
  { code: 'FR-09', name: 'Special Chicken Fried Rice / Noodles', category: 'Fried Rice / Noodles', price: 169 },

  // Combo Packs
  { code: 'CP-01', name: 'SPL Chicken Biryani (2-3 serves) +2 Roti + Egg Curry + Sweet Lassi', category: 'Combo Packs', price: 599 },
  { code: 'CP-02', name: 'Lollipop Biryani + Sweet Lassi', category: 'Combo Packs', price: 259 },
  { code: 'CP-03', name: 'SPL Chicken Biryani + Lollipop + Sweet Lassi', category: 'Combo Packs', price: 469 },
  { code: 'CP-04', name: 'Chicken Jumbo Pack (3-4 serves) (Chicken Biryani + 5 Roti + Egg Curry+Sweet Lassi)', category: 'Combo Packs', price: 899 },
  { code: 'CP-05', name: 'Veg Curry+Veg Fried Rice + Curd Rice + Soft Drink', category: 'Combo Packs', price: 339 },
  { code: 'CP-06', name: 'Non Veg Combo (Chicken Curry +2 Roti + Egg Fried Rice + Soft Drink)', category: 'Combo Packs', price: 349 },

  // Beverages
  { code: 'BV-01', name: 'Sweet Lassi', category: 'Beverages', price: 49 },
  { code: 'BV-02', name: 'Butter Milk', category: 'Beverages', price: 49 },
  { code: 'BV-03', name: 'Badham Milk', category: 'Beverages', price: 49 },
  { code: 'BV-04', name: 'Rose Milk', category: 'Beverages', price: 49 },

  // Starters - Veg
  { code: 'ST-VG-01', name: 'Gobi Manchuria', category: 'Starters - Veg', price: 99 },
  { code: 'ST-VG-02', name: 'Gobi 65', category: 'Starters - Veg', price: 110 },
  { code: 'ST-VG-03', name: 'Paneer Chilli', category: 'Starters - Veg', price: 189 },
  { code: 'ST-VG-04', name: 'Paneer 65', category: 'Starters - Veg', price: 200 },
  { code: 'ST-VG-05', name: 'Mushroom Manchuria', category: 'Starters - Veg', price: 169 },
  { code: 'ST-VG-06', name: 'Mushroom 65', category: 'Starters - Veg', price: 179 },
  { code: 'ST-VG-07', name: 'Mushroom Chilli', category: 'Starters - Veg', price: 149 },
  { code: 'ST-VG-08', name: 'Baby Corn', category: 'Starters - Veg', price: 99 },

  // Starters - Non-Veg
  { code: 'ST-NV-01', name: 'Chicken 65', category: 'Starters - Non-Veg', price: 199 },
  { code: 'ST-NV-02', name: 'Chicken Manchuria', category: 'Starters - Non-Veg', price: 199 },
  { code: 'ST-NV-03', name: 'Chilli Chicken', category: 'Starters - Non-Veg', price: 199 },
  { code: 'ST-NV-04', name: 'Chicken Majestic', category: 'Starters - Non-Veg', price: 229 },
  { code: 'ST-NV-05', name: 'Chicken 555', category: 'Starters - Non-Veg', price: 229 },
  { code: 'ST-NV-06', name: 'Chicken Drumstick', category: 'Starters - Non-Veg', price: 239 },
  { code: 'ST-NV-07', name: 'Chicken Lollipop', category: 'Starters - Non-Veg', price: 219 },
  { code: 'ST-NV-08', name: 'Dragon Chicken', category: 'Starters - Non-Veg', price: 219 },
  { code: 'ST-NV-09', name: 'Hongkong Chicken', category: 'Starters - Non-Veg', price: 209 },
  { code: 'ST-NV-10', name: 'Pepper Chicken', category: 'Starters - Non-Veg', price: 199 },
  { code: 'ST-NV-11', name: 'Chicken Kabab(200g)', category: 'Starters - Non-Veg', price: 100 },
  { code: 'ST-NV-12', name: 'Red Hot Chicken', category: 'Starters - Non-Veg', price: 219 },
  { code: 'ST-NV-13', name: 'Guntur Chicken', category: 'Starters - Non-Veg', price: 209 },
  { code: 'ST-NV-14', name: 'Kaju Chicken', category: 'Starters - Non-Veg', price: 249 },

  // Indian Curries - Non-Veg
  { code: 'IC-NV-01', name: 'Chicken Curry', category: 'Indian Curries - Non-Veg', price: 200 },
  { code: 'IC-NV-02', name: 'Chicken Masala', category: 'Indian Curries - Non-Veg', price: 180 },
  { code: 'IC-NV-03', name: 'Chicken Hyderabadi', category: 'Indian Curries - Non-Veg', price: 210 },
  { code: 'IC-NV-04', name: 'Gongura Chicken Curry', category: 'Indian Curries - Non-Veg', price: 190 },
  { code: 'IC-NV-05', name: 'Butter Chicken', category: 'Indian Curries - Non-Veg', price: 230 },
  { code: 'IC-NV-06', name: 'Chicken Mughlai', category: 'Indian Curries - Non-Veg', price: 210 },
  { code: 'IC-NV-07', name: 'Chicken Rayalaseema', category: 'Indian Curries - Non-Veg', price: 200 },
  { code: 'IC-NV-08', name: 'Afghani Chicken', category: 'Indian Curries - Non-Veg', price: 220 },
  { code: 'IC-NV-09', name: 'Panjabi Chicken', category: 'Indian Curries - Non-Veg', price: 220 },
  { code: 'IC-NV-10', name: 'Kaju Chicken', category: 'Indian Curries - Non-Veg', price: 220 },
  { code: 'IC-NV-11', name: 'Chicken Boneless Curry', category: 'Indian Curries - Non-Veg', price: 190 },

  // Indian Curries - Veg
  { code: 'IC-VG-01', name: 'Dal Fry', category: 'Indian Curries - Veg', price: 89 },
  { code: 'IC-VG-02', name: 'Dal Tadka', category: 'Indian Curries - Veg', price: 99 },
  { code: 'IC-VG-03', name: 'Kaju Tomato Curry', category: 'Indian Curries - Veg', price: 109 },
  { code: 'IC-VG-04', name: 'Mushroom Curry', category: 'Indian Curries - Veg', price: 149 },
  { code: 'IC-VG-05', name: 'Kadai Mushroom', category: 'Indian Curries - Veg', price: 159 },
  { code: 'IC-VG-06', name: 'Methi Kofta', category: 'Indian Curries - Veg', price: 179 },
  { code: 'IC-VG-07', name: 'Methi Chaman', category: 'Indian Curries - Veg', price: 189 },
  { code: 'IC-VG-08', name: 'Kaju Curry', category: 'Indian Curries - Veg', price: 189 },
  { code: 'IC-VG-09', name: 'Paneer Curry', category: 'Indian Curries - Veg', price: 179 },
  { code: 'IC-VG-10', name: 'Kadai Paneer', category: 'Indian Curries - Veg', price: 189 },
  { code: 'IC-VG-11', name: 'Paneer Butter Masala', category: 'Indian Curries - Veg', price: 199 }
];

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: { rejectUnauthorized: true }
  });

  try {
    await conn.query('DELETE FROM menu');
    
    for (const item of menuItems) {
      await conn.execute(
        'INSERT INTO menu (item_code, item_name, category, default_price) VALUES (?, ?, ?, ?)',
        [item.code, item.name, item.category, item.price]
      );
    }
    console.log('Successfully inserted ' + menuItems.length + ' items.');
  } catch (error) {
    console.error('Error inserting menu items:', error);
  } finally {
    await conn.end();
  }
})();
