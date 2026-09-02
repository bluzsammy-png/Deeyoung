// QUANTEDGE PRO — signup MX deliverability check (anti-abuse layer 1.5).
// Rejects signups whose email domain cannot receive mail (typo'd domains,
// lookalike domains with no MX), while never blocking real users on DNS hiccups:
//   • definitive "no mail here" answers (ENOTFOUND/ENODATA) → reject
//   • transient resolver/network errors → fail open (allow) and let other layers decide
// Positive lookups are cached in memory for 10 minutes to keep signup snappy.

import { resolveMx, resolve } from "dns/promises";

type Verdict = { ok: boolean; reason?: string };

const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { verdict: Verdict; expires: number }>();

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(Object.assign(new Error("dns-timeout"), { code: "ETIMEOUT" })), ms))]);
}

export async function assertEmailDomainDeliverable(email: string): Promise<Verdict> {
  const domain = email.split("@")[1]?.toLowerCase().trim();
  if (!domain || !domain.includes(".")) {
    return { ok: false, reason: "That email address doesn't look valid." };
  }

  const hit = cache.get(domain);
  if (hit && hit.expires > Date.now()) return hit.verdict;

  const verdict = await lookup(domain);
  cache.set(domain, { verdict, expires: Date.now() + CACHE_TTL_MS });
  return verdict;
}

async function lookup(domain: string): Promise<Verdict> {
  try {
    const mx = await withTimeout(resolveMx(domain), 3500);
    if (mx && mx.length > 0) return { ok: true };
    // RFC 5321 §5.1 implicit MX: fall back to the A record before giving up.
    try {
      const a = await withTimeout(resolve(domain, "A"), 2500);
      if (a && a.length > 0) return { ok: true };
    } catch {
      /* fall through to definitive-miss handling below */
    }
    return {
      ok: false,
      reason: "That email domain can't receive mail. Double-check the address — no typos.",
    };
  } catch (e) {
    const code = (e as NodeJS.ErrnoException)?.code;
    if (code === "ENOTFOUND" || code === "ENODATA") {
      return {
        ok: false,
        reason: "That email domain doesn't exist. Double-check the address — no typos.",
      };
    }
    // ESERVFAIL / ETIMEOUT / network sandbox restrictions → fail open.
    return { ok: true };
  }
}
