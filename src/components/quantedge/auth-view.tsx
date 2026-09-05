"use client";

// DEEYOUNG PRO — Auth gate: sign in / create account, shown before the terminal opens.
// Carries the anti-abuse messaging: temp-mail rejection, one-per-person policy.

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, KeyRound, Loader2, LockKeyhole, MailCheck, MailWarning, ShieldCheck } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { track } from "@/lib/analytics";
import { EdgeMark } from "@/components/quantedge/landing";

type Mode = "signin" | "signup" | "forgot" | "reset";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      remove: (id: string) => void;
    };
    __onTurnstileLoad?: () => void;
  }
}

/** Env-gated Cloudflare Turnstile widget. Renders nothing when no site key is configured. */
function Turnstile({ onToken }: { onToken: (t: string) => void }) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(
    () => !!siteKey && typeof window !== "undefined" && !!window.turnstile,
  );

  useEffect(() => {
    if (!siteKey || ready) return;
    window.__onTurnstileLoad = () => setReady(true);
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=__onTurnstileLoad&render=explicit";
    s.async = true;
    document.head.appendChild(s);
  }, [siteKey, ready]);

  useEffect(() => {
    if (!ready || !siteKey || !ref.current || !window.turnstile) return;
    const id = window.turnstile.render(ref.current, {
      sitekey: siteKey,
      theme: "dark",
      callback: (token: string) => onToken(token),
    });
    return () => window.turnstile?.remove(id);
  }, [ready, siteKey, onToken]);

  if (!siteKey) return null;
  return <div ref={ref} className="mt-1 flex justify-center" />;
}

