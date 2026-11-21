"use strict";
const { withTenantTx } = require('../../../backend/src/db/pool');

const DEFAULT_RULES = [
  {
    rule_code: 'SERVICE_YEAR_ROLLOVER',
    name: 'Service Year & Officer Tenure Rollover',
    description:
      'Activates scheduled service years on start_date and flags or completes officer terms after end_date (Church Manual Ch. 9).',
    auto_apply: false,
    threshold_days: 0,
  },
  {
    rule_code: 'READING_WINDOW_READY',
    name: '7-Day First-to-Second Reading Window',
    description:
      'Flags nominated officers and FIRST_READING transfers once the 7-day SDA Manual notice period has elapsed.',
    auto_apply: true,
    threshold_days: 7,
  },
  {
    rule_code: 'BOARD_ACTION_OVERDUE',
    name: 'Overdue Board & Executive Actions',
    description:
      'Marks VOTED or IN_PROGRESS board/executive actions as overdue when due_date passes.',
    auto_apply: true,
    threshold_days: 0,
  },
  {
    rule_code: 'STALE_TRANSFER_ALERT',
    name: 'Stale Membership Transfer Follow-Up',
    description:
      'Alerts the Clerk/Secretary when a transfer remains uncompleted past 30 days.',
    auto_apply: true,
    threshold_days: 30,
  },
];

async function ensureTenantRules(client, tenantId) {
  for (const r of DEFAULT_RULES) {
    await client.query(
      `INSERT INTO automation_rules (tenant_id, rule_code, name, description, is_enabled, auto_apply, threshold_days)
       VALUES ($1, $2::automation_rule_code, $3, $4, TRUE, $5, $6)
       ON CONFLICT (tenant_id, rule_code) DO NOTHING`,
      [tenantId, r.rule_code, r.name, r.description, r.auto_apply, r.threshold_days]
    );
  }
}

