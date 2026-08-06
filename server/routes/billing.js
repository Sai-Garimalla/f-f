const express = require('express');
const router = express.Router();
const net = require('net');
const { pool } = require('../db/connection');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

// Generate next token number
async function getNextToken() {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [settings] = await conn.execute(
      "SELECT value FROM settings WHERE key_name = 'token_format'"
    );
    const format = settings[0]?.value || 'daily';

    const today = new Date().toISOString().split('T')[0];

    if (format === 'daily') {
      await conn.execute(
        'INSERT INTO token_counter (counter_date, last_token) VALUES (?, 1) ON DUPLICATE KEY UPDATE last_token = last_token + 1',
        [today]
      );
      const [counter] = await conn.execute(
        'SELECT last_token FROM token_counter WHERE counter_date = ?', [today]
      );
      await conn.commit();
      return counter[0].last_token;
    } else {
      // Continuous: use a fixed date key '0000-01-01'
      await conn.execute(
        "INSERT INTO token_counter (counter_date, last_token) VALUES ('0000-01-01', 1) ON DUPLICATE KEY UPDATE last_token = last_token + 1"
      );
      const [counter] = await conn.execute(
        "SELECT last_token FROM token_counter WHERE counter_date = '0000-01-01'"
      );
      await conn.commit();
      return counter[0].last_token;
    }
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// Generate bill number
function generateBillNumber() {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const timeStr = now.getTime().toString().slice(-6);
  return `FF-${dateStr}-${timeStr}`;
}

// ESC/POS printer function
function printToPrinter(ip, port, data) {
  return new Promise((resolve, reject) => {
    if (!ip || !port) return resolve({ skipped: true, reason: 'No printer configured' });
    const client = new net.Socket();
    const timeout = setTimeout(() => {
      client.destroy();
      reject(new Error('Printer connection timeout'));
    }, 5000);

    client.connect(parseInt(port), ip, () => {
      client.write(data, () => {
        clearTimeout(timeout);
        client.destroy();
        resolve({ success: true });
      });
    });

    client.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

// Build ESC/POS Customer Receipt
async function buildCustomerReceipt(bill, items, settings) {
  const ESC = '\x1B';
  const GS = '\x1D';
  const LF = '\n';
  const INIT = ESC + '@';
  const BOLD_ON = ESC + 'E' + '\x01';
  const BOLD_OFF = ESC + 'E' + '\x00';
  const CENTER = ESC + 'a' + '\x01';
  const LEFT = ESC + 'a' + '\x00';
  const DOUBLE_HEIGHT = GS + '!' + '\x11';
  const NORMAL_SIZE = GS + '!' + '\x00';
  const CUT = GS + 'V' + '\x41' + '\x03';

  const pad = (str, len) => String(str).padEnd(len).slice(0, len);
  const padLeft = (str, len) => String(str).padStart(len).slice(-len);
  const line = '-'.repeat(48);

  let receipt = INIT;
  // Print NV Logo 1 (User must upload logo to NV memory via Windows tool)
  receipt += '\x1C\x70\x01\x00' + LF; 
  receipt += CENTER + BOLD_ON + DOUBLE_HEIGHT + (settings.restaurant_name || 'Fire & Flavour') + LF + NORMAL_SIZE + BOLD_OFF;
  receipt += CENTER + (settings.address || '') + LF;
  receipt += CENTER + 'Ph: ' + (settings.phone || '') + LF;
  receipt += LEFT + line + LF;
  receipt += BOLD_ON + 'CUSTOMER RECEIPT' + BOLD_OFF + LF;
  receipt += 'Bill No : ' + bill.bill_number + LF;
  receipt += 'Token   : ' + BOLD_ON + bill.token_number + BOLD_OFF + LF;
  receipt += 'Date    : ' + new Date(bill.created_at).toLocaleDateString('en-IN') + LF;
  receipt += 'Time    : ' + new Date(bill.created_at).toLocaleTimeString('en-IN') + LF;
  receipt += 'Type    : ' + (bill.order_type || 'Dine-in') + LF;
  if (bill.customer_phone) receipt += 'Phone   : ' + bill.customer_phone + LF;
  receipt += line + LF;
  receipt += BOLD_ON + pad('ITEM', 24) + padLeft('QTY', 4) + padLeft('PRICE', 9) + padLeft('AMT', 11) + LF + BOLD_OFF;
  receipt += line + LF;

  for (const item of items) {
    const name = pad(item.item_name, 24);
    const qty = padLeft(item.quantity, 4);
    const price = padLeft(parseFloat(item.unit_price).toFixed(2), 9);
    const amt = padLeft(parseFloat(item.line_total).toFixed(2), 11);
    receipt += name + qty + price + amt + LF;
  }

  receipt += line + LF;
  receipt += pad('Subtotal', 36) + padLeft(parseFloat(bill.subtotal).toFixed(2), 12) + LF;

  if (bill.delivery_enabled) {
    receipt += pad('Delivery', 36) + padLeft(parseFloat(bill.delivery_charge).toFixed(2), 12) + LF;
  }
  if (bill.discount_enabled && bill.discount_amount > 0) {
    const discLabel = `Discount (${bill.discount_type === 'percentage' ? bill.discount_value + '%' : 'Rs ' + bill.discount_value})`;
    receipt += pad(discLabel, 36) + padLeft('-' + parseFloat(bill.discount_amount).toFixed(2), 12) + LF;
  }

  receipt += line + LF;
  receipt += BOLD_ON + pad('GRAND TOTAL', 36) + padLeft(parseFloat(bill.grand_total).toFixed(2), 12) + LF + BOLD_OFF;
  receipt += line + LF;
  receipt += CENTER + (settings.footer || 'Thank you! Visit again.') + LF;
  receipt += LF + LF + LF;
  receipt += CUT;

  return Buffer.from(receipt, 'latin1');
}

// Build ESC/POS Kitchen Order Ticket
async function buildKOT(bill, items, settings) {
  const ESC = '\x1B';
  const GS = '\x1D';
  const LF = '\n';
  const INIT = ESC + '@';
  const BOLD_ON = ESC + 'E' + '\x01';
  const BOLD_OFF = ESC + 'E' + '\x00';
  const CENTER = ESC + 'a' + '\x01';
  const LEFT = ESC + 'a' + '\x00';
  const LARGE = GS + '!' + '\x33';
  const NORMAL = GS + '!' + '\x00';
  const CUT = GS + 'V' + '\x41' + '\x03';
  const line = '='.repeat(32);

  let kot = INIT;
  kot += CENTER + BOLD_ON + (settings.restaurant_name || 'Fire & Flavour') + BOLD_OFF + LF;
  kot += CENTER + BOLD_ON + '*** KITCHEN ORDER ***' + BOLD_OFF + LF;
  kot += CENTER + line + LF;
  kot += CENTER + 'TOKEN' + LF;
  kot += CENTER + LARGE + BOLD_ON + String(bill.token_number) + BOLD_OFF + NORMAL + LF;
  kot += LEFT + line + LF;
  kot += 'Date: ' + new Date(bill.created_at).toLocaleDateString('en-IN') + '  Time: ' + new Date(bill.created_at).toLocaleTimeString('en-IN') + LF;
  kot += 'Type: ' + BOLD_ON + (bill.order_type || 'Dine-in') + BOLD_OFF + LF;
  kot += line + LF;
  kot += BOLD_ON + 'ITEM                         QTY' + LF + BOLD_OFF;
  kot += line + LF;

  for (const item of items) {
    const name = item.item_name.padEnd(25).slice(0, 25);
    const qty = String(item.quantity).padStart(6);
    kot += name + qty + LF;
  }

  kot += line + LF + LF + LF;
  kot += CUT;

  return Buffer.from(kot, 'latin1');
}

// Create bill
router.post('/', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const {
      items, customer_phone, order_type,
      delivery_enabled, delivery_charge,
      discount_enabled, discount_type, discount_value, discount_amount,
      subtotal, grand_total, status, token_number
    } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'Bill must have at least one item.' });
    }

    const token = token_number || await getNextToken();
    const billNumber = generateBillNumber();
    const now = new Date();
    const billStatus = status === 'draft' ? 'draft' : 'completed';

    const [billResult] = await conn.execute(
      `INSERT INTO bills 
       (bill_number, token_number, customer_phone, order_type, subtotal, delivery_enabled, delivery_charge,
        discount_enabled, discount_type, discount_value, discount_amount, grand_total, created_by, created_at, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        billNumber, token, customer_phone || null, order_type || 'Dine-in',
        subtotal, delivery_enabled ? 1 : 0, delivery_charge || 0,
        discount_enabled ? 1 : 0, discount_type || 'fixed', discount_value || 0, discount_amount || 0,
        grand_total, req.user.id, now, billStatus
      ]
    );

    const billId = billResult.insertId;

    for (const item of items) {
      await conn.execute(
        'INSERT INTO bill_items (bill_id, item_code, item_name, quantity, unit_price, line_total, is_manual) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [billId, item.item_code || null, item.item_name, item.quantity, item.unit_price, item.line_total, item.is_manual ? 1 : 0]
      );
    }

    await conn.commit();

    // Fetch settings for printing
    const [settingsRows] = await pool.execute('SELECT key_name, value FROM settings');
    const settings = {};
    settingsRows.forEach(r => { settings[r.key_name] = r.value; });

    const bill = {
      bill_id: billId, bill_number: billNumber, token_number: token,
      customer_phone: customer_phone || null, order_type: order_type || 'Dine-in',
      subtotal, delivery_enabled: delivery_enabled ? 1 : 0, delivery_charge: delivery_charge || 0,
      discount_enabled: discount_enabled ? 1 : 0, discount_type: discount_type || 'fixed',
      discount_value: discount_value || 0, discount_amount: discount_amount || 0,
      grand_total, created_at: now
    };

    // Print
    let printResults = [];
    let receiptB64 = null;
    let kotB64 = null;

    if (billStatus === 'completed') {
      const autoPrintReceipt = settings.auto_print_receipt === '1';
      const autoPrintKOT = settings.auto_print_kot === '1';

      if (autoPrintReceipt) {
        const receiptData = await buildCustomerReceipt(bill, items, settings);
        receiptB64 = Buffer.from(receiptData, 'binary').toString('base64');
        if (settings.customer_printer_ip) {
          try {
            const result = await printToPrinter(settings.customer_printer_ip, settings.customer_printer_port, receiptData);
            printResults.push({ type: 'receipt', ...result });
          } catch (e) {
            printResults.push({ type: 'receipt', error: e.message });
          }
        }
      }

      if (autoPrintKOT) {
        const kotData = await buildKOT(bill, items, settings);
        kotB64 = Buffer.from(kotData, 'binary').toString('base64');
        if (settings.kitchen_printer_ip) {
          try {
            const result = await printToPrinter(settings.kitchen_printer_ip, settings.kitchen_printer_port, kotData);
            printResults.push({ type: 'kot', ...result });
          } catch (e) {
            printResults.push({ type: 'kot', error: e.message });
          }
        }
      }
    } // End if completed

    res.json({ 
      success: true, 
      bill_id: billId, 
      bill_number: billNumber, 
      token_number: token, 
      print_results: printResults, 
      status: billStatus,
      receipt_b64: receiptB64,
      kot_b64: kotB64
    });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    if (conn) conn.release();
  }
});

// Reprint specific document
router.post('/:billId/reprint', async (req, res) => {
  try {
    const { type } = req.body; // 'receipt', 'kot', 'both'

    const [bills] = await pool.execute('SELECT * FROM bills WHERE bill_id = ?', [req.params.billId]);
    if (!bills.length) return res.status(404).json({ error: 'Bill not found.' });

    const [items] = await pool.execute('SELECT * FROM bill_items WHERE bill_id = ?', [req.params.billId]);
    const [settingsRows] = await pool.execute('SELECT key_name, value FROM settings');
    const settings = {};
    settingsRows.forEach(r => { settings[r.key_name] = r.value; });

    const bill = bills[0];
    let printResults = [];
    let receiptB64 = null;
    let kotB64 = null;

    if (type === 'receipt' || type === 'both') {
      const receiptData = await buildCustomerReceipt(bill, items, settings);
      receiptB64 = Buffer.from(receiptData, 'binary').toString('base64');
      if (settings.customer_printer_ip) {
        try {
          const result = await printToPrinter(settings.customer_printer_ip, settings.customer_printer_port, receiptData);
          printResults.push({ type: 'receipt', ...result });
        } catch (e) {
          printResults.push({ type: 'receipt', error: e.message });
        }
      }
    }

    if (type === 'kot' || type === 'both') {
      const kotData = await buildKOT(bill, items, settings);
      kotB64 = Buffer.from(kotData, 'binary').toString('base64');
      if (settings.kitchen_printer_ip) {
        try {
          const result = await printToPrinter(settings.kitchen_printer_ip, settings.kitchen_printer_port, kotData);
          printResults.push({ type: 'kot', ...result });
        } catch (e) {
          printResults.push({ type: 'kot', error: e.message });
        }
      }
    }

    res.json({ success: true, print_results: printResults, receipt_b64: receiptB64, kot_b64: kotB64 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
