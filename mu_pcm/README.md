# MU PCM Monorepo

MU SDA PCM is a two-package web app:
- `packages/backend` exposes the Express API, Firebase Admin auth, session cookies, uploads, and content routes.
- `packages/frontend` is the Next.js client that serves the public site and the admin portal.

## Project Structure

- `packages/backend/src/index.js` wires the API, CORS, health check, and route mounting.
- `packages/backend/src/routes/` contains the feature routes for announcements, events, groups, prayers, contacts, students, uploads, and more.
- `packages/backend/src/middleware/` contains authentication and rate limiting.
- `packages/backend/src/utils/` contains email, phone, SMS, and HTML-escaping helpers.
- `packages/frontend/src/app/` contains the public site, admin portal, auth flow, and shared UI.
- `packages/frontend/middleware.js` protects the admin UI shell with a session-cookie check.

## Local Setup

Install dependencies in each package:

```bash
npm install
cd packages/backend && npm install
cd ../frontend && npm install
```

Run the backend:

```bash
cd packages/backend
npm run dev
```

Run the frontend:

```bash
cd packages/frontend
npm run dev
```

The backend defaults to port `5000` and the frontend defaults to `3000`.

## Environment Variables

Backend:
- `PORT`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `FIREBASE_STORAGE_BUCKET`
- `CORS_ORIGIN`
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `EMAIL_USER`
- `EMAIL_PASS`
- `NOTIFY_EMAIL`
- `PRAYER_TEAM_EMAIL`
- `FRONTEND_URL`
- `ADMIN_SECRET`

Frontend:
- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`

## Important Flows

- Public users can submit contact, prayer, and group join requests.
- Students can register through Firebase Auth and are held pending approval.
- Admin users sign in with Firebase Auth, exchange the ID token for a session cookie, and access the admin portal.
- Uploads are restricted to authenticated editor/admin roles and pass through Cloudinary.

## Security Notes

- The admin portal is protected by a session-cookie gate in the frontend middleware and by role checks in the backend.
- Public write routes are rate-limited where appropriate.
- User-supplied values should be HTML-escaped before they are placed into notification emails.
- `ADMIN_SECRET` should be treated as sensitive and rotated if it has ever been exposed.

## Available Scripts

Backend:
- `npm run dev`
- `npm start`
- `npm run bootstrap`

Frontend:
- `npm run dev`
- `npm run build`
- `npm run start`
- `npm run lint`

## Documentation Index

- [Docs Index](docs/README.md)
- [Proposed Test Plan](docs/TEST_PLAN.md)
- [Security Review Notes](docs/SECURITY_REVIEW.md)
