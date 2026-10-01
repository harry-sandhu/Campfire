import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Comment, Group, Notification, Ticket, TicketTemplate } from "../src/models/index.js";
import { runDueRecurrences } from "../src/services/recurrence.js";
import { DEFAULT_PERMISSIONS } from "./permissions-fixture.js";
import { api, makeGroup, makeUser, resetDb, startDb, stopDb } from "./helpers.js";

beforeAll(startDb);
afterAll(stopDb);
beforeEach(resetDb);

const POWER = [...DEFAULT_PERMISSIONS, "tickets.edit", "tickets.change_status", "tickets.change_priority", "tickets.delete", "comments.edit", "ticket_links.create", "activity.view"];

async function world() {
  const alice = await makeUser("Alice", { permissions: POWER });
  const bob = await makeUser("Bob", { permissions: POWER });
  const carol = await makeUser("Carol", { permissions: POWER });
  const group = await makeGroup("Alpha", [alice, bob]);
  const make = async (title: string, extra: object = {}) => (await api().post("/api/v1/tickets").set(alice.auth).send({ title, groupId: group.id, ...extra })).body.data.id as string;
  return { alice, bob, carol, group, make };
}

describe("mentions and watchers", () => {
  it("notifies only mentioned users who can see the ticket", async () => {
    const { alice, bob, carol, make } = await world();
    const id = await make("T");
    const res = await api().post(`/api/v1/tickets/${id}/comments`).set(alice.auth).send({ body: "hi @Bob @Carol", mentionIds: [bob.id, carol.id] });
    expect(res.status).toBe(201);
    expect((await Comment.findById(res.body.data._id))!.mentionIds.map(String)).toEqual([bob.id]);
    expect(await Notification.countDocuments({ userId: bob.id, type: "TICKET_MENTION" })).toBe(1);
    expect(await Notification.countDocuments({ userId: carol.id })).toBe(0);
  });

  it("lets users watch tickets and notifies watchers about comments", async () => {
    const { alice, bob, make } = await world();
    const id = await make("T");
    expect((await api().post(`/api/v1/tickets/${id}/watch`).set(bob.auth)).body.data.watching).toBe(true);
    expect((await api().get(`/api/v1/tickets/${id}`).set(bob.auth)).body.data.watching).toBe(true);
    await api().post(`/api/v1/tickets/${id}/comments`).set(alice.auth).send({ body: "update" });
    expect(await Notification.countDocuments({ userId: bob.id, type: "TICKET_COMMENTED" })).toBe(1);
    await api().delete(`/api/v1/tickets/${id}/watch`).set(bob.auth);
    expect((await api().get(`/api/v1/tickets/${id}`).set(bob.auth)).body.data.watching).toBe(false);
  });
});

