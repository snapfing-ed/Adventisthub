# Product Vision

MU SDA PCM is a church community web platform for members, leaders, and administrators of the Mulungushi University SDA PCM fellowship.

## Goals

- Publish the fellowship's public-facing content in one place.
- Give members a simple path to register, submit requests, and discover activities.
- Give leaders a protected admin portal for managing content, requests, media, and user roles.
- Keep the system lightweight enough to run on a simple Firebase plus Node.js stack.

## Primary Users

- Visitors who want to read public content.
- Members who submit prayer requests, contact messages, or group join requests.
- Student registrants who create an account for approval.
- Editors and committee members who manage content.
- Admin and super admin users who manage users and permissions.

## Scope

In scope:
- public site pages
- Firebase Auth sign-in and admin session handling
- admin portal content management
- public submission workflows
- uploads through Cloudinary
- email notifications

Out of scope:
- native mobile apps
- offline-first syncing
- complex multi-tenant organizational management
- payment processing

## Success Criteria

- Users can find content and complete public submissions without confusion.
- Admin users can securely log in and manage content.
- Public submission routes remain rate-limited and abuse-resistant.
- The codebase stays maintainable with clear documentation and test coverage.

