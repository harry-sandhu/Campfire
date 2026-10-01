import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { User } from "../src/models/index.js";
import { hashPassword } from "../src/utils/security.js";
import { api, resetDb, startDb, stopDb } from "./helpers.js";

beforeAll(startDb);
afterAll(stopDb);
beforeEach(resetDb);

const cookieOf = (res: any) => (res.headers["set-cookie"] as string[]).find((c) => c.startsWith("refreshToken="))!.split(";")[0];

async function login() {
  await User.create({ name: "Sam", email: "sam@example.com", passwordHash: await hashPassword("password123"), permissions: ["tickets.view"] });
  return api().post("/api/v1/auth/login").send({ email: "sam@example.com", password: "password123" });
}

describe("auth sessions", () => {
  it("rotates refresh tokens and revokes the family when an old one is replayed", async () => {
    const first = await login();
    expect(first.status).toBe(200);
    const oldCookie = cookieOf(first);

    const rotated = await api().post("/api/v1/auth/refresh").set("Cookie", oldCookie);
    expect(rotated.status).toBe(200);
    const newCookie = cookieOf(rotated);

    expect((await api().post("/api/v1/auth/refresh").set("Cookie", oldCookie)).status).toBe(401);
    // the replay also killed the newest token
    expect((await api().post("/api/v1/auth/refresh").set("Cookie", newCookie)).status).toBe(401);
  });

  it("rejects bad credentials identically for unknown and known emails", async () => {
    await login();
    const unknown = await api().post("/api/v1/auth/login").send({ email: "nobody@example.com", password: "password123" });
    const wrong = await api().post("/api/v1/auth/login").send({ email: "sam@example.com", password: "wrong-password" });
    expect(unknown.status).toBe(401);
    expect(unknown.body).toEqual(wrong.body);
  });

  it("revokes sessions after a password change", async () => {
    const first = await login();
    const cookie = cookieOf(first);
    const changed = await api().post("/api/v1/auth/change-password").set("Authorization", `Bearer ${first.body.data.accessToken}`).send({ currentPassword: "password123", newPassword: "another-password" });
    expect(changed.status).toBe(200);
    expect((await api().post("/api/v1/auth/refresh").set("Cookie", cookie)).status).toBe(401);
  });
});
