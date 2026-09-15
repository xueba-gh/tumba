import type { Config } from "tailwindcss";

/**
 * Tokens mirror design-system/narrated-video-assembler/MASTER.md.
 * Colors resolve to CSS variables so both themes work from one class name.
 */
export default {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        "surface-raised": "var(--surface-raised)",
        fg: "var(--fg)",
        "fg-muted": "var(--fg-muted)",
        "fg-subtle": "var(--fg-subtle)",
        border: "var(--border)",
        "border-strong": "var(--border-strong)",
        accent: "var(--accent)",
        "accent-fg": "var(--accent-fg)",
        "accent-subtle": "var(--accent-subtle)",
        success: "var(--success)",
        "success-subtle": "var(--success-subtle)",
        warning: "var(--warning)",
        "warning-subtle": "var(--warning-subtle)",
        destructive: "var(--destructive)",
        "destructive-subtle": "var(--destructive-subtle)",
        ring: "var(--ring)",
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
