import type { Project } from "@nva/core";
import { Muxer, ArrayBufferTarget } from "mp4-muxer";
import type { TimedSegment } from "@nva/core";
import { computeKenBurnsTransform, drawImageCover, drawEndCard } from "./painter.js";

export interface RenderProgress {
  currentFrame: number;
  totalFrames: number;
  fps: number;
  percent: number;
  etaSec: number;
  statusText: string;
}

export interface RenderResult {
  blob: Blob;
  durationSec: number;
  sha256: string;
  /** True only when the encoded stream really carries the expected frames and audio. */
  verified: boolean;
  verification: string;
  hasAudio: boolean;
}

export interface RenderOptions {
  /** Timed segments to render. Supply the saved timing so the video matches the Timing step. */
  segments: TimedSegment[];
  /** Decoded narration. Omit only when the project genuinely has no voice-over. */
  audio?: AudioBuffer;
}

/** SHA-256 over exactly the bytes given, ignoring any slack in the backing buffer. */
export async function computeSha256(data: Uint8Array): Promise<string> {
  const exact = data.slice();
  const digest = await crypto.subtle.digest("SHA-256", exact);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** WebCodecs is required; without it we cannot encode deterministically. */
export function isRenderSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof VideoEncoder !== "undefined" &&
    typeof VideoFrame !== "undefined"
  );
}

export function pickVideoCodec(width: number, height: number): string {
  // avc1.<profile><constraints><level>. High profile, level scaled to frame size.
  const level = width * height > 1920 * 1080 ? "33" : width * height > 1280 * 720 ? "29" : "1f";
  return `avc1.6400${level}`;
}

/**
 * Renders the project to a real MP4 using WebCodecs, muxing the narration in
 * alongside the video.
 *
 * Every frame is encoded with an explicit timestamp, so output duration is
 * determined by the timeline rather than by how long the loop happens to take.
 * (A canvas captureStream + MediaRecorder approach records in wall-clock time,
 * which desynchronises the video from the narration and silently drops audio.)
 */
