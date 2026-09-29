import { describe, expect, it } from "vitest";
import { isPermission, PERMISSIONS } from "../src/constants/permissions.js";

describe("permission catalog", () => {
  it("contains granular ticket permissions", () => {
    expect(PERMISSIONS).toContain("tickets.create");
    expect(PERMISSIONS).toContain("tickets.assign");
    expect(isPermission("tickets.delete")).toBe(true);
    expect(isPermission("admin.all")).toBe(false);
  });
});
