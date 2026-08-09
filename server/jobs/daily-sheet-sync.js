const { google } = require('googleapis');
const { pool } = require('../db/connection');

async function syncDailyToSheets(targetDate = null) {
  try {
    const serviceAccountKeyStr = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;

    if (!serviceAccountKeyStr || !spreadsheetId) {
      console.warn('⚠️ Google Sheets Sync Skipped: Missing GOOGLE_SERVICE_ACCOUNT_KEY or GOOGLE_SHEET_ID in .env');
      return { success: false, error: 'Missing credentials in .env' };
    }

    const credentials = JSON.parse(serviceAccountKeyStr);
    
    // Fix for Vercel/Env Parsers double-escaping newlines
    if (credentials.private_key) {
      credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
    }

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });

    // Target Date
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istNow = new Date(now.getTime() + istOffset);
    const date = targetDate || istNow.toISOString().split('T')[0];

    // 1. Create a new sheet (tab) for the day
    let sheetId;
    try {
      const addSheetRes = await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        resource: {
          requests: [{
            addSheet: {
              properties: {
                title: date
              }
            }
          }]
        }
      });
      sheetId = addSheetRes.data.replies[0].addSheet.properties.sheetId;
    } catch (e) {
      if (e.message.includes('already exists')) {
        console.log(`Sheet for ${date} already exists. Overwriting/Appending...`);
        // Note: For simplicity, we just append to existing if it exists, or could clear it first.
        // Let's clear the existing sheet to prevent duplicate data
        await sheets.spreadsheets.values.clear({
          spreadsheetId,
          range: `'${date}'!A1:Z1000`,
        });
      } else {
        throw e;
      }
    }

    // ── Fetch Data (Same logic as Excel Export) ──
    const [bills] = await pool.execute(`
      SELECT
        b.bill_id,
        CONCAT(CASE WHEN b.token_prefix='T' THEN 'DIN' ELSE IFNULL(b.token_prefix,'DIN') END, LPAD(b.token_number,3,'0')) AS token,
        b.bill_number,
        IFNULL(b.customer_name,'Walk-in') AS customer_name,
        IFNULL(b.customer_phone,'—') AS customer_phone,
        IFNULL(b.order_type,'Dine-in') AS order_type,
        b.status,
        b.grand_total,
        COALESCE(b.cash_collected,0) AS cash_collected,
        COALESCE(b.upi_collected,0) AS upi_collected,
        CASE
          WHEN b.status='cancelled' THEN 'Cancelled'
          WHEN (COALESCE(b.cash_collected,0)+COALESCE(b.upi_collected,0)) <= 0 THEN 'Unpaid'
          WHEN (COALESCE(b.cash_collected,0)+COALESCE(b.upi_collected,0)) > (b.grand_total+0.005) THEN 'Overpaid'
          WHEN (COALESCE(b.cash_collected,0)+COALESCE(b.upi_collected,0)) >= (b.grand_total-0.005) THEN 'Paid'
          ELSE 'Partial'
        END AS payment_status,
        IFNULL(u.full_name,'—') AS cashier,
        DATE_FORMAT(CONVERT_TZ(b.created_at,'+00:00','+05:30'),'%Y-%m-%d %H:%i:%s') AS created_at_ist
      FROM bills b
      LEFT JOIN users u ON b.created_by = u.id
      WHERE DATE(CONVERT_TZ(b.created_at,'+00:00','+05:30')) = ?
      ORDER BY b.created_at ASC
    `, [date]);

    const ordersHeader = ['Token', 'Bill No', 'Customer', 'Phone', 'Order Type', 'Status', 'Grand Total (₹)', 'Cash (₹)', 'UPI (₹)', 'Payment Status', 'Cashier', 'Time (IST)'];
    const ordersRows = bills.map(b => [b.token, b.bill_number, b.customer_name, b.customer_phone, b.order_type, b.status, +b.grand_total, +b.cash_collected, +b.upi_collected, b.payment_status, b.cashier, b.created_at_ist]);

    const [pSummary] = await pool.execute(`
      SELECT
        COUNT(CASE WHEN status='completed' THEN 1 END) AS completed_orders,
        ROUND(SUM(CASE WHEN status='completed' THEN grand_total ELSE 0 END),2) AS gross_revenue,
        ROUND(SUM(CASE WHEN status='completed' THEN COALESCE(cash_collected,0) ELSE 0 END),2) AS total_cash,
        ROUND(SUM(CASE WHEN status='completed' THEN COALESCE(upi_collected,0) ELSE 0 END),2) AS total_upi,
        ROUND(SUM(CASE WHEN status='completed' AND (COALESCE(cash_collected,0)+COALESCE(upi_collected,0)) < (grand_total-0.005) THEN grand_total-(COALESCE(cash_collected,0)+COALESCE(upi_collected,0)) ELSE 0 END),2) AS total_pending
      FROM bills
      WHERE DATE(CONVERT_TZ(created_at,'+00:00','+05:30')) = ?
    `, [date]);
    const ps = pSummary[0];
    
    const summaryData = [
      ['Date', date],
      ['Completed Orders', +ps.completed_orders],
      ['Gross Revenue (₹)', +ps.gross_revenue],
      ['Total Cash (₹)', +ps.total_cash],
      ['Total UPI (₹)', +ps.total_upi],
      ['Pending Due (₹)', +ps.total_pending]
    ];

    const values = [
      ['--- PAYMENT SUMMARY ---'],
      ...summaryData,
      [],
      ['--- ORDERS ---'],
      ordersHeader,
      ...ordersRows
    ];

    // Append to sheet
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `'${date}'!A1`,
      valueInputOption: 'USER_ENTERED',
      resource: { values },
    });

    console.log(`✅ Successfully synced data for ${date} to Google Sheets`);
    return { success: true, date };

  } catch (err) {
    console.error('❌ Google Sheets Sync Error:', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = { syncDailyToSheets };
