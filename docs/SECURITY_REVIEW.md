# Security Review Notes

This project currently has a few security-sensitive behaviors worth tracking:

- Admin access depends on Firebase Auth plus a server session cookie.
- Public submission routes can generate Firestore writes and outbound email.
- Uploads are routed through Cloudinary and must keep MIME allowlists tight.
- Historical secrets should be treated as compromised if they were ever committed.

## Confirmed Hardening Already In Place

- Public prayer, contact, and group join submissions are rate-limited.
- Student registration is rate-limited.
- Notification email content escapes user-supplied HTML.
- The clock-sync endpoint is disabled outside production.
- The admin portal frontend checks for a session cookie before rendering protected UI.

## Follow-Up Security Work

- Rotate `ADMIN_SECRET` if it was ever exposed in git history or deployment logs.
- Keep `CORS_ORIGIN` pinned to known frontend origins in production.
- Add automated tests for cookie flags, CORS, and limiter behavior.
- Review dependency upgrades after the next maintenance pass.

