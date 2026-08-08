const express = require('express');
const router = express.Router();
const mqtt = require('mqtt');
const { pool } = require('../db/connection');
const { authenticateToken } = require('../middleware/auth');
router.use(authenticateToken);

// ── Generate next token number ──
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

// ── Bill number: YYYYMMDD-TOKEN format ──
function generateBillNumber(date, token) {
  const d = date || new Date();
  const dateStr = d.toISOString().slice(0, 10).replace(/-/g, '');
  return `${dateStr}-${String(token).padStart(3, '0')}`;
}

// ── MQTT cloud print bridge ──
let mqttClient = null;
if (process.env.MQTT_HOST) {
  mqttClient = mqtt.connect(`mqtts://${process.env.MQTT_HOST}`, {
    username: process.env.MQTT_USER,
    password: process.env.MQTT_PASS
  });
  mqttClient.on('connect', () => console.log('✅ Connected to HiveMQ Print Cloud'));
  mqttClient.on('error', (err) => console.error('❌ HiveMQ Error:', err));
}

function printToPrinter(ip, port, data) {
  return new Promise((resolve, reject) => {
    if (!ip) return resolve({ skipped: true, reason: 'No printer IP configured' });
    if (!mqttClient || !mqttClient.connected) {
      return resolve({ skipped: true, reason: 'MQTT disconnected — ESP32 must be powered on' });
    }
    mqttClient.publish(`restaurant/printer/${ip}`, data, { qos: 1 }, (err) => {
      if (err) return reject(err);
      resolve({ queued: true, method: 'MQTT', message: 'Sent to printer queue' });
    });
  });
}

// ── ESC/POS helper constants ──
function ep() {
  const ESC = '\x1B', GS = '\x1D', LF = '\n';
  return {
    LF, INIT: ESC+'@', BOLD_ON: ESC+'E\x01', BOLD_OFF: ESC+'E\x00',
    CENTER: ESC+'a\x01', LEFT: ESC+'a\x00',
    DBL_HT: GS+'!\x11', LARGE: GS+'!\x33', NORMAL: GS+'!\x00',
    CUT: GS+'V\x41\x03',
    DLINE: '='.repeat(48), SLINE: '-'.repeat(48),
    pad:  (s, l) => String(s == null ? '' : s).padEnd(l).slice(0, l),
    padL: (s, l) => String(s == null ? '' : s).padStart(l).slice(-l),
  };
}

