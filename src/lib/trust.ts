// QUANTEDGE PRO — trust & anti-abuse primitives
// IPs are never stored raw (GDPR): HMAC-SHA256 with a server-side secret.

import { createHmac } from "crypto";

/** Best-effort client IP resolution behind proxies (Railway/Cloudflare/Vercel). */
export function clientIpFromHeaders(h?: Headers | null): string | null {
  if (!h || typeof h.get !== "function") return null;
  const xff = h.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const real = h.get("x-real-ip") ?? h.get("cf-connecting-ip");
  return real ? real.trim() : null;
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
