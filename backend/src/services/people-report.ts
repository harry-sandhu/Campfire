import { ActivityLog, Group, Ticket, User } from "../models/index.js";
import type { AuthUser } from "../types/auth.js";
import { isSuperAdmin } from "../utils/access.js";

const DONE = ["COMPLETED", "CLOSED"];
const MAX_TICKETS = 20000;

type Row = { userId: string; name: string; email: string; active: boolean; assigned: number; completed: number; inProgress: number; open: number; blocked: number; overdue: number; completionRate: number; onTimeRate: number | null; avgDaysToComplete: number | null; leftGroup: number };

/** Groups the viewer leads or created. SuperAdmin manages all of them, signalled by `null`. */
async function managedGroupIds(viewer: AuthUser) {
  if (isSuperAdmin(viewer)) return null;
  const groups = await Group.find({ deletedAt: null, $or: [{ leaderIds: viewer.id }, { creatorIds: viewer.id }] }).select("_id").lean();
  return new Set(groups.map((g) => String(g._id)));
}

/** Assignment times for (ticket, user) pairs, from the activity log. Older tickets fall back to their creation time. */
async function assignmentTimes(tickets: { _id: unknown; createdAt: Date }[]) {
  const times = new Map<string, Date>();
  if (!tickets.length) return times;
  const activities = await ActivityLog.find({ ticketId: { $in: tickets.map((t) => t._id) }, type: { $in: ["CREATED", "ASSIGNEEIDS_CHANGED"] } }).sort({ createdAt: 1 }).select("ticketId type metadata createdAt").lean();
  for (const a of activities) {
    const meta = (a.metadata ?? {}) as { assigneeIds?: string[]; from?: string[]; to?: string[] };
    const before = new Set(a.type === "CREATED" ? [] : meta.from ?? []);
    for (const userId of a.type === "CREATED" ? meta.assigneeIds ?? [] : meta.to ?? []) {
      const key = `${a.ticketId}:${userId}`;
      if (!before.has(userId) && !times.has(key)) times.set(key, a.createdAt as Date);
    }
  }
  return times;
}

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);
const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Loads tickets assigned to anyone the viewer may look at. Visibility rules do not apply here on purpose:
 * a person removed from a group keeps their assignment record, and leaders still need to see it.
 */
async function scopedTickets(viewer: AuthUser, extra: Record<string, unknown> = {}) {
  const managed = await managedGroupIds(viewer);
  const filter: Record<string, unknown> = { deletedAt: null, "assigneeIds.0": { $exists: true }, ...extra };
  if (managed) filter.$or = [{ assigneeIds: viewer.id }, { groupId: { $in: [...managed] } }];
  const tickets = await Ticket.find(filter).select("ticketNumber title status priority dueDate completedAt createdAt groupId assigneeIds").limit(MAX_TICKETS).lean();
  const allowed = (ticket: { groupId?: unknown }, userId: string) => !managed || userId === viewer.id || (!!ticket.groupId && managed.has(String(ticket.groupId)));
  return { tickets, allowed };
}

