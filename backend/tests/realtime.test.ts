import { createHmac } from "node:crypto";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startWebhookDispatcher, setWebhookTransport } from "../src/services/webhooks.js";
import { isPrivateAddress } from "../src/utils/ssrf.js";
import { DEFAULT_PERMISSIONS } from "./permissions-fixture.js";
import { api, app, makeGroup, makeUser, resetDb, startDb, stopDb } from "./helpers.js";

beforeAll(async () => { await startDb(); startWebhookDispatcher(); });
afterAll(stopDb);
beforeEach(resetDb);

describe("SSRF guard", () => {
  it("flags private, loopback, link-local and metadata addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "192.168.0.5", "172.20.0.1", "169.254.169.254", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1", "not-an-ip"]) expect(isPrivateAddress(ip)).toBe(true);
    for (const ip of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"]) expect(isPrivateAddress(ip)).toBe(false);
  });
});

describe("webhooks", () => {
  async function setup() {
    const alice = await makeUser("Alice", { permissions: [...DEFAULT_PERMISSIONS, "tickets.edit", "tickets.change_status"] });
    const bob = await makeUser("Bob");
    const group = await makeGroup("Alpha", [alice, bob]);
    return { alice, bob, group };
  }

  it("rejects unsafe URLs and non-managers", async () => {
    const { alice, bob, group } = await setup();
    for (const url of ["http://hooks.example.com/x", "https://localhost/x", "https://10.0.0.1/x", "https://169.254.169.254/latest", "https://user:pw@example.com/x"]) {
      expect((await api().post(`/api/v1/groups/${group.id}/webhooks`).set(alice.auth).send({ url })).status).toBe(422);
    }
    expect((await api().post(`/api/v1/groups/${group.id}/webhooks`).set(bob.auth).send({ url: "https://hooks.example.com/x" })).status).toBe(403);
  });

  it("delivers signed events for group tickets, in Slack format when asked", async () => {
    const { alice, group } = await setup();
    const sent: { url: string; body: string; headers: Record<string, string> }[] = [];
    setWebhookTransport(async (d) => { sent.push(d); return 200; });

    const json = await api().post(`/api/v1/groups/${group.id}/webhooks`).set(alice.auth).send({ url: "https://hooks.example.com/json", events: ["ticket.created", "comment.created"] });
    const slack = await api().post(`/api/v1/groups/${group.id}/webhooks`).set(alice.auth).send({ url: "https://hooks.slack.com/services/T/B/X", format: "slack", events: ["ticket.created"] });
    expect(json.body.data.secret).toBeTruthy();
    expect((await api().get(`/api/v1/groups/${group.id}/webhooks`).set(alice.auth)).body.data.webhooks[0]).not.toHaveProperty("secret");

    const created = await api().post("/api/v1/tickets").set(alice.auth).send({ title: "Ship it", groupId: group.id });
    await api().patch(`/api/v1/tickets/${created.body.data.id}`).set(alice.auth).send({ status: "IN_PROGRESS" });
    await new Promise((r) => setTimeout(r, 200));

    expect(sent).toHaveLength(2); // ticket.updated is not subscribed by either hook
    const jsonDelivery = sent.find((s) => s.url.endsWith("/json"))!;
    expect(jsonDelivery.headers["X-Campfire-Event"]).toBe("ticket.created");
    expect(jsonDelivery.headers["X-Campfire-Signature"]).toBe(`sha256=${createHmac("sha256", json.body.data.secret).update(jsonDelivery.body).digest("hex")}`);
    expect(JSON.parse(jsonDelivery.body).ticket.title).toBe("Ship it");
    expect(JSON.parse(sent.find((s) => s.url.includes("slack"))!.body).text).toContain("Ship it");

    const test = await api().post(`/api/v1/groups/${group.id}/webhooks/${json.body.data.id}/test`).set(alice.auth);
    expect(test.body.data.delivered).toBe(true);
  });

  it("does not fire for tickets outside the group", async () => {
    const { alice, group } = await setup();
    const sent: unknown[] = [];
    setWebhookTransport(async (d) => { sent.push(d); return 200; });
    await api().post(`/api/v1/groups/${group.id}/webhooks`).set(alice.auth).send({ url: "https://hooks.example.com/x" });
    await api().post("/api/v1/tickets").set(alice.auth).send({ title: "ungrouped" });
    await new Promise((r) => setTimeout(r, 100));
    expect(sent).toHaveLength(0);
  });
});

describe("server-sent events", () => {
  async function open(token: string) {
    const server = app.listen(0);
    const { port } = server.address() as AddressInfo;
    const controller = new AbortController();
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/events`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal });
    const reader = res.body!.getReader();
    const read = async (ms = 500) => {
      const chunk = await Promise.race([reader.read(), new Promise<null>((r) => setTimeout(() => r(null), ms))]);
      return chunk && !("done" in chunk && chunk.done) ? new TextDecoder().decode(chunk.value) : "";
    };
    return { read, close: () => { controller.abort(); server.close(); } };
  }

  it("streams events only to people who can see the ticket", async () => {
    const alice = await makeUser("Alice");
    const bob = await makeUser("Bob");
    const outsider = await makeUser("Eve");
    const group = await makeGroup("Alpha", [alice, bob]);
    const member = await open(bob.token);
    const stranger = await open(outsider.token);
    expect(await member.read()).toContain("retry");
    expect(await stranger.read()).toContain("retry");

    await api().post("/api/v1/tickets").set(alice.auth).send({ title: "Live", groupId: group.id });
    expect(await member.read()).toContain("ticket.created");
    expect(await stranger.read(300)).toBe("");
    member.close(); stranger.close();
  });

  it("delivers notifications to their owner", async () => {
    const alice = await makeUser("Alice");
    const bob = await makeUser("Bob");
    const group = await makeGroup("Alpha", [alice, bob]);
    const stream = await open(bob.token);
    await stream.read();
    await api().post("/api/v1/tickets").set(alice.auth).send({ title: "For Bob", groupId: group.id, assigneeIds: [bob.id] });
    const text = await stream.read() + await stream.read();
    expect(text).toContain("notification.created");
    stream.close();
  });
});
