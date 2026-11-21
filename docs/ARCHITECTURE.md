# System Architecture

## High-Level Structure

The application is split into two packages:

- `packages/frontend`: Next.js public site and admin portal.
- `packages/backend`: Express API with Firebase Admin, rate limiting, sessions, uploads, and Firestore access.

## Main Dependencies

- Frontend UI: Next.js, React, Firebase client SDK.
- Backend API: Express, Firebase Admin SDK, express-rate-limit, cors, multer, Cloudinary, nodemailer.
- Data store: Firestore.
- Authentication: Firebase Auth plus backend-verified session cookies.

## Request Flow

### Public Content

1. Browser loads a frontend page.
2. The page fetches content from the backend API where needed.
3. The backend reads from Firestore and returns JSON.

### Admin Login

1. Admin signs in with Firebase Auth in the frontend.
2. The frontend sends the Firebase ID token to `POST /api/sessionLogin`.
3. The backend exchanges the ID token for an httpOnly session cookie.
4. Frontend middleware checks for the cookie before rendering protected admin routes.
5. Backend routes still verify the bearer token or session cookie plus role.

### Public Submission

1. User submits a form from the public site.
2. The backend validates input and applies a limiter where required.
3. The backend writes a document to Firestore.
4. The backend sends a notification email.

### Uploads

1. An authenticated editor or admin submits a file.
2. The backend checks MIME type and size limits.
3. The file is streamed to Cloudinary.
4. The backend returns the hosted URL.

## Security Boundaries

- Public routes accept anonymous traffic but must validate and limit input.
- Admin UI access is gated in the frontend and enforced again in the backend.
- Session cookies are httpOnly and protected by CORS credentials settings.
- Notification email bodies escape user input to reduce HTML injection.

## Operational Notes

- `CORS_ORIGIN` should be pinned in production.
- `ADMIN_SECRET` must be treated as sensitive.
- The clock-sync endpoint is development-only.

