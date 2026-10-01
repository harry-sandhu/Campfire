"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, json, refreshSession, setAccessToken, setAuthLostHandler } from "../lib/api";
import type { User } from "../lib/types";

type AuthState = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  reloadUser: () => Promise<void>;
  can: (permission: string) => boolean;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const reloadUser = useCallback(async () => {
    const me = await api<{ user: User }>("/auth/me");
    setUser(me.user);
  }, []);

  useEffect(() => {
    setAuthLostHandler(() => {
      setAccessToken("");
      setUser(null);
    });
    (async () => {
      try {
        if (await refreshSession()) await reloadUser();
      } catch {
        /* not signed in */
      } finally {
        setLoading(false);
      }
    })();
  }, [reloadUser]);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      reloadUser,
      can: (permission) => !!user && (user.role === "SUPERADMIN" || user.permissions.includes(permission)),
      login: async (email, password) => {
        const data = await api<{ user: User; accessToken: string }>("/auth/login", { method: "POST", body: json({ email, password }) });
        setAccessToken(data.accessToken);
        setUser(data.user);
      },
      logout: async () => {
        await api("/auth/logout", { method: "POST" }).catch(() => undefined);
        setAccessToken("");
        setUser(null);
      },
    }),
    [user, loading, reloadUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
