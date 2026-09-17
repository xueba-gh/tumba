/**
 * Main-thread client for the render Web Worker.
 *
 * Wraps the postMessage/onmessage dance into a clean async API:
 *
 *   const { blob, sha256 } = await renderInWorker(project, images, segments, audio, onProgress);
 *
 * Falls back to calling renderProjectInBrowser directly on the main thread
 * if the browser doesn't support Worker + OffscreenCanvas transfer.
 */

import type { Project, TimedSegment } from "@nva/core";
import { renderProjectInBrowser, type RenderProgress, type RenderResult } from "./renderEngine.js";
import type { WorkerInput, WorkerOutMsg } from "./renderWorker.js";

/** Whether the current browser can run the render in a Web Worker. */
export function isWorkerRenderSupported(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof Worker === "undefined") return false;
  // OffscreenCanvas must be transferable to a worker.
  try {
    const c = new OffscreenCanvas(1, 1);
    // Check that 2d context is available (some browsers have OffscreenCanvas
    // but only support WebGL, not 2d).
    const ctx = c.getContext("2d");
    if (!ctx) return false;
  } catch {
    return false;
  }
  return true;
}

/**
 * Serialise an AudioBuffer into a flat interleaved Float32Array that the
 * worker can reconstruct.  The result is transferred (not copied).
 */
function flattenAudioBuffer(
  audio: AudioBuffer,
): { buffer: ArrayBuffer; channels: number; sampleRate: number } {
  const channels = Math.min(2, audio.numberOfChannels);
  const interleaved = new Float32Array(audio.length * channels);
  for (let ch = 0; ch < channels; ch++) {
    const src = audio.getChannelData(ch);
    for (let i = 0; i < audio.length; i++) {
      interleaved[i * channels + ch] = src[i]!;
    }
  }
  return { buffer: interleaved.buffer, channels, sampleRate: audio.sampleRate };
}

export interface RenderInWorkerOptions {
  /**
   * URL to the compiled worker script.  In Next.js you can use
   * `new URL("@nva/render-web/src/renderWorker.js", import.meta.url)`.
   * If omitted, falls back to main-thread rendering.
   */
  workerUrl?: URL;
}

/**
 * Render a project to MP4, preferring a Web Worker to keep the UI responsive.
 *
 * If `workerUrl` is provided and the browser supports workers, the render runs
 * off the main thread.  Otherwise it falls back to calling
 * `renderProjectInBrowser` directly (still works, but may freeze the tab).
 */
export async function renderInWorker(
  project: Project,
  imageBlobs: Map<string, Blob>,
  segments: TimedSegment[],
  audio?: AudioBuffer,
  onProgress?: (p: RenderProgress) => void,
  options?: RenderInWorkerOptions,
): Promise<RenderResult> {
  const useWorker = options?.workerUrl && isWorkerRenderSupported();

  if (!useWorker) {
    // Fallback: main-thread render (preserves existing behaviour).
    return renderProjectInBrowser(project, imageBlobs, onProgress, { segments, audio });
  }

  return new Promise<RenderResult>((resolve, reject) => {
    const worker = new Worker(options!.workerUrl!, { type: "module" });

    worker.onmessage = (event: MessageEvent<WorkerOutMsg>) => {
      const msg = event.data;
      switch (msg.type) {
        case "progress":
          onProgress?.(msg.progress);
          break;
        case "result":
          worker.terminate();
          resolve({
            blob: new Blob([msg.mp4], { type: "video/mp4" }),
            durationSec: msg.durationSec,
            sha256: msg.sha256,
            verified: msg.verified,
            verification: msg.verification,
            hasAudio: msg.hasAudio,
          });
          break;
        case "error":
          worker.terminate();
          reject(new Error(msg.message));
          break;
      }
    };

    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(`Render worker error: ${event.message}`));
    };

    // Serialise inputs — Blobs and AudioBuffer can't cross the wire directly.
    const imageEntries: [string, ArrayBuffer][] = [];
    const transfers: Transferable[] = [];

    // We need to convert Blobs to ArrayBuffers.  This is async so we do it
    // here and then post.
    void (async () => {
      try {
        for (const [assetId, blob] of imageBlobs) {
          const buf = await blob.arrayBuffer();
          imageEntries.push([assetId, buf]);
          transfers.push(buf);
        }

        let audioFlat:
          | { buffer: ArrayBuffer; channels: number; sampleRate: number }
          | undefined;
        if (audio) {
          audioFlat = flattenAudioBuffer(audio);
          transfers.push(audioFlat.buffer);
        }

        const input: WorkerInput = {
          project,
          imageEntries,
          segments,
          audioBuffer: audioFlat?.buffer,
          audioChannels: audioFlat?.channels,
          audioSampleRate: audioFlat?.sampleRate,
        };

        worker.postMessage(input, transfers);
      } catch (err) {
        worker.terminate();
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    })();
  });
}
