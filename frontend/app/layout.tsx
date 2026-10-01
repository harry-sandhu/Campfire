import type { Metadata } from "next";
import { AuthProvider } from "../components/auth-provider";
import { ToastProvider } from "../components/toast";
import "./globals.css";

export const metadata: Metadata = { title: "Campfire", description: "A warm, focused workspace for internal work" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <ToastProvider>
          <AuthProvider>{children}</AuthProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
