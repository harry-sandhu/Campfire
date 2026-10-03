import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Comment, Notification, Ticket } from "../src/models/index.js";
import { DEFAULT_PERMISSIONS } from "./permissions-fixture.js";
import { api, makeGroup, makeUser, resetDb, startDb, stopDb } from "./helpers.js";

beforeAll(startDb);
afterAll(stopDb);
beforeEach(resetDb);

const POWER = [...DEFAULT_PERMISSIONS, "tickets.edit", "tickets.change_status", "tickets.change_priority", "tickets.assign"];

async function world() {
  const alice = await makeUser("Alice", { permissions: POWER });
  const bob = await makeUser("Bob", { permissions: POWER });
  const group = await makeGroup("Alpha", [alice, bob]);
  const make = async (title: string, extra: Record<string, unknown> = {}) => {
    const res = await api().post("/api/v1/tickets").set(alice.auth).send({ title, groupId: group.id, assigneeIds: [bob.id], ...extra });
    return res.body.data.id as string;
  };
  const setStatus = (id: string, status: string) => api().patch(`/api/v1/tickets/${id}`).set(alice.auth).send({ status });
  const status = async (id: string) => (await Ticket.findById(id))!.status;
  const waitsOn = (id: string, other: string) => api().post(`/api/v1/tickets/${id}/relations`).set(alice.auth).send({ type: "WAITS_ON", ticketId: other });
  return { alice, bob, group, make, setStatus, status, waitsOn };
}

describe("ticket dependencies", () => {
  it("waits while the other ticket is not cleared, and becomes ready (Open) when it is", async () => {
    const { bob, make, setStatus, status, waitsOn } = await world();
    const decision = await make("Decision");
    const work = await make("Work that needs the decision");
    expect((await waitsOn(work, decision)).status).toBe(201);
    expect(await status(work)).toBe("WAITING");
    expect(await Comment.countDocuments({ ticketId: work, body: /waiting for TKT-/ })).toBe(1);
    // clearing the decision frees the work: Open, a comment, a notification to the assignee
    expect((await setStatus(decision, "COMPLETED")).status).toBe(200);
    expect(await status(work)).toBe("OPEN");
    expect(await Comment.countDocuments({ ticketId: work, body: /ready to start/ })).toBe(1);
    expect(await Notification.countDocuments({ userId: bob.id, ticketId: work, message: /ready to start/ })).toBe(1);
  });

  it("'This ticket blocks' works the same from the other side, and Closed counts as cleared", async () => {
    const { alice, make, setStatus, status } = await world();
    const decision = await make("Decision");
    const work = await make("Work");
    await api().post(`/api/v1/tickets/${decision}/relations`).set(alice.auth).send({ type: "BLOCKS", ticketId: work });
    expect(await status(work)).toBe("WAITING");
    await setStatus(decision, "CLOSED");
    expect(await status(work)).toBe("OPEN");
  });

  it("with several dependencies, every one must be cleared", async () => {
    const { make, setStatus, status, waitsOn } = await world();
    const a = await make("A"); const b = await make("B"); const work = await make("Work");
    await waitsOn(work, a); await waitsOn(work, b);
    await setStatus(a, "COMPLETED");
    expect(await status(work)).toBe("WAITING");
    await setStatus(b, "COMPLETED");
    expect(await status(work)).toBe("OPEN");
  });

  it("a ticket that needs a person (Blocked) or is in review also waits when it depends on a ticket", async () => {
    const { make, setStatus, status, waitsOn } = await world();
    const decision = await make("Decision");
    const blocked = await make("Needs input"); await setStatus(blocked, "BLOCKED");
    const review = await make("In review"); await setStatus(review, "IN_REVIEW");
    const doing = await make("In progress"); await setStatus(doing, "IN_PROGRESS");
    const done = await make("Already done"); await setStatus(done, "COMPLETED");
    for (const t of [blocked, review, doing, done]) await waitsOn(t, decision);
    expect([await status(blocked), await status(review), await status(doing), await status(done)]).toEqual(["WAITING", "WAITING", "IN_PROGRESS", "COMPLETED"]);
  });

  it("reopening a cleared ticket sends not-started tickets back to waiting, and only warns those already underway", async () => {
    const { make, setStatus, status, waitsOn } = await world();
    const decision = await make("Decision");
    const idle = await make("Not started");
    const doing = await make("Underway");
    await waitsOn(idle, decision); await waitsOn(doing, decision);
    await setStatus(decision, "COMPLETED");
    await setStatus(doing, "IN_PROGRESS");
    expect(await status(idle)).toBe("OPEN");
    await setStatus(decision, "OPEN"); // the decision is reopened
    expect(await status(idle)).toBe("WAITING");
    expect(await status(doing)).toBe("IN_PROGRESS");
    expect(await Comment.countDocuments({ ticketId: doing, body: /was reopened/ })).toBe(1);
  });

  it("refuses loops, self links and a manual Waiting with nothing to wait for", async () => {
    const { make, setStatus, waitsOn } = await world();
    const a = await make("A"); const b = await make("B"); const c = await make("C");
    expect((await waitsOn(a, a)).status).toBe(422);
    expect((await waitsOn(b, a)).status).toBe(201);   // B waits on A
    expect((await waitsOn(c, b)).status).toBe(201);   // C waits on B
    const loop = await waitsOn(a, c);                 // A waits on C: A -> C -> B -> A
    expect(loop.status).toBe(422);
    expect(loop.body.error.code).toBe("DEPENDENCY_LOOP");
    expect((await waitsOn(b, a)).status).toBe(409);   // already linked
    const free = await make("Free");
    const manual = await setStatus(free, "WAITING");
    expect(manual.status).toBe(422);
    expect(manual.body.error.code).toBe("NOTHING_TO_WAIT_FOR");
  });

  it("removing the last dependency frees a waiting ticket, and bulk status changes clear dependents too", async () => {
    const { alice, make, status, waitsOn } = await world();
    const decision = await make("Decision"); const work = await make("Work"); const other = await make("Other");
    await waitsOn(work, decision); await waitsOn(other, decision);
    await api().delete(`/api/v1/tickets/${work}/relations/${decision}`).set(alice.auth);
    expect(await status(work)).toBe("OPEN");
    const bulk = await api().post("/api/v1/tickets/bulk").set(alice.auth).send({ ids: [decision], action: "status", value: "COMPLETED" });
    expect(bulk.body.data.succeeded).toBe(1);
    expect(await status(other)).toBe("OPEN");
  });

  it("the dependency list and the Waiting filter work", async () => {
    const { alice, make, waitsOn } = await world();
    const decision = await make("Decision"); const work = await make("Work");
    await waitsOn(work, decision);
    const detail = (await api().get(`/api/v1/tickets/${work}`).set(alice.auth)).body.data;
    expect(detail.relations.map((r: { type: string }) => r.type)).toContain("blockedBy");
    const waiting = (await api().get("/api/v1/tickets?status=WAITING").set(alice.auth)).body.data.tickets;
    expect(waiting.map((t: { title: string }) => t.title)).toEqual(["Work"]);
  });
});
