import type { Motion } from "@nva/core";

/**
 * Computes Ken Burns transform parameters for a given beat and normalized progress (0..1).
 */
export function computeKenBurnsTransform(
  motion: Motion | undefined,
  progress: number, // 0..1
  zoomMin = 1.035,
  zoomMax = 1.04,
  beatIndex = 0,
): { scale: number; translateX: number; translateY: number } {
  const chosenMotion = motion || (beatIndex % 2 === 0 ? "in" : "out");

  let scale = 1.0;
  let translateX = 0;
  let translateY = 0;

  const t = Math.max(0, Math.min(1, progress));

  switch (chosenMotion) {
    case "in":
      scale = zoomMin + (zoomMax - zoomMin) * t;
      break;
    case "out":
      scale = zoomMax - (zoomMax - zoomMin) * t;
      break;
    case "panLR":
      scale = zoomMin;
      translateX = (t - 0.5) * 0.04;
      break;
    case "panRL":
      scale = zoomMin;
      translateX = (0.5 - t) * 0.04;
      break;
    case "none":
    default:
      scale = 1.0;
      break;
  }

  return { scale, translateX, translateY };
}

/**
 * Draws an image fitted to cover the canvas with Ken Burns transform applied.
 */
export function drawImageCover(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  img: HTMLImageElement | ImageBitmap,
  canvasWidth: number,
  canvasHeight: number,
  scale: number,
  translateX: number,
  translateY: number,
  opacity = 1.0,
) {
  ctx.save();
  ctx.globalAlpha = opacity;

  const imgWidth = img.width;
  const imgHeight = img.height;

  const canvasAspect = canvasWidth / canvasHeight;
  const imgAspect = imgWidth / imgHeight;

  let drawWidth = canvasWidth;
  let drawHeight = canvasHeight;

  if (imgAspect > canvasAspect) {
    drawWidth = canvasHeight * imgAspect;
  } else {
    drawHeight = canvasWidth / imgAspect;
  }

  const baseDx = (canvasWidth - drawWidth) / 2;
  const baseDy = (canvasHeight - drawHeight) / 2;

  // Apply scale and translation transform
  const centerX = canvasWidth / 2;
  const centerY = canvasHeight / 2;

  ctx.translate(centerX + translateX * canvasWidth, centerY + translateY * canvasHeight);
  ctx.scale(scale, scale);
  ctx.translate(-centerX, -centerY);

  ctx.drawImage(img, baseDx, baseDy, drawWidth, drawHeight);
  ctx.restore();
}

/**
 * Draws End Card with SUBSCRIBE title + tagline and blurred/darkened background.
 */
export function drawEndCard(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  lastImage?: HTMLImageElement | ImageBitmap,
  title = "SUBSCRIBE",
  tagline = "",
) {
  ctx.save();

  if (lastImage) {
    // Draw last frame darkened
    drawImageCover(ctx, lastImage, canvasWidth, canvasHeight, 1.0, 0, 0, 1.0);
    ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  } else {
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  }

  // Draw End Card Title
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${Math.round(canvasHeight * 0.08)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(title, canvasWidth / 2, canvasHeight / 2 - 20);

  if (tagline) {
    ctx.fillStyle = "#d4d4d4";
    ctx.font = `${Math.round(canvasHeight * 0.04)}px sans-serif`;
    ctx.fillText(tagline, canvasWidth / 2, canvasHeight / 2 + 40);
  }

  ctx.restore();
}
