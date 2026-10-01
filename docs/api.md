# API reference

The full, always-current reference is generated from `backend/src/openapi.ts`:

- Interactive: `GET /api/docs` (Swagger UI)
- Machine-readable: `GET /api/docs/openapi.json`

A test fails whenever a route exists that is not documented there (or the reverse), so the reference cannot drift.

## Conventions

- Base path `/api/v1`. Success: `{ success: true, data }`. Failure: `{ success: false, error: { code, message } }`.
- Authenticate with `Authorization: Bearer <access token>` from `POST /auth/login`, or with a **personal API token** (`cfp_…`) created under Account. Tokens act as their owner (same permissions and group access), can be read-only, and cannot call `/auth/*` or manage tokens.
- Validation errors are `422`, unknown or inaccessible records `404`, duplicates `409`, lockouts `429`. A user who must change a temporary password gets `403 PASSWORD_CHANGE_REQUIRED` everywhere except `/auth/*`.

## Visibility rules

- Grouped tickets (and their comments, links, activity, subtasks, relations) are visible to members of the group and to SuperAdmin.
- Ungrouped tickets are visible to their creator, assignees and SuperAdmin.
- The dashboard, activity feed, search, reports, CSV export and realtime stream are all filtered by the same rule.

## Ticket editing

`PATCH /tickets/:id` checks one permission per field: `tickets.edit` (title, description, dueDate, groupId, topicIds, milestoneId, parentId), `tickets.change_status`, `tickets.change_priority`, `tickets.assign` (assigneeIds). Moving a ticket to another group clears its topics and milestone unless new ones are sent, and every assignee must belong to the new group. Subtasks are one level deep and must share the parent's group.

## Realtime

`GET /events` is a server-sent event stream (use `fetch` with the Authorization header). Events carry only ids and short labels (`ticket.created`, `ticket.updated`, `ticket.deleted`, `comment.created`, `notification.created`); clients refetch through the normal API. Streams are filtered per user, close after 25 minutes so tokens are re-checked, and are limited to 5 per user.

## Webhooks

Group leaders and creators can add webhooks per group (`/groups/:id/webhooks`). Only `https` URLs that resolve to public addresses are accepted, and the address is re-checked at connection time. Each delivery is signed: `X-Campfire-Signature: sha256=<HMAC-SHA256 of the body using the webhook secret>`, with `X-Campfire-Event` and `X-Campfire-Delivery` headers. Failed deliveries are retried twice. Format `slack` posts a ready-made message to a Slack incoming webhook.

## Admin

`/admin/data/*` (SuperAdmin only) finds tickets by age, group, status or trash state, restores or permanently deletes them (`confirm: "DELETE"` required), restores deleted groups, and cleans up old activity, notifications or audit records. `/audit` (permission `audit.view`) lists security-relevant events.