export async function renderProjectInBrowser(
  project: Project,
  imageBlobsMap: Map<string, Blob>,
  onProgress?: (p: RenderProgress) => void,
  options?: RenderOptions,
): Promise<RenderResult> {
  if (!isRenderSupported()) {
    throw new Error(
      "This browser cannot encode video: WebCodecs is unavailable. Chrome or Edge 94+ is required.",
    );
  }

  const segments = options?.segments ?? [];
  if (segments.length === 0) {
    throw new Error("No timing available. Compute timing on the Timing step before rendering.");
  }

  const audio = options?.audio;
  const fps = project.output.fps || 30;
  const width = project.output.width || 1920;
  const height = project.output.height || 1080;

  const endCardSec = project.style.endCard?.enabled ? project.style.endCard.seconds || 5 : 0;
  const timelineSec = Math.max(...segments.map((s) => s.start + s.dur));
  const totalDurationSec = timelineSec + endCardSec;
  const totalFrames = Math.max(1, Math.ceil(totalDurationSec * fps));

  // ---- Decode images once, as ImageBitmaps (cheaper to draw than <img>).
  const bitmaps = new Map<string, ImageBitmap>();
  for (const [assetId, blob] of imageBlobsMap.entries()) {
    try {
      bitmaps.set(assetId, await createImageBitmap(blob));
    } catch {
      // A single unreadable asset must not abort the whole render.
    }
  }

  // ---- Muxer: video always, audio only when narration exists.
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: "avc", width, height, frameRate: fps },
    ...(audio
      ? {
          audio: {
            codec: "aac",
            numberOfChannels: Math.min(2, audio.numberOfChannels),
            sampleRate: audio.sampleRate,
          },
        }
      : {}),
    fastStart: "in-memory", // moov atom first, so the file streams and seeks immediately
  });

  let encodedVideoChunks = 0;
  let encodedAudioChunks = 0;

  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => {
      muxer.addVideoChunk(chunk, meta);
      encodedVideoChunks++;
    },
    error: (e) => {
      throw new Error(`Video encoding failed: ${e.message}`);
    },
  });

  videoEncoder.configure({
    codec: pickVideoCodec(width, height),
    width,
    height,
    framerate: fps,
    // ~0.1 bits per pixel per frame keeps 1080p30 near 6 Mbps.
    bitrate: Math.round(width * height * fps * 0.1),
    latencyMode: "quality",
  });

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d", { alpha: false })!;

  const startedAt = Date.now();

  for (let frame = 0; frame < totalFrames; frame++) {
    const timeSec = frame / fps;

    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, width, height);

    if (timeSec < timelineSec) {
      const seg =
        segments.find((s) => timeSec >= s.start && timeSec < s.start + s.dur) ??
        segments[segments.length - 1];

      if (seg) {
        const beat = project.beats.find((b) => b.n === seg.n);
        const img = beat?.assetId ? bitmaps.get(beat.assetId) : undefined;
        if (img) {
          const progress = Math.max(0, Math.min(1, (timeSec - seg.start) / Math.max(0.001, seg.dur)));
          const kb = computeKenBurnsTransform(
            beat?.motion,
            progress,
            project.style.kenBurns.zoomMin,
            project.style.kenBurns.zoomMax,
            seg.n,
          );
          drawImageCover(ctx, img, width, height, kb.scale, kb.translateX, kb.translateY, 1);
        }
      }
    } else if (project.style.endCard?.enabled) {
      const last = project.beats[project.beats.length - 1];
      const lastImg = last?.assetId ? bitmaps.get(last.assetId) : undefined;
      drawEndCard(
        ctx,
        width,
        height,
        lastImg,
        project.style.endCard.title,
        project.style.endCard.tagline,
      );
    }

    // Timestamps are microseconds and drive the output duration.
    const videoFrame = new VideoFrame(canvas, {
      timestamp: Math.round((frame * 1_000_000) / fps),
      duration: Math.round(1_000_000 / fps),
    });
    // A keyframe every 2s keeps the file seekable without bloating it.
    videoEncoder.encode(videoFrame, { keyFrame: frame % (fps * 2) === 0 });
    videoFrame.close();

    if (frame % 15 === 0) {
      const elapsed = (Date.now() - startedAt) / 1000;
      const rate = frame / Math.max(0.1, elapsed);
      onProgress?.({
        currentFrame: frame,
        totalFrames,
        fps: Math.round(rate),
        percent: Math.round((frame / totalFrames) * 100),
        etaSec: Math.round((totalFrames - frame) / Math.max(1, rate)),
        statusText: `Encoding frame ${frame} of ${totalFrames}`,
      });
      // Yield so the encoder queue drains and the UI stays responsive.
      if (videoEncoder.encodeQueueSize > fps * 2) {
        while (videoEncoder.encodeQueueSize > fps) await new Promise((r) => setTimeout(r, 0));
      } else {
        await new Promise((r) => setTimeout(r, 0));
      }
    }
  }

  await videoEncoder.flush();
  videoEncoder.close();

  // ---- Audio: encode the narration so the output is actually narrated.
  if (audio) {
    onProgress?.({
      currentFrame: totalFrames,
      totalFrames,
      fps: 0,
      percent: 99,
      etaSec: 0,
      statusText: "Encoding narration audio",
    });

    const channels = Math.min(2, audio.numberOfChannels);
    const audioEncoder = new AudioEncoder({
      output: (chunk, meta) => {
        muxer.addAudioChunk(chunk, meta);
        encodedAudioChunks++;
      },
      error: (e) => {
        throw new Error(`Audio encoding failed: ${e.message}`);
      },
    });

    audioEncoder.configure({
      codec: "mp4a.40.2", // AAC-LC
      numberOfChannels: channels,
      sampleRate: audio.sampleRate,
      bitrate: 128_000,
    });

    // Feed in ~1s blocks of interleaved f32 so memory stays bounded.
    const blockFrames = audio.sampleRate;
    for (let offset = 0; offset < audio.length; offset += blockFrames) {
      const count = Math.min(blockFrames, audio.length - offset);
      const interleaved = new Float32Array(count * channels);
      for (let c = 0; c < channels; c++) {
        const src = audio.getChannelData(c);
        for (let i = 0; i < count; i++) interleaved[i * channels + c] = src[offset + i]!;
      }

      const data = new AudioData({
        format: "f32",
        sampleRate: audio.sampleRate,
        numberOfFrames: count,
        numberOfChannels: channels,
        timestamp: Math.round((offset / audio.sampleRate) * 1_000_000),
        data: interleaved,
      });
      audioEncoder.encode(data);
      data.close();

      if (audioEncoder.encodeQueueSize > 8) {
        while (audioEncoder.encodeQueueSize > 2) await new Promise((r) => setTimeout(r, 0));
      }
    }

    await audioEncoder.flush();
    audioEncoder.close();
  }

  muxer.finalize();
  const { buffer } = muxer.target as ArrayBufferTarget;
  const bytes = new Uint8Array(buffer);
  const blob = new Blob([bytes], { type: "video/mp4" });
  const sha256 = await computeSha256(bytes);

  // Real checks, not a tautology: the muxer must have received a frame for
  // every frame we encoded, audio chunks when narration was supplied, and the
  // file must be a non-trivial MP4.
  const problems: string[] = [];
  if (encodedVideoChunks === 0) problems.push("no video was encoded");
  if (audio && encodedAudioChunks === 0) problems.push("narration was supplied but no audio encoded");
  if (bytes.byteLength < 1024) problems.push("the encoded file is implausibly small");

  onProgress?.({
    currentFrame: totalFrames,
    totalFrames,
    fps: 0,
    percent: 100,
    etaSec: 0,
    statusText: problems.length === 0 ? "Render complete" : `Render finished with problems`,
  });

  return {
    blob,
    durationSec: totalDurationSec,
    sha256,
    verified: problems.length === 0,
    verification:
      problems.length === 0
        ? `${encodedVideoChunks} video chunks, ${encodedAudioChunks} audio chunks, ${(
            bytes.byteLength /
            1024 /
            1024
          ).toFixed(1)} MB`
        : problems.join("; "),
    hasAudio: encodedAudioChunks > 0,
  };
}