export async function peopleSummary(viewer: AuthUser): Promise<Row[]> {
  const { tickets, allowed } = await scopedTickets(viewer);
  const groups = await Group.find({ _id: { $in: [...new Set(tickets.map((t) => String(t.groupId ?? "")).filter(Boolean))] } }).select("memberIds").lean();
  const members = new Map(groups.map((g) => [String(g._id), new Set((g.memberIds ?? []).map(String))]));
  const times = await assignmentTimes(tickets.filter((t) => DONE.includes(t.status)));
  const now = new Date();
  const stats = new Map<string, { t: Row; dueDone: number; onTime: number; days: number[] }>();
  for (const ticket of tickets) {
    for (const raw of ticket.assigneeIds ?? []) {
      const userId = String(raw);
      if (!allowed(ticket, userId)) continue;
      const entry = stats.get(userId) ?? { t: { userId, name: "", email: "", active: true, assigned: 0, completed: 0, inProgress: 0, open: 0, blocked: 0, overdue: 0, completionRate: 0, onTimeRate: null, avgDaysToComplete: null, leftGroup: 0 }, dueDone: 0, onTime: 0, days: [] };
      const row = entry.t;
      row.assigned++;
      const done = DONE.includes(ticket.status);
      if (done) {
        row.completed++;
        if (ticket.dueDate && ticket.completedAt) { entry.dueDone++; if (ticket.completedAt <= ticket.dueDate) entry.onTime++; }
        const from = times.get(`${ticket._id}:${userId}`) ?? ticket.createdAt;
        if (ticket.completedAt) entry.days.push(Math.max(0, ticket.completedAt.getTime() - from.getTime()) / 86400000);
      } else {
        if (ticket.status === "IN_PROGRESS" || ticket.status === "IN_REVIEW") row.inProgress++;
        else if (ticket.status === "BLOCKED") row.blocked++;
        else row.open++;
        if (ticket.dueDate && ticket.dueDate < now) row.overdue++;
      }
      if (ticket.groupId && !members.get(String(ticket.groupId))?.has(userId)) row.leftGroup++;
      stats.set(userId, entry);
    }
  }
  const users = await User.find({ _id: { $in: [...stats.keys()] } }).select("name email isActive").lean();
  const byId = new Map(users.map((u) => [String(u._id), u]));
  return [...stats.values()].map(({ t, dueDone, onTime, days }) => {
    const user = byId.get(t.userId);
    return { ...t, name: user?.name ?? "Unknown", email: user?.email ?? "", active: user?.isActive ?? false, completionRate: pct(t.completed, t.assigned), onTimeRate: dueDone ? pct(onTime, dueDone) : null, avgDaysToComplete: days.length ? round1(days.reduce((a, b) => a + b, 0) / days.length) : null };
  }).sort((a, b) => b.assigned - a.assigned || a.name.localeCompare(b.name));
}

export async function personDetail(viewer: AuthUser, userId: string, filters: { groupId?: string; status?: string; days?: number }) {
  const extra: Record<string, unknown> = { assigneeIds: userId };
  if (filters.groupId) extra.groupId = filters.groupId === "none" ? null : filters.groupId;
  if (filters.status) extra.status = filters.status;
  if (filters.days) extra.createdAt = { $gte: new Date(Date.now() - filters.days * 86400000) };
  const { tickets, allowed } = await scopedTickets(viewer, extra);
  const visible = tickets.filter((t) => allowed(t, userId));
  const groups = await Group.find({ _id: { $in: [...new Set(visible.map((t) => String(t.groupId ?? "")).filter(Boolean))] } }).select("name memberIds").lean();
  const byGroup = new Map(groups.map((g) => [String(g._id), g]));
  const times = await assignmentTimes(visible);
  const now = new Date();
  const rows = visible.map((t) => {
    const group = t.groupId ? byGroup.get(String(t.groupId)) : undefined;
    const done = DONE.includes(t.status);
    return {
      id: String(t._id), ticketNumber: t.ticketNumber, title: t.title, status: t.status, priority: t.priority, dueDate: t.dueDate ?? null, completedAt: t.completedAt ?? null,
      assignedAt: times.get(`${t._id}:${userId}`) ?? t.createdAt,
      groupId: t.groupId ? String(t.groupId) : null, groupName: group?.name ?? null,
      leftGroup: !!group && !(group.memberIds ?? []).map(String).includes(userId),
      overdue: !done && !!t.dueDate && t.dueDate < now,
      onTime: done && t.dueDate && t.completedAt ? t.completedAt <= t.dueDate : null,
    };
  }).sort((a, b) => a.ticketNumber.localeCompare(b.ticketNumber, "en", { numeric: true }));
  const user = await User.findById(userId).select("name email isActive").lean();
  return { user: user ? { id: userId, name: user.name, email: user.email, active: user.isActive } : null, tickets: rows };
}

/** True when the viewer may open this person's overview: themselves, a leader of a group they work in, or SuperAdmin. */
export async function canSeePerson(viewer: AuthUser, userId: string) {
  if (viewer.id === userId || isSuperAdmin(viewer)) return true;
  const managed = await managedGroupIds(viewer);
  return !!managed?.size && !!(await Ticket.exists({ deletedAt: null, assigneeIds: userId, groupId: { $in: [...managed] } }));
}
