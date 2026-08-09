const express = require('express');
const router = express.Router();
const { pool } = require('../db/connection');
const { authenticateToken } = require('../middleware/auth');
const XLSX = require('xlsx');

router.use(authenticateToken);

// ── Helper: column widths ──
function colWidths(cols) {
  return cols.map(w => ({ wch: w }));
}

// ── Helper: header style (xlsx-style not available in base xlsx, use plain headers) ──
function makeRow(arr) { return arr; }

// ─────────────────────────────────────────────────────────────
// GET /api/export/daily?date=YYYY-MM-DD
// Downloads a multi-sheet Excel workbook for the given date.
// ─────────────────────────────────────────────────────────────
router.get('/daily', async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'staff') {
      return res.status(403).json({ error: 'Admin/Staff access only' });
    }

    const now = new Date();
    // Convert to IST for "today" default
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istNow = new Date(now.getTime() + istOffset);
    const defaultDate = istNow.toISOString().split('T')[0];
    const date = req.query.date || defaultDate;

    // ── Sheet 1: Orders Summary ──────────────────────────────
    const [bills] = await pool.execute(`
      SELECT
        b.bill_id,
        CONCAT(CASE WHEN b.token_prefix='T' THEN 'DIN' ELSE IFNULL(b.token_prefix,'DIN') END,
               LPAD(b.token_number,3,'0'))                          AS token,
        b.bill_number,
        IFNULL(b.customer_name,'Walk-in')                           AS customer_name,
        IFNULL(b.customer_phone,'—')                                AS customer_phone,
        IFNULL(b.order_type,'Dine-in')                              AS order_type,
        IFNULL(b.delivery_address,'—')                              AS delivery_address,
        b.status,
        b.subtotal,
        COALESCE(b.delivery_charge,0)                               AS delivery_charge,
        COALESCE(b.discount_amount,0)                               AS discount,
        b.grand_total,
        COALESCE(b.cash_collected,0)                                AS cash_collected,
        COALESCE(b.upi_collected,0)                                 AS upi_collected,
        ROUND(COALESCE(b.cash_collected,0)+COALESCE(b.upi_collected,0),2) AS total_collected,
        ROUND(b.grand_total - (COALESCE(b.cash_collected,0)+COALESCE(b.upi_collected,0)),2) AS balance,
        CASE
          WHEN b.status='cancelled' THEN 'Cancelled'
          WHEN (COALESCE(b.cash_collected,0)+COALESCE(b.upi_collected,0)) <= 0 THEN 'Unpaid'
          WHEN (COALESCE(b.cash_collected,0)+COALESCE(b.upi_collected,0)) > (b.grand_total+0.005)
            THEN CONCAT('Overpaid +₹', ROUND((COALESCE(b.cash_collected,0)+COALESCE(b.upi_collected,0))-b.grand_total,2))
          WHEN (COALESCE(b.cash_collected,0)+COALESCE(b.upi_collected,0)) >= (b.grand_total-0.005) THEN 'Paid'
          ELSE CONCAT('Partial -₹', ROUND(b.grand_total-(COALESCE(b.cash_collected,0)+COALESCE(b.upi_collected,0)),2))
        END                                                         AS payment_status,
        CASE WHEN b.change_settled=1 THEN 'Yes' ELSE 'No' END      AS change_settled,
        IFNULL(u.full_name,'—')                                     AS cashier,
        IFNULL(du.full_name,'—')                                    AS delivered_by,
        DATE_FORMAT(CONVERT_TZ(b.created_at,'+00:00','+05:30'),'%Y-%m-%d %H:%i:%s') AS created_at_ist,
        DATE_FORMAT(CONVERT_TZ(b.delivered_at,'+00:00','+05:30'),'%Y-%m-%d %H:%i:%s') AS delivered_at_ist
      FROM bills b
      LEFT JOIN users u  ON b.created_by   = u.id
      LEFT JOIN users du ON b.delivered_by  = du.id
      WHERE DATE(CONVERT_TZ(b.created_at,'+00:00','+05:30')) = ?
      ORDER BY b.created_at ASC
    `, [date]);

    const ordersHeader = [
      'Token','Bill No','Customer','Phone','Order Type','Address',
      'Status','Subtotal (₹)','Delivery (₹)','Discount (₹)','Grand Total (₹)',
      'Cash (₹)','UPI (₹)','Total Collected (₹)','Balance (₹)',
      'Payment Status','Change Settled','Cashier','Delivered By',
      'Order Time (IST)','Delivered At (IST)'
    ];

    const ordersRows = bills.map(b => [
      b.token, b.bill_number, b.customer_name, b.customer_phone, b.order_type, b.delivery_address,
      b.status, +b.subtotal, +b.delivery_charge, +b.discount, +b.grand_total,
      +b.cash_collected, +b.upi_collected, +b.total_collected,
      +b.balance, b.payment_status, b.change_settled, b.cashier, b.delivered_by,
      b.created_at_ist, b.delivered_at_ist
    ]);

    // ── Sheet 2: Order Items Detail ──────────────────────────
    const [items] = await pool.execute(`
      SELECT
        CONCAT(CASE WHEN b.token_prefix='T' THEN 'DIN' ELSE IFNULL(b.token_prefix,'DIN') END,
               LPAD(b.token_number,3,'0'))                          AS token,
        b.bill_number,
        IFNULL(b.customer_name,'Walk-in')                           AS customer_name,
        IFNULL(b.order_type,'Dine-in')                              AS order_type,
        bi.item_code,
        bi.item_name,
        bi.quantity,
        bi.unit_price,
        bi.line_total,
        IFNULL(bi.item_note,'—')                                    AS item_note,
        DATE_FORMAT(CONVERT_TZ(b.created_at,'+00:00','+05:30'),'%Y-%m-%d %H:%i:%s') AS order_time_ist
      FROM bill_items bi
      JOIN bills b ON bi.bill_id = b.bill_id
      WHERE DATE(CONVERT_TZ(b.created_at,'+00:00','+05:30')) = ?
        AND b.status = 'completed'
      ORDER BY b.created_at ASC, bi.id ASC
    `, [date]);

    const itemsHeader = [
      'Token','Bill No','Customer','Order Type','Item Code','Item Name',
      'Qty','Unit Price (₹)','Line Total (₹)','Note','Order Time (IST)'
    ];
    const itemsRows = items.map(i => [
      i.token, i.bill_number, i.customer_name, i.order_type, i.item_code || '—',
      i.item_name, i.quantity, +i.unit_price, +i.line_total, i.item_note, i.order_time_ist
    ]);

    // ── Sheet 3: Item-wise Sales Aggregation ─────────────────
    const [itemSales] = await pool.execute(`
      SELECT
        bi.item_code,
        bi.item_name,
        COALESCE(mi.category,'—')          AS category,
        SUM(bi.quantity)                   AS total_qty,
        ROUND(SUM(bi.line_total),2)        AS total_revenue,
        ROUND(AVG(bi.unit_price),2)        AS avg_price,
        COUNT(DISTINCT b.bill_id)          AS order_count
      FROM bill_items bi
      JOIN bills b      ON bi.bill_id = b.bill_id
      LEFT JOIN menu mi ON bi.item_code = mi.item_code
      WHERE DATE(CONVERT_TZ(b.created_at,'+00:00','+05:30')) = ?
        AND b.status = 'completed'
      GROUP BY bi.item_code, bi.item_name, mi.category
      ORDER BY total_revenue DESC
    `, [date]);

    const itemSalesHeader = [
      'Item Code','Item Name','Category','Total Qty Sold','Total Revenue (₹)','Avg Price (₹)','Orders Count'
    ];
    const itemSalesRows = itemSales.map(i => [
      i.item_code || '—', i.item_name, i.category,
      +i.total_qty, +i.total_revenue, +i.avg_price, +i.order_count
    ]);

    // ── Sheet 4: Payment Summary ─────────────────────────────
    const [pSummary] = await pool.execute(`
      SELECT
        COUNT(CASE WHEN status='completed' THEN 1 END)   AS completed_orders,
        COUNT(CASE WHEN status='cancelled' THEN 1 END)   AS cancelled_orders,
        ROUND(SUM(CASE WHEN status='completed' THEN grand_total ELSE 0 END),2) AS gross_revenue,
        ROUND(SUM(CASE WHEN status='completed' THEN COALESCE(cash_collected,0) ELSE 0 END),2) AS total_cash,
        ROUND(SUM(CASE WHEN status='completed' THEN COALESCE(upi_collected,0) ELSE 0 END),2)  AS total_upi,
        ROUND(SUM(CASE WHEN status='completed' THEN COALESCE(cash_collected,0)+COALESCE(upi_collected,0) ELSE 0 END),2) AS total_collected,
        ROUND(SUM(CASE WHEN status='completed'
          AND (COALESCE(cash_collected,0)+COALESCE(upi_collected,0)) < (grand_total-0.005)
          THEN grand_total-(COALESCE(cash_collected,0)+COALESCE(upi_collected,0)) ELSE 0 END),2) AS total_pending,
        ROUND(SUM(CASE WHEN status='completed'
          AND (COALESCE(cash_collected,0)+COALESCE(upi_collected,0)) > (grand_total+0.005)
          AND COALESCE(change_settled,0)=0
          THEN (COALESCE(cash_collected,0)+COALESCE(upi_collected,0))-grand_total ELSE 0 END),2) AS change_unsettled,
        ROUND(SUM(CASE WHEN status='completed'
          AND (COALESCE(cash_collected,0)+COALESCE(upi_collected,0)) > (grand_total+0.005)
          AND COALESCE(change_settled,0)=1
          THEN (COALESCE(cash_collected,0)+COALESCE(upi_collected,0))-grand_total ELSE 0 END),2) AS change_settled_total,
        ROUND(SUM(CASE WHEN status='cancelled' THEN grand_total ELSE 0 END),2) AS cancelled_value
      FROM bills
      WHERE DATE(CONVERT_TZ(created_at,'+00:00','+05:30')) = ?
    `, [date]);

    const ps = pSummary[0];
    const paymentSummaryRows = [
      ['Metric', 'Value'],
      ['Date', date],
      ['Completed Orders', +ps.completed_orders],
      ['Cancelled Orders', +ps.cancelled_orders],
      ['Gross Revenue (₹)', +ps.gross_revenue],
      ['Total Cash Collected (₹)', +ps.total_cash],
      ['Total UPI Collected (₹)', +ps.total_upi],
      ['Total Collected (₹)', +ps.total_collected],
      ['Pending / Unpaid Balance (₹)', +ps.total_pending],
      ['Unsettled Change Due (₹)', +ps.change_unsettled],
      ['Settled Change Total (₹)', +ps.change_settled_total],
      ['Cancelled Orders Value (₹)', +ps.cancelled_value],
    ];

    // ── Sheet 5: Delivery Boys Performance ───────────────────
    const [drivers] = await pool.execute(`
      SELECT
        u.full_name                                                   AS driver_name,
        COUNT(b.bill_id)                                              AS orders_delivered,
        ROUND(SUM(COALESCE(b.cash_collected,0)),2)                   AS cash_collected,
        ROUND(SUM(COALESCE(b.upi_collected,0)),2)                    AS upi_collected,
        ROUND(SUM(COALESCE(b.cash_collected,0)+COALESCE(b.upi_collected,0)),2) AS total_collected,
        ROUND(SUM(b.grand_total),2)                                   AS total_billed,
        ROUND(SUM(CASE
          WHEN (COALESCE(b.cash_collected,0)+COALESCE(b.upi_collected,0)) > (b.grand_total+0.005)
          THEN (COALESCE(b.cash_collected,0)+COALESCE(b.upi_collected,0))-b.grand_total
          ELSE 0
        END),2)                                                        AS change_given,
        ROUND(SUM(CASE
          WHEN (COALESCE(b.cash_collected,0)+COALESCE(b.upi_collected,0)) < (b.grand_total-0.005)
          THEN b.grand_total-(COALESCE(b.cash_collected,0)+COALESCE(b.upi_collected,0))
          ELSE 0
        END),2)                                                        AS shortfall
      FROM bills b
      JOIN users u ON b.delivered_by = u.id
      WHERE DATE(CONVERT_TZ(b.created_at,'+00:00','+05:30')) = ?
        AND b.status = 'completed'
        AND b.delivery_status = 'delivered'
      GROUP BY b.delivered_by, u.full_name
      ORDER BY total_collected DESC
    `, [date]);

    const driversHeader = [
      'Driver Name','Orders Delivered','Cash Collected (₹)','UPI Collected (₹)',
      'Total Collected (₹)','Total Billed (₹)','Change Given Out (₹)','Shortfall (₹)'
    ];
    const driversRows = drivers.map(d => [
      d.driver_name, +d.orders_delivered, +d.cash_collected, +d.upi_collected,
      +d.total_collected, +d.total_billed, +d.change_given, +d.shortfall
    ]);

    // ── Build Workbook ───────────────────────────────────────
    const wb = XLSX.utils.book_new();

    // Sheet 1 – Orders Summary
    const ws1 = XLSX.utils.aoa_to_sheet([ordersHeader, ...ordersRows]);
    ws1['!cols'] = colWidths([8,16,18,14,16,24,12,10,10,10,12,10,10,12,10,22,12,16,16,22,22]);
    XLSX.utils.book_append_sheet(wb, ws1, 'Orders Summary');

    // Sheet 2 – Order Items Detail
    const ws2 = XLSX.utils.aoa_to_sheet([itemsHeader, ...itemsRows]);
    ws2['!cols'] = colWidths([8,16,18,16,12,28,6,12,12,20,22]);
    XLSX.utils.book_append_sheet(wb, ws2, 'Order Items Detail');

    // Sheet 3 – Item Sales
    const ws3 = XLSX.utils.aoa_to_sheet([itemSalesHeader, ...itemSalesRows]);
    ws3['!cols'] = colWidths([12,30,16,12,16,12,12]);
    XLSX.utils.book_append_sheet(wb, ws3, 'Item-wise Sales');

    // Sheet 4 – Payment Summary
    const ws4 = XLSX.utils.aoa_to_sheet(paymentSummaryRows);
    ws4['!cols'] = colWidths([32,18]);
    XLSX.utils.book_append_sheet(wb, ws4, 'Payment Summary');

    // Sheet 5 – Delivery Boys
    const ws5 = drivers.length
      ? XLSX.utils.aoa_to_sheet([driversHeader, ...driversRows])
      : XLSX.utils.aoa_to_sheet([driversHeader, ['No delivery data for this date']]);
    ws5['!cols'] = colWidths([20,14,16,16,18,16,18,14]);
    XLSX.utils.book_append_sheet(wb, ws5, 'Delivery Performance');

    // ── Write & send ─────────────────────────────────────────
    const filename = `FireAndFlavour_${date}.xlsx`;
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);

  } catch (err) {
    console.error('Export error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/export/sync-sheets?date=YYYY-MM-DD
// Manually triggers Google Sheets sync for a given date
// ─────────────────────────────────────────────────────────────
router.post('/sync-sheets', async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'staff') {
      return res.status(403).json({ error: 'Admin/Staff access only' });
    }

    const { syncDailyToSheets } = require('../jobs/daily-sheet-sync');
    const date = req.query.date || null;
    
    const result = await syncDailyToSheets(date);
    
    if (result.success) {
      res.json({ success: true, message: `Data for ${result.date} synced to Google Sheets` });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (err) {
    console.error('Export error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
