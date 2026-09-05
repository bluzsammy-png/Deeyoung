// DEEYOUNG PRO — transactional email with a transport chain:
//   1. RESEND_API_KEY set    → Resend (branded domain sender; SPF/DKIM verified)
//   2. AGENTMAIL_API_KEY set → AgentMail (agentmail.to) from the org inbox
//   3. neither set           → dry mode: the action link is printed to the server console
// so the full flow stays testable without outbound mail.
// Any real transport ⇒ email verification becomes REQUIRED (production-strict).

import { Resend } from "resend";

// NOTE: AgentMail is integrated as a zero-dependency REST client (below) rather
// than the npm SDK — the SDK's optional @x402/fetch peer dep breaks webpack
// bundling, and the REST surface we need (list inboxes, send message) is tiny.

const FROM = process.env.EMAIL_FROM || "DeeYoung Pro <onboarding@resend.dev>";
const SUPPORT_EMAIL = "deyongsltd@gmail.com";
const APP_URL = (process.env.BETTER_AUTH_URL || "http://localhost:3000").replace(/\/$/, "");

let client: Resend | null = null;

function resendClient(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!client) client = new Resend(process.env.RESEND_API_KEY);
  return client;
}

// ─── AgentMail transport (agentmail.to — zero-dep REST client) ──────────────
// Docs: https://docs.agentmail.to — Bearer auth, JSON bodies, inbox_id = email.

const AGENTMAIL_BASE = process.env.AGENTMAIL_API_URL || "https://api.agentmail.to/v0";

let amInboxCache: string | null = null;

/** Resolve the sending inbox: AGENTMAIL_INBOX if set, else the org's first inbox. */
async function agentmailInbox(key: string): Promise<string> {
  if (amInboxCache) return amInboxCache;
  const wanted = process.env.AGENTMAIL_INBOX?.trim();
  if (wanted) {
    amInboxCache = wanted.includes("@") ? wanted : `${wanted}@agentmail.to`;
    return amInboxCache;
  }
  const res = await fetch(`${AGENTMAIL_BASE}/inboxes`, {
    headers: { Authorization: `Bearer ${key}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`AgentMail inboxes ${res.status}: ${body.slice(0, 200)}`);
  }
  const org = (await res.json()) as { inboxes?: Array<{ inbox_id?: string; email?: string }> };
  const first = org.inboxes?.[0];
  const inboxId = first?.inbox_id ?? first?.email;
  if (!inboxId) throw new Error("AgentMail org has no inboxes; create one or set AGENTMAIL_INBOX");
  amInboxCache = inboxId;
  return inboxId;
}

async function agentmailSend(to: string, subject: string, html: string): Promise<void> {
  const key = process.env.AGENTMAIL_API_KEY;
  if (!key) throw new Error("AGENTMAIL_API_KEY not set");
  const inbox = await agentmailInbox(key);
  // Plain-text fallback (cheap tag-strip) — improves deliverability scoring.
  const text = html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const res = await fetch(`${AGENTMAIL_BASE}/inboxes/${encodeURIComponent(inbox)}/messages/send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ to, subject, html, text }),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`AgentMail send ${res.status}: ${body.slice(0, 200)}`);
  }
}

export function emailConfigured(): boolean {
  return !!(process.env.RESEND_API_KEY || process.env.AGENTMAIL_API_KEY);
}

/** Which transport will deliver mail — surfaced by /api/health for diagnostics. */
export function mailTransport(): "resend" | "agentmail" | "dry" {
  if (process.env.RESEND_API_KEY) return "resend";
  if (process.env.AGENTMAIL_API_KEY) return "agentmail";
  return "dry";
}

/** Server-side verify endpoint: verifies the token, then redirects back to the app. */
export function verificationLink(token: string): string {
  return `${APP_URL}/api/auth/verify-email?token=${encodeURIComponent(token)}&callbackURL=${encodeURIComponent(APP_URL)}`;
}

/** The product is a single-page app — the reset lands on / with ?reset=<token>. */
export function passwordResetLink(token: string): string {
  return `${APP_URL}/?reset=${encodeURIComponent(token)}`;
}

// ─── Branded HTML shell (dark, premium, email-client-safe inline styles) ────

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://deeyoung-production.up.railway.app";

