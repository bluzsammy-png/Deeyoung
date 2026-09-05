// Media Kit manifest — every deliverable for the DeeYoung Pro launch kit.
// Files live OUTSIDE the project tree and are served via /api/kit/<file>.
// Production deployments without a mounted media dir hide the kit entirely:
// set NEXT_PUBLIC_MEDIA_KIT=on (build-time) only where /api/kit is backed.
export type KitItem = { file: string; label: string; note?: string };
export type KitGroup = { title: string; items: KitItem[] };

export const MEDIA_KIT_ENABLED = process.env.NEXT_PUBLIC_MEDIA_KIT === "on";

export const FILM_FILE = "DeeYoung-Pro-80s-Ad-Film.mp4";

export const KIT_GROUPS: KitGroup[] = [
  {
    title: "The Film",
    items: [
      { file: FILM_FILE, label: "80-Second Ad Film", note: "720p · narrated voiceover · Ken Burns motion. The hero asset for ads" },
    ],
  },
  {
    title: "Scene Cuts. Ready-to-post 14s reels",
    items: [
      { file: "Film-Scene-1.mp4", label: "Scene 1 · Opening" },
      { file: "Film-Scene-2.mp4", label: "Scene 2 · The Problem" },
      { file: "Film-Scene-3.mp4", label: "Scene 3 · The Terminal" },
      { file: "Film-Scene-4.mp4", label: "Scene 4 · AI Trade Desk" },
      { file: "Film-Scene-5.mp4", label: "Scene 5 · Why Us" },
      { file: "Film-Scene-6.mp4", label: "Scene 6 · Call to Action" },
    ],
  },
  {
    title: "Cinematic Ad Stills",
    items: [
      { file: "Ad-1-Terminal-Hero.png", label: "Terminal Hero" },
      { file: "Ad-2-Gold-Macro.png", label: "Gold Macro" },
      { file: "Ad-3-Trader-Silhouette.png", label: "Trader Silhouette" },
      { file: "Ad-4-Lifestyle-Mobile.png", label: "Lifestyle Mobile" },
      { file: "Ad-5-City-Momentum.png", label: "City Momentum" },
    ],
  },
  {
    title: "Real Product Screenshots",
    items: [
      { file: "Screen-1-Landing.png", label: "Landing Page" },
      { file: "Screen-2-Pricing.png", label: "Pricing Tiers" },
      { file: "Screen-3-Signup.png", label: "Sign Up" },
      { file: "Screen-4-Dashboard-FX-Signals.png", label: "Dashboard + FX Signals" },
      { file: "Screen-5-Trade-Desk.png", label: "AI Trade Desk" },
    ],
  },
  {
    title: "Audio & Docs",
    items: [
      { file: "Ad-Film-Voiceover.wav", label: "Voiceover Track", note: "80s narration. Reuse for cuts and remixes" },
      { file: "DeeYoung-Pro-Legal-Policies.docx", label: "Legal Policies Pack", note: "Terms · Privacy · Security · Refund" },
      { file: "SECURITY-AUDIT.md", label: "Security Audit Report" },
    ],
  },
];
