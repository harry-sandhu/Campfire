"use client";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "../../components/auth-provider";
import { Shell } from "../../components/shell";
import { Spinner } from "../../components/ui";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const mustChange = !!user?.mustChangePassword;

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/login");
    else if (mustChange && pathname !== "/account") router.replace("/account");
  }, [loading, user, mustChange, pathname, router]);

  if (loading || !user || (mustChange && pathname !== "/account")) return <Spinner full />;
  return <Shell>{children}</Shell>;
}