function shell(title: string, bodyHtml: string, ctaLabel: string, ctaUrl: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#07090d;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#07090d;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#0d1117;border:1px solid #1e252e;border-radius:16px;overflow:hidden;">
        <tr><td style="padding:28px 32px 0 32px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="padding-right:10px;">
              <img src="${SITE_URL}/icon-192.png" width="34" height="34" alt="DeeYoung Pro logo" style="display:block;width:34px;height:34px;border-radius:8px;border:1px solid rgba(220,38,38,0.5);" />
            </td>
            <td style="font-size:15px;font-weight:700;color:#e6edf3;letter-spacing:-0.2px;">DeeYoung <span style="color:#ef4444;">Pro</span></td>
          </tr></table>
          <h1 style="margin:18px 0 0 0;font-size:20px;font-weight:700;color:#e6edf3;letter-spacing:-0.3px;">${title}</h1>
        </td></tr>
        <tr><td style="padding:14px 32px 0 32px;">
          <p style="margin:0;font-size:14px;line-height:1.65;color:#8b98a5;">${bodyHtml}</p>
        </td></tr>
        <tr><td style="padding:26px 32px 6px 32px;">
          <a href="${ctaUrl}" style="display:block;text-align:center;background:#dc2626;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:13px 18px;border-radius:12px;">${ctaLabel}</a>
          <p style="margin:14px 0 0 0;font-size:11px;line-height:1.6;color:#5b6672;word-break:break-all;">Or paste this link into your browser:<br>${ctaUrl}</p>
        </td></tr>
        <tr><td style="padding:22px 32px 28px 32px;border-top:1px solid #1e252e;margin-top:22px;">
          <p style="margin:0;font-size:11px;line-height:1.6;color:#5b6672;">If you didn't request this, you can safely ignore this email and your account stays unchanged. One account per person; abuse leads to termination without refund.</p>
        </td></tr>
      </table>
      <p style="margin:18px 0 0 0;font-size:11px;color:#3d454f;">&#169; ${new Date().getFullYear()} DeeYoungs Ltd · <a href="mailto:deyoungltd@gmail.com" style="color:#8b98a5;">deyoungltd@gmail.com</a> · All rights reserved.</p>
    </td></tr>
  </table>
</body></html>`;
}

async function deliver(to: string, subject: string, html: string, dryNote: string): Promise<void> {
  // 1 — Resend (verified domain sender, preferred in production)
  const r = resendClient();
  if (r) {
    try {
      const { error } = await r.emails.send({ from: FROM, to, subject, html, replyTo: SUPPORT_EMAIL });
      if (error) console.error("[email] Resend rejected message:", error);
    } catch (e) {
      console.error("[email] Resend send failed:", e);
    }
    return;
  }
  // 2 — AgentMail (agent-first inbox transport)
  if (process.env.AGENTMAIL_API_KEY) {
    try {
      await agentmailSend(to, subject, html);
      console.log(`[email:agentmail] ${dryNote} → to=${to}`);
    } catch (e) {
      console.error("[email] AgentMail send failed:", e instanceof Error ? e.message : e);
    }
    return;
  }
  // 3 — Dry mode: surface the action link so the full flow is testable without outbound mail.
  const link = html.match(/href="([^"]+)"/)?.[1];
  console.log(`[email:dry] ${dryNote} → to=${to} link=${link ?? "(n/a)"}`);
}

export async function sendVerificationEmail(to: string, name: string, token: string): Promise<void> {
  const first = name.trim().split(" ")[0] || "there";
  await deliver(
    to,
    "Verify your email · DeeYoung Pro",
    shell(
      `Welcome aboard, ${first}.`,
      "Confirm this address to activate your account: live markets, multi-factor signals, and portfolio risk in one terminal. One account per person; subscribe anytime.",
      "Verify my email",
      verificationLink(token),
    ),
    "verification",
  );
}

export async function sendPasswordResetEmail(to: string, name: string, token: string): Promise<void> {
  const first = name.trim().split(" ")[0] || "there";
  await deliver(
    to,
    "Reset your password · DeeYoung Pro",
    shell(
      `Password reset, ${first}.`,
      "We received a request to reset the password on your account. This link works once and expires soon. Set a new password to regain terminal access.",
      "Choose a new password",
      passwordResetLink(token),
    ),
    "password-reset",
  );
}
