const rateLimit = require('express-rate-limit');

const publicSubmitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many submissions. Please wait a few minutes and try again.' },
});

// Stricter limiter for endpoints that create a Firebase Auth account.
const accountCreationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many registration attempts from this device. Please try again in an hour.' },
});

module.exports = { publicSubmitLimiter, accountCreationLimiter };
