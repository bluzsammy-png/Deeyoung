"use client";

// DEEYOUNG PRO — free live-support chat (Tawk.to, the free Smartsupp-class
// alternative: unlimited chats, no per-seat fee, works in Nigeria).
// Inert until NEXT_PUBLIC_TAWK_PROPERTY_ID is set on the deployment — the site
// renders and behaves identically without it. Create the free account at
// tawk.to, copy the Property ID from Administration → Property Settings
// (looks like "64ad3f1ef24c9f6b1f2a3b4d"), set it as a Railway variable, done.

import { useEffect } from "react";

declare global {
  interface Window {
    Tawk_API?: Record<string, unknown>;
    Tawk_LoadStart?: Date;
  }
}

export function SupportWidget() {
  useEffect(() => {
    const id = process.env.NEXT_PUBLIC_TAWK_PROPERTY_ID;
    if (!id || window.Tawk_API) return;
    window.Tawk_API = window.Tawk_API || {};
    window.Tawk_LoadStart = new Date();
    const s1 = document.createElement("script");
    const s0 = document.getElementsByTagName("script")[0];
    s1.async = true;
    s1.src = `https://embed.tawk.to/${id}/1gm0v2v0p`;
    s1.charset = "UTF-8";
    s1.setAttribute("crossorigin", "*");
    s0?.parentNode?.insertBefore(s1, s0);
  }, []);
  return null;
}
