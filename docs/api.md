# API reference

The API is served under `/api/v1` and returns `{ success: true, data }` for successful requests or `{ success: false, error: { code, message } }` for errors.

## Public endpoints

- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /health`
- `GET /health/ready`
- `GET /api/v1/health`
- `GET /api/v1/health/ready`
- `DELETE /users/:id` — SuperAdmin/user administrator soft-deletes a user and revokes their refresh sessions.
- `POST /users/:id/reset-password` — SuperAdmin/user administrator sets a temporary password for a user.
- `POST /bootstrap` — creates the first SuperAdmin only when none exists and the initial credentials are supplied through environment variables.

## Authenticated endpoints

- `GET /auth/me`, `POST /auth/change-password`
- `GET/POST /users`, `PATCH /users/:id`, `PATCH /users/:id/status`, `POST /users/:id/reset-password`
- `GET/POST /groups`, `GET/PATCH/DELETE /groups/:id`
- `POST /groups/:id/members`, `DELETE /groups/:id/members/:userId`, `PATCH /groups/:id/roles/:userId`
- `POST /groups/:id/topics`, `PATCH /groups/:id/topics/:topicId`
- `GET /users/assignees?groupId=` — minimal `{id,name,email}` directory
- `GET/POST /tickets`, `GET/PATCH/DELETE /tickets/:id`
- `POST/PATCH/DELETE /tickets/:id/comments...`
- `POST/PATCH/DELETE /tickets/:id/links...`
- `GET /dashboard`, `GET /activity`, `GET /notifications`

Bearer access tokens are short lived. Refresh tokens are rotated and stored in secure HttpOnly cookies. Every protected route performs backend permission checks; SuperAdmin is the only role that bypasses granular permissions.

## Group scoping

Tickets, comments, links, the dashboard and the activity feed only include tickets the caller may see: tickets in groups they belong to, plus ungrouped tickets they created or are assigned to. SuperAdmin sees everything. Requests for tickets or groups outside that scope return `404`.

`PATCH /tickets/:id` checks one permission per field: `tickets.edit` (title, description, dueDate, groupId, topicIds), `tickets.change_status`, `tickets.change_priority` and `tickets.assign` (assigneeIds). Moving a ticket to another group clears its topics unless new `topicIds` are sent, and all assignees must belong to the new group.

## Errors

Errors use `{ success: false, error: { code, message } }`. Validation failures return `422`, malformed ids `400`/`422`, duplicate values `409`, and a user who must change a temporary password receives `403 PASSWORD_CHANGE_REQUIRED` on everything except `/auth/*`.
