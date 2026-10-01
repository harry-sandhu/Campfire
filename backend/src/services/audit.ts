import type { Request } from "express";
import { AuditLog } from "../models/index.js";

type Entry = { action: string; targetType?: string; targetId?: unknown; summary?: string; metadata?: Record<string, unknown> };

/** Writes an audit entry. Auditing must never break the request it describes. */
export async function audit(request: Request | null, actorId: string | null, entry: Entry) {
  try {
    await AuditLog.create({
      actorId,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId === undefined ? undefined : String(entry.targetId),
      summary: entry.summary ?? "",
      metadata: entry.metadata ?? {},
      ip: request?.ip,
    });
  } catch (error) {
    console.error("Failed to write audit log", error);
  }
}
