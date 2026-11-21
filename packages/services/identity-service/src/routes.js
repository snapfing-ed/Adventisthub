"use strict";
const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { withTenantTx } = require('../../../shared/src');
const {
  signSessionToken,
  verifySession,
  requireTenantRole,
  requirePlatformAdmin,
} = require('../../../shared/src');

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

const COOKIE_MAX_AGE = 5 * 24 * 60 * 60 * 1000;
const VALID_ROLES = ['ADMIN', 'PASTOR', 'ELDER', 'CLERK', 'TREASURER', 'PCM_LEADER'];

function setSessionCookie(res, token) {
  res.cookie('session', token, {
    maxAge: COOKIE_MAX_AGE,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    domain: process.env.COOKIE_DOMAIN || undefined,
    path: '/',
  });
}

function slugify(name, customSlug) {
  const raw = customSlug || name || '';
  const base = String(raw)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  if (customSlug && base.length >= 3) return base;
  const suffix = crypto.randomBytes(2).toString('hex');
  return `${base || 'org'}-${suffix}`;
}

// GET /api/public/tenants/:slug — Public subdomain resolver
router.get('/public/tenants/:slug', async (req, res) => {
  const slug = String(req.params.slug || '').toLowerCase().trim();
  try {
    const tenant = await withTenantTx({ isPlatformAdmin: true }, async (client) => {
      const q = await client.query(
        `SELECT id, name, slug, organization_type, verification_status, country, region_or_conference, city_or_campus
         FROM tenants WHERE slug = $1`,
        [slug]
      );
      return q.rows[0] || null;
    });
    if (!tenant) return res.status(404).json({ error: 'Organization not found' });
    return res.json({ tenant });
  } catch (err) {
    console.error('[public/tenants/slug] error:', err);
    return res.status(500).json({ error: 'Failed to resolve organization' });
  }
});

