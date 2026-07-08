export interface Landmark {
  x: number;
  y: number;
  z: number;
}

export interface HandFrame {
  handedness: "Left" | "Right";
  landmarks: Landmark[];
}

export interface HandTrackingResult {
  hands: HandFrame[];
  frameTimestampMs: number;
}

export interface PressEvent {
  lane: number;
  fingertipKey: string;
  timestampMs: number;
  pressScore: number;
}

export interface FingertipDebugSample {
  key: string;
  x: number;
  y: number;
  pressScore: number;
}
