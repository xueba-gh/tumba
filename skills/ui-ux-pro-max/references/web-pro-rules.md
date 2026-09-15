# Web & Desktop Professional UI Rules + Pre-Delivery Checklist

Load this file before final delivery of **web or desktop UI** (Next.js, React, Vue, Svelte, Astro, Laravel, HTML/Tailwind, Electron), or when a user says the UI looks "AI-generated", "generic", "cheap", or "unprofessional" and the cause isn't obvious from the priority table in SKILL.md.

**Scope notice:** this is the web/desktop counterpart to `pro-rules.md` (which targets native/mobile: touch targets, safe areas, platform gestures). Use this file for pointer-driven, keyboard-first, resizable-viewport interfaces. `quick-reference.md` remains the stack-agnostic rule list; this file covers what it doesn't — craft-level discipline that separates professional web UI from default-looking output.

---

## §0. Anti-Patterns That Read as "AI Slop"

The single most common failure mode in generated UI. Each of these is individually defensible in the right context and collectively fatal — they are the visual signature of a design that made no decisions. **Treat every row as prohibited unless the user explicitly asks for it or the product is genuinely in the "Best For" column of that style.**

| # | Anti-Pattern | Why It Reads as Cheap | Do Instead |
|---|---|---|---|
| 1 | **Decorative gradients** — purple→pink, blue→violet, teal→cyan on headings, buttons, cards, hero backgrounds | Gradient is being used as a substitute for hierarchy. It carries no information, so the eye gets no ranking signal | Flat surfaces. Establish hierarchy with **weight, size, and spacing**. Reserve gradient for encoding real data (heatmap, waveform intensity) |
| 2 | **Gradient text** (`bg-clip-text` on a headline) | Reduces contrast, breaks at small sizes, dates instantly to 2023 | Solid foreground token at the weight the hierarchy calls for |
| 3 | **Emoji as icons** (🚀 ⚙️ 🎬 ✨ 📊) | Font-dependent, unthemeable, inconsistent per-OS, wrong optical weight next to text | Inline SVG (Lucide/Heroicons/Phosphor), `currentColor`, consistent stroke |
| 4 | **Glow / neon shadows** (`shadow-purple-500/50`, colored `drop-shadow`) | Pure ornament; muddies edges and reads as a template | Hairline borders + a single neutral elevation shadow, or no shadow at all |
| 5 | **Glassmorphism everywhere** (`backdrop-blur` on every card) | Destroys contrast, costs GPU, hides hierarchy | Reserve backdrop blur for one layer that genuinely overlaps content (sticky header, modal scrim) |
| 6 | **Everything rounded to `rounded-2xl`/`3xl`** | Uniform extreme radius removes the size cue that distinguishes control from container | Radius scale tied to element size: inputs/buttons 6px, cards 8–12px, modals 12–16px |
| 7 | **Center-aligned everything** | Centered text has a ragged left edge, so scanning cost rises with every line | Left-align all body copy, labels, form content, and table cells. Center only short display headings and empty states |
| 8 | **Three feature cards with a colored circle icon** | The default landing-page skeleton; signals no product thinking | Show the actual interface, real data, or a real screenshot |
| 9 | **Hero at `min-height: 100vh` on an app** | Tools are not marketing sites. Burns the fold on nothing | Put the user's real work above the fold |
| 10 | **Pure black `#000` on pure white `#FFF`** | Halation and eye strain at long dwell times | Near-neutrals: `#FAFAFA`/`#09090B` light, `#0A0A0B`/`#FAFAFA` dark |
| 11 | **Multiple accent hues competing** (blue CTA + green badge + orange tag + purple link) | With no single accent, nothing is primary | **One** accent hue. Semantic colors (success/warning/destructive) appear only for real state |
| 12 | **Decorative-only animation** (floating blobs, pulsing glows, infinite loops) | Costs battery, distracts, conveys nothing | Animate only state change: enter/exit, expand/collapse, value updates |
| 13 | **`font-weight: 900` display type at `clamp(3rem, 10vw, 12rem)`** | Editorial/fashion convention applied to a work tool | Largest UI text ≈ 24–30px. Hierarchy from spacing and weight (500/600), not scale explosions |
| 14 | **Raw hex scattered through components** | Theming becomes find-and-replace; dark mode silently breaks | Semantic CSS-variable tokens (`--color-fg-muted`), never literals in components |
| 15 | **Fake depth stacks** (`shadow-2xl` on a flat card) | Shadow that no light source explains | One shadow scale, low opacity, tight blur — or borders alone |

**Positive rule of thumb:** a professional web UI is usually *flat surfaces + one accent + a strict spacing scale + real type hierarchy*. If a visual element cannot survive the question "what information does this encode?", delete it.

