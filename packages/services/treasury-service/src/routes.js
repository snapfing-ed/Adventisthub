"use strict";
const express = require('express');
const {
  verifySession,
  requireTenantRole,
  requireVerifiedTenant,
} = require('../../../shared/src');

const router = express.Router();

const TREASURY_READ_ROLES = ['ADMIN', 'TREASURER', 'PASTOR', 'ELDER', 'PCM_LEADER'];
const TREASURY_WRITE_ROLES = ['ADMIN', 'TREASURER', 'PCM_LEADER'];

const VALID_CATEGORIES = [
  'TITHE',
  'CONFERENCE_OFFERING',
  'LOCAL_BUDGET',
  'PROJECT_PLEDGE',
  'CAMP_MEETING',
  'PCM_CHAPTER_FUND',
];

const TRUST_DEFAULT_CATEGORIES = ['TITHE', 'CONFERENCE_OFFERING', 'CAMP_MEETING'];

function enforceChapterWriteGuard(req, res, next) {
  if (req.user?.is_platform_admin) return next();
  if (
    req.tenantRole === 'PCM_LEADER' &&
    req.tenant?.organization_type !== 'PCM_CHAPTER'
  ) {
    return res.status(403).json({
      error: 'PCM_LEADER treasury write access is restricted to PCM Campus Chapters.',
    });
  }
  return next();
}