export function AuthView({ onBack }: { onBack: () => void }) {
  const [mode, setMode] = useState<Mode>("signup");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [needVerify, setNeedVerify] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  // When an error has an obvious next step, offer it directly (no dead ends).
  const [errorAction, setErrorAction] = useState<"signin" | "signup" | "forgot" | null>(null);
  const [busy, setBusy] = useState(false);
  // Google sign-in availability — probed at runtime from /api/auth-methods (env-gated provider).
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  // Password-reset deep link: the reset email lands on /?reset=<token>.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("reset");
    if (t) {
      setMode("reset");
      setResetToken(t);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  // "Continue with Google" renders only when the provider is configured server-side.
  useEffect(() => {
    fetch("/api/auth-methods")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setGoogleEnabled(!!d?.google))
      .catch(() => setGoogleEnabled(false));
  }, []);

  const google = async () => {
    setGoogleBusy(true);
    setError(null);
    setErrorAction(null);
    setNotice(null);
    try {
      const r = await fetch("/api/auth/sign-in/social", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "google", callbackURL: "/?terminal=1" }),
      });
      const d = await r.json();
      if (d?.url) {
        window.location.href = d.url;
        return;
      }
      fail("Google sign-in isn't available right now. Use email and password.");
    } catch {
      fail("Google sign-in failed. Use email and password.");
    }
    setGoogleBusy(false);
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setError(null);
    setErrorAction(null);
    setNotice(null);
    setNeedVerify(false);
  };

  const fail = (message: string, action: "signin" | "signup" | "forgot" | null = null) => {
    setError(message);
    setErrorAction(action);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setErrorAction(null);
    setNotice(null);
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error: err } = await authClient.signUp.email({
          email: email.trim(),
          password,
          name: name.trim(),
          // @ts-expect-error — turnstileToken only exists when Turnstile is configured server-side
          turnstileToken,
        });
        if (err) {
          const dup = err.status === 422 || (err.code ?? "").includes("USER_ALREADY_EXISTS");
          if (dup) {
            fail("That email already has an account. Sign in instead, or reset your password if you've forgotten it.", "signin");
          } else {
            fail(err.message || "Couldn't create your account. Check your details and retry.");
          }
        } else {
          track("signup_completed", { method: "email" });
        }
      } else if (mode === "signin") {
        const { error: err } = await authClient.signIn.email({ email: email.trim(), password });
        if (err) {
          if (err.status === 403 || err.code === "EMAIL_NOT_VERIFIED") {
            setNeedVerify(true);
            fail("Please verify your email before signing in. Check your inbox.");
          } else {
            fail("No account matches that email and password. Double-check both, or create an account in 20 seconds.", "signup");
          }
        } else {
          track("login_completed", { method: "email" });
        }
      } else if (mode === "forgot") {
        // Always returns success (no account enumeration).
        await authClient.requestPasswordReset({ email: email.trim(), redirectTo: window.location.origin });
        setNotice("If an account exists for that address, a reset link is on its way. Check your inbox (and spam).");
      } else if (mode === "reset") {
        if (newPassword !== confirmPassword) throw new Error("The two passwords don't match.");
        const { error: err } = await authClient.resetPassword({ newPassword, token: resetToken });
        if (err) fail("That reset link is invalid or has expired. Request a fresh one below.", "forgot");
        else {
          setNotice("Password updated. Sign in with your new password.");
          setPassword("");
          switchMode("signin");
        }
      }
      // session hook in the app shell flips the gate automatically
    } catch (err) {
      fail(err instanceof Error ? err.message : "Something went wrong. Please retry.");
    } finally {
      setBusy(false);
    }
  };

  const resendVerification = async () => {
    setError(null);
    setBusy(true);
    try {
      await authClient.sendVerificationEmail({ email: email.trim() });
      setNotice("Verification email sent. Check your inbox (and spam), then click the link to activate your account.");
    } catch {
      setError("Couldn't send the verification email. Double-check the address and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-[420px]"
      >
        <button
          onClick={onBack}
          className="mb-5 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to home
        </button>

        <div className="qe-panel p-6">
          <div className="flex items-center gap-3">
            <EdgeMark size={34} />
            <div>
              <p className="text-sm font-bold tracking-tight">DeeYoung<span className="text-brand"> Pro</span></p>
              <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">Read the market. Move first.</p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-1 rounded-xl bg-panel-2 p-1">
            {(["signup", "signin"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => switchMode(m)}
                className={`relative rounded-lg py-2 text-xs font-semibold transition-colors ${
                  mode === m ? "bg-brand/15 text-brand" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {m === "signup" ? "Create account" : "Sign in"}
              </button>
            ))}
          </div>

          {googleEnabled && (mode === "signin" || mode === "signup") && (
            <>
              <button
                type="button"
                onClick={google}
                disabled={googleBusy}
                className="mt-5 flex w-full items-center justify-center gap-2.5 rounded-xl border border-hairline bg-panel-2 py-2.5 text-sm font-semibold text-foreground transition-colors hover:border-brand/40 disabled:opacity-60"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true"><path fill="#EA4335" d="M12 5.04c1.7 0 3.22.59 4.42 1.74l3.29-3.29C17.73 1.63 15.09.5 12 .5 7.42.5 3.44 3.13 1.5 6.93l3.85 2.99C6.27 7.05 8.9 5.04 12 5.04z"/><path fill="#4285F4" d="M23.5 12.27c0-.79-.07-1.55-.2-2.27H12v4.51h6.44c-.29 1.48-1.14 2.73-2.41 3.57l3.72 2.89c2.17-2 3.75-4.96 3.75-8.7z"/><path fill="#FBBC05" d="M5.35 14.08a7.06 7.06 0 0 1 0-4.16L1.5 6.93a11.51 11.51 0 0 0 0 10.14l3.85-2.99z"/><path fill="#34A853" d="M12 23.5c3.09 0 5.68-1.02 7.58-2.76l-3.72-2.89c-1.03.7-2.36 1.11-3.86 1.11-3.1 0-5.73-2.01-6.65-4.88l-3.85 2.99C3.44 20.87 7.42 23.5 12 23.5z"/></svg>
                {googleBusy ? "Redirecting to Google…" : "Continue with Google"}
              </button>
              <div className="mt-4 flex items-center gap-3 text-[10px] uppercase tracking-widest text-muted-foreground/60">
                <span className="h-px flex-1 bg-hairline" /> or with email <span className="h-px flex-1 bg-hairline" />
              </div>
            </>
          )}

          {mode === "reset" && (
            <p className="mt-4 flex items-center gap-2 rounded-xl border border-warn/30 bg-warn/10 px-3.5 py-2.5 text-xs leading-snug text-warn">
              <KeyRound className="h-3.5 w-3.5 shrink-0" />
              Choose a new password for your account.
            </p>
          )}

          <form onSubmit={submit} className="mt-5 space-y-3.5">
            {mode === "signup" && (
              <div>
                <label htmlFor="qe-name" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Full name</label>
                <input
                  id="qe-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ada Obi"
                  autoComplete="name"
                  required
                  minLength={2}
                  className="w-full rounded-xl border border-hairline bg-panel-2 px-3.5 py-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-brand/50"
                />
              </div>
            )}
            <div className={mode === "reset" ? "hidden" : "block"}>
              <label htmlFor="qe-email" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Email</label>
              <input
                id="qe-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required={mode !== "reset"}
                className="w-full rounded-xl border border-hairline bg-panel-2 px-3.5 py-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-brand/50"
              />
            </div>
            <div className={mode === "forgot" || mode === "reset" ? "hidden" : "block"}>
              <label htmlFor="qe-password" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Password</label>
              <input
                id="qe-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === "signup" ? "At least 8 characters" : "••••••••"}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                required={mode === "signin" || mode === "signup"}
                minLength={mode === "signup" ? 8 : undefined}
                className="w-full rounded-xl border border-hairline bg-panel-2 px-3.5 py-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-brand/50"
              />
            </div>
            {mode === "reset" && (
              <>
                <div>
                  <label htmlFor="qe-new-password" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">New password</label>
                  <input
                    id="qe-new-password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    className="w-full rounded-xl border border-hairline bg-panel-2 px-3.5 py-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-brand/50"
                  />
                </div>
                <div>
                  <label htmlFor="qe-confirm-password" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Confirm new password</label>
                  <input
                    id="qe-confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat it"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    className="w-full rounded-xl border border-hairline bg-panel-2 px-3.5 py-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-brand/50"
                  />
                </div>
              </>
            )}

            {mode !== "forgot" && mode !== "reset" && <Turnstile onToken={setTurnstileToken} />}

            {error && (
              <div className="space-y-2" role="alert">
                <p className="flex items-start gap-2 rounded-xl border border-neg/30 bg-neg/10 px-3.5 py-2.5 text-xs leading-snug text-neg">
                  <MailWarning className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {error}
                </p>
                {errorAction && (
                  <button
                    type="button"
                    onClick={() => switchMode(errorAction as Mode)}
                    className="w-full rounded-xl border border-brand/35 bg-brand/10 py-2.5 text-xs font-bold text-brand-hi transition-colors hover:bg-brand/20"
                  >
                    {errorAction === "signup" && "Create an account with this email →"}
                    {errorAction === "signin" && "Sign in instead →"}
                    {errorAction === "forgot" && "Send a new reset link →"}
                  </button>
                )}
              </div>
            )}

            {notice && (
              <p className="flex items-start gap-2 rounded-xl border border-brand/30 bg-brand/10 px-3.5 py-2.5 text-xs leading-snug text-brand-hi" role="status">
                <MailCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {notice}
              </p>
            )}

            {needVerify && (
              <button
                type="button"
                onClick={resendVerification}
                disabled={busy}
                className="w-full rounded-xl border border-hairline bg-panel-2 py-2.5 text-xs font-semibold text-foreground transition-colors hover:bg-panel disabled:opacity-60"
              >
                Resend verification email
              </button>
            )}

            <button
              type="submit"
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-3 text-sm font-bold text-white transition-all hover:brightness-110 disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />}
              {mode === "signup"
                ? "Create my account"
                : mode === "forgot"
                  ? "Send reset link"
                  : mode === "reset"
                    ? "Set new password"
                    : "Sign in to the terminal"}
            </button>
          </form>

          {mode === "signin" && (
            <button
              onClick={() => switchMode("forgot")}
              className="mt-3 w-full text-center text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Forgot your password?
            </button>
          )}
          {mode === "forgot" && (
            <button
              onClick={() => switchMode("signin")}
              className="mt-3 w-full text-center text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Back to sign in
            </button>
          )}

          <div className="mt-5 space-y-2 border-t border-hairline pt-4">
            <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-brand" />
              Full analytics from day one · plans from ₦15,000/mo or your currency
            </p>
            <p className="text-[11px] leading-relaxed text-muted-foreground/70">
              One account per person. Disposable or temporary email domains are rejected automatically,
              and accounts that violate the Terms of Service are terminated without refund.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

/** Full-screen block for SUSPENDED / BANNED accounts (session is already dead server-side). */
export function BlockedView({ status }: { status: string }) {
  const banned = status === "BANNED";
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="qe-panel w-full max-w-[460px] p-7 text-center"
      >
        <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-2xl ${banned ? "bg-neg/15" : "bg-warn/15"}`}>
          <LockKeyhole className={`h-7 w-7 ${banned ? "text-neg" : "text-warn"}`} />
        </div>
        <h1 className="mt-4 text-lg font-bold tracking-tight">
          {banned ? "Account banned" : "Account suspended"}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {banned
            ? "This account has been permanently banned for violating the Terms of Service. If you believe this is a mistake, you may appeal by contacting support."
            : "Your account has been temporarily suspended. Contact support to resolve the outstanding issue and restore access."}
        </p>
        <button
          onClick={async () => { await authClient.signOut(); window.location.href = "/"; }}
          className="mt-6 w-full rounded-xl border border-hairline bg-panel-2 py-2.5 text-sm font-semibold transition-colors hover:bg-panel"
        >
          Sign out
        </button>
      </motion.div>
    </div>
  );
}
