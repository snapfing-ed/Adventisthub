# Database Schema

This project uses Firestore collections rather than a relational database.

## Collections

### `admin_users`

Stores admin portal users and roles.

Common fields:
- `uid`
- `email`
- `displayName`
- `role`
- `active`
- `createdAt`
- `createdBy`
- `lastLogin`

### `students`

Stores student registration and approval data.

Common fields:
- `email`
- `name`
- `studentId`
- `department`
- `year`
- `phone`
- `category`
- `joinedBands`
- `homeAddress`
- `churchName`
- `hostel`
- `roomNumber`
- `locality`
- `status`
- `createdAt`
- `approvedAt`
- `approvedBy`
- `frozen`
- `frozenAt`
- `frozenBy`

### `group_join_requests`

Stores public requests to join groups.

Common fields:
- `groupId`
- `groupName`
- `name`
- `studentId`
- `email`
- `year`
- `phone`
- `motivation`
- `status`
- `submittedAt`
- `lastReply`
- `repliedAt`
- `repliedBy`

### `contacts`

Stores public contact messages.

Common fields:
- `name`
- `email`
- `subject`
- `message`
- `date`
- `submittedAt`
- `status`
- `updatedAt`
- `updatedBy`

### `prayers`

Stores public prayer requests.

Common fields:
- `name`
- `email`
- `category`
- `request`
- `anonymous`
- `date`
- `submittedAt`
- `status`
- `lastReply`
- `repliedAt`
- `repliedBy`

### `groups`

Stores group metadata.

Common fields:
- `name`
- other UI-managed metadata fields supplied by editors
- `createdAt`
- `createdBy`
- `updatedAt`
- `updatedBy`

### `events`

Stores event metadata.

Common fields:
- `title`
- `createdAt`
- `createdBy`
- `updatedAt`
- `updatedBy`

### `programming_plans`

Stores committee schedules and plan data.

Common fields:
- `title`
- `termLabel`
- `notes`
- `schedule`
- `createdAt`
- `createdBy`
- `updatedAt`
- `updatedBy`

## Notes

- The code relies on document IDs for record identity.
- Many admin routes write audit fields such as `createdBy`, `updatedBy`, `approvedBy`, and `repliedBy`.
- Public submission collections should be treated as user-generated data and validated at the route layer.

