import type { Metadata } from "next";
import Link from "next/link";
import { EdgeMark } from "@/components/quantedge/edge-mark";
import { Download, ShieldCheck, Smartphone } from "lucide-react";

export const metadata: Metadata = {
  title: "Get the Android app · DeeYoung Pro",
  description: "Download the official DeeYoung Pro Android app. Same account, same engine, native experience.",
};

const APK_PATH = "/deeyoungpro-1.0.0.apk";

const INSTALL_STEPS: { title: string; body: string }[] = [
  {
    title: "Open this page on your phone",
    body: "Use the Android phone you want the app on, in Chrome. Tap the Download APK button below.",
  },
  {
    title: "Allow the download",
    body: "Chrome may say \"this file may be harmful\". That warning shows for every app installed outside the Play Store. Tap Download anyway.",
  },
  {
    title: "Allow the install",
    body: "When you open the downloaded file, Android asks to allow installs from your browser. Tap Settings, switch on Allow from this source, then go back.",
  },
  {
    title: "Install and open",
    body: "Tap Install, then Open. Your login from the website works in the app too: same account, same plan, same data.",
  },
];

export default function AppDownloadPage() {
  return (
    <div className="relative min-h-screen overflow-x-clip">
      <div className="qe-grid-bg pointer-events-none absolute inset-0 opacity-60" />
      <header className="relative z-10 border-b border-hairline">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
          <Link href="/" className="flex items-center gap-2.5">
            <EdgeMark size={28} />
            <span className="qe-display text-[15px] font-bold tracking-tight">
              DeeYoung<span className="text-brand"> Pro</span>
            </span>
          </Link>
          <Link href="/" className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
            Back to site
          </Link>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-3xl px-5 py-12">
        <p className="qe-label">Official app · Android 8.0+</p>
        <h1 className="qe-display mt-2 text-3xl font-bold tracking-tight">Get the Android app</h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
          The native DeeYoung Pro terminal for your phone: live engine status, signals, paper and live trades,
          approvals, notifications and the kill switch, in one app. Same account as the website, nothing extra to set up.
        </p>

        <div className="mt-8 flex flex-col gap-4 rounded-xl border border-hairline bg-background/60 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-hairline bg-background">
              <Smartphone className="h-5 w-5 text-brand" />
            </div>
            <div>
              <p className="qe-display text-sm font-bold">DeeYoung Pro v1.0.0</p>
              <p className="text-xs text-muted-foreground">APK · 14.8 MB · package com.deeyoungs.pro</p>
            </div>
          </div>
          <a
            href={APK_PATH}
            download
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-hi"
          >
            <Download className="h-4 w-4" /> Download APK
          </a>
        </div>

        <div className="mt-10 space-y-2.5">
          <p className="qe-label">How to install</p>
          <ol className="mt-3 space-y-3">
            {INSTALL_STEPS.map((s, i) => (
              <li key={i} className="flex gap-3 rounded-lg border border-hairline bg-background/60 p-4">
                <span className="qe-display mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-hairline text-xs font-bold text-brand">
                  {i + 1}
                </span>
                <div>
                  <p className="text-sm font-semibold">{s.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="mt-10 flex gap-3 rounded-lg border border-hairline bg-background/60 p-4">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
          <p className="text-xs leading-relaxed text-muted-foreground">
            Only download the app from deyoungpro.site. The Chrome &quot;harmful file&quot; warning is standard for
            direct APK installs and does not mean the file is unsafe. If you ever want the app on Google Play, it
            ships from the same codebase and would appear here first.
          </p>
        </div>
      </main>

      <footer className="relative z-10 border-t border-hairline">
        <div className="mx-auto max-w-3xl px-5 py-8 text-[11px] text-muted-foreground">
          <p>© {new Date().getFullYear()} DeeYoungs Ltd. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
