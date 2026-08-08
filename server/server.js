const path = require('path');
require('dotenv').config({ path: path.join(process.cwd(), '.env') });
try {
  const config = require('./env-config.js');
  for (const key in config) {
    if (!process.env[key]) process.env[key] = config[key];
  }
} catch (e) {}
const express = require('express');
const cors = require('cors');
const { initDB } = require('./db/connection');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve static client files
app.use(express.static(path.join(__dirname, '../client')));

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/menu', require('./routes/menu'));
app.use('/api/billing', require('./routes/billing'));
app.use('/api/bills', require('./routes/bills'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/users', require('./routes/users'));

// SPA fallback — serve index.html for all non-API routes
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '../client/index.html'));
  }
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

async function start() {
  try {
    await initDB();
    if (require.main === module) {
      app.listen(PORT, () => {
        console.log(`🔥 Fire & Flavour server running on http://localhost:${PORT}`);
      });
    }
  } catch (err) {
    console.error('❌ Failed to start server:', err.message);
    if (require.main === module) {
      process.exit(1);
    }
  }
}

// Start immediately for local, or just init DB for serverless
start();

// Export the Express app so Vercel can run it as a serverless function
module.exports = app;
