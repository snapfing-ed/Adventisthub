# Deployment and Operations Runbook

## Environment Variables

Backend:
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `FIREBASE_STORAGE_BUCKET`
- `CORS_ORIGIN`
- `ADMIN_SECRET`
- `EMAIL_USER`
- `EMAIL_PASS`
- `NOTIFY_EMAIL`
- `PRAYER_TEAM_EMAIL`
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`

Frontend:
- `NEXT_PUBLIC_API_URL`
- Firebase client variables prefixed with `NEXT_PUBLIC_`

## Local Startup

Backend:
```bash
cd packages/backend
npm run dev
```

Frontend:
```bash
cd packages/frontend
npm run dev
```

## Production Notes

- Pin `CORS_ORIGIN` to the real frontend origin.
- Keep the clock-sync endpoint disabled in production.
- Rotate any secret that was ever committed to git history.
- Verify session cookie behavior after deployment.
- Confirm email delivery configuration before announcing releases.

## Release Checklist

- Run syntax checks on touched backend files.
- Run frontend lint.
- Run backend audit when network access is available.
- Smoke-test login, logout, session cookies, and protected admin pages.
- Test one public submission flow and one admin update flow.

## Incident Checklist

- If admin login fails, check Firebase Auth configuration and backend session cookie settings.
- If public forms fail, check CORS and rate limits.
- If uploads fail, check Cloudinary environment variables.
- If email notifications fail, check SMTP credentials and provider limits.

