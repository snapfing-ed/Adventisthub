# ADR 0003: Rate-limit public submission routes and escape email HTML

## Status

Accepted

## Context

Public forms write to Firestore and trigger outbound email. Those are high-value abuse targets.

## Decision

- Apply rate limiting to public submission endpoints.
- Escape all user-supplied values before interpolating them into HTML email templates.
- Use stricter throttling for flows that create Firebase Auth accounts.

## Consequences

- The system is more resilient to spam and quota abuse.
- Notification emails are less likely to be used for HTML injection.
- Public form handling becomes slightly stricter for legitimate repeat submissions.

