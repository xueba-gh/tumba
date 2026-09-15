"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Project } from "@nva/core";
import { Icon, type IconName } from "./Icon";
import { cx } from "./ui";

interface ProjectNavProps {
  project: Project;
}

const STEPS: Array<{ slug: string; label: string; icon: IconName }> = [
  { slug: "import", label: "Import", icon: "upload" },
  { slug: "script", label: "Script", icon: "script" },
  { slug: "match", label: "Match", icon: "grid" },
  { slug: "timing", label: "Timing", icon: "clock" },
  { slug: "style", label: "Style", icon: "palette" },
  { slug: "render", label: "Render", icon: "film" },
];

type StepState = "done" | "current" | "available" | "locked";

/**
 * Pipeline progress. State is carried by a number, an icon and a word — never
 * by color alone (MASTER.md §9).
 */
export function ProjectNav({ project }: ProjectNavProps) {
  const pathname = usePathname();

  const hasMedia = project.assets.length > 0 || Boolean(project.audio.fileRef);
  const hasBeats = project.beats.length > 0;

  function stateOf(slug: string, isActive: boolean): StepState {
    if (isActive) return "current";
    if (slug === "import") return hasMedia ? "done" : "available";
    if (slug === "script") return hasBeats ? "done" : hasMedia ? "available" : "locked";
    return hasBeats ? "available" : "locked";
  }

  function lockReason(slug: string): string {
    if (slug === "script") return "Import media first";
    return "Split the script into beats first";
  }

  return (
    <div className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-frame flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            href="/"
            className="rounded-md text-label text-fg-muted transition-colors hover:text-fg"
          >
            Projects
          </Link>
          <Icon name="chevronRight" size={12} className="shrink-0 text-fg-subtle" />
          <h1 className="truncate text-body font-semibold text-fg">{project.name}</h1>
          <span className="shrink-0 rounded-sm border border-border bg-bg px-1.5 py-0.5 font-mono text-overline text-fg-muted">
            {project.output.aspect}
          </span>
        </div>

        {/* Scrolls inside itself so the page body never scrolls horizontally. */}
        <nav aria-label="Pipeline steps" className="-mx-1 overflow-x-auto px-1 pb-1 lg:pb-0">
          <ol className="flex items-center gap-1">
            {STEPS.map((step, i) => {
              const href = `/p/${project.id}/${step.slug}`;
              const isActive =
                pathname.endsWith(`/${step.slug}`) ||
                (step.slug === "import" && pathname === `/p/${project.id}`);
              const state = stateOf(step.slug, isActive);
              const locked = state === "locked";

              const content = (
                <>
                  <span
                    className={cx(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded-sm font-mono text-[10px] font-semibold",
                      state === "current" && "bg-accent-fg/20 text-accent-fg",
                      state === "done" && "bg-success-subtle text-success",
                      state === "available" && "bg-bg text-fg-subtle",
                      locked && "bg-bg text-fg-subtle",
                    )}
                  >
                    {state === "done" ? <Icon name="check" size={10} /> : i + 1}
                  </span>
                  {step.label}
                </>
              );

              const shared =
                "flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-label font-medium transition-colors";

              return (
                <li key={step.slug}>
                  {locked ? (
                    <span
                      aria-disabled="true"
                      title={lockReason(step.slug)}
                      className={cx(shared, "cursor-not-allowed text-fg-subtle")}
                    >
                      {content}
                    </span>
                  ) : (
                    <Link
                      href={href}
                      aria-current={state === "current" ? "step" : undefined}
                      className={cx(
                        shared,
                        state === "current"
                          ? "bg-accent text-accent-fg"
                          : "text-fg-muted hover:bg-accent-subtle hover:text-fg",
                      )}
                    >
                      {content}
                    </Link>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
      </div>
    </div>
  );
}
