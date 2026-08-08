const fs = require('fs');
const file = './server/routes/billing.js';
let code = fs.readFileSync(file, 'utf8');

const putRoute = `
// ── PUT /:billId — Update Bill ──
router.put('/:billId', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const billId = req.params.billId;
    const {
      items, customer_name, customer_phone, delivery_address, order_type,
      delivery_enabled, delivery_charge,
      discount_enabled, discount_type, discount_value, discount_amount,
      subtotal, grand_total, status, print_intent
    } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'Bill must have at least one item.' });
    }

    const billStatus = status === 'draft' ? 'draft' : 'completed';

    await conn.execute(
      \`UPDATE bills SET 
        customer_name=?, customer_phone=?, order_type=?, delivery_address=?,
        subtotal=?, delivery_enabled=?, delivery_charge=?,
        discount_enabled=?, discount_type=?, discount_value=?, discount_amount=?,
        grand_total=?, status=?
       WHERE bill_id=?\`,
      [
        customer_name || null, customer_phone || null,
        order_type || 'Dine-in', delivery_address || null,
        subtotal,
        delivery_enabled ? 1 : 0, delivery_charge || 0,
        discount_enabled ? 1 : 0, discount_type || 'fixed',
        discount_value || 0, discount_amount || 0,
        grand_total, billStatus, billId
      ]
    );

    await conn.execute('DELETE FROM bill_items WHERE bill_id=?', [billId]);

    for (const item of items) {
      await conn.execute(
        'INSERT INTO bill_items (bill_id, item_code, item_name, quantity, unit_price, line_total, is_manual) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [billId, item.item_code || null, item.item_name, item.quantity, item.unit_price, item.line_total, item.is_manual ? 1 : 0]
      );
    }

    await conn.commit();

    // Fetch updated bill to print
    const [bills] = await conn.execute('SELECT * FROM bills WHERE bill_id=?', [billId]);
    const billData = bills[0];
    billData.cashier_name = req.user.full_name || req.user.username;

    // Fetch settings for printing
    const [settingsRows] = await pool.execute('SELECT key_name, value FROM settings');
    const settings = {};
    settingsRows.forEach(r => { settings[r.key_name] = r.value; });

    let printResults = [];
    let receiptB64 = null, kotB64 = null, checklistB64 = null;

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
      if (shouldPrint('receipt') && settings.customer_printer_ip) {
        const data = await buildCustomerReceipt(billData, items, settings);
        receiptB64 = data.toString('base64');
        try { const r = await printToPrinter(settings.customer_printer_ip, settings.customer_printer_port, data); printResults.push({ type:'receipt', ...r }); }
        catch(e) { printResults.push({ type:'receipt', error: e.message }); }
      } else if (shouldPrint('receipt')) {
        const data = await buildCustomerReceipt(billData, items, settings);
        receiptB64 = data.toString('base64');
        printResults.push({ type:'receipt', skipped:true, reason:'No customer printer IP' });
      }

      if (shouldPrint('kot') && settings.kitchen_printer_ip) {
        const data = await buildKOT(billData, items, settings);
        kotB64 = data.toString('base64');
        try { const r = await printToPrinter(settings.kitchen_printer_ip, settings.kitchen_printer_port, data); printResults.push({ type:'kot', ...r }); }
        catch(e) { printResults.push({ type:'kot', error: e.message }); }
      } else if (shouldPrint('kot')) {
        const data = await buildKOT(billData, items, settings);
        kotB64 = data.toString('base64');
        printResults.push({ type:'kot', skipped:true, reason:'No kitchen printer IP' });
      }

      const isDineIn = (billData.order_type || '').toLowerCase().includes('dine');
      if (!isDineIn && shouldPrint('checklist') && settings.customer_printer_ip) {
        const data = await buildCounterChecklist(billData, items, settings);
        checklistB64 = data.toString('base64');
        try { const r = await printToPrinter(settings.customer_printer_ip, settings.customer_printer_port, data); printResults.push({ type:'checklist', ...r }); }
        catch(e) { printResults.push({ type:'checklist', error: e.message }); }
      } else if (!isDineIn && shouldPrint('checklist')) {
        const data = await buildCounterChecklist(billData, items, settings);
        checklistB64 = data.toString('base64');
        printResults.push({ type:'checklist', skipped:true, reason:'No printer IP' });
      }
    }

    res.json({
      success: true, bill_id: billId, bill_number: billData.bill_number, token_number: billData.token_number,
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
`;

// Insert before router.post('/:billId/reprint'
if (!code.includes('router.put(\'/:billId\', async')) {
  code = code.replace('// ── POST /:billId/reprint ──', putRoute + '\n// ── POST /:billId/reprint ──');
  fs.writeFileSync(file, code);
  console.log('PUT route added.');
} else {
  console.log('PUT route already exists.');
}
