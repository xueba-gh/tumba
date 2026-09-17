/**
 * Web Worker entry point for the browser renderer.
 *
 * Receives a project + image blobs + timing segments via postMessage,
 * runs renderProjectInBrowser on the worker thread, and posts progress
 * updates and the final result back to the main thread.
 *
 * This keeps the main thread free — 9-minute renders no longer freeze the tab.
 */

import type { Project, TimedSegment } from "@nva/core";
import { renderProjectInBrowser, type RenderProgress, type RenderResult } from "./renderEngine.js";

export interface WorkerInput {
  project: Project;
  /** Map serialised as [assetId, ArrayBuffer][] — Blobs can't cross the wire. */
  imageEntries: [string, ArrayBuffer][];
  segments: TimedSegment[];
  /** Raw audio bytes (e.g. from AudioBuffer → WAV). Omit for silent renders. */
  audioBuffer?: ArrayBuffer;
  audioChannels?: number;
  audioSampleRate?: number;
}

export interface WorkerProgressMsg {
  type: "progress";
  progress: RenderProgress;
}

export interface WorkerResultMsg {
  type: "result";
  /** The finished MP4 as an ArrayBuffer (transferred, zero-copy). */
  mp4: ArrayBuffer;
  durationSec: number;
  sha256: string;
  verified: boolean;
  verification: string;
  hasAudio: boolean;
}

export interface WorkerErrorMsg {
  type: "error";
  message: string;
}

export type WorkerOutMsg = WorkerProgressMsg | WorkerResultMsg | WorkerErrorMsg;

// Minimal worker-scope shape; the WebWorker lib conflicts with DOM in this tsconfig.
interface WorkerScope {
  onmessage: ((event: MessageEvent<WorkerInput>) => void) | null;
  postMessage(message: WorkerOutMsg, transfer?: Transferable[]): void;
}

const ctx = globalThis as unknown as WorkerScope;

ctx.onmessage = async (event: MessageEvent<WorkerInput>) => {
  try {
    const { project, imageEntries, segments, audioBuffer, audioChannels, audioSampleRate } =
      event.data;

    // Reconstruct Blobs from transferred ArrayBuffers.
    const imageBlobsMap = new Map<string, Blob>();
    for (const [assetId, buf] of imageEntries) {
      imageBlobsMap.set(assetId, new Blob([buf]));
    }

    // Reconstruct AudioBuffer if audio was provided.
    let audio: AudioBuffer | undefined;
    if (audioBuffer && audioChannels && audioSampleRate) {
      const totalSamples = audioBuffer.byteLength / (4 * audioChannels); // f32
      // OfflineAudioContext is available in Workers.
      const offCtx = new OfflineAudioContext(audioChannels, totalSamples, audioSampleRate);
      audio = offCtx.createBuffer(audioChannels, totalSamples, audioSampleRate);
      const src = new Float32Array(audioBuffer);
      for (let ch = 0; ch < audioChannels; ch++) {
        const channelData = audio.getChannelData(ch);
        for (let i = 0; i < totalSamples; i++) {
          channelData[i] = src[i * audioChannels + ch]!;
        }
      }
    }

    const result: RenderResult = await renderProjectInBrowser(
      project,
      imageBlobsMap,
      (p: RenderProgress) => {
        ctx.postMessage({ type: "progress", progress: p } satisfies WorkerProgressMsg);
      },
      { segments, audio },
    );

    // Transfer the blob as an ArrayBuffer for zero-copy.
    const mp4 = await result.blob.arrayBuffer();
    ctx.postMessage(
      {
        type: "result",
        mp4,
        durationSec: result.durationSec,
        sha256: result.sha256,
        verified: result.verified,
        verification: result.verification,
        hasAudio: result.hasAudio,
      } satisfies WorkerResultMsg,
      [mp4],
    );
  } catch (err) {
    ctx.postMessage({
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    } satisfies WorkerErrorMsg);
  }
};