describe("subtasks, relations, milestones", () => {
  it("enforces single-level subtasks within one group", async () => {
    const { alice, make, group } = await world();
    const parent = await make("Parent");
    const child = await make("Child", { parentId: parent });
    const nested = await api().post("/api/v1/tickets").set(alice.auth).send({ title: "Nested", groupId: group.id, parentId: child });
    expect(nested.status).toBe(422);
    const other = await makeGroup("Beta", [alice]);
    const cross = await api().post("/api/v1/tickets").set(alice.auth).send({ title: "X", groupId: other.id, parentId: parent });
    expect(cross.status).toBe(422);
    const move = await api().patch(`/api/v1/tickets/${child}`).set(alice.auth).send({ groupId: other.id });
    expect(move.status).toBe(422);
    const detail = await api().get(`/api/v1/tickets/${parent}`).set(alice.auth);
    expect(detail.body.data.subtasks).toHaveLength(1);
    expect((await api().get(`/api/v1/tickets/${child}`).set(alice.auth)).body.data.parent.id).toBe(parent);
  });

  it("links tickets and shows both directions", async () => {
    const { alice, make } = await world();
    const a = await make("A");
    const b = await make("B");
    expect((await api().post(`/api/v1/tickets/${a}/relations`).set(alice.auth).send({ type: "BLOCKS", ticketId: b })).status).toBe(201);
    expect((await api().post(`/api/v1/tickets/${b}/relations`).set(alice.auth).send({ type: "RELATES", ticketId: a })).status).toBe(409);
    expect((await api().get(`/api/v1/tickets/${a}`).set(alice.auth)).body.data.relations[0].type).toBe("blocks");
    expect((await api().get(`/api/v1/tickets/${b}`).set(alice.auth)).body.data.relations[0].type).toBe("blockedBy");
    await api().delete(`/api/v1/tickets/${a}/relations/${b}`).set(alice.auth);
    expect((await api().get(`/api/v1/tickets/${a}`).set(alice.auth)).body.data.relations).toHaveLength(0);
  });

  it("tracks milestone progress and requires milestones from the ticket's group", async () => {
    const { alice, bob, make, group } = await world();
    const made = await api().post(`/api/v1/groups/${group.id}/milestones`).set(alice.auth).send({ name: "v1", dueDate: "2030-01-01" });
    expect(made.status).toBe(201);
    const milestoneId = made.body.data.id;
    const t1 = await make("One", { milestoneId });
    await make("Two", { milestoneId });
    await api().patch(`/api/v1/tickets/${t1}`).set(alice.auth).send({ status: "COMPLETED" });
    const list = await api().get(`/api/v1/groups/${group.id}/milestones`).set(bob.auth);
    expect(list.body.data.milestones[0]).toMatchObject({ total: 2, done: 1 });
    const other = await makeGroup("Beta", [alice]);
    expect((await api().post("/api/v1/tickets").set(alice.auth).send({ title: "bad", groupId: other.id, milestoneId })).status).toBe(422);
  });
});

