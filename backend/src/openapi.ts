import { zodToJsonSchema } from "zod-to-json-schema";
import { createInput, updateInput } from "./schemas/ticket.js";

type Op = { method: "get" | "post" | "patch" | "delete"; path: string; tag: string; summary: string; auth?: boolean; permission?: string; body?: unknown };

const b = (schema: unknown) => zodToJsonSchema(schema as never, { target: "openApi3", $refStrategy: "none" });

/** Single source of truth for the API reference. A test fails when a route is added without being listed here. */
export const operations: Op[] = [
  { method: "post", path: "/auth/login", tag: "Auth", summary: "Sign in. Returns an access token and sets the refresh cookie. Locks out after repeated failures.", auth: false },
  { method: "post", path: "/auth/refresh", tag: "Auth", summary: "Rotate the refresh cookie and get a new access token. Replaying an old token revokes all sessions.", auth: false },
  { method: "post", path: "/auth/logout", tag: "Auth", summary: "Revoke the current refresh token.", auth: false },
  { method: "get", path: "/auth/me", tag: "Auth", summary: "Current user." },
  { method: "post", path: "/auth/change-password", tag: "Auth", summary: "Change password; revokes other sessions." },
  { method: "get", path: "/auth/sessions", tag: "Auth", summary: "List your active sessions." },
  { method: "post", path: "/auth/sessions/revoke-others", tag: "Auth", summary: "Sign out every other session." },
  { method: "delete", path: "/auth/sessions/:id", tag: "Auth", summary: "Revoke one session." },
  { method: "post", path: "/bootstrap", tag: "Auth", summary: "Create the first SuperAdmin from environment variables (optional x-bootstrap-token).", auth: false },
  { method: "get", path: "/api-tokens", tag: "API tokens", summary: "List your personal API tokens." },
  { method: "post", path: "/api-tokens", tag: "API tokens", summary: "Create a token (shown once). Tokens act as you and can be read-only." },
  { method: "delete", path: "/api-tokens/:id", tag: "API tokens", summary: "Revoke a token." },

  { method: "get", path: "/tickets", tag: "Tickets", summary: "List tickets you can see (filters: search, groupId, topicId, milestoneId, status, priority, assigneeId (each takes one or more values separated by commas; add statusNot=true, priorityNot=true, milestoneNot=true or assigneeNot=true for \"everything except these\"), mine, page, limit).", permission: "tickets.view" },
  { method: "post", path: "/tickets", tag: "Tickets", summary: "Create a ticket.", permission: "tickets.create", body: b(createInput) },
  { method: "get", path: "/tickets/export", tag: "Tickets", summary: "Export visible tickets as CSV (same filters as list).", permission: "tickets.view" },
  { method: "post", path: "/tickets/restore", tag: "Tickets", summary: "Undo a recent delete (by the person who deleted it, within 10 minutes).", permission: "tickets.delete" },
  { method: "post", path: "/tickets/bulk", tag: "Tickets", summary: "Apply status, priority, assign, unassign, move, milestone or delete to up to 100 tickets; returns per-ticket results." },
  { method: "post", path: "/tickets/import", tag: "Tickets", summary: "Import up to 200 rows as tickets.", permission: "tickets.create" },
  { method: "get", path: "/tickets/:id", tag: "Tickets", summary: "Ticket with comments, links, activity, subtasks, parent, relations and watch state.", permission: "tickets.view" },
  { method: "patch", path: "/tickets/:id", tag: "Tickets", summary: "Update fields; each field needs its own permission.", body: b(updateInput) },
  { method: "delete", path: "/tickets/:id", tag: "Tickets", summary: "Soft-delete a ticket.", permission: "tickets.delete" },
  { method: "get", path: "/tickets/:id/comments", tag: "Tickets", summary: "Older comments (cursor: before).", permission: "comments.view" },
  { method: "get", path: "/tickets/:id/activity", tag: "Tickets", summary: "Older activity (cursor: before)." },
  { method: "post", path: "/tickets/:id/comments", tag: "Tickets", summary: "Add a comment; mentionIds notifies people who can see the ticket.", permission: "comments.create" },
  { method: "patch", path: "/tickets/:id/comments/:id", tag: "Tickets", summary: "Edit your comment.", permission: "comments.edit" },
  { method: "delete", path: "/tickets/:id/comments/:id", tag: "Tickets", summary: "Delete your comment.", permission: "comments.delete" },
  { method: "post", path: "/tickets/:id/links", tag: "Tickets", summary: "Add a link.", permission: "ticket_links.create" },
  { method: "patch", path: "/tickets/:id/links/:id", tag: "Tickets", summary: "Edit a link.", permission: "ticket_links.edit" },
  { method: "delete", path: "/tickets/:id/links/:id", tag: "Tickets", summary: "Remove a link.", permission: "ticket_links.delete" },
  { method: "post", path: "/tickets/:id/watch", tag: "Tickets", summary: "Watch a ticket.", permission: "tickets.view" },
  { method: "delete", path: "/tickets/:id/watch", tag: "Tickets", summary: "Stop watching.", permission: "tickets.view" },
  { method: "post", path: "/tickets/:id/relations", tag: "Tickets", summary: "Relate to another ticket (BLOCKS or RELATES).", permission: "tickets.edit" },
  { method: "delete", path: "/tickets/:id/relations/:id", tag: "Tickets", summary: "Remove a relation.", permission: "tickets.edit" },

  { method: "get", path: "/groups", tag: "Groups", summary: "Groups you belong to (all groups for SuperAdmin)." },
  { method: "post", path: "/groups", tag: "Groups", summary: "Create a group.", permission: "groups.create" },
  { method: "get", path: "/groups/:id", tag: "Groups", summary: "Group with members and topics." },
  { method: "patch", path: "/groups/:id", tag: "Groups", summary: "Rename or describe a group (leaders and creators)." },
  { method: "delete", path: "/groups/:id", tag: "Groups", summary: "Delete a group without active tickets (creators)." },
  { method: "post", path: "/groups/:id/members", tag: "Groups", summary: "Add a member." },
  { method: "delete", path: "/groups/:id/members/:id", tag: "Groups", summary: "Remove a member or leave." },
  { method: "patch", path: "/groups/:id/roles/:id", tag: "Groups", summary: "Set creator/leader roles (creators)." },
  { method: "post", path: "/groups/:id/topics", tag: "Groups", summary: "Add a topic." },
  { method: "patch", path: "/groups/:id/topics/:id", tag: "Groups", summary: "Rename or archive a topic." },
  { method: "get", path: "/groups/:id/milestones", tag: "Groups", summary: "Milestones with progress." },
  { method: "post", path: "/groups/:id/milestones", tag: "Groups", summary: "Create a milestone." },
  { method: "patch", path: "/groups/:id/milestones/:id", tag: "Groups", summary: "Update or close a milestone." },
  { method: "delete", path: "/groups/:id/milestones/:id", tag: "Groups", summary: "Delete a milestone." },
  { method: "get", path: "/groups/:id/webhooks", tag: "Webhooks", summary: "List the group's webhooks (leaders and creators)." },
  { method: "post", path: "/groups/:id/webhooks", tag: "Webhooks", summary: "Add an https webhook (json or slack format). The signing secret is shown once." },
  { method: "patch", path: "/groups/:id/webhooks/:id", tag: "Webhooks", summary: "Enable, disable or change a webhook." },
  { method: "delete", path: "/groups/:id/webhooks/:id", tag: "Webhooks", summary: "Delete a webhook." },
  { method: "post", path: "/groups/:id/webhooks/:id/test", tag: "Webhooks", summary: "Send a test delivery." },
  { method: "post", path: "/groups/:id/webhooks/:id/rotate-secret", tag: "Webhooks", summary: "Replace the signing secret. The new secret is shown once." },
  { method: "get", path: "/groups/:id/webhooks/:id/deliveries", tag: "Webhooks", summary: "Last 50 delivery attempts (kept 30 days)." },
  { method: "post", path: "/groups/:id/webhooks/:id/deliveries/:id/resend", tag: "Webhooks", summary: "Send a past delivery again." },
  { method: "get", path: "/groups/:id/automations", tag: "Automations", summary: "List the group's automations (leaders and creators)." },
  { method: "post", path: "/groups/:id/automations", tag: "Automations", summary: "Create an automation: a trigger, optional conditions and up to 5 actions." },
  { method: "patch", path: "/groups/:id/automations/:id", tag: "Automations", summary: "Edit, enable or disable an automation." },
  { method: "delete", path: "/groups/:id/automations/:id", tag: "Automations", summary: "Delete an automation." },
  { method: "get", path: "/groups/:id/automations/:id/runs", tag: "Automations", summary: "Recent runs of an automation (kept 30 days)." },
  { method: "post", path: "/groups/:id/automations/:id/test", tag: "Automations", summary: "Dry run against a ticket. Changes nothing." },
  { method: "get", path: "/reports/people", tag: "Views", permission: "tickets.view", summary: "Per-person assignment and completion summary, limited to what the caller may see." },
  { method: "get", path: "/reports/people/:id", tag: "Views", permission: "tickets.view", summary: "One person's assigned tickets with status, due date and whether they left the group." },

  { method: "get", path: "/templates", tag: "Templates", summary: "Ticket templates you can use.", permission: "tickets.create" },
  { method: "post", path: "/templates", tag: "Templates", summary: "Create a template, optionally recurring (daily, weekly, monthly).", permission: "tickets.create" },
  { method: "patch", path: "/templates/:id", tag: "Templates", summary: "Edit a template or pause its recurrence.", permission: "tickets.create" },
  { method: "delete", path: "/templates/:id", tag: "Templates", summary: "Delete a template.", permission: "tickets.create" },
  { method: "post", path: "/templates/:id/create", tag: "Templates", summary: "Create a ticket from a template.", permission: "tickets.create" },
  { method: "get", path: "/saved-filters", tag: "Views", summary: "Your saved ticket filters." },
  { method: "post", path: "/saved-filters", tag: "Views", summary: "Save a filter." },
  { method: "delete", path: "/saved-filters/:id", tag: "Views", summary: "Delete a saved filter." },
  { method: "get", path: "/search", tag: "Views", summary: "Quick search across tickets, groups and (with users.view) people." },
  { method: "get", path: "/reports", tag: "Views", summary: "Status, priority, assignee and group breakdowns, weekly throughput and lead time.", permission: "tickets.view" },
  { method: "get", path: "/dashboard", tag: "Views", summary: "Counts and recent tickets.", permission: "tickets.view" },
  { method: "get", path: "/activity", tag: "Views", summary: "Recent activity on tickets you can see.", permission: "activity.view" },
  { method: "get", path: "/events", tag: "Views", summary: "Server-sent event stream (send the Authorization header with fetch)." },
  { method: "get", path: "/notifications", tag: "Notifications", summary: "Your notifications." },
  { method: "patch", path: "/notifications/:id/read", tag: "Notifications", summary: "Mark one as read." },
  { method: "post", path: "/notifications/read-all", tag: "Notifications", summary: "Mark all as read." },

  { method: "get", path: "/users", tag: "Users", summary: "List users and the permission catalog.", permission: "users.view" },
  { method: "post", path: "/users", tag: "Users", summary: "Create a user with a temporary password.", permission: "users.create" },
  { method: "get", path: "/users/assignees", tag: "Users", summary: "Minimal people directory, optionally for one group.", permission: "tickets.assign" },
  { method: "get", path: "/users/role-templates", tag: "Users", summary: "Permission bundles.", permission: "users.edit" },
  { method: "patch", path: "/users/:id", tag: "Users", summary: "Rename or change permissions (only ones you hold).", permission: "users.edit" },
  { method: "patch", path: "/users/:id/status", tag: "Users", summary: "Enable or disable a user.", permission: "users.disable" },
  { method: "post", path: "/users/:id/reset-password", tag: "Users", summary: "Set a new temporary password.", permission: "users.edit" },
  { method: "post", path: "/users/grant-ticket-access", tag: "Users", summary: "Maintenance helper (SuperAdmin)." },
  { method: "delete", path: "/users/:id", tag: "Users", summary: "Delete a user.", permission: "users.edit" },

  { method: "get", path: "/audit", tag: "Admin", summary: "Audit log.", permission: "audit.view" },
  { method: "get", path: "/admin/data/summary", tag: "Admin", summary: "Record counts and database size (SuperAdmin)." },
  { method: "get", path: "/admin/data/tickets", tag: "Admin", summary: "Find tickets by age, group, status or trash state (SuperAdmin)." },
  { method: "post", path: "/admin/data/tickets/restore", tag: "Admin", summary: "Restore soft-deleted tickets (SuperAdmin)." },
  { method: "post", path: "/admin/data/tickets/purge", tag: "Admin", summary: "Permanently delete tickets; requires confirm: \"DELETE\" (SuperAdmin)." },
  { method: "get", path: "/admin/data/groups", tag: "Admin", summary: "Deleted groups (SuperAdmin)." },
  { method: "post", path: "/admin/data/groups/:id/restore", tag: "Admin", summary: "Restore a deleted group (SuperAdmin)." },
  { method: "post", path: "/admin/data/cleanup", tag: "Admin", summary: "Delete old activity, notification or audit records (SuperAdmin)." },
  { method: "get", path: "/health", tag: "System", summary: "Liveness.", auth: false },
  { method: "get", path: "/health/ready", tag: "System", summary: "Readiness (database connected).", auth: false },
];

