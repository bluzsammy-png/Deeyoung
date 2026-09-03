# DEPLOY — DeeYoung Pro to GitHub → Supabase → Railway

Launch path: **push to GitHub → create Postgres in Supabase → deploy app on Railway.**
Payments (Paystack) are intentionally deferred; the billing module is stubbed and ready.

---

## 0. Prerequisites

- GitHub account with 2FA enabled
- Railway account (railway.app) — log in with GitHub
- Supabase project (already created: `qmummmtraypryueyicza`, eu-west-1)
- ⚠️ If the Supabase DB password was ever pasted into a chat/ticket, rotate it now:
  Supabase Dashboard → Settings → Database → **Reset database password**.

---

## 1. Push to GitHub

```bash
# from the project root
git init
git add .
git commit -m "DeeYoung Pro — auth, trials, anti-abuse, admin, billing stub"

git remote add origin https://github.com/bluzsammy-png/DeeYoung.git
git branch -M main
git push -u origin main
```

If the push asks for credentials: GitHub no longer accepts account passwords.
Use **Settings → Developer settings → Personal access tokens → Fine-grained token**
with `Contents: Read & Write` on the DeeYoung repo, and paste the token as the password.
(Or install the `gh` CLI and run `gh auth login`.)

`.env`, `db/` (SQLite), and `.next/` are already gitignored — secrets never leave your machine.

---

## 2. Supabase (production database)

1. Dashboard → **Project Settings → Database**.
2. Copy the **Session pooler** connection string (port 5432, host like
   `aws-1-eu-west-1.pooler.supabase.com`). This is IPv4-friendly → works from Railway.
3. **URL-encode special characters** in the password (`@` → `%40`, `&` → `%26`, `$` → `%24`),
   then append `?sslmode=require`.
4. In Supabase SQL Editor, enable row-level safety on any table the `anon` key can touch
   (the app talks to Postgres only from the server, but defense in depth is free).

### Postgres — already wired

The repo ships **`prisma/schema.postgres.prisma`** (production schema) alongside the
sandbox SQLite one. Nothing to hand-edit:

- Railway builds & starts against the Postgres schema automatically (`railway.json`).
- The app picks the correct Prisma dialect from the `DATABASE_URL` at runtime.

To apply the schema manually from your machine (optional — Railway also does it on boot):

```bash
DATABASE_URL="<your encoded pooler URL>" bun run db:push:pg
```

Enable row-level security (defense in depth — the `anon` key exists even if the app
never uses it). In Supabase SQL Editor:

```sql
do $$ declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security;', t.tablename);
  end loop;
end $$;
```

(No policies = `anon` can read nothing. The app connects as the table owner, which
bypasses RLS — exactly what we want.)

---

## 3. Railway (app hosting)

1. railway.app → **New Project → Deploy from GitHub repo → DeeYoung**.
2. Add a **Variable** for everything in `.env.example` (see table below).
3. Railway auto-detects the repo and uses **`railway.json`**: the build generates the
   Prisma client for Postgres, and boot applies the schema before serving traffic.
4. **Networking → Generate Domain** → this is your live URL.
5. First deploy checklist:
   - `GET /api/health` returns JSON (market data DEGRADED without a news key is normal)
   - Register your admin account — its email must be in `ADMIN_EMAILS`
   - Visit `/?terminal=1` → you should land in the terminal

