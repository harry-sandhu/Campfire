import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Automation, AutomationRun, Group, Milestone, Notification, Ticket, Webhook, WebhookDelivery } from "../src/models/index.js";
import { runMilestoneAlerts, runTimeAutomations, startAutomationEngine } from "../src/services/automations.js";
import { MAX_CONSECUTIVE_FAILURES, setWebhookTransport } from "../src/services/webhooks.js";
import { deliverWebhook } from "../src/services/webhooks.js";
import { DEFAULT_PERMISSIONS } from "./permissions-fixture.js";
import { api, makeGroup, makeUser, resetDb, startDb, stopDb } from "./helpers.js";

beforeAll(async () => { await startDb(); startAutomationEngine(); });
afterAll(stopDb);
beforeEach(resetDb);

const POWER = [...DEFAULT_PERMISSIONS, "tickets.edit", "tickets.change_status", "tickets.change_priority", "tickets.assign", "tickets.delete", "comments.edit"];

async function world() {
  const alice = await makeUser("Alice", { permissions: POWER }); // group creator and leader
  const bob = await makeUser("Bob", { permissions: POWER });
  const carol = await makeUser("Carol", { permissions: POWER });
  const group = await makeGroup("Alpha", [alice, bob]);
  const make = async (title: string, extra: object = {}) => (await api().post("/api/v1/tickets").set(alice.auth).send({ title, groupId: group.id, ...extra })).body.data.id as string;
  const rule = (body: object) => api().post(`/api/v1/groups/${group.id}/automations`).set(alice.auth).send(body);
  return { alice, bob, carol, group, make, rule };
}

async function until(check: () => Promise<boolean>, ms = 3000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await check()) return true; await new Promise((r) => setTimeout(r, 25)); }
  return false;
}

describe("automation rules", () => {
  it("lets only leaders and creators manage rules, and keeps them inside the group", async () => {
    const { bob, carol, group, rule } = await world();
    const body = { name: "Notify", trigger: { type: "ticket.created" }, actions: [{ type: "notify_leaders" }] };
    expect((await rule(body)).status).toBe(201);
    expect((await api().get(`/api/v1/groups/${group.id}/automations`).set(bob.auth)).status).toBe(403);
    expect((await api().post(`/api/v1/groups/${group.id}/automations`).set(bob.auth).send(body)).status).toBe(403);
    expect((await api().get(`/api/v1/groups/${group.id}/automations`).set(carol.auth)).status).toBe(404);
    const outsider = await rule({ ...body, actions: [{ type: "assign", userId: carol.id }] });
    expect(outsider.status).toBe(422);
    expect((await rule({ ...body, actions: [{ type: "set_priority" }] })).status).toBe(422);
  });

  it("assigns and notifies when a matching ticket is created, and ignores non-matching ones", async () => {
    const { alice, bob, make, rule } = await world();
    await rule({ name: "Urgent to Bob", trigger: { type: "ticket.created" }, conditions: [{ field: "priority", op: "is", value: "URGENT" }], actions: [{ type: "assign", userId: bob.id }, { type: "notify_leaders", message: "{ticket} is urgent" }] });
    const calm = await make("calm");
    const urgent = await make("fire", { priority: "URGENT" });
    expect(await until(async () => (await Ticket.findById(urgent))!.assigneeIds.map(String).includes(bob.id))).toBe(true);
    expect((await Ticket.findById(calm))!.assigneeIds).toHaveLength(0);
    expect(await until(async () => (await Notification.countDocuments({ userId: alice.id, type: "AUTOMATION" })) === 1)).toBe(true);
    expect((await Notification.findOne({ userId: alice.id, type: "AUTOMATION" }))!.message).toMatch(/TKT-\d+ is urgent/);
    expect(await AutomationRun.countDocuments({ ok: true })).toBe(1);
  });

  it("stops rules that would trigger themselves", async () => {
    const { make, rule } = await world();
    await rule({ name: "Loop", trigger: { type: "ticket.priority_changed" }, actions: [{ type: "set_priority", priority: "HIGH" }] });
    const id = await make("t");
    await api().patch(`/api/v1/tickets/${id}`).set((await makeUser("Dave", { role: "SUPERADMIN" })).auth).send({ priority: "LOW" });
    await until(async () => (await Ticket.findById(id))!.priority === "HIGH");
    await new Promise((r) => setTimeout(r, 300));
    expect((await Automation.findOne())!.runCount).toBe(1);
  });

  it("records a failing action and still runs the others", async () => {
    const { alice, make, rule } = await world();
    await rule({ name: "No slack", trigger: { type: "ticket.created" }, actions: [{ type: "post_slack" }, { type: "notify_leaders" }] });
    await make("t");
    expect(await until(async () => (await AutomationRun.countDocuments({ ok: false })) === 1)).toBe(true);
    expect(await Notification.countDocuments({ userId: alice.id, type: "AUTOMATION" })).toBe(1);
    expect((await Automation.findOne())!.failCount).toBe(1);
  });

  it("fires overdue rules once per ticket", async () => {
    const { alice, make, rule } = await world();
    await rule({ name: "Overdue", trigger: { type: "ticket.overdue" }, actions: [{ type: "notify_leaders" }] });
    const id = await make("late", { dueDate: new Date(Date.now() - 86400000).toISOString() });
    await make("fine");
    expect(await runTimeAutomations()).toBe(1);
    expect(await runTimeAutomations()).toBe(0);
    expect(await Notification.countDocuments({ userId: alice.id, ticketId: id })).toBe(1);
  });

  it("closes a milestone when its last ticket is completed", async () => {
    const { alice, group, make, rule } = await world();
    const milestone = await Milestone.create({ groupId: group.id, name: "M1" });
    await rule({ name: "Wrap up", trigger: { type: "milestone.completed" }, actions: [{ type: "close_milestone" }] });
    const a = await make("a", { milestoneId: String(milestone._id) });
    const b = await make("b", { milestoneId: String(milestone._id) });
    await api().patch(`/api/v1/tickets/${a}`).set(alice.auth).send({ status: "COMPLETED" });
    await new Promise((r) => setTimeout(r, 200));
    expect((await Milestone.findById(milestone._id))!.closedAt).toBeFalsy();
    await api().patch(`/api/v1/tickets/${b}`).set(alice.auth).send({ status: "COMPLETED" });
    expect(await until(async () => !!(await Milestone.findById(milestone._id))!.closedAt)).toBe(true);
  });

  it("dry-runs without changing anything", async () => {
    const { group, alice, make, rule } = await world();
    const created = (await rule({ name: "Urgent", trigger: { type: "ticket.created" }, conditions: [{ field: "priority", op: "is", value: "URGENT" }], actions: [{ type: "set_status", status: "BLOCKED" }] })).body.data;
    const id = await make("calm");
    const res = await api().post(`/api/v1/groups/${group.id}/automations/${created.id}/test`).set(alice.auth).send({ ticketId: id });
    expect(res.body.data).toEqual({ matches: false, steps: [] });
    expect((await Ticket.findById(id))!.status).toBe("OPEN");
  });
});

