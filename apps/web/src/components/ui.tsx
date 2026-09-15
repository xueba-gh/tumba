"use client";

import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { useEffect, useId, useRef } from "react";
import { Icon, type IconName } from "./Icon";

/** Join class names, dropping falsy entries. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/* ------------------------------------------------------------------ Button */

type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
type ButtonSize = "sm" | "md" | "lg";

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-fg hover:opacity-90 disabled:opacity-40",
  secondary:
    "bg-surface text-fg border border-border hover:border-border-strong hover:bg-accent-subtle disabled:opacity-40",
  ghost: "text-fg-muted hover:bg-accent-subtle hover:text-fg disabled:opacity-40",
  destructive:
    "bg-transparent text-destructive border border-border hover:border-destructive hover:bg-destructive-subtle disabled:opacity-40",
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: "h-control-sm px-2.5 text-label gap-1.5",
  md: "h-control px-3 text-label gap-2",
  lg: "h-control-lg px-4 text-body gap-2",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  loading?: boolean;
}

export function Button({
  variant = "secondary",
  size = "md",
  icon,
  loading = false,
  disabled,
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        "inline-flex cursor-pointer items-center justify-center rounded-md font-medium transition-colors",
        "disabled:cursor-not-allowed",
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner /> : icon ? <Icon name={icon} size={size === "lg" ? 16 : 14} /> : null}
      {children}
    </button>
  );
}

export function IconButton({
  label,
  icon,
  variant = "ghost",
  size = "md",
  className,
  ...rest
}: Omit<ButtonProps, "icon" | "children"> & { label: string; icon: IconName }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        "inline-flex cursor-pointer items-center justify-center rounded-md transition-colors",
        "disabled:cursor-not-allowed",
        buttonVariants[variant],
        size === "sm" ? "h-control-sm w-control-sm" : "h-control w-control",
        className,
      )}
      {...rest}
    >
      <Icon name={icon} size={16} />
    </button>
  );
}

function Spinner() {
  return (
    <span
      className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
      aria-hidden="true"
    />
  );
}

/* ------------------------------------------------------------------- Field */

/** Persistent visible label above the control — never placeholder-as-label. */
export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  htmlFor?: string;
  className?: string;
}) {
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-label font-medium text-fg">
        {label}
      </label>
      {children}
      {error ? (
        <p className="flex items-center gap-1 text-label text-destructive">
          <Icon name="alert" size={12} />
          {error}
        </p>
      ) : hint ? (
        <p className="text-label text-fg-muted">{hint}</p>
      ) : null}
    </div>
  );
}

const controlBase =
  "w-full rounded-md border border-border bg-surface px-2.5 text-body text-fg transition-colors " +
  "placeholder:text-fg-subtle hover:border-border-strong focus:border-accent focus:outline-none " +
  "focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50";

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(controlBase, "h-control", className)} {...rest} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(controlBase, "resize-y py-2 leading-relaxed", className)} {...rest} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(controlBase, "h-control cursor-pointer pr-8", className)} {...rest}>
      {children}
    </select>
  );
}

/* -------------------------------------------------------------------- Card */

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cx("rounded-lg border border-border bg-surface", className)}>{children}</div>
  );
}

export function SectionHeading({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <h2 className="text-heading font-semibold text-fg">{children}</h2>
      {action}
    </div>
  );
}

export function Overline({ children }: { children: ReactNode }) {
  return <span className="text-overline font-semibold uppercase text-fg-muted">{children}</span>;
}

/* ------------------------------------------------------------------- Badge */

type Tone = "neutral" | "accent" | "success" | "warning" | "destructive";

const badgeTones: Record<Tone, string> = {
  neutral: "bg-bg text-fg-muted border-border",
  accent: "bg-accent-subtle text-accent border-transparent",
  success: "bg-success-subtle text-success border-transparent",
  warning: "bg-warning-subtle text-warning border-transparent",
  destructive: "bg-destructive-subtle text-destructive border-transparent",
};

/** Always carries a word — color is never the sole signal. */
export function Badge({
  tone = "neutral",
  icon,
  children,
  className,
}: {
  tone?: Tone;
  icon?: IconName;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-overline font-semibold uppercase",
        badgeTones[tone],
        className,
      )}
    >
      {icon ? <Icon name={icon} size={11} /> : null}
      {children}
    </span>
  );
}

/* -------------------------------------------------------------- EmptyState */

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: IconName;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border px-6 py-12 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-bg text-fg-subtle">
        <Icon name={icon} size={20} />
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-body font-medium text-fg">{title}</p>
        <p className="mx-auto max-w-sm text-label text-fg-muted">{description}</p>
      </div>
      {action}
    </div>
  );
}

/* ------------------------------------------------------------------- Modal */

/**
 * Focus is trapped while open, Escape closes, and focus returns to whatever
 * was focused before opening. See MASTER.md §7.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "md" | "lg";
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    if (!open) return;

    restoreRef.current = document.activeElement as HTMLElement | null;

    function focusables(): HTMLElement[] {
      if (!panelRef.current) return [];
      return Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])',
        ),
      );
    }

    focusables()[0]?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;

      const items = focusables();
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
      restoreRef.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        className={cx(
          "relative flex max-h-[85vh] w-full flex-col rounded-xl border border-border bg-surface-raised shadow-md",
          size === "lg" ? "max-w-2xl" : "max-w-md",
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-4 py-3">
          <div className="flex flex-col gap-0.5">
            <h2 id={titleId} className="text-heading font-semibold text-fg">
              {title}
            </h2>
            {description ? (
              <p id={descId} className="text-label text-fg-muted">
                {description}
              </p>
            ) : null}
          </div>
          <IconButton label="Close dialog" icon="close" size="sm" onClick={onClose} />
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>

        {footer ? (
          <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
