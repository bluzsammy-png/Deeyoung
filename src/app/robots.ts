// DEEYOUNG PRO — robots (SEO hardening, free).
// Crawl the public proof surfaces; keep API + admin out of the index.
import type { MetadataRoute } from "next";

const BASE = process.env.NEXT_PUBLIC_SITE_URL || "https://deyoungpro.site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/status", "/privacy", "/terms"],
        disallow: ["/api/", "/admin", "/checkout"],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
  };
}
