// DEEYOUNG PRO — symmetric crypto for broker credentials.
// AES-256-GCM keyed by APP_SECRET (falls back to BETTER_AUTH_SECRET in dev).
// Ciphertext, IV and auth tag are stored as separate columns so a leak of one
// field alone is useless. Plaintext passwords NEVER touch the database or logs.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

function key(): Buffer {
  const secret = process.env.APP_SECRET || process.env.BETTER_AUTH_SECRET || "deeyoung-dev-secret-do-not-use-in-prod";
  return createHash("sha256").update(secret).digest();
}

export function encryptSecret(plaintext: string): { cipher: string; iv: string; tag: string } {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plaintext, "utf8"), c.final()]);
  return { cipher: enc.toString("hex"), iv: iv.toString("hex"), tag: c.getAuthTag().toString("hex") };
}

export function decryptSecret(payload: { cipher: string; iv: string; tag: string }): string | null {
  try {
    const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(payload.iv, "hex"));
    d.setAuthTag(Buffer.from(payload.tag, "hex"));
    return Buffer.concat([d.update(Buffer.from(payload.cipher, "hex")), d.final()]).toString("utf8");
  } catch {
    return null; // wrong key / tampered row — never throw secrets around
  }
}
