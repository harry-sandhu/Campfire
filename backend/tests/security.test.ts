import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AuditLog, Comment, Ticket, User } from "../src/models/index.js";
import { hashPassword } from "../src/utils/security.js";
import { DEFAULT_PERMISSIONS } from "./permissions-fixture.js";
import { api, makeGroup, makeUser, resetDb, startDb, stopDb } from "./helpers.js";

beforeAll(startDb);
afterAll(stopDb);
beforeEach(resetDb);

describe("login lockout", () => {
  it("locks after repeated failures for known and unknown emails alike", async () => {
    await User.create({ name: "Sam", email: "sam@example.com", passwordHash: await hashPassword("password123"), permissions: [] });
    for (const email of ["sam@example.com", "ghost@example.com"]) {
      for (let i = 0; i < 5; i++) expect((await api().post("/api/v1/auth/login").send({ email, password: "wrong-password" })).status).toBe(401);
      const locked = await api().post("/api/v1/auth/login").send({ email, password: "password123" });
      expect(locked.status).toBe(429);
    }
  });
});

describe("sessions", () => {
  it("lists sessions and revokes others", async () => {
    await User.create({ name: "Sam", email: "sam@example.com", passwordHash: await hashPassword("password123"), permissions: [] });
    const a = await api().post("/api/v1/auth/login").send({ email: "sam@example.com", password: "password123" });
    const b = await api().post("/api/v1/auth/login").send({ email: "sam@example.com", password: "password123" });
    const cookieB = (b.headers["set-cookie"] as string[])[0].split(";")[0];
    const list = await api().get("/api/v1/auth/sessions").set("Authorization", `Bearer ${b.body.data.accessToken}`).set("Cookie", cookieB);
    expect(list.body.data.sessions).toHaveLength(2);
    expect(list.body.data.sessions.filter((s: any) => s.current)).toHaveLength(1);
    const revoked = await api().post("/api/v1/auth/sessions/revoke-others").set("Authorization", `Bearer ${a.body.data.accessToken}`).set("Cookie", cookieB);
    expect(revoked.body.data.revoked).toBe(1);
  });
});

describe("API tokens", () => {
  it("authenticates as the owner, honours read-only, and cannot manage tokens", async () => {
    const user = await makeUser("Dev");
    const created = await api().post("/api/v1/api-tokens").set(user.auth).send({ name: "ci", readOnly: true });
    expect(created.status).toBe(201);
    const token = created.body.data.token as string;
    expect(token.startsWith("cfp_")).toBe(true);
    expect((await api().get("/api/v1/api-tokens").set(user.auth)).body.data.tokens[0]).not.toHaveProperty("token");

    const bearer = { Authorization: `Bearer ${token}` };
    expect((await api().get("/api/v1/tickets").set(bearer)).status).toBe(200);
    expect((await api().post("/api/v1/tickets").set(bearer).send({ title: "x" })).status).toBe(403);
    expect((await api().get("/api/v1/api-tokens").set(bearer)).status).toBe(403);

    await api().delete(`/api/v1/api-tokens/${created.body.data.id}`).set(user.auth);
    expect((await api().get("/api/v1/tickets").set(bearer)).status).toBe(401);
  });

  it("allows writes with a read-write token", async () => {
    const user = await makeUser("Dev");
    const created = await api().post("/api/v1/api-tokens").set(user.auth).send({ name: "rw", readOnly: false });
    const res = await api().post("/api/v1/tickets").set({ Authorization: `Bearer ${created.body.data.token}` }).send({ title: "via token" });
    expect(res.status).toBe(201);
  });
});

describe("audit log and role templates", () => {
  it("records permission changes and restricts the log", async () => {
    const admin = await makeUser("Admin", { role: "SUPERADMIN", permissions: [] });
    const target = await makeUser("Target");
    await api().patch(`/api/v1/users/${target.id}`).set(admin.auth).send({ permissions: [...DEFAULT_PERMISSIONS, "tickets.edit"] });
    const log = await api().get("/api/v1/audit").set(admin.auth);
    expect(log.body.data.entries[0].action).toBe("PERMISSIONS_CHANGED");
    expect(log.body.data.entries[0].metadata.added).toEqual(["tickets.edit"]);
    expect((await api().get("/api/v1/audit").set(target.auth)).status).toBe(403);
    expect((await api().get("/api/v1/users/role-templates").set(admin.auth)).body.data.templates.length).toBeGreaterThan(2);
  });
});

describe("SuperAdmin data management", () => {
  it("finds old tickets, restores trash and purges with confirmation", async () => {
    const admin = await makeUser("Admin", { role: "SUPERADMIN", permissions: [] });
    const alice = await makeUser("Alice", { permissions: [...DEFAULT_PERMISSIONS, "tickets.delete"] });
    const group = await makeGroup("Alpha", [alice]);
    const t1 = (await api().post("/api/v1/tickets").set(alice.auth).send({ title: "old", groupId: group.id })).body.data.id;
    await api().post("/api/v1/tickets").set(alice.auth).send({ title: "new", groupId: group.id });
    await api().post(`/api/v1/tickets/${t1}/comments`).set(alice.auth).send({ body: "c" });
    await Ticket.updateOne({ _id: t1 }, { updatedAt: new Date(Date.now() - 400 * 86400000) }, { timestamps: false });

    expect((await api().get("/api/v1/admin/data/summary").set(alice.auth)).status).toBe(403);
    const old = await api().get("/api/v1/admin/data/tickets").query({ olderThanDays: 365 }).set(admin.auth);
    expect(old.body.data.tickets.map((t: any) => t.title)).toEqual(["old"]);

    await api().delete(`/api/v1/tickets/${t1}`).set(alice.auth);
    expect((await api().post("/api/v1/admin/data/tickets/restore").set(admin.auth).send({ ids: [t1] })).body.data.restored).toBe(1);
    await Ticket.updateOne({ _id: t1 }, { updatedAt: new Date(Date.now() - 400 * 86400000) }, { timestamps: false });

    expect((await api().post("/api/v1/admin/data/tickets/purge").set(admin.auth).send({ ids: [t1] })).status).toBe(422);
    const purged = await api().post("/api/v1/admin/data/tickets/purge").set(admin.auth).send({ filter: { olderThanDays: 365 }, confirm: "DELETE" });
    expect(purged.body.data.deleted).toBe(1);
    expect(await Ticket.countDocuments()).toBe(1);
    expect(await Comment.countDocuments()).toBe(0);
    expect(await AuditLog.countDocuments({ action: "TICKETS_PURGED" })).toBe(1);
  });
});
