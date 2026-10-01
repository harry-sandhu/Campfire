import { createHmac, randomUUID } from "node:crypto";
import { lookup } from "node:dns";
import { request as httpsRequest } from "node:https";
import { env } from "../config/env.js";
import { Webhook } from "../models/index.js";
import { isPrivateAddress } from "../utils/ssrf.js";
import { subscribe, type DomainEvent } from "./events.js";

export const WEBHOOK_EVENTS = ["ticket.created", "ticket.updated", "ticket.deleted", "comment.created"] as const;
const RETRY_DELAYS_MS = [0, 1000, 5000];

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
    const verb = { "ticket.created": "created", "ticket.updated": "updated", "ticket.deleted": "deleted", "comment.created": `commented (${String(data.author ?? "someone")})` }[event] ?? event;
    const extra = event === "comment.created" ? `\n> ${String(data.body ?? "").slice(0, 300)}` : "";
    return { text: `*${number}* ${verb}: ${url ? `<${url}|${title}>` : title}${extra}` };
  }
  return { event, timestamp: new Date().toISOString(), groupId, ticket: ticketId ? { id: ticketId, url, ...data } : undefined, data };
}

/** Delivers one webhook with retries. Records the outcome on the webhook document. Returns the last HTTP status (0 on network failure). */
export async function deliverWebhook(hook: { _id: unknown; url: string; secret: string; format: string }, event: string, groupId: string, ticketId: string | undefined, data: Record<string, unknown>) {
  const body = JSON.stringify(payloadFor(event, groupId, ticketId, data, hook.format));
  const headers = { "Content-Type": "application/json", "User-Agent": "Campfire-Webhook/1", "X-Campfire-Event": event, "X-Campfire-Delivery": randomUUID(), "X-Campfire-Signature": sign(hook.secret, body) };
  let status = 0;
  for (const delay of RETRY_DELAYS_MS) {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    try {
      status = await transport({ url: hook.url, body, headers });
      if (status >= 200 && status < 300) break;
    } catch (error) {
      status = 0;
      console.error(`Webhook ${hook._id} failed: ${(error as Error).message}`);
    }
  }
  await Webhook.updateOne({ _id: hook._id }, { lastStatus: status ? String(status) : "error", lastDeliveredAt: new Date() }).catch(() => undefined);
  return status;
}

async function dispatch(event: DomainEvent) {
  if (!event.groupId || !(WEBHOOK_EVENTS as readonly string[]).includes(event.type)) return;
  const hooks = await Webhook.find({ groupId: event.groupId, active: true, events: event.type }).lean();
  for (const hook of hooks) void deliverWebhook(hook, event.type, event.groupId, event.ticketId, event.data ?? {});
}

export function startWebhookDispatcher() {
  return subscribe((event) => void dispatch(event).catch((error) => console.error("Webhook dispatch failed", error)));
}
