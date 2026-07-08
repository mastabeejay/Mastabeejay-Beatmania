export type FrameCallback = (
  video: HTMLVideoElement,
  metadata: VideoFrameCallbackMetadata,
) => void;

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
   *  while already pumping used to spin up an additional concurrent requestVideoFrameCallback chain,
   *  so every swap piled on another parallel MediaPipe inference per real frame. */
  onFrame(callback: FrameCallback): void {
    this.frameCallback = callback;
    this.running = true;
    if (!this.pumping) {
      this.pumping = true;
      this.pump();
    }
  }

  private pump(): void {
    if (!this.running) {
      this.pumping = false;
      return;
    }
    this.video.requestVideoFrameCallback((_now, metadata) => {
      this.frameCallback?.(this.video, metadata);
      this.pump();
    });
  }

  stop(): void {
    this.running = false;
    this.stream?.getTracks().forEach((track) => track.stop());
  }
}
