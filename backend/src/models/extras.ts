import { model, Schema } from "mongoose";

const id = (ref: string, extra: Record<string, unknown> = {}) => ({ type: Schema.Types.ObjectId, ref, ...extra });

const savedFilterSchema = new Schema({
  userId: id("User", { required: true, index: true }),
  name: { type: String, required: true, trim: true, maxlength: 60 },
  query: { type: Map, of: String, default: {} },
}, { timestamps: true });

const milestoneSchema = new Schema({
  groupId: id("Group", { required: true, index: true }),
  name: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, default: "", maxlength: 1000 },
  dueDate: Date,
  closedAt: Date,
}, { timestamps: true });

const templateSchema = new Schema({
  groupId: id("Group", { default: null, index: true }),
  createdById: id("User", { required: true }),
  name: { type: String, required: true, trim: true, maxlength: 80 },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  description: { type: String, default: "", maxlength: 50000 },
  priority: { type: String, enum: ["NO_PRIORITY", "LOW", "MEDIUM", "HIGH", "URGENT"], default: "MEDIUM" },
  topicIds: { type: [id("Topic")], default: [] },
  assigneeIds: { type: [id("User")], default: [] },
  recurrence: {
    every: { type: String, enum: ["daily", "weekly", "monthly"] },
    nextRunAt: Date,
    active: { type: Boolean, default: false },
  },
}, { timestamps: true });
templateSchema.index({ "recurrence.active": 1, "recurrence.nextRunAt": 1 });

const auditSchema = new Schema({
  actorId: id("User", { index: true }),
  action: { type: String, required: true, index: true },
  targetType: String,
  targetId: String,
  summary: { type: String, default: "" },
  metadata: { type: Schema.Types.Mixed, default: {} },
  ip: String,
}, { timestamps: { createdAt: true, updatedAt: false } });
auditSchema.index({ createdAt: -1 });

const apiTokenSchema = new Schema({
  userId: id("User", { required: true, index: true }),
  name: { type: String, required: true, trim: true, maxlength: 60 },
  prefix: { type: String, required: true },
  tokenHash: { type: String, required: true, unique: true },
  readOnly: { type: Boolean, default: true },
  expiresAt: Date,
  lastUsedAt: Date,
  revokedAt: Date,
}, { timestamps: true });

const webhookSchema = new Schema({
  groupId: id("Group", { required: true, index: true }),
  createdById: id("User", { required: true }),
  url: { type: String, required: true, maxlength: 2048 },
  format: { type: String, enum: ["json", "slack"], default: "json" },
  secret: { type: String, required: true },
  events: { type: [String], default: [] },
  active: { type: Boolean, default: true },
  lastStatus: String,
  lastDeliveredAt: Date,
}, { timestamps: true });

/** Failed-login counters keyed by email, so unknown and known accounts behave identically. */
const loginAttemptSchema = new Schema({
  email: { type: String, required: true, unique: true },
  count: { type: Number, default: 0 },
  lockedUntil: Date,
  updatedAt: { type: Date, default: Date.now, expires: 86400 },
});

export const SavedFilter = model("SavedFilter", savedFilterSchema);
export const Milestone = model("Milestone", milestoneSchema);
export const TicketTemplate = model("TicketTemplate", templateSchema);
export const AuditLog = model("AuditLog", auditSchema);
export const ApiToken = model("ApiToken", apiTokenSchema);
export const Webhook = model("Webhook", webhookSchema);
export const LoginAttempt = model("LoginAttempt", loginAttemptSchema);
