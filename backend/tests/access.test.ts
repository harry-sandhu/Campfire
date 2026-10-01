import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_PERMISSIONS } from "./permissions-fixture.js";
import { api, makeGroup, makeUser, resetDb, startDb, stopDb } from "./helpers.js";

beforeAll(startDb);
afterAll(stopDb);
beforeEach(resetDb);

async function setup() {
  const admin = await makeUser("Admin", { role: "SUPERADMIN", permissions: [] });
  const alice = await makeUser("Alice", { permissions: [...DEFAULT_PERMISSIONS, "comments.edit", "comments.delete", "ticket_links.create", "tickets.delete", "activity.view", "tickets.edit"] });
  const bob = await makeUser("Bob", { permissions: [...DEFAULT_PERMISSIONS, "ticket_links.create", "activity.view"] });
  const groupA = await makeGroup("Alpha", [alice]);
  const groupB = await makeGroup("Beta", [bob]);
  const created = await api().post("/api/v1/tickets").set(alice.auth).send({ title: "Secret A", groupId: groupA.id, topicIds: [groupA.topicId] });
  return { admin, alice, bob, groupA, groupB, ticketId: created.body.data.id as string };
}

describe("group-scoped ticket access", () => {
  it("hides other groups' tickets from lists, details, dashboard and activity", async () => {
    const { bob, ticketId, alice } = await setup();
    expect((await api().get("/api/v1/tickets").set(bob.auth)).body.data.total).toBe(0);
    expect((await api().get(`/api/v1/tickets/${ticketId}`).set(bob.auth)).status).toBe(404);
    expect((await api().get("/api/v1/dashboard").set(bob.auth)).body.data.recent).toHaveLength(0);
    expect((await api().get("/api/v1/activity").set(bob.auth)).body.data.logs).toHaveLength(0);
    expect((await api().get("/api/v1/activity").set(alice.auth)).body.data.logs.length).toBeGreaterThan(0);
  });

  it("blocks comments and links on tickets outside the user's groups", async () => {
    const { bob, ticketId } = await setup();
    expect((await api().post(`/api/v1/tickets/${ticketId}/comments`).set(bob.auth).send({ body: "hi" })).status).toBe(404);
    expect((await api().post(`/api/v1/tickets/${ticketId}/links`).set(bob.auth).send({ label: "x", url: "https://example.com" })).status).toBe(404);
  });

  it("lets members comment, and SuperAdmin see everything", async () => {
    const { alice, admin, ticketId } = await setup();
    expect((await api().post(`/api/v1/tickets/${ticketId}/comments`).set(alice.auth).send({ body: "hi" })).status).toBe(201);
    expect((await api().get("/api/v1/tickets").set(admin.auth)).body.data.total).toBe(1);
  });

  it("lets ungrouped tickets be seen only by creator, assignees and SuperAdmin", async () => {
    const { alice, bob, admin } = await setup();
    const created = await api().post("/api/v1/tickets").set(alice.auth).send({ title: "Solo" });
    expect(created.status).toBe(201);
    const id = created.body.data.id;
    expect((await api().get(`/api/v1/tickets/${id}`).set(alice.auth)).status).toBe(200);
    expect((await api().get(`/api/v1/tickets/${id}`).set(bob.auth)).status).toBe(404);
    expect((await api().get(`/api/v1/tickets/${id}`).set(admin.auth)).status).toBe(200);
    expect((await api().patch(`/api/v1/tickets/${id}`).set(alice.auth).send({ assigneeIds: [bob.id] })).status).toBe(200);
    expect((await api().get(`/api/v1/tickets/${id}`).set(bob.auth)).status).toBe(200);
  });

  it("rejects creating tickets in groups the user is not in", async () => {
    const { alice, groupB } = await setup();
    const res = await api().post("/api/v1/tickets").set(alice.auth).send({ title: "x", groupId: groupB.id });
    expect(res.status).toBe(403);
  });

  it("rejects assignees outside the group and topics from other groups", async () => {
    const { alice, bob, groupA, groupB } = await setup();
    const assignee = await api().post("/api/v1/tickets").set(alice.auth).send({ title: "x", groupId: groupA.id, assigneeIds: [bob.id] });
    expect(assignee.status).toBe(422);
    const topic = await api().post("/api/v1/tickets").set(alice.auth).send({ title: "x", groupId: groupA.id, topicIds: [groupB.topicId] });
    expect(topic.status).toBe(422);
  });

  it("clears topics when a ticket moves group and enforces field permissions", async () => {
    const { alice, bob, ticketId, groupA } = await setup();
    const extra = await makeGroup("Gamma", [alice]);
    const moved = await api().patch(`/api/v1/tickets/${ticketId}`).set(alice.auth).send({ groupId: extra.id });
    expect(moved.status).toBe(200);
    expect(moved.body.data.topicIds).toHaveLength(0);
    // alice lacks tickets.change_status
    expect((await api().patch(`/api/v1/tickets/${ticketId}`).set(alice.auth).send({ status: "CLOSED" })).status).toBe(403);
    expect(groupA.id).toBeTruthy();
    expect((await api().patch(`/api/v1/tickets/${ticketId}`).set(bob.auth).send({ title: "hack" })).status).toBe(403);
  });

  it("escapes regex input in search instead of failing", async () => {
    const { alice } = await setup();
    const res = await api().get("/api/v1/tickets").query({ search: "(" }).set(alice.auth);
    expect(res.status).toBe(200);
  });

  it("returns 400/422 rather than 500 for malformed ids", async () => {
    const { alice } = await setup();
    expect((await api().get("/api/v1/tickets").query({ groupId: "nope" }).set(alice.auth)).status).toBe(422);
    expect((await api().get("/api/v1/tickets/nope").set(alice.auth)).status).toBe(422);
  });
});

