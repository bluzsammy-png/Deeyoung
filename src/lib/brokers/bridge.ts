// DEEYOUNG PRO — own MT4/MT5 EA bridge helpers (no third party service).
//
// MetaTrader terminals have no official web API. Instead of routing through an
// external cloud bridge (unreachable from this deployment), the user installs
// our Expert Advisor on their own terminal. The EA authenticates with a
// per-link bridge token, polls /api/bridge/poll for queued commands, executes
// them locally on the user's account, and reports fills back. A fill is only
// ever recorded from the terminal's own report.
//
// The token is shown once at link creation and stored only as a SHA-256 hex
// digest. Losing it means generating a new link.

import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { db } from "@/lib/db";

export type BridgeLink = Awaited<ReturnType<typeof db.brokerLink.findFirstOrThrow>>;

export function newBridgeToken(): string {
  // 32 random bytes, url-safe. ~43 chars. Shown once, stored hashed.
  return `btk_${randomBytes(32).toString("base64url")}`;
}

export function hashBridgeToken(token: string): string {
  return createHash("sha256").update(token.trim()).digest("hex");
}

/** Constant-time digest comparison; returns the link when the token matches. */
export async function bridgeLinkByToken(token: string): Promise<BridgeLink | null> {
  const t = token.trim();
  if (!t || t.length < 16 || t.length > 200) return null;
  const digest = hashBridgeToken(t);
  const link = await db.brokerLink.findFirst({
    where: { bridgeTokenHash: digest, platform: { in: ["MT4", "MT5"] } },
  });
  if (!link) return null;
  const given = Buffer.from(digest, "hex");
  const stored = Buffer.from(link.bridgeTokenHash as string, "hex");
  if (given.length !== stored.length || !timingSafeEqual(given, stored)) return null;
  return link;
}

/** A bridge link counts as live while its terminal has checked in recently. */
export const BRIDGE_LIVE_WINDOW_MS = 3 * 60_000;

export function bridgeLive(lastHandshakeAt: Date | null | undefined): boolean {
  if (!lastHandshakeAt) return false;
  return Date.now() - lastHandshakeAt.getTime() < BRIDGE_LIVE_WINDOW_MS;
}

export const EA_VERSION = "1.0.0";
export const EA_MAGIC = 860426;
export const BRIDGE_HEARTBEAT_SEC = 5;
