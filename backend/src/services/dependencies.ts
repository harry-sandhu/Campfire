import { Comment, Ticket } from "../models/index.js";
import type { AuthUser } from "../types/auth.js";
import { unprocessable } from "../utils/errors.js";
import { publish } from "./events.js";
import { interestedUsers, notify, recordActivity } from "./ticket-service.js";

/**
 * Ticket dependencies. "A waits on B" is stored as the existing link "B blocks A".
 *
 *   - while B is not cleared (Completed or Closed), A sits in WAITING;
 *   - when every ticket A waits on is cleared, A moves to OPEN (ready) and its people are told;
 *   - if a cleared ticket is reopened, tickets that have not been started go back to WAITING
 *     (tickets already in progress or review keep their status, but their people are warned).
 * BLOCKED keeps its meaning: a person has to give input.
 */
export const CLEARED = ["COMPLETED", "CLOSED"];
/** Statuses that are pushed into WAITING when something they depend on is not cleared. */
const PARKABLE = ["OPEN", "BLOCKED", "IN_REVIEW"];
export const MAX_DEPENDENCIES = 20;

type TicketDoc = InstanceType<typeof Ticket>;
const idOf = (v: unknown) => String(v);

/** Tickets that `ticket` waits on (they block it). */
export async function blockersOf(ticket: { _id: unknown }) {
  return Ticket.find({ deletedAt: null, relations: { $elemMatch: { type: "BLOCKS", ticketId: ticket._id } } }).select("ticketNumber title status assigneeIds assigneeId watcherIds createdById groupId relations").lean();
}

/** Tickets that wait on `ticket`. */
export async function dependentsOf(ticket: { relations?: ArrayLike<{ type?: string | null; ticketId?: unknown }> }) {
  const ids = Array.from(ticket.relations ?? []).filter((r) => r.type === "BLOCKS").map((r) => r.ticketId);
  return ids.length ? Ticket.find({ _id: { $in: ids }, deletedAt: null }) : [];
}

/** Would making `dependent` wait on `blocker` create a loop (blocker already waits, directly or not, on dependent)? */
export async function wouldLoop(blockerId: string, dependentId: string) {
  const seen = new Set<string>();
  const queue = [dependentId];
  while (queue.length) {
    const id = queue.pop()!;
    if (id === blockerId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    const t = await Ticket.findById(id).select("relations").lean();
    for (const r of t?.relations ?? []) if (r.type === "BLOCKS") queue.push(idOf(r.ticketId));
  }
  return false;
}

async function setStatus(actor: AuthUser, ticket: TicketDoc, status: string, reason: string) {
  const from = ticket.status;
  await Ticket.updateOne({ _id: ticket._id }, { status, completedAt: null, updatedById: actor.id });
  ticket.status = status as TicketDoc["status"];
  await recordActivity(ticket._id, actor.id, "STATUS_CHANGED", { from, to: status, auto: true });
  await Comment.create({ ticketId: ticket._id, authorId: actor.id, body: `Automatic: ${reason}` });
  await notify(interestedUsers(ticket), ticket._id, "TICKET_STATUS", `${ticket.ticketNumber}: ${reason}`, actor.id);
  publish({ type: "ticket.updated", ticketId: idOf(ticket._id), groupId: ticket.groupId ? idOf(ticket.groupId) : null, data: { ticketNumber: ticket.ticketNumber, title: ticket.title, changed: ["status"] } });
}

/** Brings one ticket in line with the state of the tickets it waits on. */
export async function reconcileWaiting(actor: AuthUser, ticket: TicketDoc) {
  if (CLEARED.includes(ticket.status)) return;
  const open = (await blockersOf(ticket)).filter((b) => !CLEARED.includes(b.status));
  if (open.length && PARKABLE.includes(ticket.status)) {
    await setStatus(actor, ticket, "WAITING", `waiting for ${open.map((b) => `${b.ticketNumber} "${String(b.title).slice(0, 60)}"`).join(", ")} to be cleared.`);
  } else if (!open.length && ticket.status === "WAITING") {
    await setStatus(actor, ticket, "OPEN", "everything this ticket was waiting for is cleared, so it is ready to start.");
  }
}

/** Call after a ticket's status changed from `previous`. */
export async function afterStatusChange(actor: AuthUser, ticket: TicketDoc, previous: string) {
  const wasCleared = CLEARED.includes(previous);
  const isCleared = CLEARED.includes(ticket.status);
  if (wasCleared === isCleared) return;
  for (const dependent of await dependentsOf(ticket)) {
    if (isCleared) {
      await reconcileWaiting(actor, dependent);
    } else if (dependent.status === "OPEN") {
      await setStatus(actor, dependent, "WAITING", `${ticket.ticketNumber} "${String(ticket.title).slice(0, 60)}" was reopened, so this ticket waits for it again.`);
    } else if (!CLEARED.includes(dependent.status) && dependent.status !== "WAITING") {
      await Comment.create({ ticketId: dependent._id, authorId: actor.id, body: `Automatic: ${ticket.ticketNumber}, which this ticket depends on, was reopened. Its decision may change.` });
      await notify(interestedUsers(dependent), dependent._id, "TICKET_STATUS", `${ticket.ticketNumber} was reopened; ${dependent.ticketNumber} depends on it`, actor.id);
    }
  }
}

/** "dependent waits on blocker". */
export async function addDependency(actor: AuthUser, dependent: TicketDoc, blocker: TicketDoc) {
  if (idOf(dependent._id) === idOf(blocker._id)) throw unprocessable("INVALID_RELATION", "A ticket cannot wait on itself");
  if ((blocker.relations ?? []).some((r) => idOf(r.ticketId) === idOf(dependent._id)) || (dependent.relations ?? []).some((r) => idOf(r.ticketId) === idOf(blocker._id))) {
    throw unprocessable("RELATION_EXISTS", "These tickets are already linked");
  }
  if ((await blockersOf(dependent)).length >= MAX_DEPENDENCIES) throw unprocessable("TOO_MANY_DEPENDENCIES", `A ticket can wait on at most ${MAX_DEPENDENCIES} others`);
  if (await wouldLoop(idOf(blocker._id), idOf(dependent._id))) throw unprocessable("DEPENDENCY_LOOP", `${blocker.ticketNumber} already waits on ${dependent.ticketNumber} (directly or through others), so this would be a loop`);
  await Ticket.updateOne({ _id: blocker._id }, { $push: { relations: { type: "BLOCKS", ticketId: dependent._id } } }, { timestamps: false });
  await recordActivity(dependent._id, actor.id, "RELATION_ADDED", { type: "WAITS_ON", target: blocker.ticketNumber });
  await reconcileWaiting(actor, dependent);
}

/** Call after a link between two tickets was removed, so the one that was waiting is re-checked. */
export async function afterRelationRemoved(actor: AuthUser, a: TicketDoc, b: TicketDoc) {
  for (const t of [a, b]) {
    const fresh = await Ticket.findById(t._id);
    if (fresh) await reconcileWaiting(actor, fresh);
  }
}
