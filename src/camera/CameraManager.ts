export interface FrameMetadata {
  mediaTime: number;
  presentationTime: number;
}

export type FrameCallback = (video: HTMLVideoElement, metadata: FrameMetadata) => void;

export class CameraManager {
  private video: HTMLVideoElement;
  private stream: MediaStream | null;
  private frameCallback: FrameCallback | null;
  private running: boolean;
  private pumping: boolean;

  constructor(video: HTMLVideoElement) {
    this.video = video;
    this.stream = null;
    this.frameCallback = null;
    this.running = false;
    this.pumping = false;
  }

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      // Lower resolution than a typical 720p webcam feed: MediaPipe's palm
      // re-detection pass (triggered whenever fast motion breaks tracking)
      // scales with input pixel count, and re-detection cost was the
      // dominant source of per-frame latency during hand movement.
      video: { width: 640, height: 480, frameRate: 30, facingMode: "user" },
      audio: false,
    });
    this.video.srcObject = this.stream;
    await new Promise<void>((resolve) => {
      this.video.onloadedmetadata = () => resolve();
    });
    await this.video.play();
  }

  /** Can be called repeatedly to swap the active callback (e.g. calibration step -> next step ->
   *  real gameplay). Only the FIRST call actually starts the frame pump loop — calling this again
   *  while already pumping used to spin up an additional concurrent pump chain, so every swap
   *  piled on another parallel MediaPipe inference per real frame. */
  onFrame(callback: FrameCallback): void {
    this.frameCallback = callback;
    this.running = true;
    if (!this.pumping) {
      this.pumping = true;
      this.pump();
    }
  }

  /** Driven by requestAnimationFrame rather than the video element's own requestVideoFrameCallback
   *  — the latter has proven unreliable for a live getUserMedia stream on iOS Safari specifically
   *  (fires once at start, then stops firing at all). The timestamp handed to MediaPipe comes from
   *  rAF's own clock, not video.currentTime: detectForVideo requires a strictly increasing
   *  timestamp between calls, and video.currentTime has been observed to stall for camera streams
   *  on some platforms, which would silently fail every detection after the first — which also
   *  rules out gating on video.currentTime to skip duplicate frames.
   *
   *  Throttled to the same ~30fps the camera itself was requested at (see start() above): without
   *  this, rAF fires at the DISPLAY's refresh rate, not the camera's capture rate, so a 120-240Hz
   *  gaming monitor was re-running the frameCallback (MediaPipe hand-landmark inference — the most
   *  expensive step in the whole app) 4-8x per real camera frame, on input that hadn't actually
   *  changed since the previous call. Same class of fix, and same reasoning, as the render loop's
   *  own TARGET_FRAME_MS cap in main.ts. */
  private static readonly TARGET_FRAME_MS = 1000 / 30;
  private lastPumpTime = 0;

  private pump(): void {
    if (!this.running) {
      this.pumping = false;
      return;
    }
    requestAnimationFrame((now) => {
      if (now - this.lastPumpTime < CameraManager.TARGET_FRAME_MS) {
        this.pump();
        return;
      }
      this.lastPumpTime = now;
      if (this.video.readyState < 2) {
        this.pump();
        return;
      }
      try {
        this.frameCallback?.(this.video, { mediaTime: now / 1000, presentationTime: now });
      } catch (err) {
        console.error("Frame callback failed; continuing to next frame.", err);
      } finally {
        this.pump();
      }
    });
  }

  stop(): void {
    this.running = false;
    this.stream?.getTracks().forEach((track) => track.stop());
  }
}