function escapeCsv(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// ── 1. Summary & Stewardship Roll-ups ──────────────────────────────────────
router.get(
  '/treasury/summary',
  verifySession,
  requireTenantRole(...TREASURY_READ_ROLES),
  async (req, res) => {
    try {
      const data = await req.dbTx(async (client) => {
        const totalsRes = await client.query(
          `SELECT
             COALESCE(SUM(CASE WHEN c.status = 'POSTED' THEN li.amount ELSE 0 END), 0) AS total_posted,
             COALESCE(SUM(CASE WHEN c.status = 'POSTED' AND f.is_trust_fund THEN li.amount ELSE 0 END), 0) AS total_trust_funds,
             COALESCE(SUM(CASE WHEN c.status = 'POSTED' AND NOT f.is_trust_fund THEN li.amount ELSE 0 END), 0) AS total_local_funds,
             COALESCE(SUM(CASE WHEN c.status = 'POSTED' AND f.category = 'TITHE' THEN li.amount ELSE 0 END), 0) AS total_tithe,
             COALESCE(SUM(CASE WHEN c.status = 'DRAFT' THEN li.amount ELSE 0 END), 0) AS total_draft
           FROM contributions c
           JOIN contribution_line_items li ON li.contribution_id = c.id
           JOIN funds f ON f.id = li.fund_id
           WHERE c.tenant_id = $1`,
          [req.tenant.id]
        );

        const byFundRes = await client.query(
          `SELECT
             f.id, f.code, f.name, f.category, f.is_trust_fund, f.target_amount, f.is_active,
             COALESCE(SUM(CASE WHEN c.status = 'POSTED' THEN li.amount ELSE 0 END), 0) AS collected_amount,
             COUNT(DISTINCT CASE WHEN c.status = 'POSTED' THEN c.id END)::int AS receipt_count
           FROM funds f
           LEFT JOIN contribution_line_items li ON li.fund_id = f.id
           LEFT JOIN contributions c ON c.id = li.contribution_id
           WHERE f.tenant_id = $1
           GROUP BY f.id
           ORDER BY f.is_trust_fund DESC, f.code ASC`,
          [req.tenant.id]
        );

        const pendingRemitRes = await client.query(
          `SELECT COALESCE(SUM(total_trust_due - remitted_amount), 0) AS pending_remittance_balance,
                  COUNT(*) FILTER (WHERE status = 'PENDING')::int AS pending_periods_count
           FROM remittances
           WHERE tenant_id = $1`,
          [req.tenant.id]
        );

        return {
          totals: totalsRes.rows[0],
          byFund: byFundRes.rows,
          remittances: pendingRemitRes.rows[0],
        };
      });

      res.json(data);
    } catch (err) {
      console.error('[treasury/summary]', err);
      res.status(500).json({ error: 'Failed to load treasury summary' });
    }
  }
);

// ── 2. Funds (Chart of Accounts) ───────────────────────────────────────────
router.get(
  '/funds',
  verifySession,
  requireTenantRole(...TREASURY_READ_ROLES),
  async (req, res) => {
    try {
      const funds = await req.dbTx(async (client) => {
        const result = await client.query(
          `SELECT f.*,
                  COALESCE(SUM(CASE WHEN c.status = 'POSTED' THEN li.amount ELSE 0 END), 0) AS collected_amount
           FROM funds f
           LEFT JOIN contribution_line_items li ON li.fund_id = f.id
           LEFT JOIN contributions c ON c.id = li.contribution_id
           WHERE f.tenant_id = $1
           GROUP BY f.id
           ORDER BY f.is_active DESC, f.is_trust_fund DESC, f.code ASC`,
          [req.tenant.id]
        );
        return result.rows;
      });
      res.json({ funds });
    } catch (err) {
      console.error('[GET /funds]', err);
      res.status(500).json({ error: 'Failed to fetch funds' });
    }
  }
);

router.post(
  '/funds/seed-defaults',
  verifySession,
  requireVerifiedTenant,
  requireTenantRole(...TREASURY_WRITE_ROLES),
  enforceChapterWriteGuard,
  async (req, res) => {
    try {
      const isPcm = req.tenant.organization_type === 'PCM_CHAPTER';
      const presets = isPcm
        ? [
            { code: 'TITHE-10', name: 'Tithe (10% Conference Trust)', category: 'TITHE', isTrust: true },
            { code: 'CONF-OFF', name: 'Combined / World Mission Offering', category: 'CONFERENCE_OFFERING', isTrust: true },
            { code: 'PCM-OPS', name: 'PCM Chapter Operations & Campus Ministry', category: 'PCM_CHAPTER_FUND', isTrust: false },
            { code: 'PCM-WEL', name: 'Student Welfare & Sabbath Lunch Fund', category: 'LOCAL_BUDGET', isTrust: false },
            { code: 'CAMP-EVG', name: 'Campus Evangelism & Convention Fund', category: 'CAMP_MEETING', isTrust: true },
          ]
        : [
            { code: 'TITHE-10', name: 'Tithe (10% Conference Trust)', category: 'TITHE', isTrust: true },
            { code: 'CONF-OFF', name: 'Combined / Conference & Mission Offerings', category: 'CONFERENCE_OFFERING', isTrust: true },
            { code: 'LOC-BUD', name: 'Local Church Combined Budget', category: 'LOCAL_BUDGET', isTrust: false },
            { code: 'BLD-PRJ', name: 'Church Building & Development Project', category: 'PROJECT_PLEDGE', isTrust: false },
            { code: 'CAMP-MTG', name: 'Annual Camp Meeting Offering', category: 'CAMP_MEETING', isTrust: true },
          ];

      const created = await req.dbTx(async (client) => {
        const inserted = [];
        for (const p of presets) {
          const r = await client.query(
            `INSERT INTO funds (tenant_id, code, name, category, is_trust_fund, created_by)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (tenant_id, code) DO NOTHING
             RETURNING *`,
            [req.tenant.id, p.code, p.name, p.category, p.isTrust, req.user.id]
          );
          if (r.rows[0]) inserted.push(r.rows[0]);
        }

        await client.query(
          `INSERT INTO audit_logs (tenant_id, actor_user_id, action, entity_type, metadata)
           VALUES ($1, $2, 'FUNDS_SEEDED', 'fund', $3::jsonb)`,
          [req.tenant.id, req.user.id, JSON.stringify({ count: inserted.length })]
        );
        return inserted;
      });

      res.status(201).json({ created, count: created.length });
    } catch (err) {
      console.error('[POST /funds/seed-defaults]', err);
      res.status(500).json({ error: 'Failed to seed standard SDA funds' });
    }
  }
);

router.post(
  '/funds',
  verifySession,
  requireVerifiedTenant,
  requireTenantRole(...TREASURY_WRITE_ROLES),
  enforceChapterWriteGuard,
  async (req, res) => {
    try {
      const { code, name, category, isTrustFund, targetAmount, description } = req.body || {};
      if (!code || !name || !VALID_CATEGORIES.includes(category)) {
        return res.status(400).json({ error: 'Valid fund code, name, and category are required.' });
      }

      const trustFlag =
        typeof isTrustFund === 'boolean'
          ? isTrustFund
          : TRUST_DEFAULT_CATEGORIES.includes(category);

      const fund = await req.dbTx(async (client) => {
        const r = await client.query(
          `INSERT INTO funds (tenant_id, code, name, category, is_trust_fund, target_amount, description, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING *`,
          [
            req.tenant.id,
            String(code).trim().toUpperCase(),
            String(name).trim(),
            category,
            trustFlag,
            targetAmount ? Number(targetAmount) : null,
            description ? String(description).trim() : null,
            req.user.id,
          ]
        );

        await client.query(
          `INSERT INTO audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
           VALUES ($1, $2, 'FUND_CREATED', 'fund', $3, $4::jsonb)`,
          [
            req.tenant.id,
            req.user.id,
            r.rows[0].id,
            JSON.stringify({ code: r.rows[0].code, category, isTrustFund: trustFlag }),
          ]
        );
        return r.rows[0];
      });

      res.status(201).json({ fund });
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({ error: 'A fund with this code already exists.' });
      }
      console.error('[POST /funds]', err);
      res.status(500).json({ error: 'Failed to create fund' });
    }
  }
);

