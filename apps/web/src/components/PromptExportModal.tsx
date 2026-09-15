"use client";

import { useEffect, useState } from "react";
import type { Beat } from "@nva/core";
import { Button, Modal, cx } from "./ui";

interface PromptExportModalProps {
  beats: Beat[];
  onClose: () => void;
}

const FORMATS = [
  { value: "txt", label: "Plain text" },
  { value: "json", label: "JSON" },
] as const;

type Format = (typeof FORMATS)[number]["value"];

export function PromptExportModal({ beats, onClose }: PromptExportModalProps) {
  const [format, setFormat] = useState<Format>("txt");
  const [copied, setCopied] = useState(false);

  const content =
    format === "txt"
      ? beats.map((b) => `${String(b.n).padStart(3, "0")}: ${b.prompt || b.text}`).join("\n\n")
      : JSON.stringify(
          beats.map((b) => ({ beat: b.n, text: b.text, prompt: b.prompt || b.text })),
          null,
          2,
        );

  // Reset the transient "Copied" confirmation without leaking a timer.
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  async function copyToClipboard() {
    await navigator.clipboard.writeText(content);
    setCopied(true);
  }

  function downloadFile() {
    const blob = new Blob([content], {
      type: format === "txt" ? "text/plain" : "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `prompts_export.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Export prompts"
      description="Numbered image prompts for Midjourney, Flux, Stable Diffusion, and similar tools."
      footer={
        <>
          <span className="mr-auto tabular font-mono text-label text-fg-muted">
            {beats.length} prompts
          </span>
          <Button onClick={onClose}>Close</Button>
          <Button icon={copied ? "check" : "copy"} onClick={() => void copyToClipboard()}>
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button variant="primary" icon="download" onClick={downloadFile}>
            Download .{format}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div
          role="radiogroup"
          aria-label="Export format"
          className="flex w-fit items-center gap-0.5 rounded-md border border-border bg-bg p-0.5"
        >
          {FORMATS.map((f) => {
            const active = format === f.value;
            return (
              <button
                key={f.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setFormat(f.value)}
                className={cx(
                  "cursor-pointer rounded-sm px-2.5 py-1 text-label font-medium transition-colors",
                  active
                    ? "bg-accent text-accent-fg"
                    : "text-fg-muted hover:bg-surface hover:text-fg",
                )}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        <label htmlFor="prompt-export-output" className="sr-only">
          Generated prompt export
        </label>
        <textarea
          id="prompt-export-output"
          value={content}
          readOnly
          spellCheck={false}
          className="h-80 w-full resize-none rounded-md border border-border bg-bg p-3 font-mono text-label leading-relaxed text-fg"
        />
      </div>
    </Modal>
  );
}
