// DEEYOUNG PRO — trust & anti-abuse primitives
// IPs are never stored raw (GDPR): HMAC-SHA256 with a server-side secret.

import { createHmac } from "crypto";

/**
 * Best-effort client IP resolution behind proxies (Railway/Cloudflare/Vercel).
 *
 * Order of trust:
 *   1. cf-connecting-ip — set by Cloudflare at the edge, cannot be spoofed by the client.
 *   2. LAST x-forwarded-for entry — the hop appended by the nearest proxy we traverse.
 *      (Taking the FIRST entry would let clients spoof a fake IP header; the last one
 *      is written by infrastructure we route through.)
 *   3. x-real-ip — common nginx fallback.
 */
export function clientIpFromHeaders(h?: Headers | null): string | null {
  if (!h || typeof h.get !== "function") return null;
  const cf = h.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const xff = h.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }
  const real = h.get("x-real-ip");
  return real ? real.trim() : null;
}

/** Loopback / private-range IPs: never rate-limit these. Dev, tests, and
 *  internal proxies all funnel through them — treating them as one shared
 *  "network" would lock out real users (and already did in the preview). */
export function isPrivateNetworkIp(ip: string): boolean {
  if (!ip) return true;
  const v = ip.toLowerCase();
  if (v === "::1" || v === "::" || v === "unknown") return true;
  if (v.startsWith("::ffff:")) return isPrivateNetworkIp(v.slice(7));
  if (v.startsWith("127.") || v.startsWith("10.")) return true;
  if (v.startsWith("192.168.")) return true;
  if (v.startsWith("172.")) {
    const second = Number.parseInt(v.split(".")[1] ?? "", 10);
    if (second >= 16 && second <= 31) return true;
  }
  if (v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80")) return true;
  return false;
}

/** One-way, salted hash of an IP — usable for velocity checks, useless for surveillance. */
export function hashIp(ip: string): string {
  const secret = process.env.APP_SECRET || process.env.BETTER_AUTH_SECRET || "deeyoung-dev-secret-do-not-use-in-prod";
  return createHmac("sha256", secret).update(ip).digest("hex");
}

/** Cloudflare Turnstile server-side verification. Env-gated: skipped when no secret configured. */
export async function verifyTurnstile(token: string, ip: string | null): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true; // not configured → skip
  if (!token) return false;
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip) body.set("remoteip", ip);
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
    });
    const json = (await res.json()) as { success?: boolean };
    return json.success === true;
  } catch {
    return false;
  }
}
