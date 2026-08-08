const fs = require('fs');
const path = require('path');
const { pool } = require('./server/db/connection');

const menuItems = [
  // BIRYANI - Non-Veg
  { code: 'B-NV-01', name: 'Chicken Dum Biryani', category: 'Biryani', price: 180 },
  { code: 'B-NV-02', name: 'Chicken Fry Piece Biryani', category: 'Biryani', price: 200 },
  { code: 'B-NV-03', name: 'Chicken Lollipop Biryani', category: 'Biryani', price: 230 },
  { code: 'B-NV-04', name: 'Chicken Special Biryani', category: 'Biryani', price: 220 },
  { code: 'B-NV-05', name: 'Chicken Mughlai Biryani', category: 'Biryani', price: 220 },
  { code: 'B-NV-06', name: 'Chicken Gongura Biryani', category: 'Biryani', price: 220 },
  { code: 'B-NV-07', name: 'Egg Biryani', category: 'Biryani', price: 149 },
  { code: 'B-NV-08', name: 'F&F Special Biryani (3 person)', category: 'Biryani', price: 499 },
  { code: 'B-NV-09', name: 'Mutton Dum Biryani', category: 'Biryani', price: 329 },
  { code: 'B-NV-10', name: 'Mutton Fry Piece Biryani', category: 'Biryani', price: 339 },

  // BIRYANI - Veg
  { code: 'B-V-11', name: 'Veg Biryani', category: 'Biryani', price: 159 },
  { code: 'B-V-12', name: 'Kaju Biryani', category: 'Biryani', price: 199 },
  { code: 'B-V-13', name: 'Mushroom Biryani', category: 'Biryani', price: 169 },
  { code: 'B-V-14', name: 'Paneer Biryani', category: 'Biryani', price: 179 },
  { code: 'B-V-15', name: 'Curd Rice', category: 'Biryani', price: 69 },

  // SOUPS
  { code: 'S-01', name: 'Chicken Corn Soup', category: 'Soups', price: 140 },
  { code: 'S-02', name: 'Chicken Hot & Sour Soup', category: 'Soups', price: 130 },
  { code: 'S-03', name: 'Manchow Soup', category: 'Soups', price: 120 },
  { code: 'S-04', name: 'Tomato Soup', category: 'Soups', price: 99 },
  { code: 'S-05', name: 'Chicken Pepper Soup', category: 'Soups', price: 110 },

  // FRIED RICE
  { code: 'FR-01', name: 'Veg Fried Rice', category: 'Fried Rice', price: 99 },
  { code: 'FR-02', name: 'Gobi Fried Rice', category: 'Fried Rice', price: 99 },
  { code: 'FR-03', name: 'Paneer Fried Rice', category: 'Fried Rice', price: 129 },
  { code: 'FR-04', name: 'Mushroom Fried Rice', category: 'Fried Rice', price: 119 },
  { code: 'FR-05', name: 'Special Veg Fried Rice', category: 'Fried Rice', price: 139 },
  { code: 'FR-06', name: 'Kaju Fried Rice', category: 'Fried Rice', price: 149 },
  { code: 'FR-07', name: 'Egg Fried Rice', category: 'Fried Rice', price: 110 },
  { code: 'FR-08', name: 'Chicken Fried Rice', category: 'Fried Rice', price: 120 },
  { code: 'FR-09', name: 'Special Chicken Fried Rice', category: 'Fried Rice', price: 169 },

  // NOODLES
  { code: 'N-01', name: 'Veg Noodles', category: 'Noodles', price: 99 },
  { code: 'N-02', name: 'Gobi Noodles', category: 'Noodles', price: 99 },
  { code: 'N-03', name: 'Paneer Noodles', category: 'Noodles', price: 129 },
  { code: 'N-04', name: 'Mushroom Noodles', category: 'Noodles', price: 119 },
  { code: 'N-05', name: 'Special Veg Noodles', category: 'Noodles', price: 139 },
  { code: 'N-06', name: 'Kaju Noodles', category: 'Noodles', price: 149 },
  { code: 'N-07', name: 'Egg Noodles', category: 'Noodles', price: 110 },
  { code: 'N-08', name: 'Chicken Noodles', category: 'Noodles', price: 120 },
  { code: 'N-09', name: 'Special Chicken Noodles', category: 'Noodles', price: 169 },

  // COMBO PACKS
  { code: 'CP-01', name: 'SPL Chicken Biryani +2 Roti + Egg Curry + Lassi', category: 'Combo Packs', price: 599 },
  { code: 'CP-02', name: 'Lollipop Biryani + Sweet Lassi', category: 'Combo Packs', price: 259 },
  { code: 'CP-03', name: 'SPL Chicken Biryani + Lollipop + Sweet Lassi', category: 'Combo Packs', price: 469 },
  { code: 'CP-04', name: 'Chicken Jumbo Pack (Biryani+5 Roti+Egg Curry+Lassi)', category: 'Combo Packs', price: 899 },
  { code: 'CP-05', name: 'Veg Curry+Veg Fried Rice+Curd Rice+Soft Drink', category: 'Combo Packs', price: 339 },
  { code: 'CP-06', name: 'Non Veg Combo (Chicken Curry+2 Roti+Egg FR+Drink)', category: 'Combo Packs', price: 349 },

  // BEVERAGES
  { code: 'BV-01', name: 'Sweet Lassi', category: 'Beverages', price: 49 },
  { code: 'BV-02', name: 'Butter Milk', category: 'Beverages', price: 49 },
  { code: 'BV-03', name: 'Badham Milk', category: 'Beverages', price: 49 },
  { code: 'BV-04', name: 'Rose Milk', category: 'Beverages', price: 49 },

  // STARTERS - Veg
  { code: 'ST-V-01', name: 'Gobi Manchuria', category: 'Starters', price: 99 },
  { code: 'ST-V-02', name: 'Gobi 65', category: 'Starters', price: 110 },
  { code: 'ST-V-03', name: 'Paneer Chilli', category: 'Starters', price: 189 },
  { code: 'ST-V-04', name: 'Paneer 65', category: 'Starters', price: 200 },
  { code: 'ST-V-05', name: 'Mushroom Manchuria', category: 'Starters', price: 169 },
  { code: 'ST-V-06', name: 'Mushroom 65', category: 'Starters', price: 179 },
  { code: 'ST-V-07', name: 'Mushroom Chilli', category: 'Starters', price: 149 },
  { code: 'ST-V-08', name: 'Baby Corn', category: 'Starters', price: 99 },

  // STARTERS - Non-Veg
  { code: 'ST-NV-01', name: 'Chicken 65', category: 'Starters', price: 199 },
  { code: 'ST-NV-02', name: 'Chicken Manchuria', category: 'Starters', price: 199 },
  { code: 'ST-NV-03', name: 'Chilli Chicken', category: 'Starters', price: 199 },
  { code: 'ST-NV-04', name: 'Chicken Majestic', category: 'Starters', price: 229 },
  { code: 'ST-NV-05', name: 'Chicken 555', category: 'Starters', price: 229 },
  { code: 'ST-NV-06', name: 'Chicken Drumstick', category: 'Starters', price: 239 },
  { code: 'ST-NV-07', name: 'Chicken Lollipop', category: 'Starters', price: 219 },
  { code: 'ST-NV-08', name: 'Dragon Chicken', category: 'Starters', price: 219 },
  { code: 'ST-NV-09', name: 'Hongkong Chicken', category: 'Starters', price: 209 },
  { code: 'ST-NV-10', name: 'Pepper Chicken', category: 'Starters', price: 199 },
  { code: 'ST-NV-11', name: 'Chicken Kabab (200g)', category: 'Starters', price: 169 },
  { code: 'ST-NV-12', name: 'Red Hot Chicken', category: 'Starters', price: 219 },
  { code: 'ST-NV-13', name: 'Guntur Chicken', category: 'Starters', price: 209 },
  { code: 'ST-NV-14', name: 'Kaju Chicken', category: 'Starters', price: 249 },

  // INDIAN CURRIES - Non-Veg
  { code: 'C-NV-01', name: 'Chicken Curry', category: 'Indian Curries', price: 200 },
  { code: 'C-NV-02', name: 'Chicken Masala', category: 'Indian Curries', price: 180 },
  { code: 'C-NV-03', name: 'Chicken Hyderabadi', category: 'Indian Curries', price: 210 },
  { code: 'C-NV-04', name: 'Gongura Chicken Curry', category: 'Indian Curries', price: 190 },
  { code: 'C-NV-05', name: 'Butter Chicken', category: 'Indian Curries', price: 230 },
  { code: 'C-NV-06', name: 'Chicken Mughlai', category: 'Indian Curries', price: 210 },
  { code: 'C-NV-07', name: 'Chicken Rayalaseema', category: 'Indian Curries', price: 200 },
  { code: 'C-NV-08', name: 'Afghani Chicken', category: 'Indian Curries', price: 220 },
  { code: 'C-NV-09', name: 'Panjabi Chicken', category: 'Indian Curries', price: 220 },
  { code: 'C-NV-10', name: 'Kaju Chicken Curry', category: 'Indian Curries', price: 220 },
  { code: 'C-NV-11', name: 'Chicken Boneless Curry', category: 'Indian Curries', price: 190 },

  // INDIAN CURRIES - Veg
  { code: 'C-V-01', name: 'Dal Fry', category: 'Indian Curries', price: 89 },
  { code: 'C-V-02', name: 'Dal Tadka', category: 'Indian Curries', price: 99 },
  { code: 'C-V-03', name: 'Kaju Tomato Curry', category: 'Indian Curries', price: 109 },
  { code: 'C-V-04', name: 'Mushroom Curry', category: 'Indian Curries', price: 149 },
  { code: 'C-V-05', name: 'Kadai Mushroom', category: 'Indian Curries', price: 159 },
  { code: 'C-V-06', name: 'Methi Kofta', category: 'Indian Curries', price: 179 },
  { code: 'C-V-07', name: 'Methi Chaman', category: 'Indian Curries', price: 189 },
  { code: 'C-V-08', name: 'Kaju Curry', category: 'Indian Curries', price: 189 },
  { code: 'C-V-09', name: 'Paneer Curry', category: 'Indian Curries', price: 179 },
  { code: 'C-V-10', name: 'Kadai Paneer', category: 'Indian Curries', price: 189 },
  { code: 'C-V-11', name: 'Paneer Butter Masala', category: 'Indian Curries', price: 199 }
];

async function updateMenu() {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Soft delete all existing items so old ones don't show up
    await conn.execute('UPDATE menu SET is_active = 0');
    console.log('Disabled existing menu items.');

    let inserted = 0;
    for (const item of menuItems) {
      await conn.execute(
        `INSERT INTO menu (item_code, item_name, category, default_price, is_active)
         VALUES (?, ?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE 
         item_name=VALUES(item_name), 
         category=VALUES(category),
         default_price=VALUES(default_price), 
         is_active=1`,
        [item.code, item.name, item.category, item.price]
      );
      inserted++;
    }

    await conn.commit();
    console.log(`Success! Inserted/Updated ${inserted} menu items.`);
  } catch (err) {
    await conn.rollback();
    console.error('Error updating menu:', err);
  } finally {
    conn.release();
    process.exit(0);
  }
}

updateMenu();
