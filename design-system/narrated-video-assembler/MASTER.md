# Narrated Video Assembler — Design System (MASTER)

Global source of truth for the web UI. Page-specific overrides live in `pages/<page-name>.md` and take precedence over this file.

Derived from the `ui-ux-pro-max` skill: style `Minimalism & Swiss Style` (styles.csv #1), palette `Monochrome + blue accent` (colors.csv), pairing `Minimal Swiss` (typography.csv). Craft rules: `references/web-pro-rules.md`.

**Stack:** Next.js 15 App Router · React 18 · Tailwind 3 · TypeScript strict.

---

## 1. Product framing

A dense, local-first **creative workstation** — not a marketing site. The user arrives with audio, a script, and a folder of images, and works a linear seven-step pipeline (Import → Script → Match → Timing → Style → Render). Everything runs in the browser; nothing uploads.

Design consequences:
- The user's own media is the only thing on screen with saturated color. **The interface must recede.**
- Sessions are long and repetitive → high density, low chrome, no ambient motion.
- Progress through the pipeline is the primary navigational fact and must be visible at all times.

**Explicitly rejected:** hero sections, feature-card triptychs, gradients, emoji icons, glow, display-scale type, any motion that isn't a state change. See `web-pro-rules.md` §0.

---

## 2. Color tokens

One neutral ramp (zinc) plus **one** accent (blue). Semantic colors appear only for real state. Every value is a CSS variable on `:root` / `.dark`; components never use raw hex or bare Tailwind palette classes.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#FAFAFA` | `#0A0A0B` | Page ground |
| `--surface` | `#FFFFFF` | `#141416` | Cards, panels, inputs |
| `--surface-raised` | `#FFFFFF` | `#1C1C1F` | Popovers, modals, hover rows |
| `--fg` | `#09090B` | `#FAFAFA` | Primary text |
| `--fg-muted` | `#52525B` | `#A1A1AA` | Secondary text, labels (≥4.5:1 both themes) |
| `--fg-subtle` | `#71717A` | `#71717A` | Tertiary/metadata only — never body copy |
| `--border` | `#E4E4E7` | `#27272A` | Hairlines, dividers, input borders |
| `--border-strong` | `#D4D4D8` | `#3F3F46` | Hover borders, focused inputs |
| `--accent` | `#2563EB` | `#3B82F6` | Primary action, active nav, selection |
| `--accent-fg` | `#FFFFFF` | `#FFFFFF` | Text on accent |
| `--accent-subtle` | `#EFF6FF` | `#1E3A8A33` | Accent-tinted backgrounds |
| `--success` | `#15803D` | `#4ADE80` | Verified / connection OK |
| `--warning` | `#B45309` | `#FBBF24` | Out-of-range beats, near-duplicates |
| `--destructive` | `#DC2626` | `#F87171` | Delete, failed test |
| `--ring` | `#2563EB` | `#3B82F6` | Focus ring |

Rules: pure `#000`/`#FFF` never used as page ground or body text (§1). Dark elevation comes from lightening the surface, not shadow. Borders carry structure; shadows are used only for genuinely floating layers (modal, popover).

---

## 3. Typography

**Inter** for everything (400/500/600) + **JetBrains Mono** for machine text. Both via `next/font` — self-hosted, no render-blocking Google Fonts request, no FOUT.

| Role | Size / Line-height / Weight | Notes |
|---|---|---|
| Page title | 20px / 1.25 / 600 | `-0.02em`. Largest text in the app |
| Section heading | 15px / 1.3 / 600 | `-0.01em` |
| Body | 14px / 1.55 / 400 | Default |
| Body emphasis | 14px / 1.55 / 500 | |
| Label | 12px / 1.4 / 500 | Form labels, card meta |
| Overline | 11px / 1 / 600 | `+0.06em`, uppercase. Step markers, table headers |
| Mono / data | 12–13px / 1.4 / 400 | Timecodes, durations, counts, IDs — `tabular-nums` |

Long-form editable text (the script textarea) is capped at ~72ch. Every number that updates in place uses `tabular-nums` so timings don't jitter.

---

## 4. Spacing, radius, elevation

- **Spacing:** 4px base — `4 / 8 / 12 / 16 / 24 / 32 / 48 / 64`. Dense tier (8–16px) inside panels; 24–32px between major regions.
- **Radius:** `sm 4px` (badges, inputs) · `md 6px` (buttons, cards) · `lg 8px` (panels) · `xl 12px` (modals). No `rounded-2xl`+ anywhere.
- **Control height:** 32px standard, 28px compact, 36px primary. All land on the 4px grid so toolbar rows align optically.
- **Elevation:** `shadow-none` by default. `shadow-sm` for popovers, `shadow-md` for modals. Never colored.
- **Page frame:** `max-w-[1400px]`, gutters `px-4 sm:px-6`, identical on every route.

---

## 5. Motion

Budget: **150ms**, `ease-out` on enter, `ease-in` at 120ms on exit. Only `transform`, `opacity`, and color properties animate. Permitted uses: hover/focus color shifts, modal and popover enter/exit, accordion expand, progress and waveform value updates. Everything else is static.

A global `@media (prefers-reduced-motion: reduce)` rule drops all transitions and animations to `0.01ms`.

---

## 6. Icons

Inline SVG, Lucide geometry: 24×24 viewBox, 1.75 stroke, `currentColor`, round caps/joins. Sizes 14/16/20px. Centralized in `components/Icon.tsx` — one family, one metric, themed for free.

Decorative icons beside a text label get `aria-hidden="true"`; icon-only buttons carry an `aria-label` **and** a `title`. **No emoji anywhere in the interface.**

---

## 7. Component conventions

- **Button** — variants `primary` (accent fill) · `secondary` (surface + border) · `ghost` (transparent, hover surface) · `destructive`. Always `<button type=...>`; sizes `sm 28px` / `md 32px` / `lg 36px`.
- **Input / Textarea / Select** — persistent visible `<label htmlFor>` above the field. Never placeholder-as-label. Focus = accent border + 2px ring.
- **Card** — `bg-surface`, 1px border, radius `lg`, no shadow.
- **Badge** — 11px, uppercase, tracked, radius `sm`, tinted background; carries a word, never color alone.
- **Modal** — focus trapped, Escape closes, focus restored on close, scrim `bg-black/50`, radius `xl`.
- **Empty state** — icon + one sentence naming what goes here + the primary action that fills it.
- **Focus** — every interactive element shows `:focus-visible` accent ring with 2px offset. `outline: none` is never used without a replacement.

---

## 8. Theme toggle

Three states: **Light / Dark / System**, persisted to `localStorage` under `nva-theme`, defaulting to System. A blocking inline script in `<head>` applies the `.dark` class before first paint (no flash). `colorScheme` is set so native form controls and scrollbars follow. The toggle is an icon button in the header with `aria-label` and a tooltip.

---

## 9. Pipeline navigation

The seven steps are always visible with explicit state: **done** (accent check) · **current** (accent fill + `aria-current="step"`) · **available** (muted, clickable) · **locked** (subtle, disabled, tooltip naming the prerequisite). Numbered so progress reads without relying on color. Horizontally scrollable within its own container on narrow viewports — never scrolls the page body.