### Environment variables (Railway → Variables)

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | ✅ | Encoded Supabase pooler URL + `?sslmode=require` |
| `BETTER_AUTH_SECRET` | ✅ | `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | ✅ | `https://<your-railway-domain>` (or custom domain) |
| `APP_SECRET` | ✅ | Separate salt for IP hashing |
| `ADMIN_EMAILS` | ✅ | Comma-separated admin emails |
| `AGENTMAIL_API_KEY` | launch | Outbound mail (verification + password reset) via agentmail.to. Get a key at agentmail.to → API Keys. Until set, auth links print to the server console (dry mode) |
| `AGENTMAIL_INBOX` | optional | Sending inbox, e.g. `deeyoungsltd@agentmail.to`. Defaults to your org's first inbox |
| `RESEND_API_KEY` | launch | When set, **email verification becomes required** + reset mails work. Get a free key at resend.com |
| `EMAIL_FROM` | launch | `"DeeYoung <no-reply@yourdomain.com>"` after verifying your domain in Resend |
| `NEXT_PUBLIC_POSTHOG_KEY` | recommended | PostHog project key |
| `NEXT_PUBLIC_POSTHOG_HOST` | optional | `https://eu.i.posthog.com` or `us…` |
| `TURNSTILE_SECRET_KEY` | launch | Free bot protection — get keys at dash.cloudflare.com |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | launch | Pairs with the secret |
| `NEXT_PUBLIC_APP_URL` | optional | Canonical URL for metadata |
| `TRUSTED_ORIGINS` | recommended | Comma-separated extra origins allowed to POST auth requests (preview proxies, custom domains). Wildcards OK: `https://*.example.com` |
| `METAAPI_TOKEN` | optional | Enables live MT4/MT5 account verification via MetaApi.cloud (§10). Without it links save encrypted + queue as `PENDING_BRIDGE` |

> Changing `NEXT_PUBLIC_*` variables requires a redeploy (they are baked into the client bundle).

---

## 4. Anti-abuse stack — what is already enforced

| Layer | Where | Behavior |
|---|---|---|
| Temp-mail blocklist | signup hook | Disposable/relay domains rejected (extend weekly from `disposable-email-domains` on GitHub) |
| MX deliverability | signup hook | Domains that can't receive mail are rejected (typo/lookalike protection); transient DNS failures fail open |
| Signup velocity | signup hook | >3 accounts per HMAC-hashed IP / 24 h → 429. Raw IPs are never stored |
| Turnstile | signup (env-gated) | Invisible captcha once keys are set |
| Email verification | production-strict | Required automatically the moment `RESEND_API_KEY` is set; unverified accounts cannot sign in |
| No-card 14-day trial | user create | `plan=TRIAL`, `trialEndsAt=+14d`; expired trials drop to FREE automatically |
| Server-side entitlements | API guard | Pro APIs (SENTINEL, Backtest, AI Briefing) return `402 PREMIUM_REQUIRED` for FREE; free APIs stay open |
| Moderation ladder | Admin & Trust panel | Warn → Suspend (sessions revoked) → Ban (sessions revoked, blocked at session layer); every action audited |
| Audit trail | `AuditEvent` | Admin actions, billing waitlist, moderation decisions |

Admin access: any email in `ADMIN_EMAILS` gets `role=ADMIN` at signup →
**Admin & Trust** appears in the terminal sidebar.

---

## 5. PostHog (analytics)

1. Create a project at posthog.com (EU or US cloud — free tier is generous).
2. Copy the project API key into `NEXT_PUBLIC_POSTHOG_KEY` on Railway and redeploy.
3. Session replay + funnels can be enabled later from the PostHog dashboard.

---

## 6. Custom domain

- Railway → Settings → Networking → **Custom Domain** → point your `CNAME` at it.
- Update `BETTER_AUTH_URL` to the new domain and redeploy.
- In Supabase → Auth → URL Configuration, add the domain if you ever enable email verification links.

---

## 7. When Paystack verification clears (payments)

Everything already has a home:

1. Set `PAYSTACK_SECRET_KEY` / `PAYSTACK_PUBLIC_KEY` on Railway.
2. Implement `POST /api/billing/paystack/webhook` — verify `x-paystack-signature`
   (HMAC-SHA512 over the **raw** body: use `await req.text()` in Next.js), then handle
   `charge.success`, `subscription.create`, `subscription.not_renew`, `subscription.disable`
   by updating `user.plan` / a `subscriptions` table.