router.patch(
  '/funds/:id',
  verifySession,
  requireVerifiedTenant,
  requireTenantRole(...TREASURY_WRITE_ROLES),
  enforceChapterWriteGuard,
  async (req, res) => {
    try {
      const { name, targetAmount, description, isActive } = req.body || {};
      const fund = await req.dbTx(async (client) => {
        const r = await client.query(
          `UPDATE funds
           SET name = COALESCE($1, name),
               target_amount = COALESCE($2, target_amount),
               description = COALESCE($3, description),
               is_active = COALESCE($4, is_active),
               updated_at = NOW()
           WHERE id = $5 AND tenant_id = $6
           RETURNING *`,
          [
            name ? String(name).trim() : null,
            targetAmount !== undefined && targetAmount !== '' ? Number(targetAmount) : null,
            description !== undefined ? String(description).trim() : null,
            typeof isActive === 'boolean' ? isActive : null,
            req.params.id,
            req.tenant.id,
          ]
        );
        if (!r.rows[0]) return null;

        await client.query(
          `INSERT INTO audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
           VALUES ($1, $2, 'FUND_UPDATED', 'fund', $3, $4::jsonb)`,
          [req.tenant.id, req.user.id, r.rows[0].id, JSON.stringify({ isActive: r.rows[0].is_active })]
        );
        return r.rows[0];
      });

      if (!fund) return res.status(404).json({ error: 'Fund not found' });
      res.json({ fund });
    } catch (err) {
      console.error('[PATCH /funds/:id]', err);
      res.status(500).json({ error: 'Failed to update fund' });
    }
  }
);

// ── 3. Contributions & Itemized Receipts ───────────────────────────────────
router.get(
  '/contributions',
  verifySession,
  requireTenantRole(...TREASURY_READ_ROLES),
  async (req, res) => {
    try {
      const { status, personId, from, to, q } = req.query;
      const contributions = await req.dbTx(async (client) => {
        const conditions = ['c.tenant_id = $1'];
        const params = [req.tenant.id];

        if (status) {
          params.push(status);
          conditions.push(`c.status = $${params.length}`);
        }
        if (personId) {
          params.push(personId);
          conditions.push(`c.person_id = $${params.length}`);
        }
        if (from) {
          params.push(from);
          conditions.push(`c.contribution_date >= $${params.length}`);
        }
        if (to) {
          params.push(to);
          conditions.push(`c.contribution_date <= $${params.length}`);
        }
        if (q) {
          params.push(`%${String(q).trim()}%`);
          conditions.push(
            `(c.receipt_number ILIKE $${params.length} OR c.contributor_label ILIKE $${params.length} OR p.first_name ILIKE $${params.length} OR p.last_name ILIKE $${params.length})`
          );
        }

        const resRows = await client.query(
          `SELECT
             c.*,
             p.first_name AS person_first_name,
             p.last_name AS person_last_name,
             p.membership_status AS person_status,
             COALESCE(
               json_agg(
                 json_build_object(
                   'id', li.id,
                   'fund_id', li.fund_id,
                   'fund_code', f.code,
                   'fund_name', f.name,
                   'category', f.category,
                   'is_trust_fund', f.is_trust_fund,
                   'amount', li.amount,
                   'memo', li.memo
                 )
                 ORDER BY f.is_trust_fund DESC, f.code ASC
               ) FILTER (WHERE li.id IS NOT NULL),
               '[]'::json
             ) AS line_items
           FROM contributions c
           LEFT JOIN persons p ON p.id = c.person_id
           LEFT JOIN contribution_line_items li ON li.contribution_id = c.id
           LEFT JOIN funds f ON f.id = li.fund_id
           WHERE ${conditions.join(' AND ')}
           GROUP BY c.id, p.first_name, p.last_name, p.membership_status
           ORDER BY c.contribution_date DESC, c.created_at DESC
           LIMIT 250`,
          params
        );
        return resRows.rows;
      });

      res.json({ contributions });
    } catch (err) {
      console.error('[GET /contributions]', err);
      res.status(500).json({ error: 'Failed to load contributions' });
    }
  }
);