async function evaluateTenantRules({ tenantId, triggerSource = 'SCHEDULER', executedBy = null }) {
  return withTenantTx({ tenantId }, async (client) => {
    await ensureTenantRules(client, tenantId);

    const rulesRes = await client.query(
      `SELECT * FROM automation_rules WHERE tenant_id = $1 AND is_enabled = TRUE`,
      [tenantId]
    );

    const results = [];

    for (const rule of rulesRes.rows) {
      let affected = 0;
      let summary = '';

      if (rule.rule_code === 'SERVICE_YEAR_ROLLOVER') {
        // 1. Auto-activate a scheduled service year whose start_date..end_date covers today
        const upcoming = await client.query(
          `SELECT id, label FROM service_years
           WHERE tenant_id = $1
             AND is_current = FALSE
             AND CURRENT_DATE >= start_date
             AND CURRENT_DATE <= end_date
           ORDER BY start_date DESC LIMIT 1`,
          [tenantId]
        );

        if (upcoming.rows.length > 0) {
          await client.query(`UPDATE service_years SET is_current = FALSE WHERE tenant_id = $1`, [tenantId]);
          await client.query(
            `UPDATE service_years SET is_current = TRUE, rollover_pending = FALSE, updated_at = NOW() WHERE id = $1`,
            [upcoming.rows[0].id]
          );
          affected += 1;
          summary += `Activated scheduled term "${upcoming.rows[0].label}". `;
        }

        // 2. Handle expired service years (end_date < CURRENT_DATE)
        const expired = await client.query(
          `SELECT id, label FROM service_years
           WHERE tenant_id = $1 AND end_date < CURRENT_DATE AND (is_current = TRUE OR rollover_pending = FALSE)`,
          [tenantId]
        );

        if (expired.rows.length > 0) {
          const expiredIds = expired.rows.map((r) => r.id);
          if (rule.auto_apply) {
            const offUpd = await client.query(
              `UPDATE officers
               SET status = 'COMPLETED', updated_at = NOW()
               WHERE tenant_id = $1 AND service_year_id = ANY($2::uuid[]) AND status = 'ELECTED'`,
              [tenantId, expiredIds]
            );
            await client.query(
              `UPDATE service_years
               SET is_current = FALSE, rollover_pending = FALSE, updated_at = NOW()
               WHERE id = ANY($1::uuid[])`,
              [expiredIds]
            );
            affected += offUpd.rowCount;
            summary += `Auto-completed ${offUpd.rowCount} officer term(s) from expired service year(s).`;
          } else {
            const flagUpd = await client.query(
              `UPDATE service_years
               SET rollover_pending = TRUE, updated_at = NOW()
               WHERE id = ANY($1::uuid[]) AND rollover_pending = FALSE`,
              [expiredIds]
            );
            affected += flagUpd.rowCount;
            if (flagUpd.rowCount > 0) {
              summary += `Flagged ${flagUpd.rowCount} ended service year(s) for Clerk/Pastor rollover confirmation.`;
            }
          }
        }
      }

      if (rule.rule_code === 'READING_WINDOW_READY') {
        const days = Math.max(1, Number(rule.threshold_days || 7));

        const offReady = await client.query(
          `UPDATE officers
           SET reading_ready_at = NOW(), updated_at = NOW()
           WHERE tenant_id = $1
             AND status = 'NOMINATED'
             AND first_reading_date IS NOT NULL
             AND first_reading_date + ($2 || ' days')::interval <= CURRENT_DATE
             AND reading_ready_at IS NULL`,
          [tenantId, days]
        );

        const txReady = await client.query(
          `UPDATE membership_transactions
           SET reading_ready_at = NOW(), updated_at = NOW()
           WHERE tenant_id = $1
             AND transfer_status = 'FIRST_READING'
             AND first_reading_date IS NOT NULL
             AND first_reading_date + ($2 || ' days')::interval <= CURRENT_DATE
             AND reading_ready_at IS NULL`,
          [tenantId, days]
        );

        affected = offReady.rowCount + txReady.rowCount;
        if (affected > 0) {
          summary = `${offReady.rowCount} nomination(s) and ${txReady.rowCount} transfer(s) passed the ${days}-day reading window.`;
        }
      }

      if (rule.rule_code === 'BOARD_ACTION_OVERDUE') {
        const overdueUpd = await client.query(
          `UPDATE board_actions
           SET is_overdue = TRUE, updated_at = NOW()
           WHERE tenant_id = $1
             AND status IN ('VOTED', 'IN_PROGRESS')
             AND due_date IS NOT NULL
             AND due_date < CURRENT_DATE
             AND is_overdue = FALSE`,
          [tenantId]
        );
        affected = overdueUpd.rowCount;
        if (affected > 0) {
          summary = `Marked ${affected} board/executive action(s) as overdue.`;
        }
      }

      if (rule.rule_code === 'STALE_TRANSFER_ALERT') {
        const days = Math.max(7, Number(rule.threshold_days || 30));
        const staleUpd = await client.query(
          `UPDATE membership_transactions
           SET is_stale_alert = TRUE, updated_at = NOW()
           WHERE tenant_id = $1
             AND transfer_status IN ('REQUESTED', 'FIRST_READING', 'BOARD_RECOMMENDED', 'BUSINESS_VOTED')
             AND effective_date + ($2 || ' days')::interval <= CURRENT_DATE
             AND is_stale_alert = FALSE`,
          [tenantId, days]
        );
        affected = staleUpd.rowCount;
        if (affected > 0) {
          summary = `Flagged ${affected} uncompleted transfer(s) open longer than ${days} days.`;
        }
      }

      await client.query(
        `UPDATE automation_rules SET last_run_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [rule.id]
      );

      if (affected > 0 || triggerSource === 'MANUAL') {
        await client.query(
          `INSERT INTO automation_runs (tenant_id, rule_code, trigger_source, affected_count, summary, executed_by)
           VALUES ($1, $2::automation_rule_code, $3, $4, $5, $6)`,
          [
            tenantId,
            rule.rule_code,
            triggerSource,
            affected,
            summary || 'No new items matched rule criteria.',
            executedBy,
          ]
        );

        if (affected > 0) {
          await client.query(
            `INSERT INTO audit_logs (tenant_id, actor_user_id, action, entity_type, metadata)
             VALUES ($1, $2, 'AUTOMATION_RULE_EXECUTED', 'automation_rule', $3::jsonb)`,
            [
              tenantId,
              executedBy,
              JSON.stringify({ ruleCode: rule.rule_code, triggerSource, affected, summary }),
            ]
          );
        }
      }

      results.push({ ruleCode: rule.rule_code, affected, summary: summary || 'Up to date' });
    }

    return results;
  });
}

async function runAllTenantsSweep() {
  return withTenantTx({ isPlatformAdmin: true }, async (client) => {
    // Advisory lock prevents overlapping runs if multiple instances run
    const lock = await client.query(`SELECT pg_try_advisory_xact_lock(91742026) AS acquired`);
    if (!lock.rows[0]?.acquired) return { skipped: true };

    // Clean up expired invite codes globally
    await client.query(
      `UPDATE verification_codes
       SET max_uses = uses_count
       WHERE expires_at IS NOT NULL AND expires_at < NOW() AND uses_count < max_uses`
    );

    const tenants = await client.query(
      `SELECT id FROM tenants WHERE verification_status = 'VERIFIED'`
    );

    let tenantsProcessed = 0;
    for (const t of tenants.rows) {
      await evaluateTenantRules({ tenantId: t.id, triggerSource: 'SCHEDULER', executedBy: null });
      tenantsProcessed += 1;
    }

    return { tenantsProcessed };
  });
}

module.exports = {
  ensureTenantRules,
  evaluateTenantRules,
  runAllTenantsSweep,
};
