"use strict";
require('dotenv').config({ path: require('path').resolve(__dirname, '../../../backend/.env') });
const express = require('express');
const cookieParser = require('cookie-parser');
const { pool } = require('../../../shared/src');

const app = express();
const PORT = process.env.SERVICE_PORT || 5002;

app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ service: 'directory-service', status: 'healthy', port: PORT, time: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ service: 'directory-service', status: 'unhealthy', error: err.message });
  }
});

app.use('/api', require('./routes'));

app.use((err, req, res, _next) => {
  console.error('[directory-service] Unhandled error:', err);
  res.status(500).json({ error: 'directory-service internal error' });
});

app.listen(PORT, () => {
  console.log('[directory-service] listening on http://localhost:' + PORT);
});
