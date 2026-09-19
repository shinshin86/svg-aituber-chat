export interface MouthShape {
  open: number;
  width: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

function bandEnergy(frequencyData: ArrayLike<number>, sampleRate: number, fftSize: number, lowHz: number, highHz: number) {
  const binHz = sampleRate / fftSize;
  const first = Math.max(0, Math.floor(lowHz / binHz));
  const last = Math.min(frequencyData.length - 1, Math.ceil(highHz / binHz));
  let peak = 0;
  for (let index = first; index <= last; index += 1) {
    const db = frequencyData[index];
    if (!Number.isFinite(db)) continue;
    peak = Math.max(peak, 10 ** (db / 10));
  }
  return peak;
}

export function estimateMouthShape(
  frequencyData: ArrayLike<number>,
  sampleRate: number,
  fftSize: number,
): MouthShape {
  const low = bandEnergy(frequencyData, sampleRate, fftSize, 250, 1000);
  const mid = bandEnergy(frequencyData, sampleRate, fftSize, 1000, 1800);
  const high = bandEnergy(frequencyData, sampleRate, fftSize, 1800, 3200);
  const total = low + mid + high;
  if (total <= 0) return { open: 0, width: 1 };

  const lowRatio = low / total;
  const brightEnergy = mid * 0.8 + high * 4;
  const dbDifference = 10 * Math.log10((brightEnergy + 1e-12) / (low + 1e-12));
  return {
    // Open vowels carry more low-band energy; keep this subtle because RMS
    // remains the primary vertical-opening signal.
    open: clamp(0.55 + lowRatio * 0.55, 0, 1),
    // Front/high energy tends to sound wider (i/e), while low energy narrows
    // the mouth (u/o).
    width: clamp(1 + dbDifference * 0.045, 0.75, 1.25),
  };
}
