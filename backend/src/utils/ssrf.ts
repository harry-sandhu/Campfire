import { isIP } from "node:net";

const v4Private = (ip: string) => {
  const [a, b] = ip.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19));
};

/** True for loopback, private, link-local, metadata and other addresses a webhook must never reach. */
export function isPrivateAddress(address: string): boolean {
  const kind = isIP(address);
  if (kind === 4) return v4Private(address);
  if (kind === 6) {
    const lower = address.toLowerCase();
    if (lower === "::" || lower === "::1") return true;
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return v4Private(mapped[1]);
    return /^f[cd]/.test(lower) || /^fe[89ab]/.test(lower) || lower.startsWith("ff");
  }
  return true;
}
