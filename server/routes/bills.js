const express = require('express');
const router = express.Router();
const { pool } = require('../db/connection');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

// Get recent bills with pagination
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    const date = req.query.date || '';

    let where = 'WHERE 1=1';
    const params = [];

    if (search) {
      where += ' AND (b.bill_number LIKE ? OR b.customer_phone LIKE ? OR CAST(b.token_number AS CHAR) LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (date) {
      where += ' AND DATE(b.created_at) = ?';
      params.push(date);
    }

    const countSql = `SELECT COUNT(*) AS total FROM bills b ${where}`;
    const [countResult] = await pool.execute(countSql, params);

    const listSql = `
      SELECT b.bill_id, b.bill_number, b.token_number, b.customer_phone, b.order_type,
             b.grand_total, b.created_at, u.full_name AS cashier_name
      FROM bills b
      LEFT JOIN users u ON b.created_by = u.id
      ${where}
      ORDER BY b.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
    const [bills] = await pool.execute(listSql, params);

    res.json({
      bills,
      pagination: { page, limit, total: countResult[0].total, pages: Math.ceil(countResult[0].total / limit) }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single bill with items
router.get('/:billId', async (req, res) => {
  try {
    const [bills] = await pool.execute(
      `SELECT b.*, u.full_name AS cashier_name FROM bills b
       LEFT JOIN users u ON b.created_by = u.id WHERE b.bill_id = ?`,
      [req.params.billId]
    );
    if (!bills.length) return res.status(404).json({ error: 'Bill not found.' });
    const [items] = await pool.execute('SELECT * FROM bill_items WHERE bill_id = ? ORDER BY id', [req.params.billId]);
    res.json({ bill: bills[0], items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