3. Replace the waitlist CTA in `src/components/quantedge/billing-modal.tsx` with
   Paystack popup checkout (Plan code = ₦15,000/mo Pro).
4. Add a 3-day grace dunning email before locking a lapsed subscription.

## 8. Email (Resend / AgentMail) — recommended before launch

Outbound mail uses a transport chain — the first configured option wins:

1. **Resend** (`RESEND_API_KEY`) — preferred in production; branded mail from your
   verified domain (SPF/DKIM).
2. **AgentMail** (`AGENTMAIL_API_KEY`) — agentmail.to org inbox, e.g.
   `deeyoungsltd@agentmail.to`. Set the key at agentmail.to → API Keys; optionally
   pin the sender with `AGENTMAIL_INBOX`. Free tier adds a "Sent via AgentMail"
   footer; upgrade removes it.
3. **Dry mode** (neither set) — verification is skipped and action links print to
   the server console, so the whole auth flow stays testable without outbound mail.

Whichever real transport is configured, **email verification becomes required**
automatically — accounts can't sign in until they confirm their address.

AgentMail setup:
1. agentmail.to → API Keys → copy a key into `AGENTMAIL_API_KEY` on Railway.
2. (Optional) `AGENTMAIL_INBOX="deeyoungsltd@agentmail.to"` to pin the sender.
3. Redeploy. `/api/health` will show `MAIL: HEALTHY (agentmail)`.

Resend setup (when you want your own domain instead):
1. Create a free account at resend.com → **API Keys** → copy into `RESEND_API_KEY`.
2. **Domains → Add domain** → add the SPF/DKIM DNS records Resend shows you, then set
   `EMAIL_FROM="DeeYoung <no-reply@yourdomain.com>"`.
3. Done — verification + reset mails use the branded dark template in `src/lib/email.ts`.

## 8.1 Troubleshooting — Railway 502 Bad Gateway

The boot sequence is **resilient by design** (`deploy/start.sh`): even if the
database is unreachable or `DATABASE_URL` is missing, the server still boots and
`GET /api/health` reports exactly what's wrong — check the `env` block (presence
booleans, never values) and the per-source `sources` states.

- **502 with no server logs** → the deploy predates `deploy/start.sh`; hit Redeploy.
- **`overall: DOWN` + `DATABASE: DOWN`** → `DATABASE_URL` missing/unreachable. Fix the
  Supabase pooler URL (Section 2) — host must be `*.pooler.supabase.com` (IPv4), not
  the direct `db.<ref>.supabase.co` host (IPv6-only on Railway).
- **`env.BETTER_AUTH_SECRET: false`** → generate one: `openssl rand -base64 32`.
- **Signup returns 500** → check Deploy Logs for `[email]` lines: with dry mode the
  verification link is printed to the console instead of emailed.

## 9. Optional next steps

- Error tracking: add Sentry (`bun add @sentry/nextjs`).
- Extend the disposable-domain list weekly (see `src/lib/disposable-domains.ts`).


## §10 — MT4 / MT5 connectivity (MetaApi bridge)

Users can link MetaTrader accounts from **Settings → MetaTrader**. Credentials are
AES-256-GCM encrypted with `APP_SECRET` before storage; the plaintext password never
touches the database or logs. **Investor (read-only) passwords are the recommended
mode** — DeeYoung can watch the account, never trade it.

1. Create an account at app.metaapi.cloud (free tier available) → copy the token.
2. Set `METAAPI_TOKEN` in Railway env vars and redeploy.
3. Existing links move from `PENDING_BRIDGE` to verified on the next save/test;
   users can re-save to trigger verification immediately.

Honest-state guarantees:
- Without `METAAPI_TOKEN` links save and queue — the UI says "Bridge pending", never "Connected".
- `FULL` (trade-capable) mode exists in the schema but order routing is not built;
  execution stays paper-only per the product's disclosures.
