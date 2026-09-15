import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "./Icon";
import { Overline } from "./ui";

/**
 * Shared frame for every pipeline step page: one container width, one gutter,
 * one title treatment (MASTER.md §4).
 */
export function PageHeader({
  step,
  title,
  description,
  next,
  actions,
}: {
  step?: string;
  title: string;
  description?: string;
  next?: { href: string; label: string };
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex flex-col gap-1">
        {step ? <Overline>{step}</Overline> : null}
        <h2 className="text-title font-semibold text-fg">{title}</h2>
        {description ? <p className="max-w-prose text-label text-fg-muted">{description}</p> : null}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {actions}
        {next ? (
          <Link
            href={next.href}
            className="inline-flex h-control cursor-pointer items-center gap-1.5 rounded-md bg-accent px-3 text-label font-medium text-accent-fg transition-opacity hover:opacity-90"
          >
            {next.label}
            <Icon name="arrowRight" size={14} />
          </Link>
        ) : null}
      </div>
    </div>
  );
}

export function PageShell({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-frame px-4 py-6 sm:px-6">{children}</div>;
}
