import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { createApp } from "../src/app.js";
import { DEFAULT_PERMISSIONS } from "./permissions-fixture.js";
import { Group, Topic, User } from "../src/models/index.js";
import { createAccessToken } from "../src/utils/security.js";

let mongo: MongoMemoryServer;
export const app = createApp();
export const api = () => request(app);

export async function startDb() {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
}
export async function stopDb() {
  await mongoose.disconnect();
  await mongo.stop();
}
export async function resetDb() {
  await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})));
}

export async function makeUser(name: string, options: { role?: "SUPERADMIN" | "USER"; permissions?: string[]; mustChangePassword?: boolean } = {}) {
  const user = await User.create({
    name,
    email: `${name.toLowerCase().replace(/\W/g, "")}@example.com`,
    passwordHash: "x",
    role: options.role ?? "USER",
    permissions: options.permissions ?? DEFAULT_PERMISSIONS,
    mustChangePassword: options.mustChangePassword ?? false,
  });
  const token = createAccessToken({ id: String(user._id), name, email: user.email, role: user.role as "USER", permissions: [] });
  return { id: String(user._id), token, auth: { Authorization: `Bearer ${token}` } };
}

export async function makeGroup(name: string, members: { id: string }[], creator = members[0]) {
  const group = await Group.create({ name, memberIds: members.map((m) => m.id), leaderIds: [creator.id], creatorIds: [creator.id] });
  const topic = await Topic.create({ groupId: group._id, name: `${name} topic` });
  return { id: String(group._id), topicId: String(topic._id) };
}
