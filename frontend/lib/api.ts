const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api/v1";
let accessToken = "";
export const setAccessToken = (token: string) => { accessToken = token; };
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${base}${path}`, { ...init, credentials: "include", headers: { "Content-Type": "application/json", ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}), ...(init.headers || {}) } });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message || "Request failed");
  return body.data as T;
}
export async function refresh() { const data = await api<{ accessToken: string }>("/auth/refresh", { method: "POST" }); setAccessToken(data.accessToken); return data; }
