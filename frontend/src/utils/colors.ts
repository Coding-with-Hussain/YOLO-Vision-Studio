// Must match PALETTE_HEX in backend/app/services/annotate.py so a class has
// the same colour in server-rendered images and browser overlays.
export const CLASS_PALETTE = [
  "#7C5CFC", "#22D3EE", "#34D399", "#FBBF24", "#F472B6",
  "#60A5FA", "#F87171", "#A3E635", "#FB923C", "#C084FC",
  "#2DD4BF", "#FACC15", "#E879F9", "#38BDF8", "#4ADE80",
  "#FCA5A5", "#818CF8", "#FDBA74", "#5EEAD4", "#F9A8D4",
];

export function classColor(classId: number): string {
  return CLASS_PALETTE[((classId % CLASS_PALETTE.length) + CLASS_PALETTE.length) % CLASS_PALETTE.length];
}

/** Readable text colour (near-black or white) for a hex background. */
export function contrastText(hex: string): string {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "#090C0F" : "#FFFFFF";
}

export function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${a}`;
}