describe("milestones", () => {
  it("bulk-adds tickets to a milestone of their own group only", async () => {
    const { alice, group, make } = await world();
    const mine = await Milestone.create({ groupId: group.id, name: "M" });
    const otherGroup = await makeGroup("Beta", [alice]);
    const foreign = await Milestone.create({ groupId: otherGroup.id, name: "F" });
    const t = await make("t");
    const ok = await api().post("/api/v1/tickets/bulk").set(alice.auth).send({ ids: [t], action: "milestone", value: String(mine._id) });
    expect(ok.body.data.succeeded).toBe(1);
    expect(String((await Ticket.findById(t))!.milestoneId)).toBe(String(mine._id));
    const bad = await api().post("/api/v1/tickets/bulk").set(alice.auth).send({ ids: [t], action: "milestone", value: String(foreign._id) });
    expect(bad.body.data.failed).toBe(1);
    await api().post("/api/v1/tickets/bulk").set(alice.auth).send({ ids: [t], action: "milestone", value: null });
    expect((await Ticket.findById(t))!.milestoneId).toBeNull();
  });

  it("alerts leaders once when a milestone is due soon", async () => {
    const { alice, group } = await world();
    await Milestone.create({ groupId: group.id, name: "Soon", dueDate: new Date(Date.now() + 86400000) });
    await Milestone.create({ groupId: group.id, name: "Later", dueDate: new Date(Date.now() + 30 * 86400000) });
    expect(await runMilestoneAlerts()).toBe(1);
    expect(await runMilestoneAlerts()).toBe(0);
    expect(await Notification.countDocuments({ userId: alice.id, type: "MILESTONE_DUE" })).toBe(1);
  });
});

