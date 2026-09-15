import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-16">
      <h1 className="text-2xl font-semibold">Narrated Video Assembler</h1>
      <p className="text-neutral-600 dark:text-neutral-400">
        Projects list lands in Phase 2. For now, start by adding an AI provider
        in Settings.
      </p>
      <Link
        href="/settings"
        className="w-fit rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-neutral-900"
      >
        Go to Settings
      </Link>
    </main>
  );
}
