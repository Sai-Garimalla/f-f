const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { pool } = require('../db/connection');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

router.use(authenticateToken);

// GET all staff users (admin only)
router.get('/', requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      "SELECT id, full_name, username, email, phone, role, status, created_at FROM users ORDER BY created_at DESC"
    );
    res.json({ users: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST create staff user (admin only)
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { full_name, username, email, phone, password, role } = req.body;
    if (!full_name || !username || !password) return res.status(400).json({ error: 'Name, username and password are required.' });
    const hash = await bcrypt.hash(password, 12);
    const [result] = await pool.execute(
      'INSERT INTO users (full_name, username, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?, ?)',
      [full_name, username, email || null, phone || null, hash, role === 'admin' ? 'admin' : 'staff']
    );
    res.json({ success: true, user_id: result.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'Username or email already exists.' });
    res.status(500).json({ error: err.message });
  }
});

// PATCH update user (admin only)
router.patch('/:id', requireAdmin, async (req, res) => {
  try {
    const { full_name, phone, status, role } = req.body;
    await pool.execute(
      'UPDATE users SET full_name=?, phone=?, status=?, role=? WHERE id=?',
      [full_name, phone || null, status || 'active', role || 'staff', req.params.id]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE user (admin only, can't delete yourself)
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: "Can't delete your own account." });
    await pool.execute('UPDATE users SET status=? WHERE id=?', ['inactive', req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
