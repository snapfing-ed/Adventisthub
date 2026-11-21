"use strict";
require('dotenv').config({ path: require('path').resolve(__dirname, '../../../backend/.env') });
const express = require('express');
const cookieParser = require('cookie-parser');
const { pool } = require('../../../shared/src');

const app = express();
const PORT = Number(process.env.GOVERNANCE_SERVICE_PORT || 5014);

app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({
      service: 'governance-service',
      status: 'healthy',
      port: PORT,
      time: new Date().toISOString(),
    });
  } catch (err) {
    res.status(503).json({ service: 'governance-service', status: 'unhealthy', error: err.message });
  }
});

app.use('/api', require('./routes'));

app.use((err, req, res, _next) => {
  console.error('[governance-service] Unhandled error:', err);
  res.status(500).json({ error: 'governance-service internal error' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('[governance-service] listening on http://127.0.0.1:' + PORT);
});