describe("groups", () => {
  it("requires groups.create and hides groups from non-members", async () => {
    const { alice, bob, groupA, admin } = await setup();
    expect((await api().post("/api/v1/groups").set(alice.auth).send({ name: "New" })).status).toBe(403);
    expect((await api().post("/api/v1/groups").set(admin.auth).send({ name: "New" })).status).toBe(201);
    expect((await api().get(`/api/v1/groups/${groupA.id}`).set(bob.auth)).status).toBe(404);
  });

  it("protects the last creator and prevents leaders removing creators", async () => {
    const { alice, bob, groupA } = await setup();
    await api().post(`/api/v1/groups/${groupA.id}/members`).set(alice.auth).send({ userId: bob.id });
    await api().patch(`/api/v1/groups/${groupA.id}/roles/${bob.id}`).set(alice.auth).send({ leader: true });
    expect((await api().delete(`/api/v1/groups/${groupA.id}/members/${alice.id}`).set(bob.auth)).status).toBe(403);
    expect((await api().patch(`/api/v1/groups/${groupA.id}/roles/${alice.id}`).set(alice.auth).send({ creator: false })).status).toBe(400);
    expect((await api().delete(`/api/v1/groups/${groupA.id}/members/${alice.id}`).set(alice.auth)).status).toBe(400);
  });

  it("returns 409 for duplicate topic names", async () => {
    const { alice, groupA } = await setup();
    const res = await api().post(`/api/v1/groups/${groupA.id}/topics`).set(alice.auth).send({ name: "Alpha topic" });
    expect(res.status).toBe(409);
  });
});

describe("users and permissions", () => {
  it("prevents granting permissions the actor does not hold or editing own permissions", async () => {
    const admin = await makeUser("Admin", { role: "SUPERADMIN", permissions: [] });
    const manager = await makeUser("Manager", { permissions: [...DEFAULT_PERMISSIONS, "users.view", "users.edit", "users.create", "ticket_links.create"] });
    const target = await makeUser("Target");
    const escalate = await api().patch(`/api/v1/users/${target.id}`).set(manager.auth).send({ permissions: [...DEFAULT_PERMISSIONS, "settings.edit"] });
    expect(escalate.status).toBe(403);
    const self = await api().patch(`/api/v1/users/${manager.id}`).set(manager.auth).send({ permissions: [...DEFAULT_PERMISSIONS, "users.view", "users.edit", "users.create", "ticket_links.create", "comments.edit"] });
    expect(self.status).toBe(403);
    const ok = await api().patch(`/api/v1/users/${target.id}`).set(manager.auth).send({ permissions: [...DEFAULT_PERMISSIONS, "ticket_links.create"] });
    expect(ok.status).toBe(200);
    expect((await api().get("/api/v1/users/assignees").set(admin.auth)).body.data.users[0]).not.toHaveProperty("permissions");
  });

  it("forces a password change before using the API", async () => {
    const user = await makeUser("Temp", { mustChangePassword: true });
    const res = await api().get("/api/v1/tickets").set(user.auth);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("PASSWORD_CHANGE_REQUIRED");
  });
});

describe("error handling", () => {
  it("returns 400 for malformed JSON", async () => {
    const { alice } = await setup();
    const res = await api().post("/api/v1/tickets").set(alice.auth).set("Content-Type", "application/json").send("{bad");
    expect(res.status).toBe(400);
  });

  it("rejects cookie endpoints from foreign origins", async () => {
    const res = await api().post("/api/v1/auth/refresh").set("Origin", "https://evil.example");
    expect(res.status).toBe(403);
  });
});
