import { model, Schema, type Document } from "mongoose";

export * from "./extras.js";

const userSchema = new Schema({ name: { type: String, required: true, trim: true, maxlength: 120 }, email: { type: String, required: true, unique: true, lowercase: true, index: true }, passwordHash: { type: String, required: true }, role: { type: String, enum: ["SUPERADMIN", "USER"], default: "USER" }, permissions: { type: [String], default: [] }, isActive: { type: Boolean, default: true, index: true }, mustChangePassword: { type: Boolean, default: false }, lastLoginAt: Date, deletedAt: Date }, { timestamps: true });
const groupSchema = new Schema({ name: { type: String, required: true, trim: true, maxlength: 120 }, description: { type: String, default: "", maxlength: 1000 }, memberIds: { type: [{ type: Schema.Types.ObjectId, ref: "User" }], default: [], index: true }, leaderIds: { type: [{ type: Schema.Types.ObjectId, ref: "User" }], default: [], index: true }, creatorIds: { type: [{ type: Schema.Types.ObjectId, ref: "User" }], default: [], index: true }, deletedAt: Date }, { timestamps: true });
const topicSchema = new Schema({ groupId: { type: Schema.Types.ObjectId, ref: "Group", required: true, index: true }, name: { type: String, required: true, trim: true, maxlength: 120 }, description: { type: String, default: "", maxlength: 500 }, archivedAt: Date }, { timestamps: true });
topicSchema.index({ groupId: 1, name: 1 }, { unique: true });
const ticketSchema = new Schema({ ticketNumber: { type: String, required: true, unique: true, index: true }, groupId: { type: Schema.Types.ObjectId, ref: "Group", default: null, index: true }, milestoneId: { type: Schema.Types.ObjectId, ref: "Milestone", default: null, index: true }, parentId: { type: Schema.Types.ObjectId, ref: "Ticket", default: null, index: true }, relations: { type: [{ type: { type: String, enum: ["BLOCKS", "RELATES"] }, ticketId: { type: Schema.Types.ObjectId, ref: "Ticket" } }], default: [] }, watcherIds: { type: [{ type: Schema.Types.ObjectId, ref: "User" }], default: [] }, topicIds: { type: [{ type: Schema.Types.ObjectId, ref: "Topic" }], default: [], index: true }, title: { type: String, required: true, trim: true, maxlength: 200 }, description: { type: String, default: "", maxlength: 50000 }, status: { type: String, enum: ["OPEN", "IN_PROGRESS", "IN_REVIEW", "WAITING", "BLOCKED", "COMPLETED", "CLOSED"], default: "OPEN", index: true }, priority: { type: String, enum: ["NO_PRIORITY", "LOW", "MEDIUM", "HIGH", "URGENT"], default: "MEDIUM", index: true }, assigneeId: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true }, assigneeIds: { type: [{ type: Schema.Types.ObjectId, ref: "User" }], default: [], index: true }, createdById: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true }, updatedById: { type: Schema.Types.ObjectId, ref: "User", required: true }, dueDate: Date, completedAt: Date, deletedAt: Date }, { timestamps: true });
ticketSchema.index({ title: "text", description: "text" });
ticketSchema.index({ groupId: 1, updatedAt: -1 });
ticketSchema.index({ deletedAt: 1, updatedAt: -1 });
const commentSchema = new Schema({ ticketId: { type: Schema.Types.ObjectId, ref: "Ticket", required: true, index: true }, authorId: { type: Schema.Types.ObjectId, ref: "User", required: true }, body: { type: String, required: true, trim: true, maxlength: 10000 }, mentionIds: { type: [{ type: Schema.Types.ObjectId, ref: "User" }], default: [] }, deletedAt: Date }, { timestamps: true });
const linkSchema = new Schema({ ticketId: { type: Schema.Types.ObjectId, ref: "Ticket", required: true, index: true }, label: { type: String, required: true, trim: true, maxlength: 120 }, url: { type: String, required: true, maxlength: 2048 }, createdById: { type: Schema.Types.ObjectId, ref: "User", required: true } }, { timestamps: true });
const activitySchema = new Schema({ ticketId: { type: Schema.Types.ObjectId, ref: "Ticket", index: true }, actorId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true }, type: { type: String, required: true }, metadata: { type: Schema.Types.Mixed, default: {} } }, { timestamps: true });
const notificationSchema = new Schema({ userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true }, type: String, ticketId: { type: Schema.Types.ObjectId, ref: "Ticket" }, message: String, readAt: Date }, { timestamps: true });
activitySchema.index({ ticketId: 1, createdAt: -1 });
const refreshSchema = new Schema({ userId: { type: Schema.Types.ObjectId, ref: "User", required: true }, tokenId: { type: String, required: true, unique: true }, expiresAt: { type: Date, required: true, index: true }, revokedAt: Date, userAgent: String, ip: String }, { timestamps: true });
const counterSchema = new Schema({ _id: String, value: { type: Number, default: 0 } });

export const User = model("User", userSchema);
export const Group = model("Group", groupSchema);
export const Topic = model("Topic", topicSchema);
export const Ticket = model("Ticket", ticketSchema);
export const Comment = model("Comment", commentSchema);
export const TicketLink = model("TicketLink", linkSchema);
export const ActivityLog = model("ActivityLog", activitySchema);
export const Notification = model("Notification", notificationSchema);
export const RefreshToken = model("RefreshToken", refreshSchema);
export const Counter = model("Counter", counterSchema);
export type UserDocument = Document & { _id: unknown; name: string; email: string; passwordHash: string; role: "SUPERADMIN" | "USER"; permissions: string[]; isActive: boolean; mustChangePassword: boolean };
