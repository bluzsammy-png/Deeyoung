import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { PostHogProvider } from "@/components/posthog-provider";

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
  title: "DeeYoung Pro — AI Market Intelligence & Trading Terminal",
  description:
    "One unified terminal: real-time market analytics, multi-factor signals, catalyst intelligence, portfolio risk, and SENTINEL — the optional supervised action layer with paper trading. 14-day free trial, no card required.",
  keywords: ["DeeYoung Pro", "DeeYoungs Ltd", "market intelligence", "signals", "SENTINEL", "paper trading", "quantitative", "risk engine"],
  authors: [{ name: "DeeYoungs Ltd" }],
  icons: { icon: "/favicon.svg" },
  openGraph: {
    title: "DeeYoung Pro — AI Market Intelligence & Trading Terminal",
    description: "Understand the market. See what matters. Act with supervision. Start your 14-day free trial.",
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
        </PostHogProvider>
      </body>
    </html>
  );
}
