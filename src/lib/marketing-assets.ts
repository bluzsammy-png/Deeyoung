// DEEYOUNG PRO — social flyer manifest.
// Cinematic, ready-to-post marketing assets served statically from
// /public/marketing and surfaced in the admin Content tab (Social flyers).
// All copy on the assets is real product fact (26 markets, 7 factors,
// public paper engine, auditable ledger) with the live site URL + QR.

export type MarketingAsset = {
  file: string;
  label: string;
  note: string;
  w: number;
  h: number;
};

export const MARKETING_ASSETS: MarketingAsset[] = [
  {
    file: "social-feed-4x5.jpg",
    label: "Feed flyer 4:5",
    note: "Instagram & Facebook feed. The full pitch: headline, stats, QR.",
    w: 1080,
    h: 1350,
  },
  {
    file: "social-story-9x16.jpg",
    label: "Story 9:16",
    note: "Stories, Reels, TikTok, WhatsApp status.",
    w: 1080,
    h: 1920,
  },
  {
    file: "social-wide-16x9.jpg",
    label: "Wide banner 16:9",
    note: "X / Twitter, LinkedIn, Facebook posts, YouTube thumbnails.",
    w: 1200,
    h: 675,
  },
  {
    file: "social-square-1x1.jpg",
    label: "Square 1:1",
    note: "Universal square for feed grids and community posts.",
    w: 1080,
    h: 1080,
  },
  {
    file: "keyart-poster-2x3.jpg",
    label: "Key art poster 2:3",
    note: "The campaign poster: Pinterest, showcases, print handbills.",
    w: 864,
    h: 1152,
  },
];

export const marketingPath = (file: string) => `/marketing/${file}`;
