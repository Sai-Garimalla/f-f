const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(process.cwd(), '.env') });

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT) || 4000,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: true },
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

async function initDB() {
  const conn = await pool.getConnection();
  try {
    // Users table
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        full_name VARCHAR(100) NOT NULL,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        phone VARCHAR(20),
        password_hash VARCHAR(255) NOT NULL,
        role ENUM('admin','staff') DEFAULT 'admin',
        status ENUM('active','inactive') DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Add missing columns to users table
    try { await conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20)"); } catch(e) {}

    // Menu table
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS menu (
        id INT AUTO_INCREMENT PRIMARY KEY,
        item_code VARCHAR(50) UNIQUE NOT NULL,
        item_name VARCHAR(200) NOT NULL,
        category VARCHAR(100),
        default_price DECIMAL(10,2) NOT NULL,
        is_active TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Bills table
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS bills (
        bill_id INT AUTO_INCREMENT PRIMARY KEY,
        bill_number VARCHAR(50) UNIQUE NOT NULL,
        token_number INT NOT NULL,
        customer_name VARCHAR(100),
        customer_phone VARCHAR(20),
        order_type VARCHAR(100) DEFAULT 'Dine-in',
        delivery_address TEXT,
        custom_note TEXT,
        subtotal DECIMAL(10,2) DEFAULT 0,
        delivery_enabled TINYINT(1) DEFAULT 0,
        delivery_charge DECIMAL(10,2) DEFAULT 0,
        discount_enabled TINYINT(1) DEFAULT 0,
        discount_type ENUM('percentage','fixed') DEFAULT 'fixed',
        discount_value DECIMAL(10,2) DEFAULT 0,
        discount_amount DECIMAL(10,2) DEFAULT 0,
        grand_total DECIMAL(10,2) DEFAULT 0,
        status ENUM('completed','draft','cancelled') DEFAULT 'completed',
        created_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (created_by) REFERENCES users(id)
      )
    `);

    // Add missing columns to bills table (safe for existing DBs)
    const billAlters = [
      "ALTER TABLE bills ADD COLUMN IF NOT EXISTS customer_name VARCHAR(100)",
      "ALTER TABLE bills ADD COLUMN IF NOT EXISTS order_type VARCHAR(100) DEFAULT 'Dine-in'",
      "ALTER TABLE bills ADD COLUMN IF NOT EXISTS delivery_address TEXT",
      "ALTER TABLE bills ADD COLUMN IF NOT EXISTS custom_note TEXT",
      "ALTER TABLE bills MODIFY COLUMN status ENUM('completed','draft','cancelled') DEFAULT 'completed'",
    ];
    for (const sql of billAlters) {
      try { await conn.execute(sql); } catch(e) { /* column may already exist */ }
    }

    // Bill items table
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS bill_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        bill_id INT NOT NULL,
        item_code VARCHAR(50),
        item_name VARCHAR(200) NOT NULL,
        quantity INT NOT NULL DEFAULT 1,
        unit_price DECIMAL(10,2) NOT NULL,
        line_total DECIMAL(10,2) NOT NULL,
        is_manual TINYINT(1) DEFAULT 0,
        item_note VARCHAR(255),
        FOREIGN KEY (bill_id) REFERENCES bills(bill_id)
      )
    `);
    
    // Add item_note if missing
    try { await conn.execute("ALTER TABLE bill_items ADD COLUMN IF NOT EXISTS item_note VARCHAR(255)"); } catch(e) {}

    // Settings table
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS settings (
        key_name VARCHAR(100) PRIMARY KEY,
        value TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // Token counter table
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS token_counter (
        id INT AUTO_INCREMENT PRIMARY KEY,
        counter_date DATE NOT NULL,
        last_token INT DEFAULT 0,
        UNIQUE KEY unique_date (counter_date)
      )
    `);

    // Insert default settings if not exists
    const defaultSettings = [
      ['restaurant_name', 'Fire & Flavour'],
      ['address', 'Opp. We Crunch, Near Prince Hostel, Vel Tech Univ, New Vellanur, TN-600062'],
      ['phone', '7993988958 / 8897497613'],
      ['footer', 'Thank you for dining with us! Visit again soon.'],
      ['token_format', 'daily'],
      ['auto_print_kot', '1'],
      ['auto_print_receipt', '1'],
      ['auto_print_checklist', '0'],
      ['customer_printer_ip', process.env.CUSTOMER_PRINTER_IP || ''],
      ['customer_printer_port', process.env.CUSTOMER_PRINTER_PORT || '9100'],
      ['kitchen_printer_ip', process.env.KITCHEN_PRINTER_IP || ''],
      ['kitchen_printer_port', process.env.KITCHEN_PRINTER_PORT || '9100'],
    ];

    for (const [key, value] of defaultSettings) {
      await conn.execute(
        'INSERT IGNORE INTO settings (key_name, value) VALUES (?, ?)',
        [key, value]
      );
    }

    // Force-update branding details so existing DBs always have correct info
    await conn.execute(
      "UPDATE settings SET value = ? WHERE key_name = 'address'",
      ['Opp. We Crunch, Near Prince Hostel, Vel Tech Univ, New Vellanur, TN-600062']
    );
    await conn.execute(
      "UPDATE settings SET value = ? WHERE key_name = 'phone'",
      ['7993988958 / 8897497613']
    );
    await conn.execute(
      "UPDATE settings SET value = ? WHERE key_name = 'restaurant_name'",
      ['Fire & Flavour']
    );

    console.log('✅ Database initialized successfully');
  } finally {
    conn.release();
  }
}

module.exports = { pool, initDB };
