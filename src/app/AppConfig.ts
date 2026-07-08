// Key zone layout, in displayed (mirrored) screen-space fractions of the stage.
export const KEY_ZONE_X_START = 0.08;
export const KEY_WIDTH_PCT = 0.049;
export const KEY_GAP_PCT = 0.02;
export const KEY_ZONE_Y_RANGE: [number, number] = [0.66, 0.81];
export const NUM_KEYS = 5;

// Scratch disk layout. Radius is applied against min(width, height) in pixels when
// rendering/hit-testing, so the disk stays a true circle regardless of the camera's aspect ratio.
export const SCRATCH_DISK_CENTER = { xPct: 0.78, yPct: 0.72 };
export const SCRATCH_DISK_RADIUS_PCT = 0.2652; // 0.204 * 1.3

// Press-gesture thresholds. Units are normalized-coordinate velocity (fraction
// of frame per ms), so a score of 1.0 means "moving at exactly the threshold
// speed". These need hands-on tuning against a real camera/hand.
export const PRESS_Z_VELOCITY_THRESHOLD = 0.001;
export const PRESS_Y_VELOCITY_THRESHOLD = 0.0007;
export const PRESS_DEBOUNCE_MS = 240;
export const VELOCITY_WINDOW_MS = 150;