export function buildSpec() {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const op of operations) {
    // Several routes have more than one id; OpenAPI needs distinct parameter names.
    let count = 0;
    const names: string[] = [];
    const path = op.path.replace(/:id/g, () => { const name = count++ === 0 ? "id" : `id${count}`; names.push(name); return `{${name}}`; });
    const params = names.map((name) => ({ name, in: "path", required: true, schema: { type: "string" } }));
    (paths[path] ??= {})[op.method] = {
      tags: [op.tag],
      summary: op.summary,
      description: op.permission ? `Requires permission \`${op.permission}\` (SuperAdmin always allowed).` : undefined,
      security: op.auth === false ? [] : [{ bearer: [] }],
      parameters: params,
      requestBody: op.body ? { content: { "application/json": { schema: op.body } } } : undefined,
      responses: { "200": { description: "Success: { success: true, data }" }, "4XX": { description: "Error: { success: false, error: { code, message } }" } },
    };
  }
  return {
    openapi: "3.0.3",
    info: { title: "Campfire API", version: "1.0.0", description: "Responses are `{ success, data }` or `{ success: false, error: { code, message } }`. Authenticate with `Authorization: Bearer <access token>` or a personal API token (`cfp_…`)." },
    servers: [{ url: "/api/v1" }],
    components: { securitySchemes: { bearer: { type: "http", scheme: "bearer" } } },
    paths,
  };
}
