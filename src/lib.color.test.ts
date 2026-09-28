import { describe, it, expect } from "vitest";
import { parseColorToRgb, colorName } from "./lib";

describe("parseColorToRgb", () => {
  it("parses hex", () => expect(parseColorToRgb("#6C6CF8")).toEqual([108, 108, 248]));
  it("parses short hex", () => expect(parseColorToRgb("#fff")).toEqual([255, 255, 255]));
  it("parses rgb()", () => expect(parseColorToRgb("rgb(108, 108, 248)")).toEqual([108, 108, 248]));
  it("parses rgba()", () => expect(parseColorToRgb("rgba(0,0,0,0.5)")).toEqual([0, 0, 0]));
  it("parses hsl() red", () => expect(parseColorToRgb("hsl(0, 100%, 50%)")).toEqual([255, 0, 0]));
  it("parses hsl() blue", () => expect(parseColorToRgb("hsl(240,100%,50%)")).toEqual([0, 0, 255]));
  it("returns null for junk", () => expect(parseColorToRgb("hello")).toBeNull());
});

describe("colorName", () => {
  it("names iris from hex", () => expect(colorName("#6C6CF8")).toBe("Iris"));
  it("names iris from rgb", () => expect(colorName("rgb(108,108,248)")).toBe("Iris"));
  it("names white", () => expect(colorName("#ffffff")).toBe("White"));
  it("names pure blue", () => expect(colorName("hsl(240,100%,50%)")).toBe("Blue"));
  it("falls back to Color on junk", () => expect(colorName("nope")).toBe("Color"));
});
