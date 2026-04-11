import { useState, useEffect, useCallback, useSyncExternalStore } from "react";

export type ThemeId =
  | "system"
  | "light"
  | "dark"
  | "catppuccin-latte"
  | "catppuccin-mocha"
  | "dracula"
  | "nord"
  | "one-dark"
  | "solarized-dark"
  | "solarized-light"
  | "tokyo-night"
  | "gruvbox-dark"
  | "gruvbox-light"
  | "rose-pine"
  | "rose-pine-dawn"
  | "ayu-dark";

/** Themes that are inherently dark (need the `.dark` class for Tailwind `dark:` variants). */
const DARK_THEMES = new Set<string>([
  "dark",
  "catppuccin-mocha",
  "dracula",
  "nord",
  "one-dark",
  "solarized-dark",
  "tokyo-night",
  "gruvbox-dark",
  "rose-pine",
  "ayu-dark",
]);

const STORAGE_KEY = "belay-theme";

const THEME_IDS: ThemeId[] = [
  "system",
  "light",
  "dark",
  "catppuccin-latte",
  "catppuccin-mocha",
  "dracula",
  "nord",
  "one-dark",
  "solarized-dark",
  "solarized-light",
  "tokyo-night",
  "gruvbox-dark",
  "gruvbox-light",
  "rose-pine",
  "rose-pine-dawn",
  "ayu-dark",
];

function getStoredTheme(): ThemeId {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && (THEME_IDS as readonly string[]).includes(stored)) {
      return stored as ThemeId;
    }
  } catch {
    // localStorage may be unavailable
  }
  return "system";
}

function storeTheme(theme: ThemeId): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // ignore
  }
}

function useSystemDark(): boolean {
  const subscribe = useCallback((onStoreChange: () => void) => {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    mql.addEventListener("change", onStoreChange);
    return () => mql.removeEventListener("change", onStoreChange);
  }, []);

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
    () => false,
  );
}

/** All named theme CSS classes that may be applied to `<html>`. */
const ALL_THEME_CLASSES = [
  "theme-catppuccin-latte",
  "theme-catppuccin-mocha",
  "theme-dracula",
  "theme-nord",
  "theme-one-dark",
  "theme-solarized-dark",
  "theme-solarized-light",
  "theme-tokyo-night",
  "theme-gruvbox-dark",
  "theme-gruvbox-light",
  "theme-rose-pine",
  "theme-rose-pine-dawn",
  "theme-ayu-dark",
];

/** Returns the CSS class to apply to `<html>` for a given theme id. */
function themeClass(id: ThemeId): string | null {
  switch (id) {
    case "light":
    case "dark":
    case "system":
      return null;
    case "catppuccin-latte":
      return "theme-catppuccin-latte";
    case "catppuccin-mocha":
      return "theme-catppuccin-mocha";
    case "dracula":
      return "theme-dracula";
    case "nord":
      return "theme-nord";
    case "one-dark":
      return "theme-one-dark";
    case "solarized-dark":
      return "theme-solarized-dark";
    case "solarized-light":
      return "theme-solarized-light";
    case "tokyo-night":
      return "theme-tokyo-night";
    case "gruvbox-dark":
      return "theme-gruvbox-dark";
    case "gruvbox-light":
      return "theme-gruvbox-light";
    case "rose-pine":
      return "theme-rose-pine";
    case "rose-pine-dawn":
      return "theme-rose-pine-dawn";
    case "ayu-dark":
      return "theme-ayu-dark";
  }
}

/** Whether a theme is a dark variant (needs `.dark` class). */
function isDarkTheme(id: ThemeId, systemDark: boolean): boolean {
  if (id === "system") return systemDark;
  return DARK_THEMES.has(id);
}

export const THEMES: {
  id: ThemeId;
  label: string;
  isDark: boolean | "system";
}[] = [
  { id: "system", label: "System", isDark: "system" },
  { id: "light", label: "Light", isDark: false },
  { id: "dark", label: "Dark", isDark: true },
  { id: "catppuccin-latte", label: "Catppuccin Latte", isDark: false },
  { id: "catppuccin-mocha", label: "Catppuccin Mocha", isDark: true },
  { id: "dracula", label: "Dracula", isDark: true },
  { id: "nord", label: "Nord", isDark: true },
  { id: "one-dark", label: "One Dark", isDark: true },
  { id: "solarized-dark", label: "Solarized Dark", isDark: true },
  { id: "solarized-light", label: "Solarized Light", isDark: false },
  { id: "tokyo-night", label: "Tokyo Night", isDark: true },
  { id: "gruvbox-dark", label: "Gruvbox Dark", isDark: true },
  { id: "gruvbox-light", label: "Gruvbox Light", isDark: false },
  { id: "rose-pine", label: "Rosé Pine", isDark: true },
  { id: "rose-pine-dawn", label: "Rosé Pine Dawn", isDark: false },
  { id: "ayu-dark", label: "Ayu Dark", isDark: true },
];

/** Manages theme selection. */
export function useTheme() {
  const [theme, setThemeState] = useState<ThemeId>(getStoredTheme);
  const systemPrefersDark = useSystemDark();

  const resolvedDark = isDarkTheme(theme, systemPrefersDark);
  const activeClass = themeClass(theme);

  // Sync classes on <html>
  useEffect(() => {
    const root = document.documentElement;

    // Remove all theme classes
    root.classList.remove(...ALL_THEME_CLASSES);

    // Toggle .dark
    if (resolvedDark) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }

    // Apply named theme class
    if (activeClass) {
      root.classList.add(activeClass);
    }
  }, [resolvedDark, activeClass]);

  const setTheme = useCallback((next: ThemeId) => {
    setThemeState(next);
    storeTheme(next);
  }, []);

  return {
    theme,
    resolvedTheme: resolvedDark ? ("dark" as const) : ("light" as const),
    isDark: resolvedDark,
    setTheme,
  } as const;
}
