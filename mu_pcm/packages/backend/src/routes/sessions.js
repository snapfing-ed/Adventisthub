const express = require('express');
const admin = require('firebase-admin');
const rateLimit = require('express-rate-limit');
const router = express.Router();

// Rate limiters
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 6, standardHeaders: true, legacyHeaders: false }); // 6 per 15m
const logoutLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false }); // 30 per hour

// Helper to safely read cookies without added dependency when needed
function parseCookies(req) {
  const rc = req.headers.cookie || '';
  const out = {};
  rc.split(';').forEach((c) => {
    const idx = c.indexOf('=');
    if (idx === -1) return;
    const k = c.slice(0, idx).trim();
    const v = c.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  });
  return out;
}

// POST /api/sessionLogin
// Expects { idToken } and issues a Firebase session cookie as httpOnly cookie.
router.post('/sessionLogin', loginLimiter, express.json(), async (req, res) => {
  const { idToken } = req.body || {};
  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  if (!idToken) return res.status(400).json({ error: 'idToken required' });

  // 5 days
  const expiresIn = 5 * 24 * 60 * 60 * 1000;
  try {
    const sessionCookie = await admin.auth().createSessionCookie(idToken, { expiresIn });
    const cookieOpts = {
      maxAge: expiresIn,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    };
    res.cookie('session', sessionCookie, cookieOpts);
    console.log(`[sessions] sessionLogin success ip=${ip} uid=unknown`);
    return res.json({ success: true });
  } catch (err) {
    console.warn('[sessions/sessionLogin] invalid token from ip=', ip, err.message || err);
    return res.status(401).json({ error: 'Invalid id token' });
  }
});

// POST /api/sessionLogout
// Clears the session cookie and attempts to revoke refresh tokens for the session (best-effort).
router.post('/sessionLogout', logoutLimiter, async (req, res) => {
  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  try {
    const cookies = parseCookies(req);
    const sessionCookie = cookies.session;
    if (sessionCookie) {
      try {
        const decoded = await admin.auth().verifySessionCookie(sessionCookie, true);
        await admin.auth().revokeRefreshTokens(decoded.sub).catch(() => {});
        console.log(`[sessions] revoked refresh tokens for uid=${decoded.sub} ip=${ip}`);
      } catch (e) {
        console.warn('[sessions/sessionLogout] verifySessionCookie failed:', e.message || e);
      }
    }
  } catch (err) {
    console.error('[sessions/sessionLogout] unexpected:', err.message || err);
  }
  res.clearCookie('session', { path: '/' });
  return res.json({ success: true });
});

module.exports = router;

