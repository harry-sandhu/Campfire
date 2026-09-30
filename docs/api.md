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
- `GET/POST /tickets`, `GET/PATCH/DELETE /tickets/:id`
- `POST/PATCH/DELETE /tickets/:id/comments...`
- `POST/PATCH/DELETE /tickets/:id/links...`
- `GET /dashboard`, `GET /activity`, `GET /notifications`

Bearer access tokens are short lived. Refresh tokens are rotated and stored in secure HttpOnly cookies. Every protected route performs backend permission checks; SuperAdmin is the only role that bypasses granular permissions.
