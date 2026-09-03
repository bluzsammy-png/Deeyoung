// DEEYOUNG PRO — Better Auth (better-auth.com) server config.
// Email/password auth + subscription state + anti-abuse layers:
//   1. disposable/temp email domain blocklist
//   1.5 MX deliverability check (rejects typo'd / dead domains, fails open on DNS hiccups)
//   2. Cloudflare Turnstile (env-gated)
//   3. signup velocity per HMAC-hashed IP (no raw IPs stored, GDPR-safe)
//   4. 2-day analytics trial, no card (Pro systems lock until they subscribe)
//   5. email verification REQUIRED in production (Resend/AgentMail configured); auto-verified locally

import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { db } from "@/lib/db";
import { clientIpFromHeaders, hashIp, isPrivateNetworkIp, verifyTurnstile } from "@/lib/trust";
import { isDisposableEmail } from "@/lib/disposable-domains";
import { assertEmailDomainDeliverable } from "@/lib/mx";
import { emailConfigured, sendVerificationEmail, sendPasswordResetEmail } from "@/lib/email";
import { TRIAL_DAYS } from "@/lib/entitlements";

// CGNAT reality: one MTN/Airtel tower can put hundreds of legitimate users behind a
// single public IP, so the ceiling stays generous. The real abuse gate is the forced
// email verification in production (each extra account costs the attacker a real inbox).
const MAX_SIGNUPS_PER_IP_PER_DAY = 10;

// Follow the DATABASE_URL dialect automatically — sandbox runs SQLite, Railway runs Postgres.
const dbProvider = process.env.DATABASE_URL?.startsWith("postgres") ? "postgresql" : "sqlite";

export const auth = betterAuth({
  database: prismaAdapter(db, { provider: dbProvider }),
  secret: process.env.BETTER_AUTH_SECRET || "dev-only-secret-change-me-0123456789abcdef",
  // CSRF: auth POSTs from the chat/preview gateway arrive with a foreign Origin header
  // (the browser page is served from *.space-z.ai while the server listens locally).
  // Trust that infra by wildcard, plus any ops-configured domains. Production
  // same-origin requests need no entry at all.
  trustedOrigins: [
    "https://*.space-z.ai",
    "http://localhost:*",
    "http://127.0.0.1:*",
    ...(process.env.TRUSTED_ORIGINS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  ],
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    // Strict once Resend is configured (production). Locally the trial starts immediately
    // so the whole product remains testable without outbound mail.
    requireEmailVerification: emailConfigured(),
    sendResetPassword: async ({ user, token }) => {
      await sendPasswordResetEmail(String(user.email).toLowerCase(), user.name ?? "", token);
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, token }) => {
      await sendVerificationEmail(String(user.email).toLowerCase(), user.name ?? "", token);
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24,
  },
  user: {
    additionalFields: {
      role: { type: "string", defaultValue: "USER", input: false },
      status: { type: "string", defaultValue: "ACTIVE", input: false },
      plan: { type: "string", defaultValue: "TRIAL", input: false },
      trialEndsAt: { type: "date", required: false, input: false },
      ipHash: { type: "string", required: false, input: false },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-up/email") return;

      const email = String(ctx.body?.email ?? "").trim().toLowerCase();
      const name = String(ctx.body?.name ?? "").trim();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new APIError("BAD_REQUEST", { message: "A valid email address is required." });
      }
      if (name.length < 2) {
        throw new APIError("BAD_REQUEST", { message: "Please enter your name." });
      }
      // Layer 1 — temp mail blocklist
      if (isDisposableEmail(email)) {
        throw new APIError("BAD_REQUEST", {
          message: "Temporary or disposable email domains are not allowed. Please use a permanent email address.",
        });
      }
      // Layer 1.5 — MX deliverability (rejects typo'd / dead domains; fails open on DNS hiccups)
      const mx = await assertEmailDomainDeliverable(email);
      if (!mx.ok) {
        throw new APIError("BAD_REQUEST", { message: mx.reason ?? "That email domain can't receive mail." });
      }
      // Layer 2 — Turnstile (only when configured)
      const ip = clientIpFromHeaders(ctx.headers);
      if (process.env.TURNSTILE_SECRET_KEY) {
        const ok = await verifyTurnstile(String(ctx.body?.turnstileToken ?? ""), ip);
        if (!ok) {
          throw new APIError("BAD_REQUEST", { message: "Captcha verification failed — please try again." });
        }
      }
      // Layer 3 — signup velocity per hashed IP (24h window). Flags farms, not NAT
      // households. Private/loopback IPs are exempt: dev, previews and internal
      // proxies all share them, and a shared bucket there locks out everyone.
      if (ip && !isPrivateNetworkIp(ip)) {
        const ipHash = hashIp(ip);
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const recent = await db.signupAttempt.count({ where: { ipHash, createdAt: { gte: since } } });
        if (recent >= MAX_SIGNUPS_PER_IP_PER_DAY) {
          throw new APIError("TOO_MANY_REQUESTS", {
            message: "Too many accounts were created from your network in the last 24 hours. Please try again later.",
          });
        }
      }
    }),
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user, ctx) => {
          const ip = clientIpFromHeaders(ctx?.headers);
          const ipHash = ip ? hashIp(ip) : null;
          if (ipHash) {
            await db.signupAttempt
              .create({ data: { ipHash, email: String(user.email).toLowerCase() } })
              .catch(() => undefined); // never block signup on telemetry failure
          }
          const adminEmails = (process.env.ADMIN_EMAILS ?? "")
            .split(",")
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean);
          return {
            data: {
              ...user,
              email: String(user.email).toLowerCase(),
              role: adminEmails.includes(String(user.email).toLowerCase()) ? "ADMIN" : "USER",
              status: "ACTIVE",
              plan: "TRIAL",
              trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000),
              ipHash,
            },
          };
        },
      },
    },
  },
});