// ── Customer Receipt (full details) ──
async function buildCustomerReceipt(bill, items, settings) {
  const { LF, INIT, BOLD_ON, BOLD_OFF, CENTER, LEFT, DBL_HT, LARGE, NORMAL, CUT, SLINE, pad, padL } = ep();

  let r = INIT;
  r += '\x1C\x70\x01\x00' + LF; // NV Logo if stored
  r += CENTER + BOLD_ON + DBL_HT + (settings.restaurant_name || 'Fire & Flavour') + LF + NORMAL + BOLD_OFF;
  if (settings.address) r += CENTER + settings.address + LF;
  if (settings.phone)   r += CENTER + 'Ph: ' + settings.phone + LF;
  r += LEFT + SLINE + LF;
  r += CENTER + BOLD_ON + 'CUSTOMER RECEIPT' + BOLD_OFF + LF;
  r += LEFT + SLINE + LF;

  r += 'Bill No  : ' + bill.bill_number + LF;
  r += 'Date     : ' + new Date(bill.created_at).toLocaleDateString('en-IN') + LF;
  r += 'Time     : ' + new Date(bill.created_at).toLocaleTimeString('en-IN') + LF;
  r += SLINE + LF;
  r += 'TOKEN    : ' + BOLD_ON + String(bill.token_number) + BOLD_OFF + LF;
  r += 'TYPE     : ' + BOLD_ON + (bill.order_type || 'Dine-in') + BOLD_OFF + LF;
  if (bill.customer_name)  r += 'Customer : ' + BOLD_ON + bill.customer_name + BOLD_OFF + LF;
  if (bill.customer_phone) r += 'Phone    : ' + BOLD_ON + bill.customer_phone + BOLD_OFF + LF;
  if (bill.delivery_address) r += 'Dest     : ' + BOLD_ON + bill.delivery_address + BOLD_OFF + LF;
  r += SLINE + LF;

  // Items header: ITEM(24) QTY(4) PRICE(9) AMT(11) = 48
  r += BOLD_ON + pad('ITEM', 24) + padL('QTY', 4) + padL('PRICE', 9) + padL('AMT', 11) + LF + BOLD_OFF;
  r += SLINE + LF;

  for (const item of items) {
    r += pad(item.item_name, 24) + padL(item.quantity, 4) +
         padL(parseFloat(item.unit_price).toFixed(2), 9) +
         padL(parseFloat(item.line_total).toFixed(2), 11) + LF;
    // If item name is long, wrap it
    if (item.item_name.length > 24) {
      r += pad('  ' + item.item_name.slice(24), 24) + LF;
    }
  }

  r += SLINE + LF;
  r += pad('Subtotal', 36) + padL(parseFloat(bill.subtotal).toFixed(2), 12) + LF;
  if (bill.delivery_enabled) {
    r += pad('Delivery Charge', 36) + padL(parseFloat(bill.delivery_charge).toFixed(2), 12) + LF;
  }
  if (bill.discount_enabled && parseFloat(bill.discount_amount) > 0) {
    const discLabel = `Discount (${bill.discount_type === 'percentage' ? bill.discount_value + '%' : 'Rs.' + bill.discount_value})`;
    r += pad(discLabel, 36) + padL('-' + parseFloat(bill.discount_amount).toFixed(2), 12) + LF;
  }
  r += SLINE + LF;
  r += BOLD_ON + pad('GRAND TOTAL', 36) + padL(parseFloat(bill.grand_total).toFixed(2), 12) + LF + BOLD_OFF;
  r += SLINE + LF;
  r += CENTER + (settings.footer || 'Thank you! Visit again.') + LF;
  r += LF + LF + LF + CUT;
  return Buffer.from(r, 'latin1');
}

// ── KOT (Kitchen Order Ticket) ──
async function buildKOT(bill, items, settings) {
  const { LF, INIT, BOLD_ON, BOLD_OFF, CENTER, LEFT, NORMAL, CUT, DLINE, pad, padL } = ep();

  let k = INIT + LEFT;
  k += CENTER + BOLD_ON + (settings.restaurant_name || 'Fire & Flavour') + BOLD_OFF + LF;
  k += CENTER + BOLD_ON + '*** KITCHEN ORDER ***' + BOLD_OFF + LF;
  k += CENTER + DLINE + LF;
  k += CENTER + 'TOKEN' + LF;
  k += CENTER + BOLD_ON + String(bill.token_number) + BOLD_OFF + LF;
  k += LEFT + DLINE + LF;

  const dateStr = 'Date: ' + new Date(bill.created_at).toLocaleDateString('en-IN');
  const timeStr = 'Time: ' + new Date(bill.created_at).toLocaleTimeString('en-IN');
  k += dateStr.padEnd(24).slice(0, 24) + timeStr.padEnd(24).slice(0, 24) + LF;
  k += 'Bill     : ' + bill.bill_number + LF;
  k += 'Type     : ' + BOLD_ON + (bill.order_type || 'Dine-in') + BOLD_OFF + LF;
  if (bill.customer_name)  k += 'Name     : ' + BOLD_ON + bill.customer_name + BOLD_OFF + LF;
  if (bill.customer_phone) k += 'Phone    : ' + BOLD_ON + bill.customer_phone + BOLD_OFF + LF;
  if (bill.delivery_address) k += 'Dest     : ' + BOLD_ON + bill.delivery_address + BOLD_OFF + LF;
  if (bill.cashier_name) k += 'Taken By : ' + bill.cashier_name + LF;
  k += DLINE + LF;
  // Header: ITEM(41) QTY(7) = 48
  k += BOLD_ON + 'ITEM'.padEnd(41) + 'QTY'.padStart(7) + LF + BOLD_OFF;
  k += DLINE + LF;

  for (const item of items) {
    k += item.item_name.padEnd(41).slice(0, 41) + String(item.quantity).padStart(7) + LF;
  }

  k += DLINE + LF + LF + LF + CUT;
  return Buffer.from(k, 'latin1');
}