router.get(
  '/contributions/export',
  verifySession,
  requireTenantRole(...TREASURY_READ_ROLES),
  async (req, res) => {
    try {
      const { status, from, to } = req.query;
      const rows = await req.dbTx(async (client) => {
        const conditions = ['c.tenant_id = $1'];
        const params = [req.tenant.id];
        if (status) {
          params.push(status);
          conditions.push(`c.status = $${params.length}`);
        }
        if (from) {
          params.push(from);
          conditions.push(`c.contribution_date >= $${params.length}`);
        }
        if (to) {
          params.push(to);
          conditions.push(`c.contribution_date <= $${params.length}`);
        }

        const r = await client.query(
          `SELECT
             c.receipt_number,
             c.contribution_date,
             c.status,
             COALESCE(NULLIF(TRIM(CONCAT(p.first_name, ' ', p.last_name)), ''), c.contributor_label, 'Loose / Anonymous Offering') AS contributor,
             c.payment_method,
             c.reference_code,
             c.currency,
             f.code AS fund_code,
             f.name AS fund_name,
             f.category AS fund_category,
             CASE WHEN f.is_trust_fund THEN 'CONFERENCE_TRUST' ELSE 'LOCAL_CHURCH_CHAPTER' END AS stewardship_scope,
             li.amount AS line_amount,
             li.memo
           FROM contributions c
           JOIN contribution_line_items li ON li.contribution_id = c.id
           JOIN funds f ON f.id = li.fund_id
           LEFT JOIN persons p ON p.id = c.person_id
           WHERE ${conditions.join(' AND ')}
           ORDER BY c.contribution_date DESC, c.receipt_number ASC`,
          params
        );
        return r.rows;
      });

      const headers = [
        'Receipt Number',
        'Date',
        'Status',
        'Contributor',
        'Payment Method',
        'Reference',
        'Currency',
        'Fund Code',
        'Fund Name',
        'Category',
        'Stewardship Scope',
        'Amount',
        'Memo',
      ];
      const csvLines = [headers.join(',')];
      for (const r of rows) {
        csvLines.push(
          [
            r.receipt_number,
            String(r.contribution_date).slice(0, 10),
            r.status,
            r.contributor,
            r.payment_method,
            r.reference_code || '',
            r.currency,
            r.fund_code,
            r.fund_name,
            r.fund_category,
            r.stewardship_scope,
            r.line_amount,
            r.memo || '',
          ]
            .map(escapeCsv)
            .join(',')
        );
      }

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="treasury-ledger-${new Date().toISOString().slice(0, 10)}.csv"`
      );
      res.send(csvLines.join('\n'));
    } catch (err) {
      console.error('[GET /contributions/export]', err);
      res.status(500).json({ error: 'Failed to export treasury CSV' });
    }
  }
);

router.post(
  '/contributions',
  verifySession,
  requireVerifiedTenant,
  requireTenantRole(...TREASURY_WRITE_ROLES),
  enforceChapterWriteGuard,
  async (req, res) => {
    try {
      const {
        receiptNumber,
        contributionDate,
        personId,
        contributorLabel,
        paymentMethod,
        referenceCode,
        currency,
        status,
        notes,
        lineItems,
      } = req.body || {};

      if (!Array.isArray(lineItems) || lineItems.length === 0) {
        return res.status(400).json({ error: 'At least one fund line item is required.' });
      }

      const normalizedLines = lineItems.map((item) => ({
        fundId: item.fundId,
        amount: Number(item.amount),
        memo: item.memo ? String(item.memo).trim() : null,
      }));

      if (normalizedLines.some((l) => !l.fundId || !Number.isFinite(l.amount) || l.amount <= 0)) {
        return res.status(400).json({ error: 'Each line item requires a valid fund and positive amount.' });
      }

      const totalAmount = Number(
        normalizedLines.reduce((acc, l) => acc + l.amount, 0).toFixed(2)
      );
      const entryStatus = status === 'DRAFT' ? 'DRAFT' : 'POSTED';

      const created = await req.dbTx(async (client) => {
        let finalReceipt = receiptNumber ? String(receiptNumber).trim().toUpperCase() : '';
        if (!finalReceipt) {
          const year = (contributionDate || new Date().toISOString().slice(0, 10)).slice(0, 4);
          const countRes = await client.query(
            `SELECT COUNT(*)::int AS cnt FROM contributions WHERE tenant_id = $1`,
            [req.tenant.id]
          );
          const nextSeq = String((countRes.rows[0]?.cnt || 0) + 1).padStart(4, '0');
          finalReceipt = `RCP-${year}-${nextSeq}`;
        }

        const contribRes = await client.query(
          `INSERT INTO contributions (
             tenant_id, receipt_number, contribution_date, person_id, contributor_label,
             payment_method, reference_code, currency, total_amount, status, notes,
             recorded_by, posted_by, posted_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
           RETURNING *`,
          [
            req.tenant.id,
            finalReceipt,
            contributionDate || new Date().toISOString().slice(0, 10),
            personId || null,
            contributorLabel ? String(contributorLabel).trim() : null,
            paymentMethod || 'CASH',
            referenceCode ? String(referenceCode).trim() : null,
            currency || 'ZMW',
            totalAmount,
            entryStatus,
            notes ? String(notes).trim() : null,
            req.user.id,
            entryStatus === 'POSTED' ? req.user.id : null,
            entryStatus === 'POSTED' ? new Date().toISOString() : null,
          ]
        );

        const contrib = contribRes.rows[0];

        for (const line of normalizedLines) {
          await client.query(
            `INSERT INTO contribution_line_items (tenant_id, contribution_id, fund_id, amount, memo)
             VALUES ($1, $2, $3, $4, $5)`,
            [req.tenant.id, contrib.id, line.fundId, line.amount, line.memo]
          );
        }

        await client.query(
          `INSERT INTO audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
           VALUES ($1, $2, $3, 'contribution', $4, $5::jsonb)`,
          [
            req.tenant.id,
            req.user.id,
            entryStatus === 'POSTED' ? 'CONTRIBUTION_POSTED' : 'CONTRIBUTION_DRAFTED',
            contrib.id,
            JSON.stringify({
              receiptNumber: contrib.receipt_number,
              totalAmount,
              lineCount: normalizedLines.length,
              anonymous: !personId,
            }),
          ]
        );

        return contrib;
      });

      res.status(201).json({ contribution: created });
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({ error: 'Receipt number already exists for this organization.' });
      }
      console.error('[POST /contributions]', err);
      res.status(500).json({ error: 'Failed to record contribution receipt' });
    }
  }
);

router.patch(
  '/contributions/:id/post',
  verifySession,
  requireVerifiedTenant,
  requireTenantRole(...TREASURY_WRITE_ROLES),
  enforceChapterWriteGuard,
  async (req, res) => {
    try {
      const updated = await req.dbTx(async (client) => {
        const r = await client.query(
          `UPDATE contributions
           SET status = 'POSTED',
               posted_by = $1,
               posted_at = NOW(),
               updated_at = NOW()
           WHERE id = $2 AND tenant_id = $3 AND status = 'DRAFT'
           RETURNING *`,
          [req.user.id, req.params.id, req.tenant.id]
        );
        if (!r.rows[0]) return null;

        await client.query(
          `INSERT INTO audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
           VALUES ($1, $2, 'CONTRIBUTION_POSTED', 'contribution', $3, $4::jsonb)`,
          [
            req.tenant.id,
            req.user.id,
            r.rows[0].id,
            JSON.stringify({ receiptNumber: r.rows[0].receipt_number }),
          ]
        );
        return r.rows[0];
      });

      if (!updated) {
        return res.status(400).json({ error: 'Only DRAFT receipts can be posted.' });
      }
      res.json({ contribution: updated });
    } catch (err) {
      console.error('[PATCH /contributions/:id/post]', err);
      res.status(500).json({ error: 'Failed to post receipt' });
    }
  }
);

router.patch(
  '/contributions/:id/void',
  verifySession,
  requireVerifiedTenant,
  requireTenantRole(...TREASURY_WRITE_ROLES),
  enforceChapterWriteGuard,
  async (req, res) => {
    try {
      const { voidReason } = req.body || {};
      if (!voidReason || String(voidReason).trim().length < 3) {
        return res.status(400).json({ error: 'A clear void reason is required for stewardship audit compliance.' });
      }

      const updated = await req.dbTx(async (client) => {
        const r = await client.query(
          `UPDATE contributions
           SET status = 'VOIDED',
               voided_by = $1,
               voided_at = NOW(),
               void_reason = $2,
               updated_at = NOW()
           WHERE id = $3 AND tenant_id = $4 AND status <> 'VOIDED'
           RETURNING *`,
          [req.user.id, String(voidReason).trim(), req.params.id, req.tenant.id]
        );
        if (!r.rows[0]) return null;

        await client.query(
          `INSERT INTO audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
           VALUES ($1, $2, 'CONTRIBUTION_VOIDED', 'contribution', $3, $4::jsonb)`,
          [
            req.tenant.id,
            req.user.id,
            r.rows[0].id,
            JSON.stringify({
              receiptNumber: r.rows[0].receipt_number,
              voidReason: String(voidReason).trim(),
            }),
          ]
        );
        return r.rows[0];
      });

      if (!updated) {
        return res.status(404).json({ error: 'Receipt not found or already voided.' });
      }
      res.json({ contribution: updated });
    } catch (err) {
      console.error('[PATCH /contributions/:id/void]', err);
      res.status(500).json({ error: 'Failed to void receipt' });
    }
  }
);

// ── 4. Conference / Field Remittances ──────────────────────────────────────
router.get(
  '/remittances',
  verifySession,
  requireTenantRole(...TREASURY_READ_ROLES),
  async (req, res) => {
    try {
      const remittances = await req.dbTx(async (client) => {
        const r = await client.query(
          `SELECT rem.*, sy.label AS service_year_label
           FROM remittances rem
           LEFT JOIN service_years sy ON sy.id = rem.service_year_id
           WHERE rem.tenant_id = $1
           ORDER BY rem.reporting_period DESC`,
          [req.tenant.id]
        );
        return r.rows;
      });
      res.json({ remittances });
    } catch (err) {
      console.error('[GET /remittances]', err);
      res.status(500).json({ error: 'Failed to load remittances' });
    }
  }
);

router.post(
  '/remittances/calculate',
  verifySession,
  requireVerifiedTenant,
  requireTenantRole(...TREASURY_WRITE_ROLES),
  enforceChapterWriteGuard,
  async (req, res) => {
    try {
      const { reportingPeriod, destinationEntity } = req.body || {};
      if (!reportingPeriod || !/^\d{4}-\d{2}$/.test(String(reportingPeriod))) {
        return res.status(400).json({ error: 'reportingPeriod must be formatted as YYYY-MM (e.g., 2026-11).' });
      }

      const [yearStr, monthStr] = String(reportingPeriod).split('-');
      const periodStart = `${yearStr}-${monthStr}-01`;
      const lastDay = new Date(Number(yearStr), Number(monthStr), 0).getDate();
      const periodEnd = `${yearStr}-${monthStr}-${String(lastDay).padStart(2, '0')}`;

      const remittance = await req.dbTx(async (client) => {
        const agg = await client.query(
          `SELECT
             COALESCE(SUM(CASE WHEN f.category = 'TITHE' THEN li.amount ELSE 0 END), 0) AS tithe_amount,
             COALESCE(SUM(CASE WHEN f.is_trust_fund AND f.category <> 'TITHE' THEN li.amount ELSE 0 END), 0) AS conference_offering_amount,
             COALESCE(SUM(CASE WHEN f.is_trust_fund THEN li.amount ELSE 0 END), 0) AS total_trust_due
           FROM contributions c
           JOIN contribution_line_items li ON li.contribution_id = c.id
           JOIN funds f ON f.id = li.fund_id
           WHERE c.tenant_id = $1
             AND c.status = 'POSTED'
             AND c.contribution_date >= $2
             AND c.contribution_date <= $3`,
          [req.tenant.id, periodStart, periodEnd]
        );

        const syRes = await client.query(
          `SELECT id FROM service_years WHERE tenant_id = $1 AND is_current = TRUE LIMIT 1`,
          [req.tenant.id]
        );

        const row = agg.rows[0];
        const upserted = await client.query(
          `INSERT INTO remittances (
             tenant_id, reporting_period, period_start, period_end, service_year_id,
             tithe_amount, conference_offering_amount, total_trust_due, destination_entity
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (tenant_id, reporting_period) DO UPDATE
           SET tithe_amount = EXCLUDED.tithe_amount,
               conference_offering_amount = EXCLUDED.conference_offering_amount,
               total_trust_due = EXCLUDED.total_trust_due,
               destination_entity = COALESCE(EXCLUDED.destination_entity, remittances.destination_entity),
               updated_at = NOW()
           RETURNING *`,
          [
            req.tenant.id,
            reportingPeriod,
            periodStart,
            periodEnd,
            syRes.rows[0]?.id || null,
            row.tithe_amount,
            row.conference_offering_amount,
            row.total_trust_due,
            destinationEntity || req.tenant.region_or_conference || 'Conference / Field Treasury',
          ]
        );

        await client.query(
          `INSERT INTO audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
           VALUES ($1, $2, 'REMITTANCE_CALCULATED', 'remittance', $3, $4::jsonb)`,
          [
            req.tenant.id,
            req.user.id,
            upserted.rows[0].id,
            JSON.stringify({
              reportingPeriod,
              totalTrustDue: row.total_trust_due,
            }),
          ]
        );

        return upserted.rows[0];
      });

      res.json({ remittance });
    } catch (err) {
      console.error('[POST /remittances/calculate]', err);
      res.status(500).json({ error: 'Failed to calculate period remittance' });
    }
  }
);

router.patch(
  '/remittances/:id',
  verifySession,
  requireVerifiedTenant,
  requireTenantRole(...TREASURY_WRITE_ROLES),
  enforceChapterWriteGuard,
  async (req, res) => {
    try {
      const { remittedAmount, remittanceDate, referenceNumber, status, notes } = req.body || {};
      const remittance = await req.dbTx(async (client) => {
        const r = await client.query(
          `UPDATE remittances
           SET remitted_amount = COALESCE($1, remitted_amount),
               remittance_date = COALESCE($2, remittance_date),
               reference_number = COALESCE($3, reference_number),
               status = COALESCE($4, status),
               notes = COALESCE($5, notes),
               submitted_by = CASE WHEN $4 IN ('SUBMITTED', 'RECONCILED') THEN $6 ELSE submitted_by END,
               updated_at = NOW()
           WHERE id = $7 AND tenant_id = $8
           RETURNING *`,
          [
            remittedAmount !== undefined && remittedAmount !== '' ? Number(remittedAmount) : null,
            remittanceDate || null,
            referenceNumber !== undefined ? String(referenceNumber).trim() : null,
            status || null,
            notes !== undefined ? String(notes).trim() : null,
            req.user.id,
            req.params.id,
            req.tenant.id,
          ]
        );
        if (!r.rows[0]) return null;

        await client.query(
          `INSERT INTO audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
           VALUES ($1, $2, 'REMITTANCE_UPDATED', 'remittance', $3, $4::jsonb)`,
          [
            req.tenant.id,
            req.user.id,
            r.rows[0].id,
            JSON.stringify({
              reportingPeriod: r.rows[0].reporting_period,
              status: r.rows[0].status,
              remittedAmount: r.rows[0].remitted_amount,
            }),
          ]
        );
        return r.rows[0];
      });

      if (!remittance) return res.status(404).json({ error: 'Remittance record not found' });
      res.json({ remittance });
    } catch (err) {
      console.error('[PATCH /remittances/:id]', err);
      res.status(500).json({ error: 'Failed to update remittance' });
    }
  }
);

module.exports = router;
