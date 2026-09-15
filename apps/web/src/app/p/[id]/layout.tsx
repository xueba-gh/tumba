"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import type { Project } from "@nva/core";
import { getProject, onProjectSaved } from "@/lib/projectStorage";
import { ProjectNav } from "@/components/ProjectNav";
import { EmptyState } from "@/components/ui";

export default function ProjectLayout({
  children,
  params: paramsPromise,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const params = use(paramsPromise);
  const [project, setProject] = useState<Project | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "missing">("loading");

  useEffect(() => {
    let active = true;
    async function fetchProject() {
      setStatus("loading");
      const proj = await getProject(params.id);
      if (!active) return;
      if (!proj) {
        setStatus("missing");
        return;
      }
      setProject(proj);
      setStatus("ready");
    }
    void fetchProject();
    return () => {
      active = false;
    };
  }, [params.id]);

  // Step pages own the project data and save it themselves; without this the
  // pipeline nav would keep showing the state from this layout's first mount.
  useEffect(
    () =>
      onProjectSaved((saved) => {
        if (saved.id === params.id) setProject(saved);
      }),
    [params.id],
  );

  if (status === "loading") {
    // Fixed-height skeleton matching the loaded layout, so nothing shifts.
    return (
      <div>
        <div className="h-[57px] border-b border-border bg-surface" />
        <div className="mx-auto max-w-frame px-4 py-6 sm:px-6">
          <div className="h-5 w-48 animate-pulse rounded-sm bg-surface" />
        </div>
      </div>
    );
  }

  if (status === "missing" || !project) {
    return (
      <div className="mx-auto max-w-frame px-4 py-12 sm:px-6">
        <EmptyState
          icon="alert"
          title="Project not found"
          description="This project may have been deleted, or opened in a different browser — projects are stored locally on each device."
          action={
            <Link
              href="/"
              className="inline-flex h-control cursor-pointer items-center rounded-md bg-accent px-3 text-label font-medium text-accent-fg transition-opacity hover:opacity-90"
            >
              Back to projects
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-3rem)] flex-col">
      <ProjectNav project={project} />
      <div className="flex-1">{children}</div>
    </div>
  );
}
