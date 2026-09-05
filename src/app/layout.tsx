import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { PostHogProvider } from "@/components/posthog-provider";
import { SupportWidget } from "@/components/support-widget";
import { LiveChat } from "@/components/live-chat";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "DeeYoung Pro — Market Signals, Catalysts & Risk. One Terminal.",
  description:
    "Gold, FX majors and US stocks — price action, news flow and portfolio risk in one screen. Seven visible signal factors, honest delayed data, paper trading, and SENTINEL — an autopilot that waits for your approval. Three plans, your currency.",
  keywords: ["DeeYoung Pro", "DeeYoungs Ltd", "market intelligence", "signals", "SENTINEL", "paper trading", "quantitative", "risk engine"],
  authors: [{ name: "DeeYoungs Ltd" }],
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  manifest: "/manifest.webmanifest",
  openGraph: {
    title: "DeeYoung Pro — See what's moving. Know why it's moving.",
    description: "Move first. Market signals, catalysts and risk in one terminal — Wall Street tools at a price that makes sense. Three plans, your currency.",
    siteName: "DeeYoung Pro",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable} antialiased bg-background text-foreground`}
      >
        <PostHogProvider>
          {children}
          <Toaster />
          {/* Live support, mutually exclusive: hosted Tawk.to when its property is
              configured, otherwise the built-in desk (free, no third party). */}
          {process.env.NEXT_PUBLIC_TAWK_PROPERTY_ID ? <SupportWidget /> : <LiveChat />}
        </PostHogProvider>
      </body>
    </html>
  );
}
