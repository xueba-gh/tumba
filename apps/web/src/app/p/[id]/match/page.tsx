"use client";

import { use } from "react";
import { PageHeader, PageShell } from "@/components/PageHeader";
import { EmptyState } from "@/components/ui";

export default function MatchPage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = use(paramsPromise);

  return (
    <PageShell>
      <PageHeader
        step="Step 3"
        title="Match images to beats"
        description="Pair each beat with the image or clip that illustrates it, by number or with AI vision."
        next={{ href: `/p/${params.id}/timing`, label: "Next: Timing" }}
      />

      <EmptyState
        icon="grid"
        title="Arrives in Phase 3"
        description="The match grid pairs beats with assets by number, and AI vision proposes matches for the ones you have not assigned."
      />
    </PageShell>
  );
}
