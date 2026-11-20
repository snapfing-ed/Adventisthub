# API Contracts

This document summarizes the current HTTP surface exposed by the backend.

## Authentication

- Bearer token: Firebase ID token sent in `Authorization: Bearer <token>`.
- Session cookie: httpOnly `session` cookie issued by `POST /api/sessionLogin`.
- Admin UI gate: frontend middleware checks for `session` or `__session`.

## Public Endpoints

### `GET /api/health`

Response:
```json
{ "status": "MU SDA PCM Backend alive!", "time": "2026-09-07T..." }
```

### `POST /api/prayers`

Request body:
```json
{ "name": "string", "email": "string|null", "category": "string", "request": "string", "anonymous": true, "date": "YYYY-MM-DD" }
```

### `POST /api/contacts`

Request body:
```json
{ "name": "string", "email": "string", "subject": "string", "message": "string", "date": "YYYY-MM-DD" }
```

### `POST /api/groups/:id/join`

Request body:
```json
{ "name": "string", "studentId": "string", "email": "string", "year": "string", "motivation": "string", "phone": "string" }
```

### `POST /api/students`

Headers:
- `Authorization: Bearer <Firebase ID token>`

Request body:
```json
{ "name": "string", "studentId": "string", "department": "string", "year": "string", "phone": "string", "category": "string", "initialBand": "string", "homeAddress": "string", "churchName": "string", "hostel": "string", "roomNumber": "string", "locality": "string" }
```

### `GET /api/groups`
### `GET /api/groups/:id`
### `GET /api/events`
### `GET /api/events/:id`

Public read endpoints that return Firestore-backed content.

## Session Endpoints

### `POST /api/sessionLogin`

Request body:
```json
{ "idToken": "Firebase ID token" }
```

Response sets the `session` cookie.

### `POST /api/sessionLogout`

Clears the `session` cookie.

## Admin Endpoints

Most admin endpoints require:

- a valid Firebase ID token or valid session cookie
- the correct role

Examples:

- `GET /api/users/me`
- `GET /api/users`
- `POST /api/users/invite`
- `PATCH /api/users/:uid/status`
- `GET /api/students/admin`
- `POST /api/uploads`

## Upload Endpoint

### `POST /api/uploads`

Form data:
- `file`

Rules:
- authenticated editor/admin only
- MIME allowlist enforced
- file size limited
- Cloudinary upload returns `{ url }`

## CORS

- Production should use `CORS_ORIGIN` as an allowlist.
- Credentialed requests are used for the admin session cookie flow.

