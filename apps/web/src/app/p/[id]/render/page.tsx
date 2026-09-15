"use client";

import { PageHeader, PageShell } from "@/components/PageHeader";
import { EmptyState } from "@/components/ui";

export default function RenderPage() {
  return (
    <PageShell>
      <PageHeader
        step="Step 6"
        title="Render output video"
        description="Encode the finished timeline to MP4 entirely in the browser."
      />

      <EmptyState
        icon="film"
        title="Arrives in Phase 5"
        description="The WebCodecs rendering engine encodes the assembled timeline to MP4 locally, with no upload and no server round-trip."
      />
    </PageShell>
  );
}
