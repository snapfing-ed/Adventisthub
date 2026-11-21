"use strict";
const jwt = require('jsonwebtoken');
const { withTenantTx } = require('./pool');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.warn('[auth] WARNING: JWT_SECRET is not set in environment variables.');
}

function signSessionToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, isPlatformAdmin: Boolean(user.is_platform_admin) },
    JWT_SECRET,
    { expiresIn: '5d' }
  );
}

const verifySession = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'] || '';
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const token = (req.cookies && req.cookies.session) || bearer;

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized — session required' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    const { user, memberships } = await withTenantTx({ isPlatformAdmin: true }, async (client) => {
      const userRes = await client.query(
        `SELECT id, email, full_name, phone, is_platform_admin
         FROM users WHERE id = $1`,
        [decoded.sub]
      );
      if (userRes.rowCount === 0) return { user: null, memberships: [] };

      const memRes = await client.query(
        `SELECT tm.id AS membership_id, tm.tenant_id, tm.role, tm.is_active,
                t.name AS tenant_name, t.slug AS tenant_slug,
                t.organization_type, t.verification_status
         FROM tenant_memberships tm
         JOIN tenants t ON t.id = tm.tenant_id
         WHERE tm.user_id = $1 AND tm.is_active = TRUE
         ORDER BY tm.created_at ASC`,
        [decoded.sub]
      );

      return { user: userRes.rows[0], memberships: memRes.rows };
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid session user' });
    }

    req.user = user;
    req.memberships = memberships;

    const requestedTenantId = req.headers['x-tenant-id'] || null;
    const requestedTenantSlug = req.headers['x-tenant-slug'] || null;
    let activeMembership = null;

    if (requestedTenantId) {
      activeMembership = memberships.find((m) => m.tenant_id === requestedTenantId) || null;
      if (!activeMembership && !user.is_platform_admin) {
        return res.status(403).json({ error: 'Access denied for requested tenant' });
      }
    } else if (requestedTenantSlug) {
      activeMembership = memberships.find((m) => m.tenant_slug === requestedTenantSlug) || null;
      if (!activeMembership && !user.is_platform_admin) {
        return res.status(403).json({ error: 'Access denied for requested organization subdomain' });
      }
    } else if (memberships.length > 0) {
      activeMembership = memberships[0];
    }

    req.tenant = activeMembership
      ? {
          id: activeMembership.tenant_id,
          name: activeMembership.tenant_name,
          slug: activeMembership.tenant_slug,
          organization_type: activeMembership.organization_type,
          verification_status: activeMembership.verification_status,
        }
      : null;
    req.tenantRole = activeMembership ? activeMembership.role : null;

    req.dbTx = (fn) =>
      withTenantTx(
        {
          tenantId: req.tenant ? req.tenant.id : null,
          isPlatformAdmin: Boolean(req.user.is_platform_admin),
        },
        fn
      );

    return next();
  } catch (err) {
    console.warn('[auth] verifySession failed:', err.message);
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
};

const requireTenantRole = (...allowedRoles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  if (req.user.is_platform_admin) return next();
  if (!req.tenant || !req.tenantRole) {
    return res.status(403).json({ error: 'No active organization selected' });
  }
  if (req.tenantRole === 'ADMIN' || allowedRoles.includes(req.tenantRole)) {
    return next();
  }
  return res.status(403).json({
    error: `Requires role: ${allowedRoles.join(' or ')}. Current role: ${req.tenantRole}`,
  });
};

const requireVerifiedTenant = (req, res, next) => {
  if (req.user && req.user.is_platform_admin) return next();
  if (!req.tenant) return res.status(403).json({ error: 'No active organization selected' });
  if (req.tenant.verification_status !== 'VERIFIED') {
    return res.status(403).json({
      error: 'Organization verification pending. Live operations unlock once verified.',
      verification_status: req.tenant.verification_status,
    });
  }
  return next();
};

const requirePlatformAdmin = (req, res, next) => {
  if (!req.user || !req.user.is_platform_admin) {
    return res.status(403).json({ error: 'Platform administrator access required' });
  }
  return next();
};


const ROLE_CAPABILITIES = {
  ADMIN: {
    label: "Tenant Manager (Admin)",
    directory: ["READ", "WRITE", "EXECUTE"],
    clerk: ["READ", "WRITE", "EXECUTE"],
    governance: ["READ", "WRITE", "EXECUTE"],
    treasury: ["READ", "WRITE", "EXECUTE"],
    pcm: ["READ", "WRITE", "EXECUTE"],
    automations: ["READ", "WRITE", "EXECUTE"],
    rbac: ["READ", "WRITE", "EXECUTE"],
  },
  PASTOR: {
    label: "Pastor",
    directory: ["READ", "WRITE"],
    clerk: ["READ", "WRITE"],
    governance: ["READ", "WRITE", "EXECUTE"],
    treasury: ["READ"],
    pcm: ["READ", "WRITE"],
    automations: ["READ"],
    rbac: ["READ"],
  },
  ELDER: {
    label: "Elder",
    directory: ["READ", "WRITE"],
    clerk: ["READ", "WRITE"],
    governance: ["READ", "WRITE"],
    treasury: ["READ"],
    pcm: ["READ", "WRITE"],
    automations: ["READ"],
    rbac: ["READ"],
  },
  CLERK: {
    label: "Church / Chapter Clerk",
    directory: ["READ", "WRITE", "EXECUTE"],
    clerk: ["READ", "WRITE", "EXECUTE"],
    governance: ["READ", "WRITE"],
    treasury: [],
    pcm: ["READ", "WRITE"],
    automations: ["READ", "WRITE"],
    rbac: ["READ"],
  },
  TREASURER: {
    label: "Treasurer",
    directory: ["READ"],
    clerk: [],
    governance: ["READ"],
    treasury: ["READ", "WRITE", "EXECUTE"],
    pcm: ["READ"],
    automations: ["READ"],
    rbac: ["READ"],
  },
  PCM_LEADER: {
    label: "PCM Chapter Leader",
    directory: ["READ", "WRITE"],
    clerk: ["READ", "WRITE"],
    governance: ["READ", "WRITE"],
    treasury: ["READ"],
    pcm: ["READ", "WRITE", "EXECUTE"],
    automations: ["READ", "WRITE"],
    rbac: ["READ"],
  },
};

module.exports = {
  ROLE_CAPABILITIES,
  signSessionToken,
  verifySession,
  requireTenantRole,
  requireVerifiedTenant,
  requirePlatformAdmin,
};