describe("webhook upgrades", () => {
  async function hook(groupId: string, alice: { id: string }) {
    return Webhook.create({ groupId, createdById: alice.id, url: "https://example.com/h", secret: "s", events: ["ticket.created"] });
  }

  it("keeps delivery history, pauses after repeated failures and alerts leaders", async () => {
    const { alice, group } = await world();
    const h = await hook(group.id, alice);
    setWebhookTransport(async () => 500);
    const original = global.setTimeout;
    // Retries wait 1s and 5s; skip the waiting so the test stays fast.
    (global as any).setTimeout = (fn: () => void) => original(fn, 0);
    try { for (let i = 0; i < MAX_CONSECUTIVE_FAILURES; i++) await deliverWebhook(h, "ticket.created", group.id, undefined, { title: "x" }); } finally { global.setTimeout = original; }
    const paused = (await Webhook.findById(h._id))!;
    expect(paused.active).toBe(false);
    expect(await WebhookDelivery.countDocuments({ webhookId: h._id, ok: false })).toBe(MAX_CONSECUTIVE_FAILURES);
    expect(await Notification.countDocuments({ userId: alice.id, type: "WEBHOOK_PAUSED" })).toBe(1);
    const list = await api().get(`/api/v1/groups/${group.id}/webhooks/${h._id}/deliveries`).set(alice.auth);
    expect(list.body.data.deliveries).toHaveLength(MAX_CONSECUTIVE_FAILURES);
    // Resuming resets the failure count, and a resend now succeeds.
    await api().patch(`/api/v1/groups/${group.id}/webhooks/${h._id}`).set(alice.auth).send({ active: true, format: "slack" });
    expect(await Webhook.findById(h._id)).toMatchObject({ active: true, failures: 0, format: "slack" });
    setWebhookTransport(async () => 200);
    const resend = await api().post(`/api/v1/groups/${group.id}/webhooks/${h._id}/deliveries/${list.body.data.deliveries[0].id}/resend`).set(alice.auth);
    expect(resend.body.data.delivered).toBe(true);
  });

  it("rotates the signing secret", async () => {
    const { alice, group } = await world();
    const h = await hook(group.id, alice);
    const res = await api().post(`/api/v1/groups/${group.id}/webhooks/${h._id}/rotate-secret`).set(alice.auth);
    expect(res.body.data.secret).toHaveLength(48);
    expect((await Webhook.findById(h._id))!.secret).toBe(res.body.data.secret);
  });
});

describe("people overview", () => {
  it("counts assigned and completed work, including groups the person has left", async () => {
    const { alice, bob, group, make } = await world();
    const done = await make("done", { assigneeIds: [bob.id], dueDate: new Date(Date.now() + 86400000).toISOString() });
    const late = await make("late", { assigneeIds: [bob.id], dueDate: new Date(Date.now() - 86400000).toISOString() });
    await make("other");
    await api().patch(`/api/v1/tickets/${done}`).set(alice.auth).send({ status: "COMPLETED" });
    await Group.updateOne({ _id: group.id }, { $pull: { memberIds: bob.id } }); // Bob leaves; his assignments stay on the tickets
    const res = await api().get("/api/v1/reports/people").set(alice.auth);
    const row = res.body.data.people.find((p: any) => p.userId === bob.id);
    expect(row).toMatchObject({ assigned: 2, completed: 1, overdue: 1, completionRate: 50, onTimeRate: 100, leftGroup: 2 });
    const detail = await api().get(`/api/v1/reports/people/${bob.id}`).set(alice.auth);
    expect(detail.body.data.tickets).toHaveLength(2);
    expect(detail.body.data.tickets.every((t: any) => t.leftGroup)).toBe(true);
    expect(detail.body.data.tickets.find((t: any) => t.id === late).overdue).toBe(true);
  });

  it("limits who can look at whom", async () => {
    const { alice, bob, carol, make } = await world();
    await make("for bob", { assigneeIds: [bob.id] });
    const otherGroup = await makeGroup("Beta", [carol]);
    await api().post("/api/v1/tickets").set(carol.auth).send({ title: "beta", groupId: otherGroup.id, assigneeIds: [carol.id] });
    // Bob is a plain member: he sees himself only.
    const own = await api().get("/api/v1/reports/people").set(bob.auth);
    expect(own.body.data.people.map((p: any) => p.userId)).toEqual([bob.id]);
    expect((await api().get(`/api/v1/reports/people/${alice.id}`).set(bob.auth)).status).toBe(404);
    // Alice leads Alpha, so she sees Bob but not Carol's Beta work.
    expect((await api().get(`/api/v1/reports/people/${bob.id}`).set(alice.auth)).status).toBe(200);
    expect((await api().get(`/api/v1/reports/people/${carol.id}`).set(alice.auth)).status).toBe(404);
    const aliceView = await api().get("/api/v1/reports/people").set(alice.auth);
    expect(aliceView.body.data.people.map((p: any) => p.userId)).not.toContain(carol.id);
  });
});
