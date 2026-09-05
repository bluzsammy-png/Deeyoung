// DEEYOUNG PRO — /admin standalone side: own layout, own look, no main-app
// chrome. This is the owner's control room, deliberately separate from the
// customer product surface.

import type { Metadata } from "next";
import "../globals.css";

export const metadata: Metadata = {
  title: "DeeYoung · Control Room",
  description: "Owner-only admin side: users, engine, venue, feed",
  other: { refresh: "60" },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-[#08090c] text-zinc-200">{children}</div>;
}
