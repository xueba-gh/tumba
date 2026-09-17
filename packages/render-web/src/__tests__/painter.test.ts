import { describe, it, expect } from "vitest";
import { computeKenBurnsTransform } from "../painter.js";

describe("computeKenBurnsTransform", () => {
  const ZOOM_MIN = 1.035;
  const ZOOM_MAX = 1.04;

  describe("spec constants", () => {
    it("defaults to zoomMin=1.035 and zoomMax=1.04 per 04_RENDER_PIPELINE_REFERENCE.md", () => {
      // Verify the default parameters match the spec constants.
      const atStart = computeKenBurnsTransform(undefined, 0);
      const atEnd = computeKenBurnsTransform(undefined, 1);
      // Even beat (0) defaults to "in" => starts at zoomMin, ends at zoomMax.
      expect(atStart.scale).toBeCloseTo(1.035);
      expect(atEnd.scale).toBeCloseTo(1.04);
    });
  });

  describe("zoom-in motion", () => {
    it("starts at zoomMin", () => {
      const r = computeKenBurnsTransform("in", 0, ZOOM_MIN, ZOOM_MAX, 0);
      expect(r.scale).toBeCloseTo(ZOOM_MIN);
    });

    it("ends at zoomMax (completes exactly at beat end)", () => {
      const r = computeKenBurnsTransform("in", 1, ZOOM_MIN, ZOOM_MAX, 0);
      expect(r.scale).toBeCloseTo(ZOOM_MAX);
    });

    it("progresses linearly at 50%", () => {
      const r = computeKenBurnsTransform("in", 0.5, ZOOM_MIN, ZOOM_MAX, 0);
      const expected = ZOOM_MIN + (ZOOM_MAX - ZOOM_MIN) * 0.5;
      expect(r.scale).toBeCloseTo(expected);
    });

    it("has no translation", () => {
      const r = computeKenBurnsTransform("in", 0.5, ZOOM_MIN, ZOOM_MAX, 0);
      expect(r.translateX).toBe(0);
      expect(r.translateY).toBe(0);
    });
  });

  describe("zoom-out motion", () => {
    it("starts at zoomMax", () => {
      const r = computeKenBurnsTransform("out", 0, ZOOM_MIN, ZOOM_MAX, 0);
      expect(r.scale).toBeCloseTo(ZOOM_MAX);
    });

    it("ends at zoomMin", () => {
      const r = computeKenBurnsTransform("out", 1, ZOOM_MIN, ZOOM_MAX, 0);
      expect(r.scale).toBeCloseTo(ZOOM_MIN);
    });
  });

  describe("panLR motion", () => {
    it("translates from left to right", () => {
      const start = computeKenBurnsTransform("panLR", 0, ZOOM_MIN, ZOOM_MAX, 0);
      const end = computeKenBurnsTransform("panLR", 1, ZOOM_MIN, ZOOM_MAX, 0);
      expect(end.translateX).toBeGreaterThan(start.translateX);
    });

    it("uses zoomMin as fixed scale", () => {
      const r = computeKenBurnsTransform("panLR", 0.5, ZOOM_MIN, ZOOM_MAX, 0);
      expect(r.scale).toBeCloseTo(ZOOM_MIN);
    });
  });

  describe("panRL motion", () => {
    it("translates from right to left (opposite of panLR)", () => {
      const start = computeKenBurnsTransform("panRL", 0, ZOOM_MIN, ZOOM_MAX, 0);
      const end = computeKenBurnsTransform("panRL", 1, ZOOM_MIN, ZOOM_MAX, 0);
      expect(end.translateX).toBeLessThan(start.translateX);
    });
  });

  describe("none motion", () => {
    it("returns scale=1 with no translation", () => {
      const r = computeKenBurnsTransform("none", 0.5, ZOOM_MIN, ZOOM_MAX, 0);
      expect(r.scale).toBe(1.0);
      expect(r.translateX).toBe(0);
      expect(r.translateY).toBe(0);
    });
  });

  describe("alternating direction by beat index", () => {
    it("even beats default to zoom-in", () => {
      // beat 0, 2, 4 ...
      const r = computeKenBurnsTransform(undefined, 0, ZOOM_MIN, ZOOM_MAX, 0);
      // "in" starts at zoomMin
      expect(r.scale).toBeCloseTo(ZOOM_MIN);
    });

    it("odd beats default to zoom-out", () => {
      // beat 1, 3, 5 ...
      const r = computeKenBurnsTransform(undefined, 0, ZOOM_MIN, ZOOM_MAX, 1);
      // "out" starts at zoomMax
      expect(r.scale).toBeCloseTo(ZOOM_MAX);
    });
  });

  describe("progress clamping", () => {
    it("clamps progress below 0 to 0", () => {
      const r = computeKenBurnsTransform("in", -0.5, ZOOM_MIN, ZOOM_MAX, 0);
      expect(r.scale).toBeCloseTo(ZOOM_MIN);
    });

    it("clamps progress above 1 to 1", () => {
      const r = computeKenBurnsTransform("in", 1.5, ZOOM_MIN, ZOOM_MAX, 0);
      expect(r.scale).toBeCloseTo(ZOOM_MAX);
    });
  });
});
