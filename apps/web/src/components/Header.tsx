"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./Icon";
import { ThemeToggle } from "./ThemeToggle";
import { cx } from "./ui";

const NAV = [
  { href: "/", label: "Projects" },
  { href: "/settings", label: "Settings" },
];

export function Header() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/85 backdrop-blur-sm">
      <div className="mx-auto flex h-12 max-w-frame items-center justify-between gap-6 px-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-md text-body font-semibold tracking-tight text-fg"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-fg text-bg">
            <Icon name="film" size={14} />
          </span>
          <span className="hidden sm:inline">Narrated Video Assembler</span>
          <span className="sm:hidden">NVA</span>
        </Link>

        <div className="flex items-center gap-4">
          <nav aria-label="Main" className="flex items-center gap-1">
            {NAV.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "rounded-md px-2.5 py-1.5 text-label font-medium transition-colors",
                    active
                      ? "bg-accent-subtle text-accent"
                      : "text-fg-muted hover:bg-surface hover:text-fg",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
