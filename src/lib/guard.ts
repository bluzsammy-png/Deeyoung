// DEEYOUNG PRO — API route guard: session → account state → entitlements.
// Every route handler is wrapped by withGuard(); gated routes pass { minPlan: "..." }.

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { PLAN_RANK, planRank, type Plan } from "@/lib/entitlements";
import { ensureUserProvisioned } from "@/lib/sentinel";
import type { PaperAccount, SentinelConfig, User } from "@prisma/client";

export class GuardError extends Error {
  constructor(
    readonly status: number,
    readonly code: "AUTH_REQUIRED" | "ACCOUNT_BANNED" | "ACCOUNT_SUSPENDED" | "PREMIUM_REQUIRED" | "INTERNAL",
    message: string,
  ) {
    super(message);
  }
  toResponse() {
    return NextResponse.json({ error: this.code, message: this.message }, { status: this.status });
  }
}

export interface GuardedContext {
  user: User;
  config: SentinelConfig;
  account: PaperAccount;
}

type RouteHandler<C> = (req: Request, ctx: C, routeCtx: unknown) => Response | Promise<Response>;

/**
 * Wrap a route handler with auth + trust enforcement:
 *  401 AUTH_REQUIRED       — no valid session
 *  403 ACCOUNT_SUSPENDED / ACCOUNT_BANNED — moderation ladder
 *  402 PREMIUM_REQUIRED    — the user's plan doesn't include this feature
 *                            (pass opts.minPlan, e.g. "TRIAL" for analytics,
 *                            "PRO" for SENTINEL/Backtest/Briefing)
 * Handlers receive { user, config, account } — the same shape bootstrapUser used to return.
 */
export function withGuard<C = GuardedContext>(
  handler: RouteHandler<C>,
  opts?: { minPlan?: Plan },
): (req: Request, routeCtx: unknown) => Promise<Response> {
  return async (req: Request = new Request("http://local/"), routeCtx?: unknown) => {
    try {
      const h = await headers();
      const session = await auth.api.getSession({ headers: h });
      if (!session?.user) throw new GuardError(401, "AUTH_REQUIRED", "Sign in to access the terminal.");
      const user = await db.user.findUnique({ where: { id: session.user.id } });
      if (!user) throw new GuardError(401, "AUTH_REQUIRED", "Sign in to access the terminal.");
      if (user.status === "BANNED") {
        throw new GuardError(403, "ACCOUNT_BANNED", "This account has been banned. Contact support to appeal.");
      }
      if (user.status === "SUSPENDED") {
        throw new GuardError(403, "ACCOUNT_SUSPENDED", "Your account is suspended. Check your email for next steps.");
      }
      const { config, account } = await ensureUserProvisioned(user.id);
      if (opts?.minPlan && planRank(user) < PLAN_RANK[opts.minPlan]) {
        const needed = opts.minPlan === "ELITE" ? "Elite" : opts.minPlan === "PRO" ? "Pro" : "a paid plan";
        throw new GuardError(
          402,
          "PREMIUM_REQUIRED",
          `This feature is part of ${needed}. Subscribe to unlock it. Your plan doesn't include it right now.`,
        );
      }
      return await handler(req, { user, config, account } as C, routeCtx);
    } catch (e) {
      if (e instanceof GuardError) return e.toResponse();
      console.error("[api:guarded]", e);
      return NextResponse.json({ error: "INTERNAL", message: "Something went wrong on our side. Please retry." }, { status: 500 });
    }
  };
}
