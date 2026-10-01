import { describe, expect, it } from "vitest";
import { operations } from "../src/openapi.js";
import { listRoutes } from "./list-routes.js";

const normalise = (path: string) => path.replace(/:[A-Za-z]+/g, ":param");

describe("OpenAPI reference", () => {
  const routes = listRoutes().filter((r) => r.path.startsWith("/api/v1"));
  const documented = new Set(operations.map((o) => `${o.method.toUpperCase()} /api/v1${normalise(o.path)}`));
  const actual = new Set(routes.map((r) => `${r.method} ${r.path}`));

  it("documents every route", () => {
    expect([...actual].filter((r) => !documented.has(r))).toEqual([]);
  });

  it("does not document routes that do not exist", () => {
    expect([...documented].filter((r) => !actual.has(r))).toEqual([]);
  });
});
