const express = require('express');
const router = express.Router();
const { pool } = require('../db/connection');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

// Get dashboard stats
router.get('/stats', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const [todaySales] = await pool.execute(
      'SELECT COALESCE(SUM(grand_total), 0) AS total, COUNT(*) AS bill_count FROM bills WHERE DATE(created_at) = ?',
      [today]
    );

    const [menuCount] = await pool.execute(
      "SELECT COUNT(*) AS count FROM menu WHERE is_active = 1"
    );

    const [recentBills] = await pool.execute(
      `SELECT b.bill_id, b.bill_number, b.token_number, b.customer_phone, b.grand_total, b.created_at
       FROM bills b
       ORDER BY b.created_at DESC
       LIMIT 5`
    );

    const [weeklyData] = await pool.execute(
      `SELECT DATE(created_at) AS date, 
              COALESCE(SUM(grand_total), 0) AS total, 
              COUNT(*) AS bill_count
       FROM bills 
       WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
       GROUP BY DATE(created_at)
       ORDER BY date ASC`
    );

    res.json({
      today_sales: parseFloat(todaySales[0].total),
      today_bills: parseInt(todaySales[0].bill_count),
      menu_count: parseInt(menuCount[0].count),
      recent_bills: recentBills,
      weekly_data: weeklyData
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
