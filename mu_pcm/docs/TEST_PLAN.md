# Proposed Test Plan

This plan is organized around the repo’s highest-risk behavior:
- authentication and session handling
- public submission endpoints
- admin-only CRUD flows
- upload handling
- security and regression checks

## 1. Authentication and Session Tests

- Verify `POST /api/sessionLogin` accepts a valid Firebase ID token and sets the `session` cookie.
- Verify `POST /api/sessionLogin` rejects missing or invalid tokens.
- Verify `POST /api/sessionLogout` clears the `session` cookie.
- Verify `verifyToken` accepts a valid bearer token and a valid session cookie.
- Verify deactivated admin accounts receive `403`.
- Verify the frontend middleware redirects unauthenticated users away from `/admin` and `/admin-portal`.

## 2. Public Submission Tests

- `POST /api/prayers`
  - accepts valid submissions
  - rejects short requests
  - rate limit is enforced
- `POST /api/contacts`
  - accepts valid submissions
  - rejects invalid email addresses
  - rate limit is enforced
- `POST /api/groups/:id/join`
  - accepts valid submissions
  - rejects missing name or email
  - rate limit is enforced
- `POST /api/students`
  - accepts valid student self-registration with a valid bearer token
  - rejects missing or invalid bearer tokens
  - rate limit is enforced

## 3. Admin Route Tests

- `GET /api/users/me` returns the signed-in admin profile.
- `GET /api/groups`, `GET /api/prayers`, `GET /api/contacts`, `GET /api/students/admin`
  - require the correct roles
  - return `401` when unauthenticated
  - return `403` when role is insufficient
- `POST`, `PUT`, and `DELETE` admin routes should update only the intended documents.

## 4. Upload Tests

- `POST /api/uploads`
  - accepts allowed MIME types only
  - rejects unsupported MIME types
  - rejects requests with no file
  - respects size limits
- Confirm filename sanitization removes unsafe characters.

## 5. Security Regression Tests

- Confirm `CORS_ORIGIN` is enforced in production.
- Confirm the production build does not expose `/api/admin/clock-sync`.
- Confirm the backend still uses `httpOnly` cookies for session storage.
- Confirm public email notifications escape HTML special characters.
- Confirm no route that creates Firebase Auth users is missing a rate limiter.

## 6. Dependency and Static Checks

- Run backend `npm audit --omit=dev` locally when network access is available.
- Run frontend `npm run lint`.
- Run backend syntax checks with `node --check` on touched files.
- Add a CI job for `npm run lint` and backend smoke tests once test files exist.

## 7. Recommended Next Automation

1. Add backend route tests with `supertest`.
2. Add frontend auth-flow tests for the admin portal redirect/login behavior.
3. Add a lightweight security smoke suite that checks CORS, cookie flags, and rate limits.
4. Add a CI workflow to run lint, tests, and syntax checks on every pull request.

