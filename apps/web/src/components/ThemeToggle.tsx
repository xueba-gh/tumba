"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon, type IconName } from "./Icon";
import { cx } from "./ui";

type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "nva-theme";

const OPTIONS: Array<{ value: Theme; label: string; icon: IconName }> = [
  { value: "light", label: "Light", icon: "sun" },
  { value: "dark", label: "Dark", icon: "moon" },
  { value: "system", label: "System", icon: "monitor" },
];

function apply(theme: Theme) {
  const dark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

/**
 * Light / Dark / System segmented control. The initial class is applied by the
 * inline script in the root layout, so this only reconciles after mount.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    let stored: Theme = "system";
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === "light" || raw === "dark" || raw === "system") stored = raw;
    } catch {
      // Storage unavailable (private mode, blocked cookies) — fall back to system.
    }
    setTheme(stored);
    setMounted(true);
  }, []);

  // Follow the OS while the preference is "system".
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  const choose = useCallback((next: Theme) => {
    setTheme(next);
    apply(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Preference simply won't persist; the UI still switches.
    }
  }, []);

  return (
    <div
      role="radiogroup"
      aria-label="Color theme"
      className="flex items-center gap-0.5 rounded-md border border-border bg-surface p-0.5"
    >
      {OPTIONS.map((opt) => {
        const active = mounted && theme === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={`${opt.label} theme`}
            title={`${opt.label} theme`}
            onClick={() => choose(opt.value)}
            className={cx(
              "flex h-6 w-6 cursor-pointer items-center justify-center rounded-sm transition-colors",
              active
                ? "bg-accent-subtle text-accent"
                : "text-fg-subtle hover:bg-bg hover:text-fg-muted",
            )}
          >
            <Icon name={opt.icon} size={14} />
          </button>
        );
      })}
    </div>
  );
}
