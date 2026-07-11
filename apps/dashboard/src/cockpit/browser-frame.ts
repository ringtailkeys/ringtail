/**
 * Frame geometry for the live-browser view (Increment 2). The daemon streams JPEG/PNG frames of
 * the real page over the session WS; we paint them onto a canvas with `object-fit: contain` (so the
 * page's aspect ratio is preserved and the canvas letterboxes). When the human takes over during a
 * handoff, a click on the CANVAS must be mapped back to a coordinate in the PAGE's own pixel space
 * to forward it — `mapToPageCss` is that inversion (and returns null for a click that lands in the
 * letterbox bars, which correspond to no page pixel).
 *
 * Pure + framework-free so it's unit-testable with no DOM (see browser-frame.test.ts).
 */

export interface Size {
  w: number;
  h: number;
}
export interface Point {
  x: number;
  y: number;
}

/** The on-canvas rectangle an `object-fit: contain` image occupies (letterboxed + centered). */
export interface ContainRect {
  /** Uniform scale from page pixels → canvas pixels. */
  scale: number;
  /** Left/top letterbox offset (px) inside the canvas. */
  offX: number;
  offY: number;
  /** Displayed image size (px) on the canvas. */
  dispW: number;
  dispH: number;
}

/** Where a page-sized image sits inside a canvas under `object-fit: contain`. */
export function containRect(canvas: Size, page: Size): ContainRect {
  const scale = Math.min(canvas.w / page.w, canvas.h / page.h);
  const dispW = page.w * scale;
  const dispH = page.h * scale;
  return {
    scale,
    dispW,
    dispH,
    offX: (canvas.w - dispW) / 2,
    offY: (canvas.h - dispH) / 2,
  };
}

/**
 * Map a click at canvas CSS coords `click` → the PAGE's own pixel coords, or null if the click
 * landed in the letterbox (outside the displayed image). This is the inverse of the contain paint:
 * frames go page→canvas, a forwarded click goes canvas→page.
 */
export function mapToPageCss(click: Point, canvas: Size, page: Size): Point | null {
  const { scale, offX, offY, dispW, dispH } = containRect(canvas, page);
  const x = click.x - offX;
  const y = click.y - offY;
  // In the letterbox bars → no page pixel under the cursor.
  if (x < 0 || y < 0 || x > dispW || y > dispH) return null;
  return { x: x / scale, y: y / scale };
}

/** Forward: a page coordinate (e.g. Rocco's cursor position from the WS) → canvas CSS coords, so
 * the mascot overlay lands exactly on the on-canvas pixel the agent is pointing at. */
export function pageToCanvas(page: Point, canvas: Size, pageSize: Size): Point {
  const { scale, offX, offY } = containRect(canvas, pageSize);
  return { x: offX + page.x * scale, y: offY + page.y * scale };
}