---

## §1. Color Discipline (Web)

| Rule | Standard | Avoid |
|---|---|---|
| **Neutral ramp first** | Build the UI from a single neutral ramp (zinc/slate/gray, 11 steps). Most professional UI is 90% neutral | Coloring surfaces "to add interest" |
| **One accent** | A single accent hue for primary actions, active nav, focus rings, selection | A palette of equal-weight brand colors |
| **Semantic tokens only** | `--color-bg`, `--color-surface`, `--color-fg`, `--color-fg-muted`, `--color-border`, `--color-accent`, `--color-destructive` | `bg-neutral-100 dark:bg-neutral-900` repeated in 40 files |
| **Borders carry structure** | Hairline 1px borders at a low-contrast token separate regions more cleanly than shadows on the web | Shadow-only separation that vanishes in dark mode |
| **Dark mode is not inverted light** | Re-pick each token. Dark surfaces get *lighter* as they come forward; light surfaces get *darker* | `filter: invert()` or mechanical value flipping |
| **Contrast floors** | Body ≥4.5:1, large text/UI glyphs ≥3:1, **in both themes** | Gray-on-gray secondary text (the most common dark-mode failure) |
| **Elevation via surface, not shadow** | In dark mode raise a surface by lightening it 2–4%, not by adding shadow (shadows are invisible on dark) | Reusing the light-mode shadow scale in dark |

## §2. Typography (Web)

| Rule | Standard | Avoid |
|---|---|---|
| **One family, many weights** | A single well-built sans (Inter, Geist, IBM Plex Sans) at 400/500/600 covers nearly all app UI | Pairing three families for "personality" |
| **Base size 14–16px** | 16px for content-led UI; 14px acceptable for dense tool UI. Never below 12px for any readable text | 11px "compact" labels |
| **Line-height by role** | Body 1.5–1.6; headings 1.15–1.25; single-line UI labels 1 | One global line-height |
| **Optical letter-spacing** | Tighten headings ≥20px (`-0.01em` to `-0.02em`); track out ALL-CAPS labels (`+0.04em`) | Default tracking everywhere, or `-0.05em` on body |
| **Tabular numerals** | `font-variant-numeric: tabular-nums` for any number that changes in place — timecodes, durations, counts, prices | Proportional digits in a timeline that jitter as they update |
| **Mono for machine text** | Timecodes, IDs, file paths, code, hashes | Mono as a body font "for the aesthetic" |
| **Measure 45–75ch** | Cap long-form text width | Edge-to-edge paragraphs on a 1920px monitor |
| **Weight, not color, for hierarchy** | Promote with 500→600 and size; demote with a muted token | Five shades of gray doing the work of two weights |

## §3. Spacing & Layout (Web)

| Rule | Standard | Avoid |
|---|---|---|
| **4px base scale** | 4/8/12/16/24/32/48/64. Every gap, pad, and margin comes from it | `p-[13px]`, `mt-[27px]` |
| **Proximity encodes grouping** | Space *between* groups must clearly exceed space *within* a group | Uniform `gap-4` everywhere, flattening structure |
| **Density matches task** | Tools/dashboards: 8–16px rhythm, 32–36px controls. Content/marketing: 24–64px | Marketing whitespace in a dense work tool |
| **Consistent page frame** | One container width + one gutter, applied identically on every route | Each page inventing its own max-width |
| **Align to a grid** | Control heights and icon boxes land on the 4px grid so rows align optically | Mixed 36/38/40px controls in one toolbar |
| **Reserve space for async content** | Fixed-height skeletons matching final dimensions (CLS < 0.1) | Spinners that collapse then reflow the page |

## §4. Pointer, Keyboard & State (Web-Specific)

| Rule | Standard | Avoid |
|---|---|---|
| **Visible focus ring** | `:focus-visible` with a 2px accent ring + 2px offset on every interactive element | `outline: none` with no replacement |
| **Full state set** | Every control defines rest / hover / active / focus-visible / disabled / loading | Hover-only styling |
| **Hover is an enhancement** | Never hide essential actions behind hover — touch and keyboard users never trigger it | Row actions that only appear on `:hover` |
| **`cursor: pointer`** | On every clickable element, including `div`-based controls | Default arrow on a custom button |
| **Semantic elements** | `<button>` for actions, `<a>` for navigation, `<label for>` on every input | `<div onClick>` as a primary control |
| **Keyboard reachability** | Full task completion without a mouse; logical tab order; Escape closes overlays; focus trapped in modals and restored on close | Modals that leak focus to the page behind |
| **Scrollbar containment** | Scroll the pane that owns the content; never a horizontally scrolling page body | `overflow-x` on `<body>` |
| **Disabled vs. hidden** | Disable with a reason (tooltip/helper text); hide only when irrelevant | Dead controls that look active |
| **Destructive confirmation** | Irreversible actions confirm, name the target, and use the destructive token | A red button that deletes on first click |

