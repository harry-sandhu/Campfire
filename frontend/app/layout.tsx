import type { Metadata, Viewport } from "next";
import { Instrument_Sans, JetBrains_Mono, Newsreader } from "next/font/google";
import { AuthProvider } from "../components/auth-provider";
import { PwaRegister } from "../components/pwa";
import { RealtimeProvider } from "../components/realtime";
import { ToastProvider } from "../components/toast";
import { themeBootScript } from "../lib/theme";
import "./globals.css";

// Fonts are fetched at build time and served from our own origin: no third-party requests when the app runs.
const sans = Instrument_Sans({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const serif = Newsreader({ subsets: ["latin"], variable: "--font-serif", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://autodao.tech";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "Campfire", template: "%s · Campfire" },
  description: "Campfire is a quiet workspace for tickets, groups and the work your team gathers around.",
  applicationName: "Campfire",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
  // Internal tool: keep it out of search engines.
  robots: { index: false, follow: false },
  openGraph: { title: "Campfire", description: "A quiet workspace for tickets, groups and team work.", siteName: "Campfire", type: "website" },
};
export const viewport: Viewport = { themeColor: [{ media: "(prefers-color-scheme: light)", color: "#faf7f2" }, { media: "(prefers-color-scheme: dark)", color: "#16130f" }] };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable} ${mono.variable}`} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeBootScript }} /></head>
      <body>
        <PwaRegister />
        <ToastProvider>
          <AuthProvider><RealtimeProvider>{children}</RealtimeProvider></AuthProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
