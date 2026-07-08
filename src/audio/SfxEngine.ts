import { extractScratchSample } from "./ScratchExtractor";
import { ScratchSamplePlayer } from "./ScratchSamplePlayer";

// Pentatonic-ish scale across lanes so simultaneous/rapid hits never clash dissonantly.
const KEY_TONES_HZ = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33];

export class SfxEngine {
  private ctx: AudioContext;
  private output: DynamicsCompressorNode;
  private scratchSample: ScratchSamplePlayer;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    // Shared limiter so pushing individual sound gains louder doesn't just clip/distort at the output.
    this.output = ctx.createDynamicsCompressor();
    this.output.threshold.value = -16;
    this.output.knee.value = 12;
    this.output.ratio.value = 8;
    this.output.attack.value = 0.002;
    this.output.release.value = 0.15;
    this.output.connect(ctx.destination);
    this.scratchSample = new ScratchSamplePlayer(ctx, this.output);
  }

  /** Fetches a source audio file, runs harmonic/percussive separation to pull out its scratch-like
   *  (tonal) content while suppressing the underlying beat, and uses the result as the scratch voice. */
  async loadScratchSample(url: string): Promise<void> {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const sourceBuffer = await this.ctx.decodeAudioData(arrayBuffer);
    const { buffer, anchorSec } = await extractScratchSample(this.ctx, sourceBuffer);
    this.scratchSample.setBuffer(buffer, anchorSec);
  }

  /** EDM-style "pluck" stab: a detuned 3-oscillator supersaw (classic fat EDM lead technique) through
   *  a resonant lowpass filter that sweeps down from bright to dark, with a punchy fast-attack /
   *  short-decay envelope — much brighter and thicker than a single plain tone. */
  playKeyTone(lane: number): void {
    const now = this.ctx.currentTime;
    const freq = KEY_TONES_HZ[lane % KEY_TONES_HZ.length];

    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 10;
    filter.frequency.setValueAtTime(freq * 10, now);
    filter.frequency.exponentialRampToValueAtTime(Math.max(200, freq * 1.2), now + 0.22);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.55, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);

    filter.connect(gain).connect(this.output);

    const detunesCents = [-9, 0, 9];
    for (const detune of detunesCents) {
      const osc = this.ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = freq;
      osc.detune.value = detune;
      osc.connect(filter);
      osc.start(now);
      osc.stop(now + 0.33);
    }
  }

  /** Call once per frame with the scratch disk's rub state. Delegates to ScratchSamplePlayer, which
   *  scrubs the extracted scratch-effect sample forward/backward at a rate matching hand speed. */
  updateScratch(scratchVelocityPerSec: number, engaged: boolean): void {
    if (!this.scratchSample.hasBuffer()) return;
    this.scratchSample.update(scratchVelocityPerSec, engaged);
  }

  /** Stops ScratchSamplePlayer's independent grain-scheduling timer — must be called before the
   *  AudioContext is closed, or it keeps firing against a dead context and throws on every tick. */
  dispose(): void {
    this.scratchSample.dispose();
  }
}
