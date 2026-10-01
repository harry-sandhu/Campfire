import { describe, expect, it } from "vitest";
import { buildAllowedOrigins, normalizeOrigin } from "../src/config/origins.js";
import { api } from "./helpers.js";

describe("allowed origins", () => {
  it("ignores trailing slashes, case and whitespace", () => {
    const allowed = buildAllowedOrigins(" HTTPS://AutoDAO.tech/ ", "https://preview.vercel.app/ , ");
    expect(allowed.has(normalizeOrigin("https://autodao.tech"))).toBe(true);
    expect(allowed.has("https://preview.vercel.app")).toBe(true);
  });

  it("allows the www and apex counterpart of a plain domain, but not unrelated hosts", () => {
    expect(buildAllowedOrigins("https://autodao.tech").has("https://www.autodao.tech")).toBe(true);
    expect(buildAllowedOrigins("https://www.autodao.tech").has("https://autodao.tech")).toBe(true);
    expect(buildAllowedOrigins("https://autodao.tech").has("https://evil.example")).toBe(false);
    expect(buildAllowedOrigins("http://localhost:3000").size).toBe(1);
    expect(buildAllowedOrigins("https://app.example.com").size).toBe(1);
  });

  it("rejects an unlisted origin and accepts the configured one on cookie endpoints", async () => {
    expect((await api().post("/api/v1/auth/refresh").set("Origin", "https://evil.example")).status).toBe(403);
    expect((await api().post("/api/v1/auth/refresh").set("Origin", "http://localhost:3000/")).status).toBe(401);
    expect((await api().post("/api/v1/auth/refresh").set("Origin", "http://www.localhost:3000")).status).toBe(403);
  });
});
