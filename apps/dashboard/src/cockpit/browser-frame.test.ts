import { expect, test } from "bun:test";
import { mapToPageCss, pageToCanvas } from "./browser-frame";

// The canvas→page inversion for a forwarded handoff click. Canvas is 800×600, the page is 1000×1000
// (square), so `contain` fits it to 600×600 with 100px letterbox bars on the left + right.
const CANVAS = { w: 800, h: 600 };
const PAGE = { w: 1000, h: 1000 };

test("a click in the LEFT letterbox bar maps to null (no page pixel there)", () => {
  // x=50 is inside the 0..100 left bar.
  expect(mapToPageCss({ x: 50, y: 300 }, CANVAS, PAGE)).toBeNull();
});

test("a click in the RIGHT letterbox bar maps to null", () => {
  // displayed image spans x∈[100,700]; x=760 is in the right bar.
  expect(mapToPageCss({ x: 760, y: 300 }, CANVAS, PAGE)).toBeNull();
});

test("a click IN the image maps to the right page-CSS coords", () => {
  // Center of the canvas → center of the page.
  expect(mapToPageCss({ x: 400, y: 300 }, CANVAS, PAGE)).toEqual({ x: 500, y: 500 });
  // Top-left corner of the displayed image (offX=100, offY=0) → page origin.
  expect(mapToPageCss({ x: 100, y: 0 }, CANVAS, PAGE)).toEqual({ x: 0, y: 0 });
});

test("pageToCanvas is the exact inverse of mapToPageCss for an in-image point", () => {
  const canvasPt = { x: 250, y: 180 };
  const page = mapToPageCss(canvasPt, CANVAS, PAGE);
  expect(page).not.toBeNull();
  if (page) expect(pageToCanvas(page, CANVAS, PAGE)).toEqual(canvasPt);
});
