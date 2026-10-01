"use client";
import { useCallback, useEffect, useState } from "react";

export type Theme = "system" | "light" | "dark";
const KEY = "campfire-theme";

/** Runs before first paint (see layout) so a saved dark theme never flashes light. */
export const themeBootScript = `try{var t=localStorage.getItem("${KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("system");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved === "light" || saved === "dark") setThemeState(saved);
    } catch { /* storage blocked: stay on system */ }
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    if (next === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = next;
    try { next === "system" ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, next); } catch { /* ignore */ }
  }, []);

  return { theme, setTheme };
}
