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
    const status = req.query.status || 'completed'; // Filter by status

    let where = 'WHERE b.status = ?';
    const params = [status];

    if (search) {
      where += ' AND (b.bill_number LIKE ? OR b.customer_phone LIKE ? OR b.customer_name LIKE ? OR CAST(b.token_number AS CHAR) LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
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

// Cancel a bill
router.post('/:billId/cancel', async (req, res) => {
  try {
    const [result] = await pool.execute(
      "UPDATE bills SET status = 'cancelled' WHERE bill_id = ?",
      [req.params.billId]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Bill not found' });
    res.json({ success: true, message: 'Bill cancelled successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get customer history by phone
router.get('/customer/:phone', async (req, res) => {
  try {
    // Get their name (most recent)
    const [nameResult] = await pool.execute(
      "SELECT customer_name FROM bills WHERE customer_phone = ? AND customer_name IS NOT NULL ORDER BY created_at DESC LIMIT 1",
      [req.params.phone]
    );
    const customer_name = nameResult.length ? nameResult[0].customer_name : null;

    // Get their last 10 completed orders
    const [orders] = await pool.execute(
      "SELECT bill_id, bill_number, created_at, grand_total, order_type FROM bills WHERE customer_phone = ? AND status = 'completed' ORDER BY created_at DESC LIMIT 10",
      [req.params.phone]
    );

    res.json({ customer_name, history: orders });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
