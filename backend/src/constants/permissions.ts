export const PERMISSIONS = [
  "tickets.view", "tickets.create", "tickets.edit", "tickets.delete", "tickets.assign", "tickets.change_status", "tickets.change_priority",
  "comments.view", "comments.create", "comments.edit", "comments.delete",
  "ticket_links.view", "ticket_links.create", "ticket_links.edit", "ticket_links.delete",
  "users.view", "users.create", "users.edit", "users.disable", "activity.view", "settings.view", "settings.edit", "groups.create",
] as const;

export type Permission = (typeof PERMISSIONS)[number];
export const isPermission = (value: string): value is Permission => (PERMISSIONS as readonly string[]).includes(value);
