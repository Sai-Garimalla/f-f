const express = require('express');
const router = express.Router();
const { pool } = require('../db/connection');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

router.use(authenticateToken);

// Get all settings
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT key_name, value FROM settings');
    const settings = {};
    rows.forEach(r => { settings[r.key_name] = r.value; });
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update settings (admin only)
router.post('/', requireAdmin, async (req, res) => {
  try {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      for (const [key, value] of Object.entries(req.body)) {
        await conn.execute(
          'INSERT INTO settings (key_name, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)',
          [key, value]
        );
      }
      await conn.commit();
      res.json({ success: true });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
