import { NUM_KEYS } from "../app/AppConfig";
import type { CameraManager } from "../camera/CameraManager";
import { GestureDetector } from "../handTracking/GestureDetector";
import type { HandLandmarkerService } from "../handTracking/HandLandmarkerService";
import type { KeyZone } from "../handTracking/ZoneLayout";
import { t } from "../i18n";
import { FingerCalibrator } from "./FingerCalibrator";

const REST_PHASE_MS = 2000;
const PRESS_ROUNDS = 3;
const PRESS_PROMPT_TIMEOUT_MS = 2000;

/** Phase A: average the resting position of the player's 5 fingertips for a quick initial estimate. */
function runRestPhase(camera: CameraManager, handTracker: HandLandmarkerService, calibrator: FingerCalibrator, onStatus: (text: string) => void): Promise<void> {
  return new Promise((resolve) => {
    const deadline = performance.now() + REST_PHASE_MS;
    camera.onFrame((videoEl, metadata) => {
      const result = handTracker.detect(videoEl, metadata.mediaTime * 1000, metadata.presentationTime);
      calibrator.addRestSample(result.hands);

      const remainingSec = Math.max(0, Math.ceil((deadline - performance.now()) / 1000));
      onStatus(t("calibrationRestPromptTemplate", { sec: remainingSec }));

      if (performance.now() >= deadline) resolve();
    });
  });
}

/** Prompts one lane, waits for any debounced press attempt (or a timeout), and records its position
 *  as a sample for that lane — regardless of where the *current* (likely still-inaccurate) zones are. */
function runPressPrompt(
  camera: CameraManager,
  handTracker: HandLandmarkerService,
  gestureDetector: GestureDetector,
  calibrator: FingerCalibrator,
  lane: number,
  round: number,
  onStatus: (text: string) => void,
): Promise<void> {
  return new Promise((resolve) => {
    const deadline = performance.now() + PRESS_PROMPT_TIMEOUT_MS;
    let settled = false;
    onStatus(t("calibrationPressPromptTemplate", { round: round + 1, total: PRESS_ROUNDS, lane: lane + 1 }));

    camera.onFrame((videoEl, metadata) => {
      if (settled) return;
      const result = handTracker.detect(videoEl, metadata.mediaTime * 1000, metadata.presentationTime);
      const { pressAttempts } = gestureDetector.process(result.hands, result.frameTimestampMs);

      if (pressAttempts.length > 0) {
        calibrator.addPressSample(lane, pressAttempts[0].x, pressAttempts[0].y);
        settled = true;
        resolve();
      } else if (performance.now() >= deadline) {
        settled = true; // no press within the window — move on, rest-pose fallback covers this lane
        resolve();
      }
    });
  });
}

/** Runs the full two-phase calibration (rest pose -> guided multi-round press practice) and returns
 *  the resulting key zones. Takes over camera.onFrame for its duration; the caller should install the
 *  real gameplay frame handler afterward. */
export async function runFingerCalibration(
  camera: CameraManager,
  handTracker: HandLandmarkerService,
  onStatus: (text: string) => void,
): Promise<KeyZone[]> {
  const calibrator = new FingerCalibrator();
  const gestureDetector = new GestureDetector(); // scratch instance: only its press-attempt detection is used here

  await runRestPhase(camera, handTracker, calibrator, onStatus);

  for (let round = 0; round < PRESS_ROUNDS; round++) {
    for (let lane = 0; lane < NUM_KEYS; lane++) {
      await runPressPrompt(camera, handTracker, gestureDetector, calibrator, lane, round, onStatus);
    }
  }

  onStatus(t("calibrationDoneMsg"));
  return calibrator.computeZones();
}