## §5. Motion (Web)

| Rule | Standard | Avoid |
|---|---|---|
| **Duration 120–240ms** | UI state changes. Larger surfaces (modal/drawer) up to 300ms | >400ms on anything the user triggers repeatedly |
| **Easing by direction** | Enter `ease-out`; exit `ease-in` and ~30% faster | `linear` or `ease-in-out` on everything |
| **Compositor properties only** | Animate `transform` and `opacity` | Animating `width`, `height`, `top`, `left` |
| **Motion must mean something** | Reveal a relationship, show origin, confirm a change | Ambient loops and entrance animations on every card |
| **Honor `prefers-reduced-motion`** | Reduce to opacity or none — never merely shorten | Shipping motion with no reduced-motion branch |

## §6. Forms & Feedback (Web)

| Rule | Standard | Avoid |
|---|---|---|
| **Persistent visible label** | Above the field, always | Placeholder-as-label (vanishes on focus, fails a11y) |
| **Inline errors** | Beside/below the offending field, naming the fix | A summary banner at the top only |
| **Validate on blur, recover on input** | Don't error mid-typing; clear as soon as it's valid | Red borders from the first keystroke |
| **Optimistic + reconciled** | Reflect the change immediately, reconcile on response, roll back visibly on failure | Freezing the UI behind a blocking spinner |
| **Every async op has 4 states** | idle / loading / empty / error — all designed | Only the happy path |
| **Empty states do work** | Explain what goes here and offer the action that fills it | "No data" centered in gray |
| **Autosave is announced** | Show "Saved" / "Saving…" with a timestamp | Silent persistence the user can't trust |

## §7. Icons (Web)

- One family, one metric (Lucide 24×24 / 1.5–2px stroke is a safe default). Never mix families.
- Inline SVG with `stroke="currentColor"` so tokens and dark mode apply for free.
- Size from the scale: 14/16/20/24px. Optical size ≈ cap height of adjacent text.
- `aria-hidden="true"` when decorative next to a text label; `aria-label` when the icon is the only content.
- Icon-only buttons need an accessible name **and** a tooltip.
- **Never emoji.** See §0 #3.

---

## Pre-Delivery Checklist (Web — canonical)

### Process
- [ ] Ran `--domain ux "accessibility forms loading"` as a validation pass before implementing
- [ ] Reviewed `quick-reference.md` §1–§3 (CRITICAL + HIGH) as a final pass
- [ ] Re-read **§0 Anti-Patterns** and confirmed zero hits
- [ ] Tested at 375 / 768 / 1024 / 1440px
- [ ] Tested **both** themes explicitly (never inferred one from the other)
- [ ] Tested with `prefers-reduced-motion: reduce` active
- [ ] Completed one full task using **keyboard only**

### Visual Quality
- [ ] No decorative gradients, gradient text, glows, or neon shadows
- [ ] No emoji used as icons — all icons are SVG from one family with consistent stroke and size
- [ ] One accent hue; semantic colors appear only for real state
- [ ] All colors come from semantic tokens; no raw hex in components
- [ ] Radius, shadow, and spacing each follow a single documented scale
- [ ] Type hierarchy is carried by weight/size/spacing, not color alone

### Typography
- [ ] Body ≥14px (≥16px if content-led); nothing readable below 12px
- [ ] Line-height differentiated by role (body vs. heading vs. label)
- [ ] Headings ≥20px optically tightened; ALL-CAPS labels tracked out
- [ ] `tabular-nums` on every in-place-updating number
- [ ] Long-form text capped at 45–75ch

### Interaction & Accessibility
- [ ] Visible `:focus-visible` ring on every interactive element
- [ ] Rest / hover / active / focus / disabled / loading defined for every control
- [ ] No essential action reachable only via hover
- [ ] Semantic elements used (`button` / `a` / `label for`)
- [ ] Modals trap focus, close on Escape, and restore focus on close
- [ ] Body text ≥4.5:1 and UI glyphs ≥3:1 **in both themes**
- [ ] Color is never the sole carrier of meaning
- [ ] Destructive actions confirm and name their target

### Layout & Performance
- [ ] No horizontal page scroll at any breakpoint
- [ ] Async regions reserve space (CLS < 0.1); skeletons match final dimensions
- [ ] Idle / loading / empty / error states designed for every async operation
- [ ] One container width and gutter shared across routes
- [ ] Animations limited to `transform`/`opacity`, 120–240ms
