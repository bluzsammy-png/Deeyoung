// DEEYOUNG PRO — shared server renderer for the public legal pages.
// Same content module as the in-app modal (src/lib/legal-content.ts).

import Link from "next/link";
import { EdgeMark } from "@/components/quantedge/edge-mark";
import { LEGAL_CONTENT, type LegalDoc } from "@/lib/legal-content";

export function LegalPage({ doc }: { doc: LegalDoc }) {
  const c = LEGAL_CONTENT[doc];
  return (
    <div className="relative min-h-screen overflow-x-clip">
      <div className="qe-grid-bg pointer-events-none absolute inset-0 opacity-60" />
      <header className="relative z-10 border-b border-hairline">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
          <Link href="/" className="flex items-center gap-2.5">
            <EdgeMark />
            <span className="qe-display text-[15px] font-bold tracking-tight">
              DeeYoung<span className="text-brand"> Pro</span>
            </span>
          </Link>
          <Link href="/" className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
            Back to home
          </Link>
        </div>
      </header>
      <main className="relative z-10 mx-auto max-w-3xl px-5 py-12">
        <h1 className="qe-display text-3xl font-bold tracking-tight">{c.title}</h1>
        <div className="mt-8 space-y-6">
          {c.sections.map((sec, i) => (
            <section key={i} className="space-y-2.5">
              {sec.h && <h2 className="qe-display text-base font-bold tracking-tight">{sec.h}</h2>}
              {sec.ps.map((p, j) => (
                <p key={j} className="text-sm leading-relaxed text-foreground/85">{p}</p>
              ))}
            </section>
          ))}
        </div>
        <p className="mt-10 border-t border-hairline pt-5 text-[11px] text-muted-foreground">
          © {new Date().getFullYear()} DeeYoungs Ltd · Last updated: September 2026 · Questions: deyongsltd@gmail.com
        </p>
      </main>
      <footer className="relative z-10 border-t border-hairline">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-[11px] text-muted-foreground">
          <span>© {new Date().getFullYear()} DeeYoungs Ltd. All rights reserved.</span>
          <span className="flex items-center gap-4">
            <Link href="/terms" className="transition-colors hover:text-foreground">Terms</Link>
            <Link href="/privacy" className="transition-colors hover:text-foreground">Privacy</Link>
            <a href="mailto:deyongsltd@gmail.com" className="transition-colors hover:text-foreground">Support</a>
          </span>
        </div>
      </footer>
    </div>
  );
}
