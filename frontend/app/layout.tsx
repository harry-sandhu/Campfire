import type { Metadata, Viewport } from "next";
import { PwaRegister } from "../components/pwa";
import { AuthProvider } from "../components/auth-provider";
import { RealtimeProvider } from "../components/realtime";
import { ToastProvider } from "../components/toast";
import "./globals.css";

export const metadata: Metadata = {
  title: "Campfire",
  description: "A warm, focused workspace for internal work",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};
export const viewport: Viewport = { themeColor: "#e26f3d" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <PwaRegister />
        <ToastProvider>
          <AuthProvider><RealtimeProvider>{children}</RealtimeProvider></AuthProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
