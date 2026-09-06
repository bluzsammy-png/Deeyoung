// DEEYOUNG PRO — sitemap (SEO hardening, free).
// Public surfaces only: landing, engine status, legal. Auth-gated terminal
// routes (admin, checkout, api) are deliberately excluded.
import type { MetadataRoute } from "next";

const BASE = process.env.NEXT_PUBLIC_SITE_URL || "https://deyoungpro.site";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${BASE}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${BASE}/status`, lastModified: now, changeFrequency: "hourly", priority: 0.9 },
    { url: `${BASE}/app`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${BASE}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${BASE}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
  ];
}
