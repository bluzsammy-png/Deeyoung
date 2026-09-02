// DEEYOUNG PRO — transactional email via Resend.
// Env-gated by design:
//   • RESEND_API_KEY set  → branded mail is sent; email verification becomes REQUIRED.
//   • RESEND_API_KEY unset (local/sandbox) → dry mode: the link is printed to the server
//     console so the full flow stays testable without outbound mail.

import { Resend } from "resend";

const FROM = process.env.EMAIL_FROM || "DeeYoung Pro <onboarding@resend.dev>";
const SUPPORT_EMAIL = "deyongsltd@gmail.com";
const APP_URL = (process.env.BETTER_AUTH_URL || "http://localhost:3000").replace(/\/$/, "");

let client: Resend | null = null;

function resendClient(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!client) client = new Resend(process.env.RESEND_API_KEY);
  return client;
}

export function emailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
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
              <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                <td style="width:30px;height:30px;background:#0a0a0c;border:1px solid rgba(220,38,38,0.5);border-radius:8px;text-align:center;font-size:16px;font-weight:800;color:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">D</td>
              </tr></table>
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
          <p style="margin:0;font-size:11px;line-height:1.6;color:#5b6672;">If you didn't request this, you can safely ignore this email — your account stays unchanged. One account per person; trial abuse leads to termination without refund.</p>
        </td></tr>
      </table>
      <p style="margin:18px 0 0 0;font-size:11px;color:#3d454f;">&#169; ${new Date().getFullYear()} DeeYoungs Ltd · <a href="mailto:deyongsltd@gmail.com" style="color:#8b98a5;">deyongsltd@gmail.com</a> · All rights reserved.</p>
    </td></tr>
  </table>
</body></html>`;
}

async function deliver(to: string, subject: string, html: string, dryNote: string): Promise<void> {
  const r = resendClient();
  if (!r) {
    // Dry mode: surface the action link so the full flow is testable without outbound mail.
    const link = html.match(/href="([^"]+)"/)?.[1];
    console.log(`[email:dry] ${dryNote} → to=${to} link=${link ?? "(n/a)"}`);
    return;
  }
  try {
    const { error } = await r.emails.send({ from: FROM, to, subject, html, replyTo: SUPPORT_EMAIL });
    if (error) console.error("[email] Resend rejected message:", error);
  } catch (e) {
    console.error("[email] send failed:", e);
  }
}

export async function sendVerificationEmail(to: string, name: string, token: string): Promise<void> {
  const first = name.trim().split(" ")[0] || "there";
  await deliver(
    to,
    "Verify your email — DeeYoung Pro",
    shell(
      `Welcome aboard, ${first}.`,
      "Confirm this address to activate your 14-day free trial of the full terminal — real-time analytics, multi-factor signals, and SENTINEL. No card required, one account per person.",
      "Verify my email & start my trial",
      verificationLink(token),
    ),
    "verification",
  );
}

export async function sendPasswordResetEmail(to: string, name: string, token: string): Promise<void> {
  const first = name.trim().split(" ")[0] || "there";
  await deliver(
    to,
    "Reset your password — DeeYoung Pro",
    shell(
      `Password reset, ${first}.`,
      "We received a request to reset the password on your account. This link works once and expires soon — set a new password to regain terminal access.",
      "Choose a new password",
      passwordResetLink(token),
    ),
    "password-reset",
  );
}
