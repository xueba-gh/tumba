"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import type { Project } from "@nva/core";
import { getProject } from "@/lib/projectStorage";
import { computeCoverageReport, type CoverageReport } from "@/lib/matcher";
import { Icon } from "@/components/Icon";
import { PageHeader, PageShell } from "@/components/PageHeader";
import { Badge, Card, EmptyState } from "@/components/ui";

export default function RenderPage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = use(paramsPromise);
  const [project, setProject] = useState<Project | null>(null);
  const [coverage, setCoverage] = useState<CoverageReport | null>(null);

  useEffect(() => {
    async function load() {
      const proj = await getProject(params.id);
      if (!proj) return;
      setProject(proj);
      setCoverage(computeCoverageReport(proj));
    }
    void load();
  }, [params.id]);

  if (!project || !coverage) return null;

  // The spec gates rendering on complete coverage: a beat with no visual has
  // nothing to draw, so the render would silently produce a gap.
  const blocked = !coverage.isComplete;

  return (
    <PageShell>
      <PageHeader
        step="Step 6"
        title="Render output video"
        description="Encode the finished timeline to MP4 entirely in the browser."
      />

      {blocked ? (
        <Card className="flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="warning" icon="alert">
              Render blocked
            </Badge>
            <span className="tabular font-mono text-label text-fg-muted">
              {coverage.matchedBeats}/{coverage.totalBeats} beats matched
            </span>
          </div>

          <p className="max-w-prose text-body text-fg">
            {coverage.totalBeats === 0
              ? "This project has no beats yet. Split your script into beats, then match a visual to each one."
              : `Every beat needs a visual before the timeline can be encoded. ${
                  coverage.unmatchedBeats.length
                } beat${coverage.unmatchedBeats.length === 1 ? " is" : "s are"} still unmatched.`}
          </p>

          {coverage.unmatchedBeats.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-overline font-semibold uppercase text-fg-muted">
                Unmatched beats
              </span>
              <ul className="flex flex-wrap gap-1">
                {coverage.unmatchedBeats.map((n) => (
                  <li key={n}>
                    <span className="tabular flex h-5 min-w-5 items-center justify-center rounded-sm bg-warning-subtle px-1 font-mono text-overline font-semibold text-warning">
                      {n}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <Link
            href={`/p/${project.id}/${coverage.totalBeats === 0 ? "script" : "match"}`}
            className="inline-flex h-control w-fit cursor-pointer items-center gap-1.5 rounded-md bg-accent px-3 text-label font-medium text-accent-fg transition-opacity hover:opacity-90"
          >
            <Icon name="arrowRight" size={14} />
            {coverage.totalBeats === 0 ? "Go to script" : "Finish matching"}
          </Link>
        </Card>
      ) : (
        <EmptyState
          icon="film"
          title="Arrives in Phase 5"
          description="Coverage is complete, so this project is ready to encode. The WebCodecs rendering engine writes MP4 locally, with no upload and no server round-trip."
        />
      )}
    </PageShell>
  );
}
