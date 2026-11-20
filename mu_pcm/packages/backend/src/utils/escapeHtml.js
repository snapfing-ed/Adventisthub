// packages/backend/src/utils/escapeHtml.js
//
// Escapes user-supplied text before it's interpolated into an HTML email
// template. Without this, a public form submitter (prayer request, contact
// form, group join request, student registration) can embed raw HTML/links
// into the notification email your team receives — e.g. a fake "Approve"
// button pointing at a phishing site.
//
// Usage:
//   const { escapeHtml } = require('../utils/escapeHtml');
//   html: `<p>Hello ${escapeHtml(name)}</p>`

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = { escapeHtml };
