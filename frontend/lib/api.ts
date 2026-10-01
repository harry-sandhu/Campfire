const PRODUCTION_API = "https://api.autodao.tech/api/v1";
const base = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === "production" ? PRODUCTION_API : "http://localhost:4000/api/v1");

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) {
    super(message);
  }
}

let accessToken = "";
let refreshInFlight: Promise<boolean> | null = null;
let refreshedUser: unknown = null;
let onAuthLost: () => void = () => {};

export const setAccessToken = (token: string) => {
  accessToken = token;
};
export const setAuthLostHandler = (handler: () => void) => {
  onAuthLost = handler;
};

async function send(path: string, init: RequestInit) {
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(init.headers || {}),
      },
    });
  } catch {
    throw new ApiError("Cannot reach the server. Check your connection and try again.", 0, "NETWORK");
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(body?.error?.message || `Request failed (${response.status})`, response.status, body?.error?.code || "REQUEST_FAILED");
  }
  return body?.data;
}

/** Refreshes the access token once, even when several requests fail at the same time. */
export function refreshSession() {
  refreshInFlight ??= send("/auth/refresh", { method: "POST" })
    .then((data: { accessToken: string; user?: unknown }) => {
      setAccessToken(data.accessToken);
      refreshedUser = data.user ?? null;
      return true;
    })
    .catch(() => false)
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  try {
    return await send(path, init);
  } catch (error) {
    const expired = error instanceof ApiError && error.status === 401 && !path.startsWith("/auth/");
    if (!expired) throw error;
    if (await refreshSession()) return send(path, init);
    onAuthLost();
    throw error;
  }
}

/** Authenticated download (for CSV export). Retries once after refreshing an expired token. */
export async function apiBlob(path: string): Promise<Blob> {
  const attempt = () => fetch(`${base}${path}`, { credentials: "include", headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} });
  let response = await attempt();
  if (response.status === 401 && (await refreshSession())) response = await attempt();
  if (!response.ok) throw new ApiError("Download failed", response.status, "DOWNLOAD_FAILED");
  return response.blob();
}

export const apiOrigin = base.replace(/\/api\/v1$/, "");
/** The user returned by the last successful refresh, so startup needs no separate /auth/me call. */
export const takeRefreshedUser = <T,>() => { const u = refreshedUser as T | null; refreshedUser = null; return u; };
export const getAccessToken = () => accessToken;
export const apiBase = base;

export const json = (value: unknown) => JSON.stringify(value);
