import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { Ticket, User } from "../models/index.js";
import { subscribe, type DomainEvent } from "../services/events.js";
import { isSuperAdmin, memberGroupIds, ticketVisibilityFilter } from "../utils/access.js";

/**
 * Server-sent events. The stream carries only identifiers and short labels; clients refetch
 * through the normal, permission-checked API. Events are filtered per connection.
 */
const router = Router();
router.use(authenticate);

const HEARTBEAT_MS = 25_000;
/** Access tokens last 15 minutes; capping each stream makes clients reconnect with a fresh token, so revoked users drop off. */
const MAX_LIFETIME_MS = 25 * 60_000;
const MAX_CONNECTIONS_PER_USER = 5;
const connections = new Map<string, Set<() => void>>();

router.get("/", async (request, response) => {
  const user = request.user!;
  response.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
  response.write("retry: 5000\n\n");

  const mine = connections.get(user.id) ?? new Set();
  connections.set(user.id, mine);
  while (mine.size >= MAX_CONNECTIONS_PER_USER) { const oldest = mine.values().next().value!; oldest(); }

  let groupIds = new Set((await memberGroupIds(user.id)).map(String));
  let refreshedAt = Date.now();

  const canSee = async (event: DomainEvent) => {
    if (event.userIds?.includes(user.id)) return true;
    if (!event.ticketId) return event.groupId ? isSuperAdmin(user) || groupIds.has(event.groupId) : false;
    if (isSuperAdmin(user)) return true;
    if (event.groupId) {
      if (Date.now() - refreshedAt > 30_000) { groupIds = new Set((await memberGroupIds(user.id)).map(String)); refreshedAt = Date.now(); }
      return groupIds.has(event.groupId);
    }
    return !!(await Ticket.exists({ $and: [{ _id: event.ticketId }, await ticketVisibilityFilter(user)] }));
  };

  const unsubscribe = subscribe(async (event) => {
    try {
      if (!(await canSee(event))) return;
      const { body: _body, ...safeData } = (event.data ?? {}) as Record<string, unknown>;
      response.write(`event: ${event.type}\ndata: ${JSON.stringify({ type: event.type, ticketId: event.ticketId, groupId: event.groupId, data: safeData })}\n\n`);
    } catch { /* connection is closing */ }
  });
  const heartbeat = setInterval(async () => {
    const active = await User.exists({ _id: user.id, isActive: true, deletedAt: null }).catch(() => true);
    if (!active) return close();
    response.write(": ping\n\n");
  }, HEARTBEAT_MS);
  const lifetime = setTimeout(() => close(), MAX_LIFETIME_MS);

  function close() {
    clearInterval(heartbeat);
    clearTimeout(lifetime);
    unsubscribe();
    mine.delete(close);
    if (!mine.size) connections.delete(user.id);
    if (!response.writableEnded) response.end();
  }
  mine.add(close);
  request.on("close", close);
});

export { router as eventsRouter };
