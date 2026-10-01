export type User = {
  id: string;
  name: string;
  email: string;
  role: "SUPERADMIN" | "USER";
  permissions: string[];
  mustChangePassword?: boolean;
  isActive?: boolean;
  lastLoginAt?: string;
};

export type Person = { id: string; name: string; email: string };
export type Ref = { _id: string; name: string; email?: string };

export type Milestone = { id: string; name: string; description?: string; dueDate?: string | null; closedAt?: string | null; total: number; done: number };
export type Group = { id: string; name: string; description?: string; memberIds: string[]; leaderIds: string[]; creatorIds: string[] };
export type Topic = { id: string; name: string; description?: string; archivedAt?: string | null };
export type Member = { id: string; name: string; email: string };

export const STATUSES = ["OPEN", "IN_PROGRESS", "IN_REVIEW", "BLOCKED", "COMPLETED", "CLOSED"] as const;
export const PRIORITIES = ["NO_PRIORITY", "LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export type Status = (typeof STATUSES)[number];
export type Priority = (typeof PRIORITIES)[number];

export type Ticket = {
  id: string;
  ticketNumber: string;
  title: string;
  description: string;
  status: Status;
  priority: Priority;
  dueDate?: string | null;
  updatedAt: string;
  createdAt: string;
  assigneeId?: Ref | null;
  assigneeIds?: Ref[];
  groupId?: { _id: string; name: string } | null;
  milestoneId?: { _id: string; name: string } | null;
  parentId?: string | null;
  topicIds?: { _id: string; name: string }[];
  createdById?: Ref;
  commentCount?: number;
};

export type Comment = { _id: string; body: string; createdAt: string; authorId?: Ref };
export type TicketLink = { _id: string; label: string; url: string };
export type Activity = { _id: string; type: string; createdAt: string; actorId?: Ref; ticketId?: { _id: string; ticketNumber: string; title: string } | null };
export type Notification = { _id: string; message: string; ticketId?: string; readAt?: string | null; createdAt: string };

export type TicketPage = { tickets: Ticket[]; page: number; pages: number; total: number };
export type MiniTicket = { id: string; ticketNumber: string; title: string; status: Status };
export type Relation = MiniTicket & { type: "blocks" | "blockedBy" | "relates" };
export type TicketDetailData = {
  ticket: Ticket; comments: Comment[]; hasMoreComments: boolean; links: TicketLink[]; activities: Activity[]; hasMoreActivity: boolean;
  subtasks: MiniTicket[]; parent: MiniTicket | null; relations: Relation[]; watching: boolean;
};
export type SavedFilter = { id: string; name: string; query: Record<string, string> };
export type Template = {
  id: string; name: string; title: string; description: string; priority: Priority; groupId: string | null; topicIds: string[]; assigneeIds: string[];
  createdById: string; recurrence: { every: "daily" | "weekly" | "monthly"; nextRunAt?: string; active: boolean } | null;
};
export type Session = { id: string; userAgent: string; ip: string; lastActive: string; current: boolean };
export type ApiTokenInfo = { id: string; name: string; prefix: string; readOnly: boolean; expiresAt?: string | null; lastUsedAt?: string | null; createdAt: string };
export type Webhook = { id: string; url: string; format: "json" | "slack"; events: string[]; active: boolean; lastStatus: string | null; lastDeliveredAt: string | null };
