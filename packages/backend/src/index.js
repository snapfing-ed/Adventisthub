require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { execSync } = require('child_process');
const { pool } = require('./db/pool');

const app = express();
const PORT = process.env.PORT || 5000;

const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    // Allow http://localhost:3000 and any http://<slug>.localhost:3000 in development
    if (process.env.NODE_ENV !== 'production' && /^http:\/\/([a-z0-9-]+\.)?localhost:3000$/.test(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-token', 'x-tenant-id', 'x-tenant-slug'],
}));
app.use(express.json());
app.use(require('cookie-parser')());

// ── Health ────────────────────────────────────────────────────────────────
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'AdventistHub API alive', db: 'connected', time: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ status: 'degraded', db: err.message, time: new Date().toISOString() });
  }
});

// ── Clock-sync endpoint (Local-dev only) ──────────────────────────────────
if (process.env.NODE_ENV !== 'production') {
  app.post('/api/admin/clock-sync', (req, res) => {
    const secret = process.env.ADMIN_SECRET;
    if (!secret || req.headers['x-admin-token'] !== secret) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    try {
      execSync('sudo hwclock --hctosys 2>/dev/null || sudo ntpdate -u time.windows.com 2>/dev/null || true');
      res.json({ ok: true, time: new Date().toISOString() });
    } catch (err) {
      res.json({ ok: false, error: err.message });
    }
  });
}

// ── Module 1 Routes (PostgreSQL + RLS) ────────────────────────────────────
app.use('/api', require('./routes/auth'));
app.use('/api', require('./routes/persons'));
app.use('/api', require('./routes/membershipTransactions'));
app.use('/api', require('./routes/governance'));

app.listen(PORT, () => {
  console.log(`AdventistHub Backend running on http://localhost:${PORT}`);
});
