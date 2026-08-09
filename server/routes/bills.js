const express = require('express');
const router = express.Router();
const { pool } = require('../db/connection');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

// ── Phone number suggestions (partial search) ──
router.get('/phone-suggest', async (req, res) => {
  try {
    const q = (req.query.q || '').trim().replace(/\D/g, '');
    if (!q) return res.json([]);
    const [rows] = await pool.execute(
      `SELECT DISTINCT customer_phone, customer_name
       FROM bills
       WHERE customer_phone LIKE ? AND customer_phone IS NOT NULL AND status='completed'
       ORDER BY MAX(created_at) DESC
       LIMIT 10`,
      [`%${q}%`]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Customer lookup by phone (must come BEFORE /:billId) ──
router.get('/customer/:phone', async (req, res) => {
  try {
    const phone = req.params.phone;
    const [nameResult] = await pool.execute(
      "SELECT customer_name FROM bills WHERE customer_phone=? AND customer_name IS NOT NULL AND status='completed' ORDER BY created_at DESC LIMIT 1",
      [phone]
    );
    const customer_name = nameResult.length ? nameResult[0].customer_name : null;

    const [orders] = await pool.execute(
      `SELECT b.bill_id, b.bill_number, b.token_number, b.created_at,
              b.grand_total, b.order_type, b.subtotal, b.discount_amount
       FROM bills b WHERE b.customer_phone=? AND b.status='completed'
       ORDER BY b.created_at DESC LIMIT 20`,
      [phone]
    );

    // Total spent + visit count
    const [totals] = await pool.execute(
      "SELECT COALESCE(SUM(grand_total),0) AS total_spent, COUNT(*) AS visit_count FROM bills WHERE customer_phone=? AND status='completed'",
      [phone]
    );

    // Per-item aggregates: what this customer orders and how much
    const [itemHistory] = await pool.execute(
      `SELECT bi.item_name,
              SUM(bi.quantity)  AS total_qty,
              SUM(bi.line_total) AS total_spent,
              COUNT(DISTINCT bi.bill_id) AS order_count
       FROM bill_items bi
       JOIN bills b ON bi.bill_id = b.bill_id
       WHERE b.customer_phone=? AND b.status='completed'
       GROUP BY bi.item_name
       ORDER BY total_qty DESC`,
      [phone]
    );

    res.json({
      customer_name,
      total_spent:  parseFloat(totals[0].total_spent),
      visit_count:  parseInt(totals[0].visit_count),
      history:      orders,
      item_history: itemHistory
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET list of bills with filters + ordering ──
router.get('/', async (req, res) => {
  try {
    const page   = parseInt(req.query.page) || 1;
    const limit  = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    const date   = req.query.date || '';
    const status = req.query.status || 'completed';

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
      SELECT b.bill_id, b.bill_number, b.token_number, b.token_prefix,
             b.customer_name, b.customer_phone, b.order_type, b.status,
             b.grand_total, b.created_at, u.full_name AS cashier_name,
             b.delivery_status, b.packing_status, b.cash_collected, b.upi_collected,
             b.delivered_at, b.assigned_delivery_boy
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
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET single bill with items ──
router.get('/:billId', async (req, res) => {
  try {
    const [bills] = await pool.execute(
      `SELECT b.*, u.full_name AS cashier_name, du.full_name AS delivery_boy_name
       FROM bills b
       LEFT JOIN users u ON b.created_by = u.id
       LEFT JOIN users du ON b.delivered_by = du.id
       WHERE b.bill_id = ?`,
      [req.params.billId]
    );
    if (!bills.length) return res.status(404).json({ error: 'Bill not found.' });
    const [items] = await pool.execute('SELECT * FROM bill_items WHERE bill_id=? ORDER BY id', [req.params.billId]);
    res.json({ bill: bills[0], items });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST cancel a bill ──
router.post('/:billId/cancel', async (req, res) => {
  try {
    const [result] = await pool.execute(
      "UPDATE bills SET status='cancelled' WHERE bill_id=?", [req.params.billId]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Bill not found' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
