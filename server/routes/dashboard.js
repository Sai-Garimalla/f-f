const express = require('express');
const router = express.Router();
const { pool } = require('../db/connection');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

router.get('/stats', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    // Today's totals + breakdown by order type
    const [todaySales] = await pool.execute(
      `SELECT
        COALESCE(SUM(grand_total),0)  AS total,
        COUNT(*)                      AS bill_count,
        COALESCE(SUM(CASE WHEN order_type LIKE 'Dine-in%' THEN grand_total ELSE 0 END),0)   AS dinein_sales,
        COALESCE(SUM(CASE WHEN order_type LIKE 'Takeaway%' THEN grand_total ELSE 0 END),0)  AS takeaway_sales,
        COALESCE(SUM(CASE WHEN order_type LIKE 'Delivery%' THEN grand_total ELSE 0 END),0)  AS delivery_sales,
        SUM(CASE WHEN order_type LIKE 'Dine-in%' THEN 1 ELSE 0 END)   AS dinein_count,
        SUM(CASE WHEN order_type LIKE 'Takeaway%' THEN 1 ELSE 0 END)  AS takeaway_count,
        SUM(CASE WHEN order_type LIKE 'Delivery%' THEN 1 ELSE 0 END)  AS delivery_count,
        SUM(CASE WHEN status='cancelled' THEN 1 ELSE 0 END)           AS cancelled_count
       FROM bills WHERE DATE(created_at)=?`, [today]
    );

    // Monthly totals
    const [monthSales] = await pool.execute(
      `SELECT COALESCE(SUM(grand_total),0) AS total, COUNT(*) AS bill_count
       FROM bills WHERE MONTH(created_at)=MONTH(NOW()) AND YEAR(created_at)=YEAR(NOW()) AND status='completed'`
    );

    // Menu count
    const [menuCount] = await pool.execute("SELECT COUNT(*) AS count FROM menu WHERE is_active=1");

    // Active staff count
    const [staffCount] = await pool.execute("SELECT COUNT(*) AS count FROM users WHERE status='active'");

    // Recent 8 bills
    const [recentBills] = await pool.execute(
      `SELECT b.bill_id, b.bill_number, b.token_number, b.customer_name, b.customer_phone, b.grand_total, b.order_type, b.status, b.created_at
       FROM bills b WHERE DATE(b.created_at)=? ORDER BY b.created_at DESC LIMIT 8`, [today]
    );

    // Weekly bar chart (last 7 days)
    const [weeklyData] = await pool.execute(
      `SELECT DATE(created_at) AS date,
              COALESCE(SUM(grand_total),0) AS total,
              COUNT(*) AS bill_count
       FROM bills WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) AND status='completed'
       GROUP BY DATE(created_at) ORDER BY date ASC`
    );

    // Top 5 selling items today
    const [topItems] = await pool.execute(
      `SELECT bi.item_name, SUM(bi.quantity) AS qty, SUM(bi.line_total) AS revenue
       FROM bill_items bi
       JOIN bills b ON bi.bill_id=b.bill_id
       WHERE DATE(b.created_at)=? AND b.status='completed'
       GROUP BY bi.item_name ORDER BY qty DESC LIMIT 5`, [today]
    );

    // Peak hours today
    const [peakHours] = await pool.execute(
      `SELECT HOUR(created_at) AS hour, COUNT(*) AS bill_count, COALESCE(SUM(grand_total),0) AS sales
       FROM bills WHERE DATE(created_at)=? AND status='completed'
       GROUP BY HOUR(created_at) ORDER BY bill_count DESC LIMIT 5`, [today]
    );

    // Staff performance today
    const [staffPerf] = await pool.execute(
      `SELECT u.full_name, COUNT(*) AS bills_taken, COALESCE(SUM(b.grand_total),0) AS sales
       FROM bills b JOIN users u ON b.created_by=u.id
       WHERE DATE(b.created_at)=? AND b.status='completed'
       GROUP BY u.id, u.full_name ORDER BY bills_taken DESC`, [today]
    );

    res.json({
      today_sales:     parseFloat(todaySales[0].total),
      today_bills:     parseInt(todaySales[0].bill_count),
      dinein_sales:    parseFloat(todaySales[0].dinein_sales),
      takeaway_sales:  parseFloat(todaySales[0].takeaway_sales),
      delivery_sales:  parseFloat(todaySales[0].delivery_sales),
      dinein_count:    parseInt(todaySales[0].dinein_count),
      takeaway_count:  parseInt(todaySales[0].takeaway_count),
      delivery_count:  parseInt(todaySales[0].delivery_count),
      cancelled_count: parseInt(todaySales[0].cancelled_count),
      month_sales:     parseFloat(monthSales[0].total),
      month_bills:     parseInt(monthSales[0].bill_count),
      menu_count:      parseInt(menuCount[0].count),
      staff_count:     parseInt(staffCount[0].count),
      recent_bills:    recentBills,
      weekly_data:     weeklyData,
      top_items:       topItems,
      peak_hours:      peakHours,
      staff_perf:      staffPerf,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