describe("bulk, export, import, search, filters, reports", () => {
  it("applies bulk actions per ticket and reports failures", async () => {
    const { alice, bob, make } = await world();
    const a = await make("A");
    const b = await make("B");
    const res = await api().post("/api/v1/tickets/bulk").set(alice.auth).send({ ids: [a, b], action: "status", value: "BLOCKED" });
    expect(res.body.data.succeeded).toBe(2);
    expect((await Ticket.findById(a))!.status).toBe("BLOCKED");
    const denied = await api().post("/api/v1/tickets/bulk").set((await makeUser("Eve")).auth).send({ ids: [a], action: "delete" });
    expect(denied.body.data.failed).toBe(1);
    const assign = await api().post("/api/v1/tickets/bulk").set(alice.auth).send({ ids: [a, b], action: "assign", value: bob.id });
    expect(assign.body.data.succeeded).toBe(2);
  });

  it("exports scoped CSV with formula protection and imports rows", async () => {
    const { alice, carol, make, group } = await world();
    await make("=HYPERLINK(\"http://evil\")");
    const csv = await api().get("/api/v1/tickets/export").set(alice.auth);
    expect(csv.headers["content-type"]).toContain("text/csv");
    expect(csv.text).toContain("'=HYPERLINK");
    expect((await api().get("/api/v1/tickets/export").set(carol.auth)).text.split("\r\n").filter(Boolean)).toHaveLength(1);
    const imp = await api().post("/api/v1/tickets/import").set(alice.auth).send({ groupId: group.id, rows: [{ title: "Imported", priority: "HIGH", status: "IN_PROGRESS" }, { title: "" }] });
    expect(imp.body.data.created).toBe(1);
    expect(imp.body.data.errors).toHaveLength(1);
    expect((await Ticket.findOne({ title: "Imported" }))!.status).toBe("IN_PROGRESS");
  });

  it("limits search results to what the user can see", async () => {
    const { alice, carol, make } = await world();
    await make("Quarterly budget");
    expect((await api().get("/api/v1/search").query({ q: "budget" }).set(alice.auth)).body.data.tickets).toHaveLength(1);
    expect((await api().get("/api/v1/search").query({ q: "budget" }).set(carol.auth)).body.data.tickets).toHaveLength(0);
  });

  it("stores and removes saved filters per user", async () => {
    const { alice, bob } = await world();
    const saved = await api().post("/api/v1/saved-filters").set(alice.auth).send({ name: "Urgent", query: { priority: "URGENT", evil: "x" } });
    expect(saved.body.data.query).toEqual({ priority: "URGENT" });
    expect((await api().get("/api/v1/saved-filters").set(bob.auth)).body.data.filters).toHaveLength(0);
    expect((await api().delete(`/api/v1/saved-filters/${saved.body.data.id}`).set(bob.auth)).status).toBe(404);
    expect((await api().delete(`/api/v1/saved-filters/${saved.body.data.id}`).set(alice.auth)).status).toBe(200);
  });

  it("builds scoped reports", async () => {
    const { alice, carol, make } = await world();
    const id = await make("Done", { priority: "URGENT" });
    await make("Open");
    await api().patch(`/api/v1/tickets/${id}`).set(alice.auth).send({ status: "COMPLETED" });
    const report = await api().get("/api/v1/reports").set(alice.auth);
    expect(report.body.data.byStatus).toMatchObject({ COMPLETED: 1, OPEN: 1 });
    expect(report.body.data.series).toHaveLength(12);
    expect(report.body.data.avgLeadTimeDays).not.toBeNull();
    expect((await api().get("/api/v1/reports").set(carol.auth)).body.data.byStatus).toEqual({});
  });

  it("paginates comments", async () => {
    const { alice, make } = await world();
    const id = await make("Chatty");
    await Comment.insertMany(Array.from({ length: 35 }, (_, i) => ({ ticketId: id, authorId: alice.id, body: `c${i}` })));
    const detail = await api().get(`/api/v1/tickets/${id}`).set(alice.auth);
    expect(detail.body.data.comments).toHaveLength(30);
    expect(detail.body.data.hasMoreComments).toBe(true);
    const older = await api().get(`/api/v1/tickets/${id}/comments`).query({ before: detail.body.data.comments[0]._id }).set(alice.auth);
    expect(older.body.data.comments).toHaveLength(5);
    expect(older.body.data.hasMore).toBe(false);
  });
});

describe("templates and recurring tickets", () => {
  it("creates tickets from templates and on schedule exactly once", async () => {
    const { alice, bob, group } = await world();
    const made = await api().post("/api/v1/templates").set(alice.auth).send({ name: "Weekly check", title: "Weekly check", groupId: group.id, recurrence: { every: "weekly" } });
    expect(made.status).toBe(201);
    expect((await api().get("/api/v1/templates").set(bob.auth)).body.data.templates).toHaveLength(1);
    expect((await api().post(`/api/v1/templates/${made.body.data.id}/create`).set(bob.auth)).status).toBe(201);

    const later = new Date(Date.now() + 8 * 86400000);
    expect(await runDueRecurrences(later)).toBe(1);
    expect(await runDueRecurrences(later)).toBe(0);
    expect(await Ticket.countDocuments({ title: "Weekly check" })).toBe(2);
    expect((await TicketTemplate.findById(made.body.data.id))!.recurrence!.nextRunAt! > later).toBe(true);
  });

  it("hides templates from non-members", async () => {
    const { alice, carol, group } = await world();
    const made = await api().post("/api/v1/templates").set(alice.auth).send({ name: "T", title: "T", groupId: group.id });
    expect((await api().get("/api/v1/templates").set(carol.auth)).body.data.templates).toHaveLength(0);
    expect((await api().post(`/api/v1/templates/${made.body.data.id}/create`).set(carol.auth)).status).toBe(404);
    expect(await Group.countDocuments()).toBe(1);
  });
});
