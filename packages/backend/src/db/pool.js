"use strict";
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  console.error('[pg] Unexpected idle client error:', err);
});

/**
 * Executes a callback inside a PostgreSQL transaction with RLS session variables set.
 * Uses SET LOCAL (is_local = true) so tenant context never leaks across pooled connections.
 */
async function withTenantTx({ tenantId = null, isPlatformAdmin = false }, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [tenantId || '']);
    await client.query(`SELECT set_config('app.is_platform_admin', $1, true)`, [
      isPlatformAdmin ? 'true' : 'false',
    ]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, withTenantTx };
