import type { Config } from "tailwindcss";

/**
 * Tokens mirror design-system/narrated-video-assembler/MASTER.md.
 * Colors resolve to CSS variables so both themes work from one class name.
 *
 * Each var holds space-separated RGB channels and is composed here with
 * <alpha-value>, which is what makes opacity modifiers work: `bg-accent/40`
 * compiles to `rgb(var(--accent) / 0.4)`. Defining these as a bare
 * `var(--accent)` silently breaks every `/opacity` utility — Tailwind cannot
 * insert an alpha channel into an opaque colour string, so it emits nothing
 * and the element paints transparent.
 */
export default {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: "rgb(var(--bg) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        "surface-raised": "rgb(var(--surface-raised) / <alpha-value>)",
        fg: "rgb(var(--fg) / <alpha-value>)",
        "fg-muted": "rgb(var(--fg-muted) / <alpha-value>)",
        "fg-subtle": "rgb(var(--fg-subtle) / <alpha-value>)",
        border: "rgb(var(--border) / <alpha-value>)",
        "border-strong": "rgb(var(--border-strong) / <alpha-value>)",
        accent: "rgb(var(--accent) / <alpha-value>)",
        "accent-fg": "rgb(var(--accent-fg) / <alpha-value>)",
        "accent-subtle": "rgb(var(--accent-subtle) / <alpha-value>)",
        success: "rgb(var(--success) / <alpha-value>)",
        "success-subtle": "rgb(var(--success-subtle) / <alpha-value>)",
        warning: "rgb(var(--warning) / <alpha-value>)",
        "warning-subtle": "rgb(var(--warning-subtle) / <alpha-value>)",
        destructive: "rgb(var(--destructive) / <alpha-value>)",
        "destructive-subtle": "rgb(var(--destructive-subtle) / <alpha-value>)",
        ring: "rgb(var(--ring) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      fontSize: {
        // role / [size, line-height] — MASTER.md §3
        overline: ["0.6875rem", { lineHeight: "1", letterSpacing: "0.06em" }],
        label: ["0.75rem", { lineHeight: "1.4" }],
        data: ["0.8125rem", { lineHeight: "1.4" }],
        body: ["0.875rem", { lineHeight: "1.55" }],
        heading: ["0.9375rem", { lineHeight: "1.3", letterSpacing: "-0.01em" }],
        title: ["1.25rem", { lineHeight: "1.25", letterSpacing: "-0.02em" }],
      },
      borderRadius: {
        sm: "4px",
        md: "6px",
        lg: "8px",
        xl: "12px",
      },
      spacing: {
        // 4px-grid control heights
        control: "2rem",
        "control-sm": "1.75rem",
        "control-lg": "2.25rem",
      },
      maxWidth: {
        frame: "1400px",
        prose: "72ch",
      },
      transitionDuration: {
        DEFAULT: "150ms",
      },
      boxShadow: {
        sm: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
        md: "0 4px 12px -2px rgb(0 0 0 / 0.12)",
      },
    },
  },
  plugins: [],
} satisfies Config;
