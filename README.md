# Deeyoung · QuantEdge Pro

AI market intelligence & trading terminal — multi-factor signals, portfolio risk,
and **SENTINEL**, a supervised automation layer, on a paper broker.
Built with Next.js 16 (App Router), TypeScript, Tailwind 4, shadcn/ui, Prisma,
**Better Auth** and PostHog.

> Deploy runbook: see **[DEPLOY.md](./DEPLOY.md)** (GitHub → Supabase → Railway).

## Feature map

| Area | What it does |
|---|---|
| Landing + Terminal | Single-page product: public landing, session-gated terminal |
| Accounts | Better Auth email/password, 30-day sessions, admin role via `ADMIN_EMAILS` |
| Free trial | 14 days full access, no card; drops to FREE automatically |
| Anti-abuse | Disposable-email blocklist, per-IP signup velocity (HMAC-hashed IPs), optional Cloudflare Turnstile |
| Entitlements | Server-side enforcement — Pro APIs return `402` for FREE plans; FREE keeps dashboard/markets/signals/portfolio |
| SENTINEL | Observe / Approve / Delegate modes with deterministic risk engine, kill switch, audit trail |
| Backtest Lab | Bias-guarded backtests over real candles (honesty gate on simulated data) |
| Admin & Trust | Warn → Suspend → Ban ladder, session revocation, signup-velocity flags, full audit |
| Billing | Pro plan UI + waitlist — Paystack-ready (see DEPLOY.md §7) |

## Local development

```bash
cp .env.example .env      # then edit values
bun install
bun run db:push           # create/update the SQLite dev database
bun run dev               # http://localhost:3000
```

Sign up with an email listed in `ADMIN_EMAILS` to get the Admin & Trust panel.

## Project layout

```
prisma/schema.prisma        # data model (auth, trading, moderation, audit)
src/lib/auth.ts             # Better Auth config + anti-abuse hooks
src/lib/guard.ts            # API route guard (auth → account state → entitlements)
src/lib/entitlements.ts     # plan/trial logic (shared client/server)
src/app/api/*               # guarded route handlers
src/components/quantedge/*  # landing, terminal views, admin, auth, billing
```
