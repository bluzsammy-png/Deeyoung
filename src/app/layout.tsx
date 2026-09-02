import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { PostHogProvider } from "@/components/posthog-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Deeyoung · QuantEdge Pro — AI Market Intelligence & Trading Terminal",
  description:
    "One unified terminal: real-time market analytics, multi-factor signals, catalyst intelligence, portfolio risk, and SENTINEL — the optional supervised action layer with paper trading. 14-day free trial, no card required.",
  keywords: ["Deeyoung", "QuantEdge", "market intelligence", "signals", "SENTINEL", "paper trading", "quantitative", "risk engine"],
  authors: [{ name: "Deeyoung" }],
  icons: { icon: "/favicon.svg" },
  openGraph: {
    title: "Deeyoung · QuantEdge Pro — AI Market Intelligence & Trading Terminal",
    description: "Understand the market. See what matters. Act with supervision. Start your 14-day free trial.",
    siteName: "Deeyoung · QuantEdge Pro",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#07090d",
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
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <PostHogProvider>
          {children}
          <Toaster />
        </PostHogProvider>
      </body>
    </html>
  );
}
