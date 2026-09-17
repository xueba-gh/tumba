import type { Asset, Beat, Project } from "@nva/core";
import {
  buildMatchingVisionRequest,
  parseMatchingResponse,
  type MatchCandidate,
  type MatchBeat,
} from "@nva/ai";
import type { AIProvider } from "@nva/ai";
import { getAssetBlob } from "@/lib/projectStorage";

/**
 * Extracts a beat number from an asset filename if it begins with numeric prefixes.
 * Examples: "01_hero.png" -> 1, "beat-02-scene.jpg" -> 2, "03.webp" -> 3, "12_dark.png" -> 12.
 */
export function extractNumberFromFilename(fileName: string): number | null {
  const cleanName = fileName.trim();
  const match = cleanName.match(/^(?:beat[-_\s]*)?0*(\d+)[-_\s.]/i) || cleanName.match(/^0*(\d+)\./);
  if (match && match[1]) {
    const num = parseInt(match[1], 10);
    return isNaN(num) || num <= 0 ? null : num;
  }
  return null;
}

/**
 * Perform deterministic Match-by-Number.
 * For each beat n, finds an asset whose filename starts with n (e.g. 01_..., 02_...).
 */
export function matchByNumber(beats: Beat[], assets: Asset[]): { beats: Beat[]; matchedCount: number } {
  const imageAssets = assets.filter((a) => !a.spare && (a.kind === "image" || a.kind === "clip"));
  const numberToAssetMap = new Map<number, Asset>();

  for (const asset of imageAssets) {
    const num = extractNumberFromFilename(asset.name);
    if (num !== null && !numberToAssetMap.has(num)) {
      numberToAssetMap.set(num, asset);
    }
  }

  let matchedCount = 0;
  const updatedBeats = beats.map((beat) => {
    const matchedAsset = numberToAssetMap.get(beat.n);
    if (matchedAsset) {
      matchedCount++;
      return {
        ...beat,
        assetId: matchedAsset.id,
        confidence: 1.0,
      };
    }
    return beat;
  });

  return { beats: updatedBeats, matchedCount };
}

/**
 * Resizes an image Blob to 512px max dimension and returns JPEG Base64 data string (q70).
 */
export async function resizeImageToThumbnailB64(blob: Blob): Promise<{ b64: string; mime: string }> {
  if (typeof window === "undefined") return { b64: "", mime: "image/jpeg" };

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);

    img.onload = () => {
      URL.revokeObjectURL(url);
      const maxDim = 512;
      let width = img.naturalWidth;
      let height = img.naturalHeight;

      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, width);
      canvas.height = Math.max(1, height);
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        reject(new Error("Canvas 2D context unavailable"));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
      const b64 = dataUrl.replace(/^data:image\/jpeg;base64,/, "");
      resolve({ b64, mime: "image/jpeg" });
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed loading image for thumbnail generation"));
    };

    img.src = url;
  });
}

/** Carries the provider's replies so the UI can show what actually came back. */
export class MatchingError extends Error {
  constructor(
    message: string,
    public readonly rawResponses: string[],
  ) {
    super(message);
    this.name = "MatchingError";
  }
}

export interface MatchByAiProgress {
  currentBatch: number;
  totalBatches: number;
  statusText: string;
}

/**
 * Perform AI Vision-based image-to-beat matching.
 * Converts unmatched candidate images to 512px thumbnails and queries vision AI provider.
 */
export interface MatchByAiOptions {
  /**
   * When true (the default), only beats without an assetId are matched, and
   * only candidates not already in use are offered. This keeps manual work
   * intact and keeps the image payload — the expensive part — as small as
   * possible. Pass false to re-match everything from scratch.
   */
  onlyUnmatched?: boolean;
}

