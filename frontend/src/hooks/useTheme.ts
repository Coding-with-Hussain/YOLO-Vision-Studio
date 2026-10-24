import { useEffect } from "react";

import { usePreferences } from "@/stores/preferences";
import { useMediaQuery } from "./useMediaQuery";

/** Applies the theme preference to <html> and returns the resolved theme. */
export function useApplyTheme(): "dark" | "light" {
  const theme = usePreferences((s) => s.theme);
  const prefersDark = useMediaQuery("(prefers-color-scheme: dark)");
  const resolved = theme === "system" ? (prefersDark ? "dark" : "light") : theme;
  useEffect(() => {
    document.documentElement.classList.toggle("dark", resolved === "dark");
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", resolved === "dark" ? "#09090F" : "#F6F7FB");
  }, [resolved]);
  return resolved;
}
