import type { Asset } from "@nva/core";

/**
 * Computes a 64-bit difference hash (dHash) for an image blob using HTML Canvas.
 * Returns a 16-character hexadecimal string representing the 64-bit fingerprint.
 */
export async function computeImageHash(blob: Blob): Promise<string> {
  if (typeof window === "undefined") return "0000000000000000";

  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);

    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      canvas.width = 9;
      canvas.height = 8;
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        resolve("0000000000000000");
        return;
      }

      // Draw image scaled to 9x8
      ctx.drawImage(img, 0, 0, 9, 8);
      const imageData = ctx.getImageData(0, 0, 9, 8);
      const pixels = imageData.data;

      // Convert to grayscale values
      const grays: number[] = [];
      for (let i = 0; i < pixels.length; i += 4) {
        const r = pixels[i]!;
        const g = pixels[i + 1]!;
        const b = pixels[i + 2]!;
        grays.push(Math.round(0.299 * r + 0.587 * g + 0.114 * b));
      }

      // Compute bit differences row by row (8 rows of 8 comparisons = 64 bits)
      let hashBits = "";
      for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
          const left = grays[row * 9 + col]!;
          const right = grays[row * 9 + col + 1]!;
          hashBits += left > right ? "1" : "0";
        }
      }

      // Convert 64-bit binary string to 16 hex chars
      let hexHash = "";
      for (let i = 0; i < 64; i += 4) {
        const nibble = hashBits.slice(i, i + 4);
        hexHash += parseInt(nibble, 2).toString(16);
      }

      resolve(hexHash);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve("0000000000000000");
    };

    img.src = url;
  });
}

/**
 * Calculates the Hamming distance (number of differing bits) between two 16-hex-char hashes.
 */
export function hammingDistance(hash1: string, hash2: string): number {
  if (hash1.length !== hash2.length) return 64;

  let distance = 0;
  for (let i = 0; i < hash1.length; i++) {
    const v1 = parseInt(hash1[i]!, 16);
    const v2 = parseInt(hash2[i]!, 16);
    const xor = v1 ^ v2;
    // Count bits set in nibble
    distance += (xor & 1) + ((xor >> 1) & 1) + ((xor >> 2) & 1) + ((xor >> 3) & 1);
  }
  return distance;
}

export interface NearDuplicateGroup {
  originalId: string;
  variantIds: string[];
  similarityPct: number;
}

/**
 * Compares asset hashes and identifies near-duplicate image assets.
 * Returns map of asset ID to variant information.
 */
export function findNearDuplicates(
  assets: Asset[],
  hashesMap: Map<string, string>,
  maxDistance = 10,
): Map<string, NearDuplicateGroup> {
  const imageAssets = assets.filter((a) => a.kind === "image");
  const variantsMap = new Map<string, NearDuplicateGroup>();

  for (let i = 0; i < imageAssets.length; i++) {
    const assetA = imageAssets[i]!;
    const hashA = hashesMap.get(assetA.id);
    if (!hashA || hashA === "0000000000000000") continue;

    for (let j = i + 1; j < imageAssets.length; j++) {
      const assetB = imageAssets[j]!;
      const hashB = hashesMap.get(assetB.id);
      if (!hashB || hashB === "0000000000000000") continue;

      const dist = hammingDistance(hashA, hashB);
      if (dist <= maxDistance) {
        const similarityPct = Math.round(((64 - dist) / 64) * 100);

        // Record for Asset B that it is a variant of Asset A
        if (!variantsMap.has(assetB.id)) {
          variantsMap.set(assetB.id, {
            originalId: assetA.id,
            variantIds: [assetA.id],
            similarityPct,
          });
        }
      }
    }
  }

  return variantsMap;
}
