"use strict";
require('dotenv').config({ path: require('path').resolve(__dirname, '../../../backend/.env') });
const express = require('express');
const cookieParser = require('cookie-parser');
const { pool } = require('../../../shared/src');

const app = express();
const PORT = process.env.SERVICE_PORT || 5003;

app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ service: 'clerk-service', status: 'healthy', port: PORT, time: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ service: 'clerk-service', status: 'unhealthy', error: err.message });
  }
});

app.use('/api', require('./routes'));

app.use((err, req, res, _next) => {
  console.error('[clerk-service] Unhandled error:', err);
  res.status(500).json({ error: 'clerk-service internal error' });
});

app.listen(PORT, () => {
  console.log('[clerk-service] listening on http://localhost:' + PORT);
});
