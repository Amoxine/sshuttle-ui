import { useEffect } from "react";

import { useAppStore } from "@/store/appStore";

/** Applies `dark` / `light` on `<html>` from persisted settings + system preference. */
export function useThemeClass(): void {
  const theme = useAppStore((s) => s.settings.theme);

  useEffect(() => {
    const root = document.documentElement;
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)");

    const apply = () => {
      if (theme === "system") {
        root.classList.toggle("dark", prefersDark.matches);
        root.classList.toggle("light", !prefersDark.matches);
      } else {
        root.classList.toggle("dark", theme === "dark");
        root.classList.toggle("light", theme === "light");
      }
    };

    apply();
    prefersDark.addEventListener("change", apply);
    return () => prefersDark.removeEventListener("change", apply);
  }, [theme]);
}