// ── Counter Checklist (full details + checkboxes) ──
async function buildCounterChecklist(bill, items, settings) {
  const { LF, INIT, BOLD_ON, BOLD_OFF, CENTER, LEFT, NORMAL, CUT, DLINE, SLINE, pad, padL } = ep();

  let c = INIT + LEFT;
  c += CENTER + BOLD_ON + (settings.restaurant_name || 'Fire & Flavour') + BOLD_OFF + LF;
  if (settings.address) c += CENTER + settings.address + LF;
  if (settings.phone)   c += CENTER + 'Ph: ' + settings.phone + LF;
  c += CENTER + BOLD_ON + '*** COUNTER CHECKLIST ***' + BOLD_OFF + LF;
  c += CENTER + 'Pack & Verify each item before dispatch' + LF;
  c += DLINE + LF;

  c += 'Bill No  : ' + bill.bill_number + LF;
  const dateStr = 'Date: ' + new Date(bill.created_at).toLocaleDateString('en-IN');
  const timeStr = 'Time: ' + new Date(bill.created_at).toLocaleTimeString('en-IN');
  c += dateStr.padEnd(24).slice(0, 24) + timeStr.padEnd(24).slice(0, 24) + LF;
  c += DLINE + LF;
  c += 'TOKEN    : ' + BOLD_ON + String(bill.token_number) + BOLD_OFF + LF;
  c += 'Type     : ' + BOLD_ON + (bill.order_type || 'Dine-in') + BOLD_OFF + LF;
  if (bill.customer_name)    c += 'Customer : ' + BOLD_ON + bill.customer_name + BOLD_OFF + LF;
  if (bill.customer_phone)   c += 'Phone    : ' + BOLD_ON + bill.customer_phone + BOLD_OFF + LF;
  if (bill.delivery_address) c += 'Dest     : ' + BOLD_ON + bill.delivery_address + BOLD_OFF + LF;
  if (bill.cashier_name) c += 'Taken By : ' + bill.cashier_name + LF;
  c += DLINE + LF;

  // Checklist header: [ ] ITEM(28) QTY(5) PRICE(11) = 48
  c += BOLD_ON + '[ ] ' + pad('ITEM', 28) + padL('QTY', 5) + padL('AMOUNT', 11) + LF + BOLD_OFF;
  c += SLINE + LF;

  for (const item of items) {
    const name  = pad(item.item_name, 28);
    const qty   = padL(item.quantity, 5);
    const price = padL(parseFloat(item.line_total).toFixed(2), 11);
    c += '[ ] ' + name + qty + price + LF;
    // Show unit price below if qty > 1
    if (item.quantity > 1) {
      c += '    @ Rs.' + parseFloat(item.unit_price).toFixed(2) + ' x ' + item.quantity + LF;
    }
    c += SLINE + LF;
  }

  c += DLINE + LF;
  c += pad('Subtotal', 36) + padL(parseFloat(bill.subtotal).toFixed(2), 12) + LF;
  if (bill.delivery_enabled) {
    c += pad('Delivery Charge', 36) + padL(parseFloat(bill.delivery_charge).toFixed(2), 12) + LF;
  }
  if (bill.discount_enabled && parseFloat(bill.discount_amount) > 0) {
    const discLabel = `Discount (${bill.discount_type === 'percentage' ? bill.discount_value + '%' : 'Rs.' + bill.discount_value})`;
    c += pad(discLabel, 36) + padL('-' + parseFloat(bill.discount_amount).toFixed(2), 12) + LF;
  }
  c += DLINE + LF;
  c += BOLD_ON + pad('GRAND TOTAL', 36) + padL(parseFloat(bill.grand_total).toFixed(2), 12) + LF + BOLD_OFF;
  c += DLINE + LF;
  c += 'Packed by: ____________  Checked by: ____________' + LF;
  c += LF + LF + LF + CUT;
  return Buffer.from(c, 'latin1');
}

