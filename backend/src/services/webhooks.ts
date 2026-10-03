import { createHmac, randomUUID } from "node:crypto";
import { lookup } from "node:dns";
import { request as httpsRequest } from "node:https";
import { env } from "../config/env.js";
import { Group, Webhook, WebhookDelivery } from "../models/index.js";
import { isPrivateAddress } from "../utils/ssrf.js";
import { notify } from "./ticket-service.js";
import { subscribe, type DomainEvent } from "./events.js";

export const WEBHOOK_EVENTS = ["ticket.created", "ticket.updated", "ticket.deleted", "comment.created"] as const;
const RETRY_DELAYS_MS = [0, 1000, 5000];
/** After this many deliveries in a row fail, the webhook is paused and the group leaders are told. */
export const MAX_CONSECUTIVE_FAILURES = 10;

type Delivery = { url: string; body: string; headers: Record<string, string> };
export type Transport = (delivery: Delivery) => Promise<number>;

/** DNS lookup that refuses private addresses. It runs at connect time, so DNS rebinding cannot bypass it. */
const safeLookup: typeof lookup = ((hostname: string, options: any, callback: any) => {
  lookup(hostname, { ...options, all: true }, (error, addresses: any) => {
    if (error) return callback(error);
    const safe = (addresses as { address: string; family: number }[]).filter((a) => !isPrivateAddress(a.address));
    if (!safe.length) return callback(new Error("Webhook target resolves to a private address"));
    if (options?.all) return callback(null, safe);
    callback(null, safe[0].address, safe[0].family);
  });
}) as typeof lookup;

const httpsTransport: Transport = ({ url, body, headers }) =>
  new Promise((resolve, reject) => {
    const req = httpsRequest(url, { method: "POST", headers: { ...headers, "Content-Length": Buffer.byteLength(body) }, lookup: safeLookup, timeout: 5000 }, (res) => {
      res.resume(); // redirects are deliberately not followed
      resolve(res.statusCode ?? 0);
    });
    req.on("timeout", () => req.destroy(new Error("Timed out")));
    req.on("error", reject);
    req.end(body);
  });

let transport: Transport = httpsTransport;
/** Tests replace the network layer. */
export const setWebhookTransport = (next: Transport) => { transport = next; };

export async function assertAllowedWebhookUrl(raw: string) {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error("Enter a valid URL"); }
  if (url.protocol !== "https:") throw new Error("Webhook URLs must use https");
  if (url.username || url.password) throw new Error("Webhook URLs cannot contain credentials");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) throw new Error("Webhook URLs cannot point at internal hosts");
  if (/^[\d.]+$/.test(host) || host.includes(":")) { if (isPrivateAddress(host)) throw new Error("Webhook URLs cannot point at private addresses"); }
}

const sign = (secret: string, body: string) => `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

function payloadFor(event: string, groupId: string, ticketId: string | undefined, data: Record<string, unknown>, format: string) {
  const url = ticketId ? `${env.FRONTEND_URL.replace(/\/$/, "")}/tickets/${ticketId}` : undefined;
  if (format === "slack") {
    const number = String(data.ticketNumber ?? "Ticket");
    const title = String(data.title ?? "");
    if (typeof data.automationMessage === "string") return { text: data.automationMessage };
    const verb = { "ticket.created": "created", "ticket.updated": "updated", "ticket.deleted": "deleted", "comment.created": `commented (${String(data.author ?? "someone")})` }[event] ?? event;
    const extra = event === "comment.created" ? `\n> ${String(data.body ?? "").slice(0, 300)}` : "";
    return { text: `*${number}* ${verb}: ${url ? `<${url}|${title}>` : title}${extra}` };
  }
  return { event, timestamp: new Date().toISOString(), groupId, ticket: ticketId ? { id: ticketId, url, ...data } : undefined, data };
}

/** Delivers one webhook with retries. Records the outcome on the webhook and in its delivery history. Returns the last HTTP status (0 on network failure). */
export async function deliverWebhook(hook: { _id: unknown; url: string; secret: string; format: string; groupId?: unknown }, event: string, groupId: string, ticketId: string | undefined, data: Record<string, unknown>) {
  const body = JSON.stringify(payloadFor(event, groupId, ticketId, data, hook.format));
  const headers = { "Content-Type": "application/json", "User-Agent": "Campfire-Webhook/1", "X-Campfire-Event": event, "X-Campfire-Delivery": randomUUID(), "X-Campfire-Signature": sign(hook.secret, body) };
  let status = 0;
  let failure = "";
  const started = Date.now();
  for (const delay of RETRY_DELAYS_MS) {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    try {
      status = await transport({ url: hook.url, body, headers });
      failure = status >= 200 && status < 300 ? "" : `HTTP ${status}`;
      if (!failure) break;
    } catch (error) {
      status = 0;
      failure = (error as Error).message;
      console.error(`Webhook ${hook._id} failed: ${failure}`);
    }
  }
  const delivered = !failure;
  await WebhookDelivery.create({ webhookId: hook._id, groupId, event, ticketId, data, status, ok: delivered, durationMs: Date.now() - started, error: failure || undefined }).catch(() => undefined);
  const updated = await Webhook.findOneAndUpdate(
    { _id: hook._id },
    delivered ? { lastStatus: String(status), lastDeliveredAt: new Date(), failures: 0 } : { lastStatus: status ? String(status) : "error", lastDeliveredAt: new Date(), $inc: { failures: 1 } },
    { new: true },
  ).catch(() => null);
  if (updated && updated.active && (updated.failures ?? 0) >= MAX_CONSECUTIVE_FAILURES) await pauseFailingWebhook(updated);
  return status;
}

async function pauseFailingWebhook(hook: { _id: unknown; groupId?: unknown }) {
  const paused = await Webhook.updateOne({ _id: hook._id, active: true }, { active: false }).catch(() => null);
  if (!paused?.modifiedCount) return;
  const group = await Group.findById(hook.groupId).select("name leaderIds creatorIds").lean().catch(() => null);
  if (!group) return;
  const leaders = [...(group.leaderIds ?? []), ...(group.creatorIds ?? [])].map(String);
  await notify(leaders, undefined, "WEBHOOK_PAUSED", `A webhook in ${group.name} was paused after ${MAX_CONSECUTIVE_FAILURES} failed deliveries`, "");
}

async function dispatch(event: DomainEvent) {
  if (!event.groupId || !(WEBHOOK_EVENTS as readonly string[]).includes(event.type)) return;
  const hooks = await Webhook.find({ groupId: event.groupId, active: true, events: event.type }).lean();
  for (const hook of hooks) void deliverWebhook(hook, event.type, event.groupId, event.ticketId, event.data ?? {});
}

export function startWebhookDispatcher() {
  return subscribe((event) => void dispatch(event).catch((error) => console.error("Webhook dispatch failed", error)));
}
