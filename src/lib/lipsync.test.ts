import { describe, expect, it } from 'vitest';
import { estimateMouthShape } from './lipsync';

const spectrum = (low: number, mid: number, high: number) => {
  const values = new Float32Array(1024).fill(-120);
  values[20] = low;
  values[60] = mid;
  values[110] = high;
  return values;
};

describe('estimateMouthShape', () => {
  it('returns a neutral shape for silence', () => {
    expect(estimateMouthShape(new Float32Array(32).fill(-Infinity), 48000, 2048)).toEqual({ open: 0, width: 1 });
  });

  it('keeps /a/ near neutral and widens /i/', () => {
    const a = estimateMouthShape(spectrum(-20, -20, -70), 48000, 2048);
    const i = estimateMouthShape(spectrum(-20, -70, -22), 48000, 2048);
    expect(a.width).toBeGreaterThanOrEqual(0.95);
    expect(a.width).toBeLessThanOrEqual(1.05);
    expect(i.width).toBeGreaterThan(1.1);
  });

  it('narrows /u/ when both formants are low', () => {
    const u = estimateMouthShape(spectrum(-20, -70, -70), 48000, 2048);
    expect(u.width).toBeLessThanOrEqual(0.9);
  });
});
