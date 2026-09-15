"use client";

import { use } from "react";
import { PageHeader, PageShell } from "@/components/PageHeader";
import { EmptyState } from "@/components/ui";

export default function StylePage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = use(paramsPromise);

  return (
    <PageShell>
      <PageHeader
        step="Step 5"
        title="Visual style & treatment"
        description="Transitions, Ken Burns zoom and pan presets, title and end cards."
        next={{ href: `/p/${params.id}/render`, label: "Next: Render" }}
      />

      <EmptyState
        icon="palette"
        title="Arrives in Phase 5"
        description="Per-project style configuration: transition type and duration, Ken Burns motion presets, and title and end card treatments."
      />
    </PageShell>
  );
}
