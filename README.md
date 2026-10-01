# Campfire

Campfire is a single-organization internal ticket management system: an Express + MongoDB API and a Next.js frontend.

## Features

- Email/password sign-in with rotating refresh tokens (HttpOnly cookie) and short-lived access tokens
- SuperAdmin plus granular per-user permissions
- **Groups** with members, leaders and creators; **topics** per group; tickets belong to a group (or stay private to their creator and assignees)
- Tickets with statuses, priorities, due dates, multiple assignees, Markdown descriptions and comments, @mentions, watchers, links, activity history and in-app notifications
- Subtasks, blocks/related links between tickets, milestones per group, ticket templates and recurring tickets
- List and drag-and-drop board views, filters, saved views, bulk edits, CSV import and export, command palette (Ctrl/⌘+K) and live updates
- Reports (throughput, lead time, workload), audit log, SuperAdmin data management (find, restore and permanently delete old tickets)
- Account security: session list, login lockout, personal API tokens, role templates for permissions
- Per-group webhooks (JSON or Slack) and an OpenAPI reference at `/api/docs`
- Installable as an app (PWA)

## Access rules in one place

- A grouped ticket (and its comments, links and activity) is visible only to members of the group, and to SuperAdmin.
- An ungrouped ticket is visible only to its creator, its assignees and SuperAdmin.
- Editing a ticket needs field-level permissions: `tickets.edit` (details, group, topics), `tickets.change_status`, `tickets.change_priority`, `tickets.assign`.
- Creating a group needs `groups.create`. Group leaders and creators manage members and topics; only creators change roles or delete the group.
- Users can only grant or revoke permissions they hold themselves, and cannot change their own.

## Local setup

1. Copy `backend/.env.example` to `backend/.env` and replace the secrets with random values of at least 32 characters.
2. Run `npm install` in the root, `backend` and `frontend` directories.
3. Start MongoDB, then run `npm run dev:backend` and `npm run dev:frontend` from the root.
4. Create the first SuperAdmin with `POST /api/v1/bootstrap` (set `INITIAL_SUPERADMIN_*`; optionally `BOOTSTRAP_TOKEN` and send it as the `x-bootstrap-token` header).

## Tests

- `npm test` in `backend` runs integration tests against an in-memory MongoDB (the first run downloads a MongoDB binary).
- `npm run e2e` in `frontend` runs browser tests with Playwright against a real API and database (run `npx playwright install chromium` once).
- CI runs build, lint, tests and the browser tests.

## Not included yet

Email (invites, password reset, notifications), file attachments and two-factor sign-in are deliberately left out for now because they need hosting or services that are not set up.

See [docs/](docs) for the API reference, architecture notes, deployment and progress.
