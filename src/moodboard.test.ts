import { describe, it, expect } from "vitest";
import { planGrid } from "./moodboard";

describe("planGrid", () => {
  it("single image is 1x1", () => {
    const p = planGrid(1, 100, 10);
    expect(p.cols).toBe(1);
    expect(p.rows).toBe(1);
    expect(p.cells).toHaveLength(1);
    expect(p.width).toBe(120);
    expect(p.height).toBe(120);
    expect(p.cells[0]).toEqual({ x: 10, y: 10, size: 100 });
  });

  it("four images is 2x2", () => {
    const p = planGrid(4, 100, 10);
    expect(p.cols).toBe(2);
    expect(p.rows).toBe(2);
    expect(p.cells).toHaveLength(4);
    expect(p.cells[3]).toEqual({ x: 120, y: 120, size: 100 });
  });

  it("three images fit a 2x2 grid with 3 cells", () => {
    const p = planGrid(3, 100, 10);
    expect(p.cols).toBe(2);
    expect(p.rows).toBe(2);
    expect(p.cells).toHaveLength(3);
  });

  it("nine images is 3x3", () => {
    const p = planGrid(9);
    expect(p.cols).toBe(3);
    expect(p.rows).toBe(3);
  });

  it("clamps count to at least 1", () => {
    expect(planGrid(0).cells).toHaveLength(1);
  });
});
