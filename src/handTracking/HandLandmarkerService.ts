import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import type { HandFrame, HandTrackingResult } from "./types";

export interface HandLandmarkerServiceOptions {
  delegate: "GPU" | "CPU";
  minHandDetectionConfidence: number;
  minHandPresenceConfidence: number;
  minTrackingConfidence: number;
}

const DEFAULT_OPTIONS: HandLandmarkerServiceOptions = {
  delegate: "GPU",
  minHandDetectionConfidence: 0.5,
  minHandPresenceConfidence: 0.5,
  // Lower than MediaPipe's 0.5 default: fast hand motion during play would
  // otherwise frequently drop below the tracking-confidence threshold and
  // trigger a full (expensive) palm re-detection pass every such frame.
  minTrackingConfidence: 0.3,
};

export class HandLandmarkerService {
  private landmarker: HandLandmarker | null;

  constructor() {
    this.landmarker = null;
  }

  async initialize(options: Partial<HandLandmarkerServiceOptions> = {}): Promise<void> {
    const resolved = { ...DEFAULT_OPTIONS, ...options };
    const vision = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
    this.landmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: "/mediapipe/hand_landmarker.task",
        delegate: resolved.delegate,
      },
      runningMode: "VIDEO",
      numHands: 2,
      minHandDetectionConfidence: resolved.minHandDetectionConfidence,
      minHandPresenceConfidence: resolved.minHandPresenceConfidence,
      minTrackingConfidence: resolved.minTrackingConfidence,
    });
  }

  /** Returns the tracking result plus the wall-clock ms spent inside detectForVideo, for perf diagnostics. */
  detect(video: HTMLVideoElement, mediaTimeMs: number, frameTimestampMs: number): HandTrackingResult & { inferenceMs: number } {
    if (!this.landmarker) {
      throw new Error("HandLandmarkerService.initialize() must complete before detect() is called");
    }
    const inferenceStart = performance.now();
    const result = this.landmarker.detectForVideo(video, mediaTimeMs);
    const inferenceMs = performance.now() - inferenceStart;
    const hands: HandFrame[] = result.landmarks.map((landmarks, i) => {
      const rawLabel = result.handedness[i]?.[0]?.categoryName;
      // MediaPipe assumes a mirrored (selfie) input image when labeling handedness.
      // We feed it the raw, unmirrored video frame, so the true anatomical hand is the opposite label.
      const handedness: "Left" | "Right" = rawLabel === "Left" ? "Right" : "Left";
      return {
        handedness,
        landmarks: landmarks.map((lm) => ({ x: lm.x, y: lm.y, z: lm.z })),
      };
    });
    return { hands, frameTimestampMs, inferenceMs };
  }

  dispose(): void {
    this.landmarker?.close();
    this.landmarker = null;
  }
}
