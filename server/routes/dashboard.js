const express = require('express');
const router = express.Router();
const { pool } = require('../db/connection');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

router.get('/stats', async (req, res) => {
  try {
    // ── Date range from query params ──
    const period = req.query.period || 'today'; // today | week | month | year | custom
    const customFrom = req.query.from || null;
    const customTo   = req.query.to   || null;

    let dateFilter, labelFormat, chartGroupBy, chartInterval, chartLabel;

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    switch (period) {
      case 'yesterday': {
        const y = new Date(now); y.setDate(y.getDate() - 1);
        const yStr = y.toISOString().split('T')[0];
        dateFilter = `DATE(created_at) = '${yStr}'`;
        chartGroupBy = `HOUR(created_at)`;
        chartInterval = 24;
        chartLabel = 'hour';
        break;
      }
      case 'week': {
        dateFilter = `created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)`;
        chartGroupBy = `DATE(created_at)`;
        chartInterval = 7;
        chartLabel = 'day';
        break;
      }
      case 'month': {
        dateFilter = `MONTH(created_at)=MONTH(NOW()) AND YEAR(created_at)=YEAR(NOW())`;
        chartGroupBy = `DATE(created_at)`;
        chartInterval = 30;
        chartLabel = 'day';
        break;
      }
      case 'year': {
        dateFilter = `YEAR(created_at)=YEAR(NOW())`;
        chartGroupBy = `MONTH(created_at)`;
        chartInterval = 12;
        chartLabel = 'month';
        break;
      }
      case 'custom': {
        const f = customFrom || todayStr;
        const t = customTo   || todayStr;
        dateFilter = `DATE(created_at) BETWEEN '${f}' AND '${t}'`;
        chartGroupBy = `DATE(created_at)`;
        chartInterval = null;
        chartLabel = 'day';
        break;
      }
      default: { // today
        dateFilter = `DATE(created_at) = '${todayStr}'`;
        chartGroupBy = `HOUR(created_at)`;
        chartInterval = 24;
        chartLabel = 'hour';
      }
    }

    // ── Core sales + type breakdown ──
    const [sales] = await pool.execute(
      `SELECT
        COALESCE(SUM(CASE WHEN status='completed' THEN grand_total ELSE 0 END),0)  AS total,
        COUNT(CASE WHEN status='completed' THEN 1 END)                              AS bill_count,
        COALESCE(AVG(CASE WHEN status='completed' THEN grand_total END),0)         AS avg_bill,
        SUM(CASE WHEN status='cancelled' THEN 1 ELSE 0 END)                        AS cancelled_count,
        SUM(CASE WHEN status='draft'     THEN 1 ELSE 0 END)                        AS draft_count,
        COALESCE(SUM(CASE WHEN order_type LIKE 'Dine-in%'  AND status='completed' THEN grand_total ELSE 0 END),0)  AS dinein_sales,
        COALESCE(SUM(CASE WHEN order_type LIKE 'Takeaway%' AND status='completed' THEN grand_total ELSE 0 END),0)  AS takeaway_sales,
        COALESCE(SUM(CASE WHEN order_type LIKE 'Delivery%' AND status='completed' THEN grand_total ELSE 0 END),0)  AS delivery_sales,
        SUM(CASE WHEN order_type LIKE 'Dine-in%'  AND status='completed' THEN 1 ELSE 0 END) AS dinein_count,
        SUM(CASE WHEN order_type LIKE 'Takeaway%' AND status='completed' THEN 1 ELSE 0 END) AS takeaway_count,
        SUM(CASE WHEN order_type LIKE 'Delivery%' AND status='completed' THEN 1 ELSE 0 END) AS delivery_count,
        COALESCE(SUM(delivery_charge),0)  AS total_delivery_charge,
        COALESCE(SUM(discount_amount),0)  AS total_discount
       FROM bills WHERE ${dateFilter}`
    );

    // ── Chart data ──
    const [chartData] = await pool.execute(
      `SELECT ${chartGroupBy} AS grp,
              COALESCE(SUM(grand_total),0) AS total,
              COUNT(*) AS bill_count
       FROM bills WHERE ${dateFilter} AND status='completed'
       GROUP BY grp ORDER BY grp ASC`
    );

    // ── Top 10 items ──
    const [topItems] = await pool.execute(
      `SELECT bi.item_name, bi.item_code,
              SUM(bi.quantity) AS qty,
              SUM(bi.line_total) AS revenue
       FROM bill_items bi
       JOIN bills b ON bi.bill_id=b.bill_id
       WHERE ${dateFilter} AND b.status='completed'
       GROUP BY bi.item_name, bi.item_code ORDER BY qty DESC LIMIT 10`
    );

    // ── Peak hours ──
    const [peakHours] = await pool.execute(
      `SELECT HOUR(created_at) AS hour, COUNT(*) AS bill_count, COALESCE(SUM(grand_total),0) AS sales
       FROM bills WHERE ${dateFilter} AND status='completed'
       GROUP BY HOUR(created_at) ORDER BY bill_count DESC LIMIT 8`
    );

    // ── Staff performance ──
    const [staffPerf] = await pool.execute(
      `SELECT u.full_name, COUNT(*) AS bills_taken, COALESCE(SUM(b.grand_total),0) AS sales,
              COALESCE(AVG(b.grand_total),0) AS avg_bill
       FROM bills b JOIN users u ON b.created_by=u.id
       WHERE ${dateFilter} AND b.status='completed'
       GROUP BY u.id, u.full_name ORDER BY bills_taken DESC`
    );

    // ── Recent 10 bills ──
    const [recentBills] = await pool.execute(
      `SELECT b.bill_id, b.bill_number, b.token_number, b.customer_name, b.customer_phone,
              b.grand_total, b.order_type, b.status, b.created_at, u.full_name AS cashier_name
       FROM bills b LEFT JOIN users u ON b.created_by=u.id
       WHERE ${dateFilter}
       ORDER BY b.created_at DESC LIMIT 10`
    );

    // ── Comparison: previous same period ──
    let prevFilter;
    switch (period) {
      case 'yesterday': {
        const p = new Date(now); p.setDate(p.getDate() - 2);
        prevFilter = `DATE(created_at) = '${p.toISOString().split('T')[0]}'`;
        break;
      }
      case 'week':  prevFilter = `created_at >= DATE_SUB(NOW(), INTERVAL 14 DAY) AND created_at < DATE_SUB(NOW(), INTERVAL 7 DAY)`; break;
      case 'month': prevFilter = `MONTH(created_at)=MONTH(DATE_SUB(NOW(), INTERVAL 1 MONTH)) AND YEAR(created_at)=YEAR(DATE_SUB(NOW(), INTERVAL 1 MONTH))`; break;
      case 'year':  prevFilter = `YEAR(created_at)=YEAR(NOW())-1`; break;
      default:      prevFilter = `DATE(created_at) = DATE_SUB('${todayStr}', INTERVAL 1 DAY)`;
    }
    const [prevSales] = await pool.execute(
      `SELECT COALESCE(SUM(grand_total),0) AS total, COUNT(*) AS bill_count
       FROM bills WHERE ${prevFilter} AND status='completed'`
    );

    // ── Global constants ──
    const [staffCount] = await pool.execute("SELECT COUNT(*) AS count FROM users WHERE status='active'");
    const [menuCount]  = await pool.execute("SELECT COUNT(*) AS count FROM menu WHERE is_active=1");

    res.json({
      period,
      total_sales:    parseFloat(sales[0].total),
      bill_count:     parseInt(sales[0].bill_count),
      avg_bill:       parseFloat(sales[0].avg_bill),
      cancelled_count:parseInt(sales[0].cancelled_count),
      draft_count:    parseInt(sales[0].draft_count),
      dinein_sales:   parseFloat(sales[0].dinein_sales),
      takeaway_sales: parseFloat(sales[0].takeaway_sales),
      delivery_sales: parseFloat(sales[0].delivery_sales),
      dinein_count:   parseInt(sales[0].dinein_count),
      takeaway_count: parseInt(sales[0].takeaway_count),
      delivery_count: parseInt(sales[0].delivery_count),
      total_delivery_charge: parseFloat(sales[0].total_delivery_charge),
      total_discount: parseFloat(sales[0].total_discount),
      prev_sales:     parseFloat(prevSales[0].total),
      prev_bills:     parseInt(prevSales[0].bill_count),
      staff_count:    parseInt(staffCount[0].count),
      menu_count:     parseInt(menuCount[0].count),
      chart_data:     chartData,
      chart_label:    chartLabel,
      top_items:      topItems,
      peak_hours:     peakHours,
      staff_perf:     staffPerf,
      recent_bills:   recentBills,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
