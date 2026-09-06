// DEEYOUNG PRO — PWA manifest (recommendations round, free upgrade).
// Installable terminal on desktop + Android. Icons already shipped in /public
// (icon-192.png, icon-512.png, apple-touch-icon.png). No service worker on
// purpose: a trading terminal must NEVER serve stale prices from cache.
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "DeeYoung Pro · Market Signals, Catalysts & Risk",
    short_name: "DeeYoung Pro",
    description: "See what's moving. Know why it's moving. Market signals, catalysts and risk in one terminal.",
    start_url: "/",
    display: "standalone",
    background_color: "#09090b",
    theme_color: "#09090b",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/apple-touch-icon.png", sizes: "180x180", type: "image/png", purpose: "maskable" },
    ],
  };
}