// ── POST / — Create Bill ──
router.post('/', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const {
      items, customer_name, customer_phone, delivery_address, order_type,
      delivery_enabled, delivery_charge,
      discount_enabled, discount_type, discount_value, discount_amount,
      subtotal, grand_total, status, token_number, print_intent
    } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'Bill must have at least one item.' });
    }

    const token = token_number || await getNextToken();
    const now = new Date();
    const billStatus = status === 'draft' ? 'draft' : 'completed';
    // Bill number: YYYYMMDD-TTT (date + zero-padded token)
    const billNumber = generateBillNumber(now, token);

    const [billResult] = await conn.execute(
      `INSERT INTO bills
       (bill_number, token_number, customer_name, customer_phone, order_type, delivery_address,
        subtotal, delivery_enabled, delivery_charge,
        discount_enabled, discount_type, discount_value, discount_amount,
        grand_total, status, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        billNumber, token,
        customer_name || null, customer_phone || null,
        order_type || 'Dine-in', delivery_address || null,
        subtotal,
        delivery_enabled ? 1 : 0, delivery_charge || 0,
        discount_enabled ? 1 : 0, discount_type || 'fixed',
        discount_value || 0, discount_amount || 0,
        grand_total, billStatus, req.user.id, now
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
      customer_name: customer_name || null,
      customer_phone: customer_phone || null,
      order_type: order_type || 'Dine-in',
      delivery_address: delivery_address || null,
      subtotal, delivery_enabled: delivery_enabled ? 1 : 0, delivery_charge: delivery_charge || 0,
      discount_enabled: discount_enabled ? 1 : 0, discount_type: discount_type || 'fixed',
      discount_value: discount_value || 0, discount_amount: discount_amount || 0,
      grand_total, created_at: now, cashier_name: req.user.full_name || req.user.username
    };

    let printResults = [];
    let receiptB64 = null, kotB64 = null, checklistB64 = null;

    // Helper: should we print this doc type?
    const shouldPrint = (docType) => {
      if (print_intent === false || !print_intent) return false;
      if (print_intent === true || print_intent === 'all') return true;
      const map = {
        kot: ['kot','kot_receipt','kot_checklist','all'],
        receipt: ['receipt','kot_receipt','receipt_checklist','all'],
        checklist: ['checklist','kot_checklist','receipt_checklist','all'],
      };
      return (map[docType] || []).includes(print_intent);
    };

    if (billStatus === 'completed') {
      // Receipt
      if (shouldPrint('receipt') && settings.customer_printer_ip) {
        const data = await buildCustomerReceipt(bill, items, settings);
        receiptB64 = data.toString('base64');
        try { const r = await printToPrinter(settings.customer_printer_ip, settings.customer_printer_port, data); printResults.push({ type:'receipt', ...r }); }
        catch(e) { printResults.push({ type:'receipt', error: e.message }); }
      } else if (shouldPrint('receipt')) {
        const data = await buildCustomerReceipt(bill, items, settings);
        receiptB64 = data.toString('base64');
        printResults.push({ type:'receipt', skipped:true, reason:'No customer printer IP' });
      }
      // KOT
      if (shouldPrint('kot') && settings.kitchen_printer_ip) {
        const data = await buildKOT(bill, items, settings);
        kotB64 = data.toString('base64');
        try { const r = await printToPrinter(settings.kitchen_printer_ip, settings.kitchen_printer_port, data); printResults.push({ type:'kot', ...r }); }
        catch(e) { printResults.push({ type:'kot', error: e.message }); }
      } else if (shouldPrint('kot')) {
        const data = await buildKOT(bill, items, settings);
        kotB64 = data.toString('base64');
        printResults.push({ type:'kot', skipped:true, reason:'No kitchen printer IP' });
      }
      // Checklist (skip for Dine-in)
      const isDineIn = (bill.order_type || '').toLowerCase().includes('dine');
      if (!isDineIn && shouldPrint('checklist') && settings.customer_printer_ip) {
        const data = await buildCounterChecklist(bill, items, settings);
        checklistB64 = data.toString('base64');
        try { const r = await printToPrinter(settings.customer_printer_ip, settings.customer_printer_port, data); printResults.push({ type:'checklist', ...r }); }
        catch(e) { printResults.push({ type:'checklist', error: e.message }); }
      } else if (!isDineIn && shouldPrint('checklist')) {
        const data = await buildCounterChecklist(bill, items, settings);
        checklistB64 = data.toString('base64');
        printResults.push({ type:'checklist', skipped:true, reason:'No printer IP' });
      }
    }

    res.json({
      success: true, bill_id: billId, bill_number: billNumber, token_number: token,
      print_results: printResults, status: billStatus,
      receipt_b64: receiptB64, kot_b64: kotB64, checklist_b64: checklistB64
    });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    if (conn) conn.release();
  }
});

// ── POST /:billId/reprint ──
router.post('/:billId/reprint', async (req, res) => {
  try {
    const { type } = req.body; // 'receipt', 'kot', 'checklist', 'both'
    const [bills] = await pool.execute(
      'SELECT b.*, u.full_name AS cashier_name FROM bills b LEFT JOIN users u ON b.created_by = u.id WHERE b.bill_id = ?',
      [req.params.billId]
    );
    if (!bills.length) return res.status(404).json({ error: 'Bill not found.' });
    const [items] = await pool.execute('SELECT * FROM bill_items WHERE bill_id = ?', [req.params.billId]);
    const [settingsRows] = await pool.execute('SELECT key_name, value FROM settings');
    const settings = {};
    settingsRows.forEach(r => { settings[r.key_name] = r.value; });

    const bill = bills[0];
    let printResults = [];
    let receiptB64 = null, kotB64 = null, checklistB64 = null;

    if (type === 'receipt' || type === 'both') {
      const data = await buildCustomerReceipt(bill, items, settings);
      receiptB64 = data.toString('base64');
      if (settings.customer_printer_ip) {
        try {
          const r = await printToPrinter(settings.customer_printer_ip, settings.customer_printer_port, data);
          printResults.push({ type: 'receipt', ...r });
        } catch (e) { printResults.push({ type: 'receipt', error: e.message }); }
      }
    }
    if (type === 'kot' || type === 'both') {
      const data = await buildKOT(bill, items, settings);
      kotB64 = data.toString('base64');
      if (settings.kitchen_printer_ip) {
        try {
          const r = await printToPrinter(settings.kitchen_printer_ip, settings.kitchen_printer_port, data);
          printResults.push({ type: 'kot', ...r });
        } catch (e) { printResults.push({ type: 'kot', error: e.message }); }
      }
    }
    if (type === 'checklist' || type === 'both') {
      const data = await buildCounterChecklist(bill, items, settings);
      checklistB64 = data.toString('base64');
      if (settings.customer_printer_ip) {
        try {
          const r = await printToPrinter(settings.customer_printer_ip, settings.customer_printer_port, data);
          printResults.push({ type: 'checklist', ...r });
        } catch (e) { printResults.push({ type: 'checklist', error: e.message }); }
      }
    }

    res.json({ success: true, print_results: printResults, receipt_b64: receiptB64, kot_b64: kotB64, checklist_b64: checklistB64 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /next-token ──
router.get('/next-token', async (req, res) => {
  try {
    const token = await getNextToken();
    res.json({ token_number: token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
