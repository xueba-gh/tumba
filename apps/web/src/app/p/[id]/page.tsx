"use client";

import { useEffect, use } from "react";
import { useRouter } from "next/navigation";

export default function ProjectPage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = use(paramsPromise);
  const router = useRouter();

  useEffect(() => {
    router.replace(`/p/${params.id}/import`);
  }, [params.id, router]);

  return null;
}
