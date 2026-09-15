/**
 * Extracts exact audio duration and normalized waveform peaks from an audio blob.
 */
export async function extractAudioPeaks(
  blob: Blob,
  numPeaks = 200,
): Promise<{ durationSec: number; peaks: number[] }> {
  if (typeof window === "undefined") {
    return { durationSec: 0, peaks: new Array(numPeaks).fill(0.1) };
  }

  try {
    const arrayBuffer = await blob.arrayBuffer();
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) {
      return { durationSec: 0, peaks: new Array(numPeaks).fill(0.1) };
    }

    const audioCtx = new AudioCtx();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    const durationSec = audioBuffer.duration;

    const channelData = audioBuffer.getChannelData(0); // Use first channel
    const step = Math.floor(channelData.length / numPeaks);
    const peaks: number[] = [];

    for (let i = 0; i < numPeaks; i++) {
      const start = i * step;
      let max = 0;
      for (let j = 0; j < step; j++) {
        const val = Math.abs(channelData[start + j] || 0);
        if (val > max) max = val;
      }
      peaks.push(max);
    }

    // Normalize peaks between 0 and 1
    const highest = Math.max(...peaks, 0.01);
    const normalized = peaks.map((p) => Math.min(1, Math.max(0.05, p / highest)));

    audioCtx.close();
    return { durationSec, peaks: normalized };
  } catch (e) {
    console.warn("Failed to decode audio data for waveform peaks:", e);
    return { durationSec: 0, peaks: new Array(numPeaks).fill(0.2) };
  }
}
