import { expect, type Page } from "@playwright/test";

export const API = "http://localhost:4100/api/v1";
export const ADMIN = { email: "admin@example.com", password: "admin-password-123" };

async function call<T = any>(path: string, token: string | null, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(json)}`);
  return json.data;
}

export const bootstrap = () => fetch(`${API}/bootstrap`, { method: "POST" }).then(() => undefined);
export const login = async (email: string, password: string) => (await call<{ accessToken: string }>("/auth/login", null, "POST", { email, password })).accessToken;
export const adminToken = () => login(ADMIN.email, ADMIN.password);
export const post = <T = any>(token: string, path: string, body?: unknown) => call<T>(path, token, "POST", body);
export const get = <T = any>(token: string, path: string) => call<T>(path, token);

/** Creates a user with a temporary password; they must change it at first sign-in. */
export async function createUser(adminTokenValue: string, name: string, email: string, temporaryPassword = "temp-password-1") {
  return post<{ id: string }>(adminTokenValue, "/users", { name, email, temporaryPassword });
}

export async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

export async function signInAsAdmin(page: Page) {
  await signIn(page, ADMIN.email, ADMIN.password);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/Good (morning|afternoon|evening), Admin/);
}
