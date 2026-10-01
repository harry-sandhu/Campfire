import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { Group, Ticket, User } from "../models/index.js";
import { buildTicketFilter } from "../services/ticket-service.js";
import { hasPermission, isSuperAdmin } from "../utils/access.js";
import { handle } from "../utils/async-handler.js";
import { ok } from "../utils/http.js";
import { escapeRegex } from "../utils/validation.js";

const router = Router();
router.use(authenticate);

/** Quick search for the command palette: tickets and groups the caller can see, and people if they may browse users. */
router.get("/", handle(async (request, response) => {
  const { q } = z.object({ q: z.string().trim().min(1).max(100) }).parse(request.query);
  const user = request.user!;
  const pattern = new RegExp(escapeRegex(q), "i");

  const [tickets, groups, people] = await Promise.all([
    hasPermission(user, "tickets.view")
      ? Ticket.find(await buildTicketFilter(user, { search: q })).sort({ updatedAt: -1 }).limit(8).select("ticketNumber title status").lean()
      : [],
    Group.find({ name: pattern, deletedAt: null, ...(isSuperAdmin(user) ? {} : { memberIds: user.id }) }).limit(5).select("name").lean(),
    hasPermission(user, "users.view") ? User.find({ deletedAt: null, isActive: true, $or: [{ name: pattern }, { email: pattern }] }).limit(5).select("name email").lean() : [],
  ]);

  ok(response, {
    tickets: tickets.map((t) => ({ id: String(t._id), ticketNumber: t.ticketNumber, title: t.title, status: t.status })),
    groups: groups.map((g) => ({ id: String(g._id), name: g.name })),
    people: people.map((p) => ({ id: String(p._id), name: p.name, email: p.email })),
  });
}));

export { router as searchRouter };
