import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
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
    const { status, ...rest } = extra;
    const res = await api().post("/api/v1/tickets").set(alice.auth).send({ title, groupId: group.id, ...rest });
    if (status) await api().patch(`/api/v1/tickets/${res.body.data.id}`).set(alice.auth).send({ status });
    return res.body.data.id as string;
  };
  const list = async (query: string) => ((await api().get(`/api/v1/tickets?${query}`).set(alice.auth)).body.data.tickets as { title: string }[]).map((t) => t.title).sort();
  return { alice, bob, group, make, list };
}

describe("ticket list filters take several values and can be negated", () => {
  it("status: one value, several values, and 'is not'", async () => {
    const { make, list } = await world();
    await make("open one");
    await make("done one", { status: "COMPLETED" });
    await make("blocked one", { status: "BLOCKED" });
    await make("closed one", { status: "CLOSED" });
    expect(await list("status=COMPLETED")).toEqual(["done one"]);
    expect(await list("status=COMPLETED,CLOSED")).toEqual(["closed one", "done one"]);
    // everything that is NOT completed
    expect(await list("status=COMPLETED&statusNot=true")).toEqual(["blocked one", "closed one", "open one"]);
    // not completed and not closed
    expect(await list("status=COMPLETED,CLOSED&statusNot=true")).toEqual(["blocked one", "open one"]);
    // the flag alone changes nothing, and false means "is"
    expect(await list("statusNot=true")).toHaveLength(4);
    expect(await list("status=COMPLETED&statusNot=false")).toEqual(["done one"]);
  });

  it("rejects an unknown status instead of silently ignoring it", async () => {
    const { alice } = await world();
    expect((await api().get("/api/v1/tickets?status=COMPLETED,NOPE").set(alice.auth)).status).toBe(422);
    expect((await api().get("/api/v1/tickets?statusNot=maybe").set(alice.auth)).status).toBe(422);
  });

  it("priority and assignee work the same way", async () => {
    const { alice, bob, make, list } = await world();
    await make("urgent mine", { priority: "URGENT", assigneeIds: [alice.id] });
    await make("high bobs", { priority: "HIGH", assigneeIds: [bob.id] });
    await make("low both", { priority: "LOW", assigneeIds: [alice.id, bob.id] });
    await make("medium nobody");
    expect(await list("priority=URGENT,HIGH")).toEqual(["high bobs", "urgent mine"]);
    expect(await list("priority=URGENT,HIGH&priorityNot=true")).toEqual(["low both", "medium nobody"]);
    expect(await list(`assigneeId=${bob.id}`)).toEqual(["high bobs", "low both"]);
    expect(await list(`assigneeId=${alice.id},${bob.id}`)).toEqual(["high bobs", "low both", "urgent mine"]);
    // not assigned to Bob (includes the unassigned one)
    expect(await list(`assigneeId=${bob.id}&assigneeNot=true`)).toEqual(["medium nobody", "urgent mine"]);
    expect((await api().get("/api/v1/tickets?assigneeId=not-an-id").set(alice.auth)).status).toBe(422);
  });

  it("milestone supports several values and 'is not', and combines with status", async () => {
    const { alice, group, make, list } = await world();
    const ms = async (name: string) => (await api().post(`/api/v1/groups/${group.id}/milestones`).set(alice.auth).send({ name })).body.data.id as string;
    const [m1, m2] = [await ms("M1"), await ms("M2")];
    await make("in m1", { milestoneId: m1 });
    await make("in m2 done", { milestoneId: m2, status: "COMPLETED" });
    await make("no milestone");
    expect(await list(`milestoneId=${m1},${m2}`)).toEqual(["in m1", "in m2 done"]);
    expect(await list(`milestoneId=${m1}&milestoneNot=true`)).toEqual(["in m2 done", "no milestone"]);
    expect(await list(`milestoneId=${m1},${m2}&status=COMPLETED&statusNot=true`)).toEqual(["in m1"]);
  });

  it("the export uses the same filters, and saved views keep them", async () => {
    const { alice, make } = await world();
    await make("keep me");
    await make("done", { status: "COMPLETED" });
    const csv = (await api().get("/api/v1/tickets/export?status=COMPLETED&statusNot=true").set(alice.auth)).text;
    expect(csv).toContain("keep me");
    expect(csv).not.toContain("done");
    const saved = await api().post("/api/v1/saved-filters").set(alice.auth).send({ name: "Not done", query: { status: "COMPLETED", statusNot: "true", bogus: "x" } });
    expect(saved.status).toBe(201);
    expect(saved.body.data.query).toEqual({ status: "COMPLETED", statusNot: "true" });
  });
});
