const express = require('express');
const router = express.Router();
const { pool } = require('../db/connection');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

// Helper: get current IST date string (YYYY-MM-DD)
function getISTDateStr(offset = 0) {
  const now = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  if (offset) now.setDate(now.getDate() + offset);
  return now.toISOString().split('T')[0];
}
const IST_CREATED = "CONVERT_TZ(b.created_at,'+00:00','+05:30')";

router.get('/stats', async (req, res) => {
  try {
    // ── Date range from query params ──
    const period = req.query.period || 'today'; // today | week | month | year | custom
    const customFrom = req.query.from || null;
    const customTo   = req.query.to   || null;
    const fromTime   = req.query.from_time || null;
    const toTime     = req.query.to_time || null;

    let dateFilter, chartGroupBy, chartInterval, chartLabel;

    const todayStr = getISTDateStr();

    switch (period) {
      case 'yesterday': {
        const yStr = getISTDateStr(-1);
        dateFilter = `DATE(${IST_CREATED}) = '${yStr}'`;
        chartGroupBy = `HOUR(${IST_CREATED})`;
        chartInterval = 24;
        chartLabel = 'hour';
        break;
      }
      case 'week': {
        dateFilter = `DATE(${IST_CREATED}) >= DATE_SUB('${todayStr}', INTERVAL 6 DAY)`;
        chartGroupBy = `DATE(${IST_CREATED})`;
        chartInterval = 7;
        chartLabel = 'day';
        break;
      }
      case 'month': {
        dateFilter = `MONTH(${IST_CREATED})=MONTH('${todayStr}') AND YEAR(${IST_CREATED})=YEAR('${todayStr}')`;
        chartGroupBy = `DATE(${IST_CREATED})`;
        chartInterval = 30;
        chartLabel = 'day';
        break;
      }
      case 'year': {
        dateFilter = `YEAR(${IST_CREATED})=YEAR('${todayStr}')`;
        chartGroupBy = `MONTH(${IST_CREATED})`;
        chartInterval = 12;
        chartLabel = 'month';
        break;
      }
      case 'custom': {
        const f = customFrom || todayStr;
        const t = customTo   || todayStr;
        dateFilter = `DATE(${IST_CREATED}) BETWEEN '${f}' AND '${t}'`;
        chartGroupBy = `DATE(${IST_CREATED})`;
        chartInterval = null;
        chartLabel = 'day';
        break;
      }
      default: { // today
        dateFilter = `DATE(${IST_CREATED}) = '${todayStr}'`;
        chartGroupBy = `HOUR(${IST_CREATED})`;
        chartInterval = 24;
        chartLabel = 'hour';
      }
    }

    if (fromTime) dateFilter += ` AND TIME(${IST_CREATED}) >= '${fromTime}:00'`;
    if (toTime) dateFilter += ` AND TIME(${IST_CREATED}) <= '${toTime}:59'`;

    // ── Core sales + type breakdown ──
    const [sales] = await pool.execute(
      `SELECT
        COALESCE(SUM(CASE WHEN status='completed' THEN grand_total ELSE 0 END),0)  AS total,
        COUNT(CASE WHEN status='completed' THEN 1 END)                              AS bill_count,
        COALESCE(AVG(CASE WHEN status='completed' THEN grand_total END),0)         AS avg_bill,
        SUM(CASE WHEN status='cancelled' THEN 1 ELSE 0 END)                        AS cancelled_count,
        COALESCE(SUM(CASE WHEN status='cancelled' THEN grand_total ELSE 0 END),0)  AS cancelled_earnings,
        SUM(CASE WHEN status='draft'     THEN 1 ELSE 0 END)                        AS draft_count,
        COALESCE(SUM(CASE WHEN order_type LIKE 'Dine-in%'  AND status='completed' THEN grand_total ELSE 0 END),0)  AS dinein_sales,
        COALESCE(SUM(CASE WHEN order_type LIKE 'Takeaway%' AND status='completed' THEN grand_total ELSE 0 END),0)  AS takeaway_sales,
        COALESCE(SUM(CASE WHEN order_type LIKE 'Delivery%' AND status='completed' THEN grand_total ELSE 0 END),0)  AS delivery_sales,
        SUM(CASE WHEN order_type LIKE 'Dine-in%'  AND status='completed' THEN 1 ELSE 0 END) AS dinein_count,
        SUM(CASE WHEN order_type LIKE 'Takeaway%' AND status='completed' THEN 1 ELSE 0 END) AS takeaway_count,
        SUM(CASE WHEN order_type LIKE 'Delivery%' AND status='completed' THEN 1 ELSE 0 END) AS delivery_count,
        COALESCE(SUM(CASE WHEN status='completed' THEN delivery_charge ELSE 0 END),0) AS total_delivery_charge,
        COALESCE(SUM(CASE WHEN status='completed' THEN discount_amount ELSE 0 END),0) AS total_discount
       FROM bills b WHERE ${dateFilter}`
    );

    // ── Chart data ──
    const [chartData] = await pool.execute(
      `SELECT ${chartGroupBy} AS grp,
              COALESCE(SUM(grand_total),0) AS total,
              COUNT(*) AS bill_count
       FROM bills b WHERE ${dateFilter} AND status='completed'
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

    // ── Peak hours (IST) ──
    const [peakHours] = await pool.execute(
      `SELECT HOUR(${IST_CREATED}) AS hour, COUNT(*) AS bill_count, COALESCE(SUM(grand_total),0) AS sales
       FROM bills b WHERE ${dateFilter} AND status='completed'
       GROUP BY HOUR(${IST_CREATED}) ORDER BY bill_count DESC LIMIT 8`
    );

    // ── Staff performance ──
    const [staffPerf] = await pool.execute(
      `SELECT u.full_name, COUNT(*) AS bills_taken, COALESCE(SUM(b.grand_total),0) AS sales,
              COALESCE(AVG(b.grand_total),0) AS avg_bill
       FROM bills b JOIN users u ON b.created_by=u.id
       WHERE ${dateFilter} AND b.status='completed'
       GROUP BY u.id, u.full_name ORDER BY bills_taken DESC`
    );

    // ── Delivery boy performance (admin dashboard) ──
    const [deliveryPerf] = await pool.execute(
      `SELECT u.id, u.full_name,
              COUNT(*) AS total_deliveries,
              SUM(CASE WHEN b.delivery_status='delivered' THEN 1 ELSE 0 END) AS completed,
              SUM(CASE WHEN b.delivery_status IN ('pending','preparing','ready','picked_up') THEN 1 ELSE 0 END) AS active,
              COALESCE(SUM(b.cash_collected),0) AS cash_collected,
              COALESCE(SUM(b.upi_collected),0) AS upi_collected,
              COALESCE(SUM(b.cash_collected + b.upi_collected),0) AS total_collected
       FROM bills b JOIN users u ON b.delivered_by=u.id
       WHERE ${dateFilter} AND b.status='completed'
         AND (b.order_type LIKE '%Delivery%' OR b.order_type LIKE '%Takeaway%')
       GROUP BY u.id, u.full_name ORDER BY total_deliveries DESC`
    );

    // ── Recent 10 bills ──
    const [recentBills] = await pool.execute(
      `SELECT b.bill_id, b.bill_number, b.token_number, b.customer_name, b.customer_phone,
              b.grand_total, b.order_type, b.status, b.created_at, u.full_name AS cashier_name
       FROM bills b LEFT JOIN users u ON b.created_by=u.id
       WHERE ${dateFilter}
       ORDER BY b.created_at DESC LIMIT 10`
    );

    // ── Comparison: previous same period (IST) ──
    let prevFilter;
    switch (period) {
      case 'yesterday': {
        const pStr = getISTDateStr(-2);
        prevFilter = `DATE(${IST_CREATED}) = '${pStr}'`;
        break;
      }
      case 'week':  prevFilter = `DATE(${IST_CREATED}) >= DATE_SUB('${todayStr}', INTERVAL 13 DAY) AND DATE(${IST_CREATED}) < DATE_SUB('${todayStr}', INTERVAL 6 DAY)`; break;
      case 'month': prevFilter = `MONTH(${IST_CREATED})=MONTH(DATE_SUB('${todayStr}', INTERVAL 1 MONTH)) AND YEAR(${IST_CREATED})=YEAR(DATE_SUB('${todayStr}', INTERVAL 1 MONTH))`; break;
      case 'year':  prevFilter = `YEAR(${IST_CREATED})=YEAR('${todayStr}')-1`; break;
      default:      prevFilter = `DATE(${IST_CREATED}) = DATE_SUB('${todayStr}', INTERVAL 1 DAY)`;
    }
    const [prevSales] = await pool.execute(
      `SELECT COALESCE(SUM(grand_total),0) AS total, COUNT(*) AS bill_count
       FROM bills b WHERE ${prevFilter} AND status='completed'`
    );

    // ── Global constants ──
    const [staffCount] = await pool.execute("SELECT COUNT(*) AS count FROM users WHERE status='active'");
    const [menuCount]  = await pool.execute("SELECT COUNT(*) AS count FROM menu WHERE is_active=1");

    res.json({
      period,
      total_sales:          parseFloat(sales[0].total),
      cancelled_earnings:   parseFloat(sales[0].cancelled_earnings),
      bill_count:           parseInt(sales[0].bill_count),
      avg_bill:             parseFloat(sales[0].avg_bill),
      cancelled_count:      parseInt(sales[0].cancelled_count),
      draft_count:          parseInt(sales[0].draft_count),
      dinein_sales:         parseFloat(sales[0].dinein_sales),
      takeaway_sales:       parseFloat(sales[0].takeaway_sales),
      delivery_sales:       parseFloat(sales[0].delivery_sales),
      dinein_count:         parseInt(sales[0].dinein_count),
      takeaway_count:       parseInt(sales[0].takeaway_count),
      delivery_count:       parseInt(sales[0].delivery_count),
      total_delivery_charge:parseFloat(sales[0].total_delivery_charge),
      total_discount:       parseFloat(sales[0].total_discount),
      prev_sales:           parseFloat(prevSales[0].total),
      prev_bills:           parseInt(prevSales[0].bill_count),
      staff_count:          parseInt(staffCount[0].count),
      menu_count:           parseInt(menuCount[0].count),
      chart_data:           chartData,
      chart_label:          chartLabel,
      top_items:            topItems,
      peak_hours:           peakHours,
      staff_perf:           staffPerf,
      delivery_perf:        deliveryPerf,
      recent_bills:         recentBills,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Item Sales full report ──
router.get('/item-sales', async (req, res) => {
  try {
    const period = req.query.period || 'today';
    const customFrom = req.query.from || null;
    const customTo   = req.query.to   || null;
    const fromTime   = req.query.from_time || null;
    const toTime     = req.query.to_time || null;
    
    let dateFilter;
    const todayStr = getISTDateStr();

    switch (period) {
      case 'yesterday': dateFilter = `DATE(${IST_CREATED}) = '${getISTDateStr(-1)}'`; break;
      case 'week':      dateFilter = `DATE(${IST_CREATED}) >= DATE_SUB('${todayStr}', INTERVAL 6 DAY)`; break;
      case 'month':     dateFilter = `MONTH(${IST_CREATED})=MONTH('${todayStr}') AND YEAR(${IST_CREATED})=YEAR('${todayStr}')`; break;
      case 'year':      dateFilter = `YEAR(${IST_CREATED})=YEAR('${todayStr}')`; break;
      case 'custom':    dateFilter = `DATE(${IST_CREATED}) BETWEEN '${customFrom || todayStr}' AND '${customTo || todayStr}'`; break;
      case 'all':       dateFilter = `1=1`; break;
      default:          dateFilter = `DATE(${IST_CREATED}) = '${todayStr}'`;
    }

    if (fromTime) dateFilter += ` AND TIME(${IST_CREATED}) >= '${fromTime}:00'`;
    if (toTime) dateFilter += ` AND TIME(${IST_CREATED}) <= '${toTime}:59'`;
    if (req.query.day) {
      dateFilter += ` AND DAYOFWEEK(${IST_CREATED}) = ${parseInt(req.query.day)}`;
    }

    const sql = `
      SELECT bi.item_name, bi.item_code, m.category,
             SUM(bi.quantity) AS qty,
             SUM(bi.line_total) AS revenue
      FROM bill_items bi
      JOIN bills b ON bi.bill_id = b.bill_id
      LEFT JOIN menu m ON bi.item_code = m.item_code
      WHERE ${dateFilter} AND b.status = 'completed'
      GROUP BY bi.item_name, bi.item_code, m.category
      ORDER BY qty DESC
    `;
    const [items] = await pool.execute(sql);
    res.json({ items });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Personal Delivery Boy Dashboard ──
router.get('/delivery-stats', async (req, res) => {
  try {
    const userId = req.user.id;
    const todayStr = getISTDateStr();
    const dateFilter = `DATE(${IST_CREATED}) = '${todayStr}'`;

    const [stats] = await pool.execute(
      `SELECT
        COUNT(*) AS total_assigned,
        SUM(CASE WHEN b.delivery_status='delivered' THEN 1 ELSE 0 END) AS delivered,
        SUM(CASE WHEN b.delivery_status IN ('pending','preparing','ready','picked_up') THEN 1 ELSE 0 END) AS pending,
        COALESCE(SUM(CASE WHEN b.delivery_status='delivered' THEN b.cash_collected ELSE 0 END),0) AS cash_collected,
        COALESCE(SUM(CASE WHEN b.delivery_status='delivered' THEN b.upi_collected ELSE 0 END),0) AS upi_collected,
        COALESCE(SUM(CASE WHEN b.delivery_status='delivered' THEN b.cash_collected + b.upi_collected ELSE 0 END),0) AS total_collected
       FROM bills b
       WHERE ${dateFilter}
         AND (b.assigned_delivery_boy = ? OR b.delivered_by = ?)
         AND b.status='completed'
         AND (b.order_type LIKE '%Delivery%' OR b.order_type LIKE '%Takeaway%')`,
      [userId, userId]
    );

    const [recentDeliveries] = await pool.execute(
      `SELECT b.bill_id, b.bill_number, b.token_number, b.token_prefix,
              b.customer_name, b.customer_phone, b.delivery_address, b.order_type,
              b.grand_total, b.delivery_status, b.cash_collected, b.upi_collected, b.created_at
       FROM bills b
       WHERE ${dateFilter}
         AND (b.assigned_delivery_boy = ? OR b.delivered_by = ?)
         AND b.status='completed'
       ORDER BY b.created_at DESC LIMIT 20`,
      [userId, userId]
    );

    res.json({
      stats: stats[0],
      recent_deliveries: recentDeliveries
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
