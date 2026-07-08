import { fft } from "./fft";

const FRAME_SIZE = 2048;
const HOP_SIZE = 512;
const PEAK_WINDOW_FRAMES = 20;
const PEAK_THRESHOLD_K = 1.6;
const MIN_ONSET_INTERVAL_SEC = 0.08;

export interface Onset {
  timeMs: number;
  band: number;
  strength: number;
}

interface FrequencyBand {
  minHz: number;
  maxHz: number;
}

// 5 bands, one per key lane (ascending frequency = ascending lane index). Bass/kick maps to lane 0,
// cymbal/hi-hat transients to lane 4 — mirrors how real charters spread instrument layers across keys.
export const FREQUENCY_BANDS: FrequencyBand[] = [
  { minHz: 20, maxHz: 150 },
  { minHz: 150, maxHz: 400 },
  { minHz: 400, maxHz: 1000 },
  { minHz: 1000, maxHz: 2500 },
  { minHz: 2500, maxHz: 9000 },
];

function hannWindow(size: number): Float32Array {
  const window = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1));
  }
  return window;
}

function pickPeaks(flux: Float32Array, band: number, sampleRate: number): Onset[] {
  const minIntervalFrames = Math.round((MIN_ONSET_INTERVAL_SEC * sampleRate) / HOP_SIZE);
  const onsets: Onset[] = [];
  let lastPeakFrame = -Infinity;

  for (let i = 1; i < flux.length - 1; i++) {
    const start = Math.max(0, i - PEAK_WINDOW_FRAMES);
    const end = Math.min(flux.length, i + PEAK_WINDOW_FRAMES);

    let sum = 0;
    for (let j = start; j < end; j++) sum += flux[j];
    const mean = sum / (end - start);

    let variance = 0;
    for (let j = start; j < end; j++) variance += (flux[j] - mean) ** 2;
    const stddev = Math.sqrt(variance / (end - start));

    const threshold = mean + PEAK_THRESHOLD_K * stddev;
    const isLocalMax = flux[i] > threshold && flux[i] >= flux[i - 1] && flux[i] >= flux[i + 1];

    if (isLocalMax && i - lastPeakFrame >= minIntervalFrames) {
      onsets.push({ timeMs: (i * HOP_SIZE * 1000) / sampleRate, band, strength: flux[i] });
      lastPeakFrame = i;
    }
  }

  return onsets;
}

/** Manual STFT + per-band spectral-flux onset detection. Returns one onset array per frequency band. */
export function detectOnsets(channelData: Float32Array, sampleRate: number): Onset[][] {
  const window = hannWindow(FRAME_SIZE);
  const numFrames = Math.max(0, Math.floor((channelData.length - FRAME_SIZE) / HOP_SIZE));
  const numBins = FRAME_SIZE / 2;

  const bandBinRanges = FREQUENCY_BANDS.map((band) => ({
    startBin: Math.max(1, Math.floor((band.minHz * FRAME_SIZE) / sampleRate)),
    endBin: Math.min(numBins - 1, Math.ceil((band.maxHz * FRAME_SIZE) / sampleRate)),
  }));

  const bandEnergyOverTime: number[][] = FREQUENCY_BANDS.map(() => []);
  const real = new Float32Array(FRAME_SIZE);
  const imag = new Float32Array(FRAME_SIZE);

  for (let frame = 0; frame < numFrames; frame++) {
    const offset = frame * HOP_SIZE;
    for (let i = 0; i < FRAME_SIZE; i++) {
      real[i] = channelData[offset + i] * window[i];
      imag[i] = 0;
    }
    fft(real, imag);

    for (let b = 0; b < FREQUENCY_BANDS.length; b++) {
      const { startBin, endBin } = bandBinRanges[b];
      let energy = 0;
      for (let bin = startBin; bin <= endBin; bin++) {
        energy += Math.hypot(real[bin], imag[bin]);
      }
      bandEnergyOverTime[b].push(energy);
    }
  }

  return bandEnergyOverTime.map((energies, band) => {
    const flux = new Float32Array(energies.length);
    for (let i = 1; i < energies.length; i++) {
      flux[i] = Math.max(0, energies[i] - energies[i - 1]);
    }
    return pickPeaks(flux, band, sampleRate);
  });
}
