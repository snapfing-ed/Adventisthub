# ADR 0001: Use Firebase Auth plus backend session cookies for admin access

## Status

Accepted

## Context

The admin portal needs browser-friendly auth for route gating, but backend routes still need direct verification and role checks.

## Decision

- Use Firebase Auth for sign-in.
- Exchange the Firebase ID token for an httpOnly backend session cookie.
- Keep backend authorization checks in place for every privileged route.

## Consequences

- The frontend can gate protected UI with a cookie check.
- The backend still remains the source of truth for authorization.
- Session handling depends on correct CORS credentials configuration.