// POST /api/auth/register — Creates User + Tenant (CHURCH | PCM_CHAPTER) + Optional Invite Code Verification
router.post('/auth/register', authLimiter, async (req, res) => {
  const {
    fullName,
    email,
    password,
    phone,
    organizationName,
    slug: requestedSlug,
    organizationType, // 'CHURCH' | 'PCM_CHAPTER'
    country,
    regionOrConference,
    cityOrCampus,
    verificationCode,
    verificationDocUrl,
  } = req.body || {};

  if (!fullName || !email || !password || !organizationName || !organizationType) {
    return res.status(400).json({
      error: 'fullName, email, password, organizationName, and organizationType are required',
    });
  }

  if (!['CHURCH', 'PCM_CHAPTER'].includes(organizationType)) {
    return res.status(400).json({ error: 'organizationType must be CHURCH or PCM_CHAPTER' });
  }

  if (String(password).length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const tenantSlug = slugify(organizationName, requestedSlug);

  try {
    const passwordHash = await bcrypt.hash(password, 12);

    const created = await withTenantTx({ isPlatformAdmin: true }, async (client) => {
      const existingEmail = await client.query('SELECT id FROM users WHERE LOWER(email) = $1', [
        normalizedEmail,
      ]);
      if (existingEmail.rowCount > 0) {
        const err = new Error('An account with this email already exists');
        err.status = 409;
        throw err;
      }

      const existingSlug = await client.query('SELECT id FROM tenants WHERE slug = $1', [tenantSlug]);
      if (existingSlug.rowCount > 0) {
        const err = new Error(`Subdomain '${tenantSlug}' is already taken`);
        err.status = 409;
        throw err;
      }

      // Check optional fast-track verification code
      let status = 'PENDING';
      let codeRow = null;
      if (verificationCode && String(verificationCode).trim()) {
        const codeRes = await client.query(
          `SELECT * FROM verification_codes
           WHERE UPPER(code) = UPPER($1)
             AND uses_count < max_uses
             AND (expires_at IS NULL OR expires_at > NOW())
           FOR UPDATE`,
          [String(verificationCode).trim()]
        );
        if (codeRes.rowCount === 0) {
          const err = new Error('Invalid, expired, or already used verification code');
          err.status = 400;
          throw err;
        }
        codeRow = codeRes.rows[0];
        if (codeRow.allowed_org_type && codeRow.allowed_org_type !== organizationType) {
          const err = new Error(`This verification code is only valid for ${codeRow.allowed_org_type}`);
          err.status = 400;
          throw err;
        }
        status = 'VERIFIED';
      }

      const userRes = await client.query(
        `INSERT INTO users (email, password_hash, full_name, phone)
         VALUES ($1, $2, $3, $4)
         RETURNING id, email, full_name, phone, is_platform_admin`,
        [normalizedEmail, passwordHash, String(fullName).trim(), phone || null]
      );
      const user = userRes.rows[0];

      const tenantRes = await client.query(
        `INSERT INTO tenants (
           name, slug, organization_type, verification_status,
           verification_doc_url, verified_at, country, region_or_conference, city_or_campus
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, name, slug, organization_type, verification_status`,
        [
          String(organizationName).trim(),
          tenantSlug,
          organizationType,
          status,
          verificationDocUrl || null,
          status === 'VERIFIED' ? new Date() : null,
          country || null,
          regionOrConference || null,
          cityOrCampus || null,
        ]
      );
      const tenant = tenantRes.rows[0];

      await client.query(
        `INSERT INTO tenant_memberships (tenant_id, user_id, role)
         VALUES ($1, $2, 'ADMIN')`,
        [tenant.id, user.id]
      );

      if (codeRow) {
        await client.query(
          `UPDATE verification_codes SET uses_count = uses_count + 1 WHERE id = $1`,
          [codeRow.id]
        );
      }

      await client.query(
        `INSERT INTO audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
         VALUES ($1, $2, 'TENANT_REGISTERED', 'tenant', $1, $3::jsonb)`,
        [
          tenant.id,
          user.id,
          JSON.stringify({ organizationType, verificationStatus: status, viaCode: Boolean(codeRow) }),
        ]
      );

      return { user, tenant };
    });

    const token = signSessionToken(created.user);
    setSessionCookie(res, token);

    return res.status(201).json({
      user: created.user,
      tenant: created.tenant,
      role: 'ADMIN',
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[auth/register] error:', err);
    return res.status(500).json({ error: 'Registration failed' });
  }
});

// POST /api/auth/login
router.post('/auth/login', authLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const result = await withTenantTx({ isPlatformAdmin: true }, async (client) => {
      const userRes = await client.query(
        `SELECT id, email, password_hash, full_name, phone, is_platform_admin
         FROM users WHERE LOWER(email) = LOWER($1)`,
        [String(email).trim()]
      );
      if (userRes.rowCount === 0) return null;

      const user = userRes.rows[0];
      const valid = await bcrypt.compare(String(password), user.password_hash);
      if (!valid) return null;

      await client.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

      const memRes = await client.query(
        `SELECT tm.tenant_id, tm.role, t.name AS tenant_name, t.slug AS tenant_slug,
                t.organization_type, t.verification_status
         FROM tenant_memberships tm
         JOIN tenants t ON t.id = tm.tenant_id
         WHERE tm.user_id = $1 AND tm.is_active = TRUE
         ORDER BY tm.created_at ASC`,
        [user.id]
      );

      delete user.password_hash;
      return { user, memberships: memRes.rows };
    });

    if (!result) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = signSessionToken(result.user);
    setSessionCookie(res, token);

    return res.json({
      user: result.user,
      memberships: result.memberships,
    });
  } catch (err) {
    console.error('[auth/login] error:', err);
    return res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/auth/logout
router.post('/auth/logout', (req, res) => {
  res.clearCookie('session', {
    domain: process.env.COOKIE_DOMAIN || undefined,
    path: '/',
  });
  return res.json({ success: true });
});

// GET /api/auth/me
router.get('/auth/me', verifySession, (req, res) => {
  return res.json({
    user: req.user,
    memberships: req.memberships,
    activeTenant: req.tenant,
    activeRole: req.tenantRole,
  });
});

// PATCH /api/tenants/verification-doc — Attach credential URL for PENDING tenant
router.patch(
  '/tenants/verification-doc',
  verifySession,
  requireTenantRole('ADMIN'),
  async (req, res) => {
    const { verificationDocUrl, verificationNotes } = req.body || {};
    if (!verificationDocUrl) {
      return res.status(400).json({ error: 'verificationDocUrl is required' });
    }

    try {
      const updated = await req.dbTx(async (client) => {
        const upRes = await client.query(
          `UPDATE tenants
           SET verification_doc_url = $1,
               verification_notes = COALESCE($2, verification_notes),
               updated_at = NOW()
           WHERE id = $3
           RETURNING id, name, slug, organization_type, verification_status, verification_doc_url`,
          [verificationDocUrl, verificationNotes || null, req.tenant.id]
        );
        return upRes.rows[0];
      });
      return res.json({ tenant: updated });
    } catch (err) {
      console.error('[tenants/verification-doc] error:', err);
      return res.status(500).json({ error: 'Failed to update verification document' });
    }
  }
);

// ── Tenant Officer / Membership RBAC Management ────────────────────────────

// GET /api/tenants/memberships — List active officer accounts in current tenant
router.get('/tenants/memberships', verifySession, requireTenantRole('ADMIN', 'PASTOR', 'ELDER', 'CLERK', 'TREASURER', 'PCM_LEADER'),
  async (req, res) => {
    try {
      const rows = await req.dbTx(async (client) => {
        const q = await client.query(
          `SELECT tm.id, tm.role, tm.is_active, tm.created_at,
                  u.id AS user_id, u.full_name, u.email, u.phone
           FROM tenant_memberships tm
           JOIN users u ON u.id = tm.user_id
           WHERE tm.tenant_id = $1
           ORDER BY tm.created_at ASC`,
          [req.tenant.id]
        );
        return q.rows;
      });
      return res.json({ memberships: rows });
    } catch (err) {
      console.error('[tenants/memberships] error:', err);
      return res.status(500).json({ error: 'Failed to load tenant memberships' });
    }
  }
);

// POST /api/tenants/memberships — Add or assign an officer role in the current tenant
router.post(
  '/tenants/memberships',
  verifySession,
  requireTenantRole('ADMIN'),
  async (req, res) => {
    const { email, fullName, temporaryPassword, role } = req.body || {};
    if (!email || !role || !VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: `Valid email and role (${VALID_ROLES.join(', ')}) required` });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    try {
      const created = await withTenantTx({ isPlatformAdmin: true }, async (client) => {
        let userRes = await client.query(
          'SELECT id, email, full_name FROM users WHERE LOWER(email) = $1',
          [normalizedEmail]
        );
        let user = userRes.rows[0];

        if (!user) {
          if (!fullName || !temporaryPassword || String(temporaryPassword).length < 8) {
            const err = new Error('New user requires fullName and temporaryPassword (min 8 chars)');
            err.status = 400;
            throw err;
          }
          const hash = await bcrypt.hash(String(temporaryPassword), 12);
          const insUser = await client.query(
            `INSERT INTO users (email, password_hash, full_name)
             VALUES ($1, $2, $3)
             RETURNING id, email, full_name`,
            [normalizedEmail, hash, String(fullName).trim()]
          );
          user = insUser.rows[0];
        }

        const memRes = await client.query(
          `INSERT INTO tenant_memberships (tenant_id, user_id, role, is_active)
           VALUES ($1, $2, $3, TRUE)
           ON CONFLICT (tenant_id, user_id, role)
           DO UPDATE SET is_active = TRUE
           RETURNING *`,
          [req.tenant.id, user.id, role]
        );

        await client.query(
          `INSERT INTO audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
           VALUES ($1, $2, 'MEMBERSHIP_ASSIGNED', 'tenant_membership', $3, $4::jsonb)`,
          [req.tenant.id, req.user.id, memRes.rows[0].id, JSON.stringify({ userId: user.id, role })]
        );

        return { membership: memRes.rows[0], user };
      });

      return res.status(201).json(created);
    } catch (err) {
      if (err.status) return res.status(err.status).json({ error: err.message });
      console.error('[tenants/memberships POST] error:', err);
      return res.status(500).json({ error: 'Failed to assign membership' });
    }
  }
);

// ── Platform-Admin Verification Endpoints ──────────────────────────────────

router.get('/admin/tenants', verifySession, requirePlatformAdmin, async (req, res) => {
  const { status } = req.query;
  try {
    const tenants = await withTenantTx({ isPlatformAdmin: true }, async (client) => {
      const params = [];
      let where = '';
      if (status && ['PENDING', 'VERIFIED', 'SUSPENDED'].includes(status)) {
        params.push(status);
        where = 'WHERE t.verification_status = $1';
      }
      const q = await client.query(
        `SELECT t.*,
                (SELECT json_agg(json_build_object('id', u.id, 'full_name', u.full_name, 'email', u.email))
                 FROM tenant_memberships tm
                 JOIN users u ON u.id = tm.user_id
                 WHERE tm.tenant_id = t.id AND tm.role = 'ADMIN') AS admins
         FROM tenants t
         ${where}
         ORDER BY t.created_at DESC`,
        params
      );
      return q.rows;
    });
    return res.json({ tenants });
  } catch (err) {
    console.error('[admin/tenants] error:', err);
    return res.status(500).json({ error: 'Failed to load tenants' });
  }
});

router.patch('/admin/tenants/:id/verify', verifySession, requirePlatformAdmin, async (req, res) => {
  const { id } = req.params;
  const { status, notes } = req.body || {};

  if (!['VERIFIED', 'SUSPENDED', 'PENDING'].includes(status)) {
    return res.status(400).json({ error: 'status must be VERIFIED, SUSPENDED, or PENDING' });
  }

  try {
    const tenant = await withTenantTx({ isPlatformAdmin: true }, async (client) => {
      const up = await client.query(
        `UPDATE tenants
         SET verification_status = $1::verification_status,
             verification_notes = COALESCE($2, verification_notes),
             verified_at = CASE WHEN $1::verification_status = 'VERIFIED'::verification_status THEN NOW() ELSE verified_at END,
             verified_by = CASE WHEN $1::verification_status = 'VERIFIED'::verification_status THEN $3 ELSE verified_by END,
             updated_at = NOW()
         WHERE id = $4
         RETURNING *`,
        [status, notes || null, req.user.id, id]
      );
      if (up.rowCount === 0) return null;

      await client.query(
        `INSERT INTO audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
         VALUES ($1, $2, 'TENANT_VERIFICATION_UPDATED', 'tenant', $1, $3::jsonb)`,
        [id, req.user.id, JSON.stringify({ status, notes: notes || null })]
      );

      return up.rows[0];
    });

    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    return res.json({ tenant });
  } catch (err) {
    console.error('[admin/tenants/verify] error:', err);
    return res.status(500).json({ error: 'Failed to update tenant verification' });
  }
});

router.get('/admin/verification-codes', verifySession, requirePlatformAdmin, async (req, res) => {
  try {
    const codes = await withTenantTx({ isPlatformAdmin: true }, async (client) => {
      const q = await client.query('SELECT * FROM verification_codes ORDER BY created_at DESC LIMIT 100');
      return q.rows;
    });
    return res.json({ verificationCodes: codes });
  } catch (err) {
    console.error('[admin/verification-codes GET] error:', err);
    return res.status(500).json({ error: 'Failed to load verification codes' });
  }
});

router.post('/admin/verification-codes', verifySession, requirePlatformAdmin, async (req, res) => {
  const { allowedOrgType, issuedToLabel, maxUses = 1, expiresInDays = 30 } = req.body || {};
  const code = `ADV-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

  try {
    const created = await withTenantTx({ isPlatformAdmin: true }, async (client) => {
      const ins = await client.query(
        `INSERT INTO verification_codes (code, allowed_org_type, issued_to_label, max_uses, expires_at, created_by)
         VALUES ($1, $2, $3, $4, NOW() + ($5 || ' days')::interval, $6)
         RETURNING *`,
        [code, allowedOrgType || null, issuedToLabel || null, maxUses, String(expiresInDays), req.user.id]
      );
      return ins.rows[0];
    });
    return res.status(201).json({ verificationCode: created });
  } catch (err) {
    console.error('[admin/verification-codes POST] error:', err);
    return res.status(500).json({ error: 'Failed to create verification code' });
  }
});

module.exports = router;
