/** Normalises an origin for comparison: trimmed, lower-case, no trailing slash. */
export const normalizeOrigin = (value: string) => value.trim().replace(/\/+$/, "").toLowerCase();

/**
 * Builds the set of browser origins allowed to call the API. Forgiving on purpose:
 * trailing slashes and letter case are ignored, and for a plain domain such as https://example.com the
 * matching https://www.example.com is allowed too (and the reverse), because sites often redirect between them.
 */
export function buildAllowedOrigins(frontendUrl: string, corsOrigins?: string) {
  const allowed = new Set<string>();
  const listed = [frontendUrl, ...(corsOrigins?.split(",") ?? [])].map(normalizeOrigin).filter(Boolean);
  for (const origin of listed) {
    allowed.add(origin);
    try {
      const url = new URL(origin);
      const labels = url.hostname.split(".");
      const apex = url.hostname.startsWith("www.") ? url.hostname.slice(4) : url.hostname;
      const isPlainDomain = apex.split(".").length === 2 && !/^\d+$/.test(labels[labels.length - 1]);
      if (isPlainDomain && url.protocol === "https:") allowed.add(`https://${url.hostname.startsWith("www.") ? apex : `www.${apex}`}${url.port ? `:${url.port}` : ""}`);
    } catch { /* not a URL: keep the literal entry only */ }
  }
  return allowed;
}

const reported = new Set<string>();
/** Logs each rejected origin once, so a wrong setting is obvious in the Render logs without flooding them. */
export function reportRejectedOrigin(origin: string, allowed: Set<string>) {
  if (reported.has(origin)) return;
  reported.add(origin);
  console.warn(`Rejected browser origin "${origin}". Allowed origins: ${[...allowed].join(", ") || "(none)"}. Check FRONTEND_URL and CORS_ORIGINS.`);
}
