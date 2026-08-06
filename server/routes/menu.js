const express = require('express');
const router = express.Router();
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const { pool } = require('../db/connection');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

router.use(authenticateToken);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Get all menu items
router.get('/', async (req, res) => {
  try {
    const { search, category } = req.query;
    let query = 'SELECT * FROM menu WHERE is_active = 1';
    const params = [];

    if (search) {
      query += ' AND (item_name LIKE ? OR item_code LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    if (category) {
      query += ' AND category = ?';
      params.push(category);
    }

    query += ' ORDER BY category, item_name';
    const [rows] = await pool.execute(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get categories
router.get('/categories', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      "SELECT DISTINCT category FROM menu WHERE is_active = 1 ORDER BY category"
    );
    res.json(rows.map(r => r.category));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Upload Excel menu (replaces existing)
router.post('/upload', requireAdmin, upload.single('menu_file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    if (!data.length) return res.status(400).json({ error: 'Excel file is empty.' });

    // Validate columns
    const required = ['Item Code', 'Item Name', 'Default Price'];
    const headers = Object.keys(data[0]);
    for (const col of required) {
      if (!headers.includes(col)) {
        return res.status(400).json({ error: `Missing column: "${col}". Required: Item Code, Item Name, Category, Default Price` });
      }
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Soft delete all existing
      await conn.execute('UPDATE menu SET is_active = 0');

      let inserted = 0, skipped = 0;
      for (const row of data) {
        const code = String(row['Item Code'] || '').trim();
        const name = String(row['Item Name'] || '').trim();
        const category = String(row['Category'] || 'General').trim();
        const price = parseFloat(row['Default Price']) || 0;

        if (!code || !name || price <= 0) { skipped++; continue; }

        await conn.execute(
          `INSERT INTO menu (item_code, item_name, category, default_price, is_active)
           VALUES (?, ?, ?, ?, 1)
           ON DUPLICATE KEY UPDATE item_name=VALUES(item_name), category=VALUES(category),
           default_price=VALUES(default_price), is_active=1`,
          [code, name, category, price]
        );
        inserted++;
      }

      await conn.commit();
      res.json({ success: true, inserted, skipped });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add single menu item
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { item_code, item_name, category, default_price } = req.body;
    if (!item_code || !item_name || !default_price) {
      return res.status(400).json({ error: 'Item code, name, and price are required.' });
    }
    await pool.execute(
      'INSERT INTO menu (item_code, item_name, category, default_price) VALUES (?, ?, ?, ?)',
      [item_code, item_name, category || 'General', parseFloat(default_price)]
    );
    res.json({ success: true });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Item code already exists.' });
    }
    res.status(500).json({ error: err.message });
  }
});

// Update menu item
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const { item_name, category, default_price } = req.body;
    await pool.execute(
      'UPDATE menu SET item_name=?, category=?, default_price=? WHERE id=?',
      [item_name, category, parseFloat(default_price), req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete menu item (soft)
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    await pool.execute('UPDATE menu SET is_active=0 WHERE id=?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Download menu as Excel template
router.get('/template', (req, res) => {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ['Item Code', 'Item Name', 'Category', 'Default Price'],
    ['F001', 'Chicken Biryani', 'Rice', 220],
    ['F002', 'Paneer Butter Masala', 'Curry', 180],
  ]);
  XLSX.utils.book_append_sheet(wb, ws, 'Menu');
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
  res.setHeader('Content-Disposition', 'attachment; filename=menu_template.xlsx');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

module.exports = router;