export async function matchByAiVision(
  project: Project,
  provider: AIProvider,
  onProgress?: (p: MatchByAiProgress) => void,
  options: MatchByAiOptions = {},
): Promise<{
  beats: Beat[];
  notes: string;
  matchedCount: number;
  failures: string[];
  /** Verbatim provider replies. The request goes browser->provider, so this is
   *  the only place the response can be inspected after the fact. */
  rawResponses: string[];
}> {
  const { onlyUnmatched = true } = options;

  const usedAssetIds = new Set(
    project.beats.map((b) => b.assetId).filter((id): id is string => Boolean(id)),
  );

  const candidateAssets = project.assets.filter((a) => {
    if (a.spare || (a.kind !== "image" && a.kind !== "clip")) return false;
    return onlyUnmatched ? !usedAssetIds.has(a.id) : true;
  });

  const targetBeats = onlyUnmatched ? project.beats.filter((b) => !b.assetId) : project.beats;

  if (targetBeats.length === 0) {
    throw new Error("Every beat already has a candidate assigned.");
  }

  if (candidateAssets.length === 0) {
    throw new Error(
      onlyUnmatched
        ? "No unused candidates left to match. Import more images, or unassign some beats."
        : "No candidate assets available for matching.",
    );
  }

  onProgress?.({
    currentBatch: 1,
    totalBatches: 1,
    statusText: "Generating 512px thumbnails for candidate images…",
  });

  const matchCandidates: MatchCandidate[] = [];
  const candidateIdMap = new Map<number, string>();

  for (let i = 0; i < candidateAssets.length; i++) {
    const asset = candidateAssets[i]!;
    candidateIdMap.set(i + 1, asset.id);
    const blob = await getAssetBlob(project.id, asset.fileRef);
    if (!blob) continue;

    try {
      const { b64, mime } = await resizeImageToThumbnailB64(blob);
      matchCandidates.push({
        index: i + 1,
        fileName: asset.name,
        b64,
        mime,
      });
    } catch (e) {
      console.warn(`Failed resizing thumbnail for ${asset.name}:`, e);
    }
  }

  const matchBeats: MatchBeat[] = targetBeats.map((b) => ({
    n: b.n,
    excerpt: b.text,
    prompt: b.prompt || b.text,
  }));

  // Batch candidates if count exceeds maxImagesPerRequest
  const batchSize = Math.max(1, provider.maxImagesPerRequest || 16);
  const totalBatches = Math.ceil(matchCandidates.length / batchSize);
  const aggregatedNotes: string[] = [];
  const failures: string[] = [];
  const rawResponses: string[] = [];

  const finalMatches = new Map<number, number>(); // beatN -> candidateIndex
  const finalConfidence = new Map<number, number>(); // beatN -> confidence

  for (let b = 0; b < totalBatches; b++) {
    const batchCandidates = matchCandidates.slice(b * batchSize, (b + 1) * batchSize);

    onProgress?.({
      currentBatch: b + 1,
      totalBatches,
      statusText: `Querying Vision AI (Batch ${b + 1} of ${totalBatches})…`,
    });

    const visionReq = buildMatchingVisionRequest(batchCandidates, matchBeats);
    const rawRes = await provider.vision(visionReq);
    rawResponses.push(rawRes);

    // One bad batch should not lose the others; collect and report instead.
    let result;
    try {
      result = parseMatchingResponse(rawRes);
    } catch (err) {
      failures.push(
        `Batch ${b + 1} of ${totalBatches}: ${err instanceof Error ? err.message : String(err)}`,
      );
      continue;
    }

    if (result.notes) aggregatedNotes.push(result.notes);

    for (const [beatStr, candIdx] of Object.entries(result.matches)) {
      const beatN = parseInt(beatStr, 10);
      if (!isNaN(beatN) && typeof candIdx === "number") {
        finalMatches.set(beatN, candIdx);
        if (result.confidence && result.confidence[beatStr] !== undefined) {
          finalConfidence.set(beatN, result.confidence[beatStr]!);
        }
      }
    }
  }

  let matchedCount = 0;
  const unknownIndices = new Set<number>();

  const updatedBeats = project.beats.map((beat) => {
    const matchedIndex = finalMatches.get(beat.n);
    if (matchedIndex !== undefined) {
      const assetId = candidateIdMap.get(matchedIndex);
      if (assetId) {
        matchedCount++;
        return {
          ...beat,
          assetId,
          confidence: finalConfidence.get(beat.n) ?? 0.85,
        };
      }
      // The model named an image number that was never sent.
      unknownIndices.add(matchedIndex);
    }
    return beat;
  });

  if (unknownIndices.size > 0) {
    failures.push(
      `The model referenced image numbers that were not sent: ${[...unknownIndices]
        .sort((a, b) => a - b)
        .join(", ")}.`,
    );
  }

  // Reporting "finished" after assigning nothing is how a broken response
  // looks like a successful run. Fail loudly instead.
  if (matchedCount === 0) {
    const detail = failures.length > 0 ? ` ${failures.join(" ")}` : "";
    throw new MatchingError(
      `The model returned a reply but none of it could be applied to a beat.${detail}`,
      rawResponses,
    );
  }

  return {
    beats: updatedBeats,
    notes: aggregatedNotes.join("\n"),
    matchedCount,
    failures,
    rawResponses,
  };
}

/**
 * Computes coverage metrics for the project's match review grid.
 */
export interface CoverageReport {
  totalBeats: number;
  matchedBeats: number;
  unmatchedBeats: number[];
  unusedAssets: Asset[];
  duplicateAssetIds: Map<string, number[]>; // assetId -> array of beat Ns using it
  coveragePercent: number;
  isComplete: boolean;
}

export function computeCoverageReport(project: Project): CoverageReport {
  const totalBeats = project.beats.length;
  const matchedBeats = project.beats.filter((b) => !!b.assetId).length;
  const unmatchedBeats = project.beats.filter((b) => !b.assetId).map((b) => b.n);

  const usedAssetIds = new Set(project.beats.map((b) => b.assetId).filter(Boolean));
  const unusedAssets = project.assets.filter(
    (a) => !a.spare && (a.kind === "image" || a.kind === "clip") && !usedAssetIds.has(a.id),
  );

  const assetUsageMap = new Map<string, number[]>();
  for (const beat of project.beats) {
    if (beat.assetId) {
      const list = assetUsageMap.get(beat.assetId) || [];
      list.push(beat.n);
      assetUsageMap.set(beat.assetId, list);
    }
  }

  const duplicateAssetIds = new Map<string, number[]>();
  for (const [assetId, beats] of assetUsageMap.entries()) {
    if (beats.length > 1) {
      duplicateAssetIds.set(assetId, beats);
    }
  }

  const coveragePercent = totalBeats > 0 ? Math.round((matchedBeats / totalBeats) * 100) : 0;
  const isComplete = totalBeats > 0 && matchedBeats === totalBeats;

  return {
    totalBeats,
    matchedBeats,
    unmatchedBeats,
    unusedAssets,
    duplicateAssetIds,
    coveragePercent,
    isComplete,
  };
}
