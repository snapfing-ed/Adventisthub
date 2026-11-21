"use strict";
require('dotenv').config({ path: require('path').resolve(__dirname, '../../backend/.env') });
const express = require('express');
const cors = require('cors');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 5000;

const SERVICES = {
  identity:   process.env.IDENTITY_SERVICE_URL   || 'http://127.0.0.1:5001',
  directory:  process.env.DIRECTORY_SERVICE_URL  || 'http://127.0.0.1:5002',
  clerk:      process.env.CLERK_SERVICE_URL      || 'http://127.0.0.1:5003',
  governance: process.env.GOVERNANCE_SERVICE_URL || 'http://127.0.0.1:5004',
};

const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      if (/^http:\/\/([a-z0-9-]+\.)?localhost:3000$/.test(origin)) return callback(null, true);
      if (/^https:\/\/([a-z0-9-]+\.)?adventisthub\.com$/.test(origin)) return callback(null, true);
      return callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-token', 'x-tenant-id', 'x-tenant-slug'],
  })
);

function resolveTarget(pathname) {
  if (
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/public') ||
    pathname.startsWith('/api/tenants') ||
    pathname.startsWith('/api/admin')
  ) {
    return { name: 'identity-service', url: SERVICES.identity };
  }
  if (pathname.startsWith('/api/persons') || pathname.startsWith('/api/households')) {
    return { name: 'directory-service', url: SERVICES.directory };
  }
  if (pathname.startsWith('/api/membership-transactions')) {
    return { name: 'clerk-service', url: SERVICES.clerk };
  }
  if (
    pathname.startsWith('/api/governance') ||
    pathname.startsWith('/api/service-years') ||
    pathname.startsWith('/api/officers') ||
    pathname.startsWith('/api/board-meetings') ||
    pathname.startsWith('/api/board-actions')
  ) {
    return { name: 'governance-service', url: SERVICES.governance };
  }
  return null;
}

// Aggregated health check showing independent status of each microservice
app.get('/api/health', async (req, res) => {
  const entries = await Promise.all(
    Object.entries(SERVICES).map(async ([key, baseUrl]) => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 1500);
        const r = await fetch(`${baseUrl}/health`, { signal: controller.signal });
        clearTimeout(timer);
        const body = await r.json();
        return [key, { up: r.ok, ...body }];
      } catch {
        return [key, { up: false, status: 'offline' }];
      }
    })
  );

  const services = Object.fromEntries(entries);
  const allUp = Object.values(services).every((s) => s.up);
  res.status(allUp ? 200 : 207).json({
    gateway: 'healthy',
    degraded: !allUp,
    services,
    time: new Date().toISOString(),
  });
});

// Fault-isolated reverse proxy (streams request body & cookies cleanly without buffering corruption)
app.use('/api', (req, res) => {
  const target = resolveTarget(req.originalUrl.split('?')[0]);
  if (!target) {
    return res.status(404).json({ error: 'Unknown API route' });
  }

  const parsed = new URL(target.url);
  const proxyReq = http.request(
    {
      hostname: parsed.hostname,
      port: parsed.port,
      path: req.originalUrl,
      method: req.method,
      headers: {
        ...req.headers,
        host: parsed.host,
      },
      timeout: 15000,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
    }
  );

  proxyReq.on('timeout', () => {
    proxyReq.destroy();
    if (!res.headersSent) {
      res.status(504).json({
        error: `${target.name} timed out. Other AdventistHub modules remain operational.`,
        service: target.name,
      });
    }
  });

  proxyReq.on('error', () => {
    if (!res.headersSent) {
      res.status(503).json({
        error: `${target.name} is temporarily unavailable. Other AdventistHub modules remain operational.`,
        service: target.name,
      });
    }
  });

  req.pipe(proxyReq, { end: true });
});

app.listen(PORT, () => {
  console.log(`[api-gateway] listening on http://localhost:${PORT}`);
});
