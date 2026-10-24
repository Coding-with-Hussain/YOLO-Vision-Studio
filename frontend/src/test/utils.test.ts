import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { CLASS_PALETTE, classColor, contrastText } from "@/utils/colors";
import { formatBytes, formatMs } from "@/utils/format";
import { validateFile } from "@/components/common/Dropzone";

describe("utilities", () => {
  it("uses the same class palette as the backend renderer", () => {
    const source = readFileSync(resolve(__dirname, "../../../backend/app/services/annotate.py"), "utf8");
    const backend = [...source.matchAll(/"(#[0-9A-F]{6})"/g)].map((m) => m[1]);
    expect(backend).toEqual(CLASS_PALETTE);
    expect(classColor(CLASS_PALETTE.length)).toBe(CLASS_PALETTE[0]);
  });

  it("picks readable label text", () => {
    expect(contrastText("#FBBF24")).toBe("#090C0F");
    expect(contrastText("#7C5CFC")).toBe("#FFFFFF");
  });

  it("formats sizes and durations", () => {
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(null)).toBe("Unavailable");
    expect(formatMs(42.46)).toBe("42 ms");
    expect(formatMs(1500)).toBe("1.50 s");
  });

  it("validates file extension and size", () => {
    expect(validateFile(new File(["a"], "best.PT"), ["pt"])).toBeNull();
    expect(validateFile(new File(["a"], "best.pth"), ["pt"])).toMatch(/not supported/);
    expect(validateFile(new File([""], "best.pt"), ["pt"])).toMatch(/empty/);
    expect(validateFile(new File(["abcdef"], "best.pt"), ["pt"], 3)).toMatch(/larger than/);
  });
});
