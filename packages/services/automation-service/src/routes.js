"use strict";
const express = require('express');
const {
  verifySession,
  requireTenantRole,
  requireVerifiedTenant,
} = require('../../../backend/src/middleware/auth');
const { ensureTenantRules, evaluateTenantRules } = require('./engine');

const router = express.Router();

const READ_ROLES = ['ADMIN', 'PASTOR', 'ELDER', 'CLERK', 'TREASURER', 'PCM_LEADER'];
const WRITE_ROLES = ['ADMIN', 'PASTOR', 'ELDER', 'CLERK', 'PCM_LEADER'];

// ── GET /api/automations/rules ─────────────────────────────────────────────
router.get(
  '/automations/rules',
  verifySession,
  requireTenantRole(...READ_ROLES),
  async (req, res) => {
    try {
      const data = await req.dbTx(async (client) => {
        await ensureTenantRules(client, req.tenant.id);
        const rules = await client.query(
          `SELECT * FROM automation_rules WHERE tenant_id = $1 ORDER BY rule_code ASC`,
          [req.tenant.id]
        );
        const pendingRollovers = await client.query(
          `SELECT id, label, start_date, end_date FROM service_years
           WHERE tenant_id = $1 AND rollover_pending = TRUE`,
          [req.tenant.id]
        );
        return { rules: rules.rows, pendingRollovers: pendingRollovers.rows };
      });
      return res.json(data);
    } catch (err) {
      console.error('[automations/rules GET] error:', err);
      return res.status(500).json({ error: 'Failed to load automation rules' });
    }
  }
);

// ── PATCH /api/automations/rules/:id ───────────────────────────────────────
router.patch(
  '/automations/rules/:id',
  verifySession,
  requireVerifiedTenant,
  requireTenantRole(...WRITE_ROLES),
  async (req, res) => {
    const { id } = req.params;
    const { isEnabled, autoApply, thresholdDays } = req.body || {};

    try {
      const updated = await req.dbTx(async (client) => {
        const upd = await client.query(
          `UPDATE automation_rules
           SET is_enabled = COALESCE($1, is_enabled),
               auto_apply = COALESCE($2, auto_apply),
               threshold_days = COALESCE($3, threshold_days),
               updated_at = NOW()
           WHERE id = $4 AND tenant_id = $5
           RETURNING *`,
          [
            typeof isEnabled === 'boolean' ? isEnabled : null,
            typeof autoApply === 'boolean' ? autoApply : null,
            Number.isInteger(thresholdDays) ? thresholdDays : null,
            id,
            req.tenant.id,
          ]
        );
        return upd.rows[0] || null;
      });

      if (!updated) return res.status(404).json({ error: 'Rule not found' });
      return res.json({ rule: updated });
    } catch (err) {
      console.error('[automations/rules PATCH] error:', err);
      return res.status(500).json({ error: 'Failed to update automation rule' });
    }
  }
);

// ── POST /api/automations/run-now ──────────────────────────────────────────
router.post(
  '/automations/run-now',
  verifySession,
  requireVerifiedTenant,
  requireTenantRole(...WRITE_ROLES),
  async (req, res) => {
    try {
      const results = await evaluateTenantRules({
        tenantId: req.tenant.id,
        triggerSource: 'MANUAL',
        executedBy: req.user.id,
      });
      return res.json({ executed: true, results });
    } catch (err) {
      console.error('[automations/run-now POST] error:', err);
      return res.status(500).json({ error: 'Failed to run automation rules' });
    }
  }
);

// ── POST /api/automations/confirm-rollover/:serviceYearId ──────────────────
router.post(
  '/automations/confirm-rollover/:serviceYearId',
  verifySession,
  requireVerifiedTenant,
  requireTenantRole(...WRITE_ROLES),
  async (req, res) => {
    const { serviceYearId } = req.params;
    const { completeOfficers = true } = req.body || {};

    try {
      const outcome = await req.dbTx(async (client) => {
        const sy = await client.query(
          `UPDATE service_years
           SET is_current = FALSE, rollover_pending = FALSE, updated_at = NOW()
           WHERE id = $1 AND tenant_id = $2
           RETURNING *`,
          [serviceYearId, req.tenant.id]
        );
        if (sy.rows.length === 0) return null;

        let completedCount = 0;
        if (completeOfficers) {
          const off = await client.query(
            `UPDATE officers
             SET status = 'COMPLETED', updated_at = NOW()
             WHERE tenant_id = $1 AND service_year_id = $2 AND status = 'ELECTED'`,
            [req.tenant.id, serviceYearId]
          );
          completedCount = off.rowCount;
        }

        await client.query(
          `INSERT INTO audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
           VALUES ($1, $2, 'SERVICE_YEAR_ROLLOVER_CONFIRMED', 'service_year', $3, $4::jsonb)`,
          [
            req.tenant.id,
            req.user.id,
            serviceYearId,
            JSON.stringify({ label: sy.rows[0].label, completedOfficers: completedCount }),
          ]
        );

        return { serviceYear: sy.rows[0], completedOfficers: completedCount };
      });

      if (!outcome) return res.status(404).json({ error: 'Service year not found' });
      return res.json(outcome);
    } catch (err) {
      console.error('[confirm-rollover POST] error:', err);
      return res.status(500).json({ error: 'Failed to confirm service year rollover' });
    }
  }
);

// ── GET /api/automations/logs ──────────────────────────────────────────────
router.get(
  '/automations/logs',
  verifySession,
  requireTenantRole(...READ_ROLES),
  async (req, res) => {
    try {
      const logs = await req.dbTx(async (client) => {
        const resLogs = await client.query(
          `SELECT ar.*, u.full_name AS executed_by_name
           FROM automation_runs ar
           LEFT JOIN users u ON u.id = ar.executed_by
           WHERE ar.tenant_id = $1
           ORDER BY ar.created_at DESC
           LIMIT 30`,
          [req.tenant.id]
        );
        return resLogs.rows;
      });
      return res.json({ logs });
    } catch (err) {
      console.error('[automations/logs GET] error:', err);
      return res.status(500).json({ error: 'Failed to load automation logs' });
    }
  }
);

module.exports = router;
