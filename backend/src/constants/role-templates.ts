import type { Permission } from "./permissions.js";

export type RoleTemplate = { id: string; name: string; description: string; permissions: Permission[] };

const member: Permission[] = ["tickets.view", "tickets.create", "tickets.assign", "comments.view", "comments.create", "ticket_links.view"];

/** Named permission bundles. Applying one still obeys "you can only grant what you hold". */
export const ROLE_TEMPLATES: RoleTemplate[] = [
  { id: "member", name: "Member", description: "View and create tickets, assign people, comment.", permissions: member },
  { id: "contributor", name: "Contributor", description: "Member plus editing tickets, status, priority and links.", permissions: [...member, "tickets.edit", "tickets.change_status", "tickets.change_priority", "comments.edit", "ticket_links.create", "ticket_links.edit"] },
  { id: "team-lead", name: "Team lead", description: "Contributor plus deleting, activity and creating groups.", permissions: [...member, "tickets.edit", "tickets.change_status", "tickets.change_priority", "tickets.delete", "comments.edit", "comments.delete", "ticket_links.create", "ticket_links.edit", "ticket_links.delete", "activity.view", "groups.create"] },
  { id: "auditor", name: "Auditor", description: "Read-only access including activity and the audit log.", permissions: ["tickets.view", "comments.view", "ticket_links.view", "activity.view", "audit.view"] },
  { id: "people-admin", name: "People admin", description: "Member plus managing users (not SuperAdmin powers).", permissions: [...member, "users.view", "users.create", "users.edit", "users.disable"] },
];
