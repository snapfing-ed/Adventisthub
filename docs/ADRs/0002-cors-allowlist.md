# ADR 0002: Restrict production CORS to an explicit origin allowlist

## Status

Accepted

## Context

The frontend sends credentialed requests when it exchanges Firebase tokens for session cookies.

## Decision

- Use `CORS_ORIGIN` as a comma-separated allowlist in production.
- Allow credentialed requests only for approved frontend origins.
- Keep the looser behavior only for local development when no allowlist is set.

## Consequences

- Session cookie flows work predictably in production.
- Random websites cannot freely make credentialed API requests.
- Deployment requires the frontend origin to be configured correctly.

