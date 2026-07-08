const SCRATCH_WINDOW_SEC = 3.0; // how far the disk's local motion can range from the anchor
const DRAG_SCALE = 0.35; // seconds of sample moved per disk-radius of hand travel — tuned by feel
const GRAIN_DURATION_SEC = 0.11; // longer grains with a short interval overlap heavily, reading as one sustained sound
const GRAIN_INTERVAL_MS = 25;

function reverseAudioBuffer(ctx: AudioContext, buffer: AudioBuffer): AudioBuffer {
  const reversed = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const source = buffer.getChannelData(channel);
    const dest = reversed.getChannelData(channel);
    for (let i = 0; i < source.length; i++) {
      dest[i] = source[source.length - 1 - i];
    }
  }
  return reversed;
}

/** Real turntable scratching: grab a point on the record, and dragging it forward/back plays that
 *  patch of audio forward/back at a rate matching hand speed. Emulated via granular playback — short
 *  overlapping grains sourced from a forward and a time-reversed copy of the sample, chosen by
 *  direction, sourced at a "playhead" position driven by the hand's rub speed.
 *
 *  Grain firing runs on its own setInterval clock, independent of how often update() is called.
 *  update() is only driven by camera frames, and camera FPS drops sharply (sometimes to 3-7fps)
 *  during exactly the fast hand motion scratching requires — scheduling grains only inside update()
 *  meant a scratch motion could produce a grain only once every 150-300ms, which is mostly silence
 *  and reads as "no sound" even though a few isolated blips were technically playing. */
export class ScratchSamplePlayer {
  private ctx: AudioContext;
  private forwardBuffer: AudioBuffer | null;
  private reverseBuffer: AudioBuffer | null;
  private anchorSec: number;
  private outputGain: GainNode;
  private offsetSec: number;
  private wasEngaged: boolean;
  private lastUpdateMs: number | null;
  private latestVelocity: number;
  private latestEngaged: boolean;
  private tickHandle: ReturnType<typeof setInterval>;

  constructor(ctx: AudioContext, destination: AudioNode) {
    this.ctx = ctx;
    this.forwardBuffer = null;
    this.reverseBuffer = null;
    this.anchorSec = 0;
    this.offsetSec = 0;
    this.wasEngaged = false;
    this.lastUpdateMs = null;
    this.latestVelocity = 0;
    this.latestEngaged = false;
    this.outputGain = ctx.createGain();
    this.outputGain.gain.value = 0;
    this.outputGain.connect(destination);
    this.tickHandle = setInterval(() => this.tick(), GRAIN_INTERVAL_MS);
  }

  /** anchorSec is where playback centers (e.g. the extractor's loudest-energy point) — clamped here
   *  so the +-SCRATCH_WINDOW_SEC/2 scrub range never runs off either end of the buffer. */
  setBuffer(buffer: AudioBuffer, anchorSec: number): void {
    this.forwardBuffer = buffer;
    this.reverseBuffer = reverseAudioBuffer(this.ctx, buffer);
    const half = SCRATCH_WINDOW_SEC / 2;
    this.anchorSec = Math.min(Math.max(anchorSec, half), Math.max(half, buffer.duration - half));
  }

  hasBuffer(): boolean {
    return this.forwardBuffer !== null;
  }

  /** Call whenever hand-tracking produces a new reading (i.e. once per camera frame — an irregular,
   *  sometimes-sparse cadence). Only updates the drag position and latest velocity/engagement state;
   *  actual grain firing happens on tick()'s independent steady clock. */
  update(velocityPerSec: number, engaged: boolean): void {
    const nowMs = performance.now();
    const dtSec = this.lastUpdateMs === null ? 0 : (nowMs - this.lastUpdateMs) / 1000;
    this.lastUpdateMs = nowMs;

    this.latestVelocity = velocityPerSec;
    this.latestEngaged = engaged;

    if (!engaged) {
      this.wasEngaged = false;
      return;
    }
    if (!this.wasEngaged) {
      // Every fresh grab scratches around the same anchor point, like re-dropping the needle.
      this.offsetSec = 0;
      this.wasEngaged = true;
    }

    const half = SCRATCH_WINDOW_SEC / 2;
    this.offsetSec = Math.max(-half, Math.min(half, this.offsetSec + velocityPerSec * DRAG_SCALE * dtSec));
  }

  dispose(): void {
    clearInterval(this.tickHandle);
  }

  private tick(): void {
    if (!this.forwardBuffer || !this.reverseBuffer) return;

    const speed = Math.abs(this.latestVelocity);
    const now = this.ctx.currentTime;

    if (!this.latestEngaged || speed < 0.3) {
      this.outputGain.gain.setTargetAtTime(0, now, 0.05);
      return;
    }

    this.outputGain.gain.setTargetAtTime(Math.min(1.8, 0.75 + speed * 0.13), now, 0.03);
    this.playGrain(this.latestVelocity >= 0, speed);
  }

  private playGrain(forward: boolean, speed: number): void {
    const forwardBuffer = this.forwardBuffer!;
    const buffer = forward ? forwardBuffer : this.reverseBuffer!;
    const now = this.ctx.currentTime;

    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = Math.min(3, Math.max(0.3, speed * 0.5));

    // Short fade in/out per grain so back-to-back grains don't click at their seams.
    const grainGain = this.ctx.createGain();
    grainGain.gain.setValueAtTime(0, now);
    grainGain.gain.linearRampToValueAtTime(1, now + 0.005);
    grainGain.gain.setValueAtTime(1, now + Math.max(0.005, GRAIN_DURATION_SEC - 0.01));
    grainGain.gain.linearRampToValueAtTime(0, now + GRAIN_DURATION_SEC);

    src.connect(grainGain).connect(this.outputGain);

    const posInForward = Math.max(0, Math.min(forwardBuffer.duration - 0.01, this.anchorSec + this.offsetSec));
    // The reverse buffer is time-flipped, so the matching point mirrors across the buffer's duration.
    const startOffset = forward ? posInForward : Math.max(0, forwardBuffer.duration - posInForward - GRAIN_DURATION_SEC);

    src.start(now, startOffset, GRAIN_DURATION_SEC);
    src.stop(now + GRAIN_DURATION_SEC + 0.01);
  }
}
