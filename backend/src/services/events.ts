import { AsyncLocalStorage } from "node:async_hooks";
import { EventEmitter } from "node:events";

/**
 * In-process domain events. Realtime streaming and webhook delivery subscribe here,
 * so route code only has to say what happened.
 */
export type DomainEvent = {
  type: "ticket.created" | "ticket.updated" | "ticket.deleted" | "comment.created" | "notification.created" | "group.updated";
  ticketId?: string;
  groupId?: string | null;
  /** Users who should receive this regardless of ticket visibility (for example notification owners). */
  userIds?: string[];
  data?: Record<string, unknown>;
  /** Ids of the automations whose actions led to this event, used to stop automation loops. */
  automationChain?: string[];
};

/** Set while an automation runs its actions, so every event those actions publish carries the chain. */
export const automationContext = new AsyncLocalStorage<{ chain: string[] }>();

const bus = new EventEmitter();
bus.setMaxListeners(0);

export const publish = (event: DomainEvent) => {
  const chain = automationContext.getStore()?.chain;
  void bus.emit("event", chain ? { ...event, automationChain: chain } : event);
};
export const subscribe = (listener: (event: DomainEvent) => void) => {
  bus.on("event", listener);
  return () => bus.off("event", listener);
};
