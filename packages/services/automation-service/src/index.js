"use strict";
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../backend/.env') });

const express = require('express');
const cookieParser = require('cookie-parser');
const routes = require('./routes');
const { runAllTenantsSweep } = require('./engine');

const app = express();
const PORT = Number(process.env.AUTOMATION_SERVICE_PORT || 5005);
const SWEEP_INTERVAL_MS = Number(process.env.AUTOMATION_SWEEP_MS || 15 * 60 * 1000); // 15 mins

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.get('/health', (_req, res) => {
  res.json({
    service: 'automation-service',
    status: 'healthy',
    port: PORT,
    sweepIntervalMs: SWEEP_INTERVAL_MS,
    time: new Date().toISOString(),
  });
});

app.use('/api', routes);

app.listen(PORT, () => {
  console.log(`[automation-service] listening on http://localhost:${PORT}`);

  // Initial background sweep 5s after startup, then every SWEEP_INTERVAL_MS
  setTimeout(() => {
    runAllTenantsSweep()
      .then((res) => console.log('[automation-service] initial sweep:', res))
      .catch((err) => console.error('[automation-service] sweep error:', err));
  }, 5000);

  setInterval(() => {
    runAllTenantsSweep().catch((err) =>
      console.error('[automation-service] scheduled sweep error:', err)
    );
  }, SWEEP_INTERVAL_MS);
});
