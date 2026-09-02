// QUANTEDGE PRO — Better Auth (better-auth.com) server config.
// Email/password auth + subscription state + anti-abuse layers:
//   1. disposable/temp email domain blocklist
//   2. Cloudflare Turnstile (env-gated)
//   3. signup velocity per HMAC-hashed IP (no raw IPs stored, GDPR-safe)
//   4. 14-day full-access trial, no card required (abuse cost capped by usage limits)

import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { db } from "@/lib/db";
import { clientIpFromHeaders, hashIp, verifyTurnstile } from "@/lib/trust";
import { isDisposableEmail } from "@/lib/disposable-domains";
import { TRIAL_DAYS } from "@/lib/entitlements";

const MAX_SIGNUPS_PER_IP_PER_DAY = 3;

export const auth = betterAuth({
  database: prismaAdapter(db, { provider: "sqlite" }), // production: "postgresql" (see DEPLOY.md)
  secret: process.env.BETTER_AUTH_SECRET || "dev-only-secret-change-me-0123456789abcdef",
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    // flip to true once Resend domain verification is live (DEPLOY.md §email)
    requireEmailVerification: false,
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
      // Layer 2 — Turnstile (only when configured)
      const ip = clientIpFromHeaders(ctx.headers);
      if (process.env.TURNSTILE_SECRET_KEY) {
        const ok = await verifyTurnstile(String(ctx.body?.turnstileToken ?? ""), ip);
        if (!ok) {
          throw new APIError("BAD_REQUEST", { message: "Captcha verification failed — please try again." });
        }
      }
      // Layer 3 — signup velocity per hashed IP (24h window). Flags farms, not NAT households.
      if (ip) {
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
