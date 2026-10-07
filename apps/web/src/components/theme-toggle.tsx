"use client";
import { useEffect, useState } from "react";

type Theme = "light" | "dark";
export const THEME_KEY = "pokta-theme";

// Flips data-theme on <html> and remembers the choice. The inline script in layout.tsx applies the stored
// choice before first paint; without one the page follows the system setting.
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const stored = document.documentElement.dataset.theme as Theme | undefined;
    setTheme(stored ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  }, []);

  const flip = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem(THEME_KEY, next);
    setTheme(next);
  };

  return (
    <button type="button" className="link-btn small theme-toggle" onClick={flip} aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} suppressHydrationWarning>
      {theme === null ? "Theme" : theme === "dark" ? "Light mode" : "Dark mode"}
    </button>
  );
}
