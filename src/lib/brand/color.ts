/** WCAG relative luminance helpers used to keep themed accents legible. */
export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n = parseInt(m?.[1] ?? "c8a45d", 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const INK = "#111113";
const IVORY = "#f7f2e8";
const BACKGROUND = "#0a0a0b";

/** Foreground for text placed on the accent color. */
export function accentForeground(accent: string): string {
  return contrastRatio(accent, INK) >= contrastRatio(accent, IVORY) ? INK : IVORY;
}

/**
 * Accent used for text/lines on the dark background: if a workspace picks a very dark accent we lift it so
 * accent-colored text keeps at least 3:1 contrast against the near-black page.
 */
export function legibleAccent(accent: string): string {
  let [r, g, b] = hexToRgb(accent);
  for (let i = 0; i < 20 && contrastRatio(toHex(r, g, b), BACKGROUND) < 3; i++) {
    r = Math.round(r + (255 - r) * 0.12);
    g = Math.round(g + (255 - g) * 0.12);
    b = Math.round(b + (255 - b) * 0.12);
  }
  return toHex(r, g, b);
}

function toHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}
