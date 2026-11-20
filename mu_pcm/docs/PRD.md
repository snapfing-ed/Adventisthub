# Product Requirements Document

## Overview

MU SDA PCM is a web application that combines a public church site with an authenticated admin portal. The frontend is a Next.js app and the backend is an Express API backed by Firebase Admin, Firestore, and Cloudinary.

## Functional Requirements

### Public Site

- Show fellowship pages such as about, events, groups, resources, journals, prayers, contact, media, and heroes.
- Allow visitors to submit contact messages.
- Allow visitors to submit prayer requests.
- Allow visitors to request membership in a group.

### Student Registration

- Allow a student to register with Firebase Auth.
- Create a pending student profile in Firestore.
- Disable the Firebase Auth account until approved.
- Notify admins when a new registration is submitted.

### Admin Portal

- Allow admin users to sign in with Firebase Auth.
- Exchange the Firebase ID token for a server-managed httpOnly session cookie.
- Restrict protected admin UI routes behind a cookie check.
- Allow authorized users to create, update, and delete content where permitted by role.
- Allow super admins to invite and manage admin users.

### Media and Uploads

- Allow authorized editors and admins to upload content through Cloudinary.
- Restrict uploads to approved MIME types.
- Sanitize filenames before uploading.

## User Stories

- As a visitor, I want to send a contact message so that the team can reply.
- As a visitor, I want to submit a prayer request so that the prayer team can receive it.
- As a member, I want to request to join a group so that leaders can review my request.
- As a student, I want to register for approval so that my account can be reviewed by leadership.
- As an admin, I want to manage content from a protected portal so that the site stays current.
- As a super admin, I want to invite other administrators so that responsibilities can be shared safely.

## Acceptance Criteria

- Public submission endpoints validate input and reject malformed requests.
- Public submission endpoints are rate-limited.
- Admin routes require Firebase-backed authentication and role checks.
- Session cookies are httpOnly and used for UI gating.
- Notification emails do not render raw user HTML.
- Upload endpoints reject unsupported file types.

## Non-Functional Requirements

- Reasonable protection against spam and abuse.
- Clear operational configuration through environment variables.
- Documented API behavior and data layout.
- Fast enough for a small fellowship website.

