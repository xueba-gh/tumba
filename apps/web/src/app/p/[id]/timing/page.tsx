"use client";

import { use } from "react";
import { PageHeader, PageShell } from "@/components/PageHeader";
import { EmptyState } from "@/components/ui";

export default function TimingPage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = use(paramsPromise);

  return (
    <PageShell>
      <PageHeader
        step="Step 4"
        title="Narration timing & alignment"
        description="Align beats to the narration waveform and tune hold durations."
        next={{ href: `/p/${params.id}/style`, label: "Next: Style" }}
      />

      <EmptyState
        icon="clock"
        title="Arrives in Phase 4"
        description="In-browser Whisper alignment, waveform beat editing, and the playback speed control land here."
      />
    </PageShell>
  );
}
