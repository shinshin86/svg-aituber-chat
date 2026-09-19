export interface HslColor {
  h: number;
  s: number;
  l: number;
}

export function hexToHsl(hex: string): HslColor {
  const value = Number.parseInt(hex.slice(1), 16);
  const r = ((value >> 16) & 255) / 255;
  const g = ((value >> 8) & 255) / 255;
  const b = (value & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  return { h, s, l };
}

function hueToRgb(p: number, q: number, t: number): number {
  let value = t;
  if (value < 0) value += 1;
  if (value > 1) value -= 1;
  if (value < 1 / 6) return p + (q - p) * 6 * value;
  if (value < 1 / 2) return q;
  if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6;
  return p;
}

export function hslToHex({ h, s, l }: HslColor): string {
  if (s === 0) {
    const gray = Math.round(l * 255).toString(16).padStart(2, '0');
    return `#${gray}${gray}${gray}`.toUpperCase();
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = ((h % 360) + 360) % 360 / 360;
  const rgb = [hueToRgb(p, q, hue + 1 / 3), hueToRgb(p, q, hue), hueToRgb(p, q, hue - 1 / 3)]
    .map((value) => Math.round(value * 255).toString(16).padStart(2, '0'));
  return `#${rgb.join('')}`.toUpperCase();
}

export function rotateHue(hex: string, degrees: number): string {
  if (!/^#[0-9a-f]{6}$/i.test(hex) || !Number.isFinite(degrees) || degrees === 0) return hex;
  const hsl = hexToHsl(hex);
  return hslToHex({ ...hsl, h: hsl.h + degrees });
}
