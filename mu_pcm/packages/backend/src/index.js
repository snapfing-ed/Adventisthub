require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { execSync } = require('child_process');

const app = express();
const PORT = process.env.PORT || 5000;

// CORS_ORIGIN can be a comma-separated allowlist for production and preview
// deployments. We only reflect arbitrary origins in local development.
const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    if (process.env.NODE_ENV !== 'production' && allowedOrigins.length === 0) {
      return callback(null, true);
    }
    return callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-token'],
}));
app.use(express.json());
app.use(require('cookie-parser')());

// ── Health ────────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'MU SDA PCM Backend alive!', time: new Date().toISOString() });
});

// ── Clock-sync endpoint ───────────────────────────────────────────────────
// Local-dev only. This should not exist on deployed environments.
if (process.env.NODE_ENV !== 'production') {
  app.post('/api/admin/clock-sync', (req, res) => {
    const secret = process.env.ADMIN_SECRET;
    if (!secret || req.headers['x-admin-token'] !== secret) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    try {
      execSync('sudo hwclock --hctosys 2>/dev/null || sudo ntpdate -u time.windows.com 2>/dev/null || true');
      console.log('[clock-sync] WSL2 clock synced at', new Date().toISOString());
      res.json({ ok: true, time: new Date().toISOString() });
    } catch (err) {
      res.json({ ok: false, error: err.message });
    }
  });
}

// ── Routes ────────────────────────────────────────────────────────────────
app.use('/api/announcements', require('./routes/announcements'));
app.use('/api/events',        require('./routes/events'));
app.use('/api/journals',      require('./routes/journals'));
app.use('/api/media',         require('./routes/media'));
app.use('/api/heroes',        require('./routes/heroes'));
app.use('/api/banners',       require('./routes/banners'));
app.use('/api/groups',        require('./routes/groups'));
app.use('/api/resources',     require('./routes/resources'));
app.use('/api/prayers',       require('./routes/prayers'));
app.use('/api/contacts',      require('./routes/contacts'));
app.use('/api/about',         require('./routes/about'));
app.use('/api/users',         require('./routes/users'));
app.use('/api/minutes',       require('./routes/minutes'));
app.use('/api/students',      require('./routes/students'));
app.use('/api/uploads',       require('./routes/uploads')); 
app.use('/api/stats',         require('./routes/stats'));
app.use('/api/programming',   require('./routes/programming'));
// Session cookie endpoints (create/clear httpOnly session cookies)
app.use('/api', require('./routes/sessions'));

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
