import "./style.css";
import { AudioEngine } from "./audio/AudioEngine";
import { SfxEngine } from "./audio/SfxEngine";
import { runFingerCalibration } from "./calibration/CalibrationFlow";
import { CameraManager } from "./camera/CameraManager";
import { buildChartFromFile } from "./chartGen/ChartBuilder";
import { pickRandomDefaultTrack, type DefaultTrack } from "./game/DefaultTracks";
import { addGuestbookEntry, deleteGuestbookEntry, editGuestbookEntry, loadGuestbook, WrongPasswordError } from "./game/Guestbook";
import { addLeaderboardEntry, computeProjectedRank, loadLeaderboard, qualifiesForTop20 } from "./game/Leaderboard";
import { JudgmentEngine, type JudgmentResult } from "./game/JudgmentEngine";
import { NoteScheduler } from "./game/NoteScheduler";
import { ScoreManager } from "./game/ScoreManager";
import { buildTestChart, DIFFICULTY_PRESETS, type ChartDensity } from "./game/testChart";
import { SCRATCH_LANE } from "./game/types";
import { reportVisit } from "./game/Visits";
import { GestureDetector } from "./handTracking/GestureDetector";
import { HandLandmarkerService } from "./handTracking/HandLandmarkerService";
import { ScratchDetector } from "./handTracking/ScratchDetector";
import type { FingertipDebugSample, HandFrame } from "./handTracking/types";
import { computeScratchZone, type KeyZone } from "./handTracking/ZoneLayout";
import { DebugSkeletonRenderer } from "./render/DebugSkeletonRenderer";
import { JudgmentRenderer } from "./render/JudgmentRenderer";
import { NoteRenderer } from "./render/NoteRenderer";
import { ZoneDebugRenderer } from "./render/ZoneDebugRenderer";

const TEST_BPM = 120;
const DEFAULT_GAME_DURATION_MS = 120000; // 2 minutes — default test-track game length when no song file is selected
const TEST_BEAT_COUNT = Math.round(DEFAULT_GAME_DURATION_MS / (60000 / TEST_BPM)); // 240 beats at 120 BPM

// Scroll speed (ms from spawn to hit line) is a separate axis from note density/difficulty —
// conflating the two was why doubling one alone didn't fix "the game feels too fast".
const SPEED_PRESETS: Record<"slow" | "normal" | "fast", number> = {
  slow: 3200,
  normal: 2400,
  fast: 1600,
};

// Human-readable labels recorded on the leaderboard alongside the score, so a run can be compared
// against others played at the same speed/difficulty rather than just by raw point total.
const SPEED_LABELS: Record<keyof typeof SPEED_PRESETS, string> = {
  slow: "느림",
  normal: "보통",
  fast: "빠름",
};
const DIFFICULTY_LABELS: Record<keyof typeof DIFFICULTY_PRESETS, string> = {
  easy: "쉬움",
  normal: "보통",
  hard: "어려움",
};

const stage = document.querySelector<HTMLDivElement>("#stage")!;
const video = document.querySelector<HTMLVideoElement>("#camera-feed")!;
const canvas = document.querySelector<HTMLCanvasElement>("#overlay-canvas")!;
const hud = document.querySelector<HTMLDivElement>("#status-hud")!;
const startOverlay = document.querySelector<HTMLDivElement>("#start-overlay")!;
const startButton = document.querySelector<HTMLButtonElement>("#start-button")!;
const stopButton = document.querySelector<HTMLButtonElement>("#stop-button")!;
const speedSelect = document.querySelector<HTMLSelectElement>("#speed-select")!;
const difficultySelect = document.querySelector<HTMLSelectElement>("#difficulty-select")!;
const songFileInput = document.querySelector<HTMLInputElement>("#song-file-input")!;
const songFileName = document.querySelector<HTMLSpanElement>("#song-file-name")!;
const bgmModeTestRadio = document.querySelector<HTMLInputElement>("#bgm-mode-test")!;
const bgmModeDefaultRadio = document.querySelector<HTMLInputElement>("#bgm-mode-default")!;
const trackInfoEl = document.querySelector<HTMLDivElement>("#track-info")!;
const trackInfoTitleEl = document.querySelector<HTMLDivElement>("#track-info-title")!;
const trackInfoProducerEl = document.querySelector<HTMLDivElement>("#track-info-producer")!;
const calibrationToggle = document.querySelector<HTMLInputElement>("#calibration-toggle")!;
const calibrationStatus = document.querySelector<HTMLDivElement>("#calibration-status")!;
const scoreHud = document.querySelector<HTMLDivElement>("#score-hud")!;
const scoreValueEl = document.querySelector<HTMLDivElement>("#score-value")!;
const resultsOverlay = document.querySelector<HTMLDivElement>("#results-overlay")!;
const resultsScoreEl = document.querySelector<HTMLDivElement>("#results-score")!;
const resultsBreakdownEl = document.querySelector<HTMLDivElement>("#results-breakdown")!;
const resultsConfirmButton = document.querySelector<HTMLButtonElement>("#results-confirm-button")!;
const nameEntryOverlay = document.querySelector<HTMLDivElement>("#name-entry-overlay")!;
const nameEntryNameInput = document.querySelector<HTMLInputElement>("#name-entry-name")!;
const nameEntryMessageInput = document.querySelector<HTMLInputElement>("#name-entry-message")!;
const nameEntrySubmitButton = document.querySelector<HTMLButtonElement>("#name-entry-submit")!;
const leaderboardBody = document.querySelector<HTMLTableSectionElement>("#leaderboard-body")!;
const visitorCountEl = document.querySelector<HTMLSpanElement>("#visitor-count")!;
const guestbookList = document.querySelector<HTMLDivElement>("#guestbook-list")!;
const guestbookForm = document.querySelector<HTMLFormElement>("#guestbook-form")!;
const guestbookNameInput = document.querySelector<HTMLInputElement>("#guestbook-name")!;
const guestbookMessageInput = document.querySelector<HTMLInputElement>("#guestbook-message")!;
const guestbookPasswordInput = document.querySelector<HTMLInputElement>("#guestbook-password")!;
const guestbookOpenCard = document.querySelector<HTMLButtonElement>("#guestbook-open-card")!;
const guestbookOverlay = document.querySelector<HTMLDivElement>("#guestbook-overlay")!;
const guestbookCloseButton = document.querySelector<HTMLButtonElement>("#guestbook-close-button")!;
const photoCountdownOverlay = document.querySelector<HTMLDivElement>("#photo-countdown-overlay")!;
const photoCountdownDescEl = document.querySelector<HTMLDivElement>("#photo-countdown-desc")!;
const photoCountdownNumberEl = document.querySelector<HTMLDivElement>("#photo-countdown-number")!;
const photoLightboxOverlay = document.querySelector<HTMLDivElement>("#photo-lightbox-overlay")!;
const photoLightboxImage = document.querySelector<HTMLImageElement>("#photo-lightbox-image")!;
const ctx = canvas.getContext("2d")!;

let selectedSongFile: File | null = null;

function updateSongFileNameDisplay(): void {
  if (selectedSongFile) {
    songFileName.textContent = `선택됨: ${selectedSongFile.name}`;
  } else if (bgmModeDefaultRadio.checked) {
    songFileName.textContent = "YBJ 힙합 트랙 중 랜덤 선택됨";
  } else {
    songFileName.textContent = "선택 안 함 — 무반주 연습 트랙으로 시작";
  }
}

songFileInput.addEventListener("change", () => {
  selectedSongFile = songFileInput.files?.[0] ?? null;
  updateSongFileNameDisplay();
});
bgmModeTestRadio.addEventListener("change", updateSongFileNameDisplay);
bgmModeDefaultRadio.addEventListener("change", updateSongFileNameDisplay);

async function renderLeaderboard(): Promise<void> {
  const board = await loadLeaderboard();
  if (board.length === 0) {
    leaderboardBody.innerHTML = `<tr id="leaderboard-empty"><td colspan="9">기록이 없습니다 — 첫 기록의 주인공이 되어보세요!</td></tr>`;
    return;
  }
  leaderboardBody.innerHTML = board
    .map(
      (entry, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(entry.name)}</td>
          <td>${entry.photo ? `<img class="leaderboard-photo-thumb" data-photo-index="${index}" alt="${escapeHtml(entry.name)} 사진" />` : `<span class="leaderboard-photo-empty">-</span>`}</td>
          <td>${escapeHtml(entry.message)}</td>
          <td>${entry.score}</td>
          <td>${escapeHtml(entry.speed)}</td>
          <td>${escapeHtml(entry.difficulty)}</td>
          <td>${escapeHtml(entry.bgm)}</td>
          <td>${formatLocalDate(entry.dateIso)}</td>
        </tr>`,
    )
    .join("");

  // Set via the DOM property, not interpolated into the HTML attribute above — consistent with how
  // guestbook message editing avoids putting arbitrary content inside an attribute value.
  board.forEach((entry, index) => {
    if (!entry.photo) return;
    const img = leaderboardBody.querySelector<HTMLImageElement>(`img[data-photo-index="${index}"]`);
    if (img) img.src = entry.photo;
  });
}

leaderboardBody.addEventListener("click", (event) => {
  const img = (event.target as HTMLElement).closest<HTMLImageElement>(".leaderboard-photo-thumb");
  if (!img) return;
  photoLightboxImage.src = img.src;
  photoLightboxOverlay.style.display = "flex";
});

photoLightboxOverlay.addEventListener("click", () => {
  photoLightboxOverlay.style.display = "none";
  photoLightboxImage.src = "";
});

/** Local calendar date, not the ISO string's UTC date — slicing the raw ISO string would show the
 *  wrong day for anyone playing near midnight in a timezone ahead of UTC (e.g. KST). */
function formatLocalDate(dateIso: string): string {
  const d = new Date(dateIso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

async function renderGuestbook(): Promise<void> {
  const entries = await loadGuestbook();
  if (entries.length === 0) {
    guestbookList.innerHTML = `<p id="guestbook-empty">아직 방명록이 없습니다 — 첫 글을 남겨보세요!</p>`;
    return;
  }
  guestbookList.innerHTML = entries
    .map(
      (entry) => `
        <div class="guestbook-entry" data-id="${entry.id}">
          <div class="guestbook-entry-top">
            <span class="guestbook-entry-name">${escapeHtml(entry.name)}</span>
            <span class="guestbook-entry-date">${formatLocalDate(entry.dateIso)}</span>
          </div>
          <div class="guestbook-entry-message">${escapeHtml(entry.message)}</div>
          <div class="guestbook-entry-actions">
            <button type="button" class="guestbook-action-btn" data-action="edit" data-id="${entry.id}">수정</button>
            <button type="button" class="guestbook-action-btn" data-action="delete" data-id="${entry.id}">삭제</button>
          </div>
          <div class="guestbook-inline-form" data-mode="edit" data-id="${entry.id}" hidden>
            <input type="text" class="guestbook-edit-message" maxlength="80" />
            <input type="password" class="guestbook-inline-password" placeholder="비밀번호" maxlength="20" />
            <span class="guestbook-inline-error" hidden>비밀번호가 일치하지 않습니다</span>
            <div class="guestbook-inline-actions">
              <button type="button" class="guestbook-confirm-btn" data-action="save" data-id="${entry.id}">저장</button>
              <button type="button" class="guestbook-cancel-btn" data-action="cancel" data-id="${entry.id}">취소</button>
            </div>
          </div>
          <div class="guestbook-inline-form" data-mode="delete" data-id="${entry.id}" hidden>
            <input type="password" class="guestbook-inline-password" placeholder="비밀번호" maxlength="20" />
            <span class="guestbook-inline-error" hidden>비밀번호가 일치하지 않습니다</span>
            <div class="guestbook-inline-actions">
              <button type="button" class="guestbook-confirm-btn" data-action="confirm-delete" data-id="${entry.id}">삭제 확인</button>
              <button type="button" class="guestbook-cancel-btn" data-action="cancel" data-id="${entry.id}">취소</button>
            </div>
          </div>
        </div>`,
    )
    .join("");

  // Set via the DOM property, never interpolated into the HTML attribute above — a message
  // containing a `"` could otherwise break out of a `value="..."` attribute.
  for (const entry of entries) {
    const editInput = guestbookList.querySelector<HTMLInputElement>(`.guestbook-inline-form[data-mode="edit"][data-id="${entry.id}"] .guestbook-edit-message`);
    if (editInput) editInput.value = entry.message;
  }
}

function hideAllGuestbookForms(): void {
  guestbookList.querySelectorAll<HTMLDivElement>(".guestbook-inline-form").forEach((form) => {
    form.hidden = true;
    const error = form.querySelector<HTMLSpanElement>(".guestbook-inline-error");
    if (error) error.hidden = true;
    const password = form.querySelector<HTMLInputElement>(".guestbook-inline-password");
    if (password) password.value = "";
  });
}

guestbookList.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-action]");
  if (!button) return;
  const id = Number(button.dataset.id);
  const action = button.dataset.action;
  const entry = button.closest<HTMLDivElement>(".guestbook-entry")!;

  if (action === "edit" || action === "delete") {
    const alreadyOpen = !entry.querySelector<HTMLDivElement>(`.guestbook-inline-form[data-mode="${action}"]`)?.hidden;
    hideAllGuestbookForms();
    if (!alreadyOpen) {
      const form = entry.querySelector<HTMLDivElement>(`.guestbook-inline-form[data-mode="${action}"]`)!;
      form.hidden = false;
    }
    return;
  }

  if (action === "cancel") {
    hideAllGuestbookForms();
    return;
  }

  if (action === "save") {
    const form = entry.querySelector<HTMLDivElement>(`.guestbook-inline-form[data-mode="edit"][data-id="${id}"]`)!;
    const message = form.querySelector<HTMLInputElement>(".guestbook-edit-message")!.value.trim();
    const password = form.querySelector<HTMLInputElement>(".guestbook-inline-password")!.value;
    const errorEl = form.querySelector<HTMLSpanElement>(".guestbook-inline-error")!;
    if (!message || !password) return;
    void editGuestbookEntry(id, message, password)
      .then(() => renderGuestbook())
      .catch((err) => {
        if (err instanceof WrongPasswordError) {
          errorEl.hidden = false;
        } else {
          console.error("방명록 수정 실패:", err);
        }
      });
    return;
  }

  if (action === "confirm-delete") {
    const form = entry.querySelector<HTMLDivElement>(`.guestbook-inline-form[data-mode="delete"][data-id="${id}"]`)!;
    const password = form.querySelector<HTMLInputElement>(".guestbook-inline-password")!.value;
    const errorEl = form.querySelector<HTMLSpanElement>(".guestbook-inline-error")!;
    if (!password) return;
    void deleteGuestbookEntry(id, password)
      .then(() => renderGuestbook())
      .catch((err) => {
        if (err instanceof WrongPasswordError) {
          errorEl.hidden = false;
        } else {
          console.error("방명록 삭제 실패:", err);
        }
      });
  }
});

guestbookForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = guestbookNameInput.value.trim();
  const message = guestbookMessageInput.value.trim();
  const password = guestbookPasswordInput.value;
  if (!name || !message || !password) return;
  void addGuestbookEntry({ name, message, password })
    .then(() => {
      guestbookNameInput.value = "";
      guestbookMessageInput.value = "";
      guestbookPasswordInput.value = "";
      return renderGuestbook();
    })
    .catch((err) => console.error("방명록 등록 실패:", err));
});

guestbookOpenCard.addEventListener("click", () => {
  guestbookOverlay.style.display = "flex";
  void renderGuestbook(); // refresh in case other visitors added entries since page load
});

guestbookCloseButton.addEventListener("click", () => {
  guestbookOverlay.style.display = "none";
  hideAllGuestbookForms();
});

void renderLeaderboard();
void renderGuestbook();

void reportVisit().then((count) => {
  if (count !== null) visitorCountEl.textContent = count.toLocaleString();
});

/** Grabs the current camera frame as a JPEG data URL. Mirrored horizontally to match what the
 *  player actually saw on screen while posing — the live <video> is only mirrored via a CSS
 *  transform, the underlying frame data is not, so an unmirrored capture would look flipped. */
function capturePhoto(videoEl: HTMLVideoElement): string {
  const captureCanvas = document.createElement("canvas");
  captureCanvas.width = videoEl.videoWidth;
  captureCanvas.height = videoEl.videoHeight;
  const captureCtx = captureCanvas.getContext("2d")!;
  captureCtx.translate(captureCanvas.width, 0);
  captureCtx.scale(-1, 1);
  captureCtx.drawImage(videoEl, 0, 0, captureCanvas.width, captureCanvas.height);
  return captureCanvas.toDataURL("image/jpeg", 0.85);
}

/** Counts down over the still-live camera feed (see endGame — camera.stop() is deliberately
 *  deferred until after this resolves) and captures a photo the moment it hits zero. Two phases:
 *  first the rank announcement sits alone for a couple seconds so it actually gets read, then the
 *  5-4-3-2-1 number starts — showing both at once from the start meant most players never noticed
 *  which rank they'd hit before the photo fired. */
function runPhotoCountdown(videoEl: HTMLVideoElement, rank: number): Promise<string> {
  return new Promise((resolve) => {
    photoCountdownDescEl.textContent = `${rank}위 입성을 축하합니다! 기념촬영을 하겠습니다.`;
    photoCountdownNumberEl.textContent = "";
    photoCountdownOverlay.style.display = "flex";

    setTimeout(() => {
      let count = 5;
      photoCountdownNumberEl.textContent = String(count);
      const interval = setInterval(() => {
        count -= 1;
        if (count > 0) {
          photoCountdownNumberEl.textContent = String(count);
          return;
        }
        clearInterval(interval);
        const photo = capturePhoto(videoEl);
        photoCountdownOverlay.style.display = "none";
        resolve(photo);
      }, 1000);
    }, 2000);
  });
}

/** Sizes #stage in exact pixels to fit the viewport while preserving the video's native aspect ratio. */
function fitStageToViewport(videoWidth: number, videoHeight: number): void {
  const viewportAspect = window.innerWidth / window.innerHeight;
  const videoAspect = videoWidth / videoHeight;
  let width: number;
  let height: number;
  if (videoAspect > viewportAspect) {
    width = window.innerWidth;
    height = width / videoAspect;
  } else {
    height = window.innerHeight;
    width = height * videoAspect;
  }
  stage.style.width = `${width}px`;
  stage.style.height = `${height}px`;
}

async function startApp(
  sfxEngine: SfxEngine,
  audioCtx: AudioContext,
  lookaheadMs: number,
  density: ChartDensity,
  songFile: File | null,
  enableCalibration: boolean,
  speedLabel: string,
  difficultyLabel: string,
  defaultTrack: DefaultTrack | null,
): Promise<void> {
  hud.textContent = "카메라 권한을 요청하는 중...";

  const camera = new CameraManager(video);
  try {
    await camera.start();
  } catch (err) {
    hud.textContent = `카메라 접근 실패: ${(err as Error).message}`;
    startOverlay.style.removeProperty("display");
    return;
  }

  // Size the stage to the camera's native aspect ratio and the canvas's
  // drawing buffer to its native resolution, so normalized landmark
  // coordinates map 1:1 onto displayed pixels with no crop/letterbox math.
  fitStageToViewport(video.videoWidth, video.videoHeight);
  window.addEventListener("resize", () => fitStageToViewport(video.videoWidth, video.videoHeight));
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  // Safari's WebGL backend has been unreliable with MediaPipe's GPU delegate — hand tracking would
  // detect once and then silently stop producing results on later frames. CPU is slower but stable
  // there. ?delegate=cpu/gpu (used for the perf A/B testing above) always overrides this default.
  const delegateOverride = new URLSearchParams(location.search).get("delegate")?.toUpperCase();
  const isSafari = /^((?!chrome|crios|fxios|android).)*safari/i.test(navigator.userAgent);
  const delegate: "GPU" | "CPU" =
    delegateOverride === "CPU" || delegateOverride === "GPU" ? delegateOverride : isSafari ? "CPU" : "GPU";

  hud.textContent = songFile
    ? `리소스 로딩 중... (음원 분석해서 채보 생성, 손 인식: ${delegate})`
    : `리소스 로딩 중... (손 인식: ${delegate})`;
  const handTracker = new HandLandmarkerService();
  const audioEngine = new AudioEngine(audioCtx);
  const scoreManager = new ScoreManager();

  // Wired up early (before calibration) so the player can bail out during the loading/calibration
  // wait, not just once gameplay has actually started.
  let stopped = false;
  stopButton.style.display = "block";
  scoreHud.style.display = "block";
  scoreValueEl.textContent = "0";
  if (defaultTrack) {
    trackInfoTitleEl.textContent = defaultTrack.title;
    trackInfoProducerEl.textContent = defaultTrack.producer;
    trackInfoEl.style.display = "block";
  } else {
    trackInfoEl.style.display = "none";
  }
  stopButton.onclick = () => {
    stopped = true;
    camera.stop();
    handTracker.dispose();
    audioEngine.stop();
    void audioCtx.close();
    stopButton.style.display = "none";
    scoreHud.style.display = "none";
    trackInfoEl.style.display = "none";
    calibrationStatus.style.display = "none";
    startOverlay.style.removeProperty("display");
    hud.textContent = "중단됨";
  };

  // Chart/audio loading (up to ~16s for onset detection on a real song) runs in the background
  // while finger calibration (~15-20s) happens in the foreground — they don't share any resource,
  // so overlapping them keeps the total wait closer to max(chart, calibration) than their sum.
  const loadChart = songFile
    ? buildChartFromFile(audioCtx, songFile, density).then((built) => {
        audioEngine.loadBuffer(built.audioBuffer);
        return built.chart.notes;
      })
    : audioEngine.loadClickTrack(TEST_BPM, TEST_BEAT_COUNT).then(() => buildTestChart(TEST_BPM, TEST_BEAT_COUNT, density));

  await Promise.all([handTracker.initialize({ delegate }), sfxEngine.loadScratchSample("/audio/Hiphop_Deejaying.mp3")]);

  let calibratedZones: KeyZone[] | undefined;
  if (enableCalibration) {
    calibrationStatus.style.display = "block";
    calibratedZones = await runFingerCalibration(camera, handTracker, (text) => {
      calibrationStatus.textContent = text;
    });
    calibrationStatus.style.display = "none";
  }

  hud.textContent = "채보 준비 중...";
  const chart = await loadChart;
  const noteScheduler = new NoteScheduler(chart);
  const judgmentEngine = new JudgmentEngine(chart);

  // A selected song plays to its natural end; the default test track runs for a fixed 2 minutes.
  const gameDurationMs = songFile ? audioEngine.getDurationMs() : DEFAULT_GAME_DURATION_MS;
  const bgmLabel = defaultTrack ? "YBJ" : songFile ? "자유" : "무반주";

  const skeletonRenderer = new DebugSkeletonRenderer(ctx);
  const gestureDetector = new GestureDetector(calibratedZones);
  const scratchDetector = new ScratchDetector();
  const zoneDebugRenderer = new ZoneDebugRenderer(ctx);
  const noteRenderer = new NoteRenderer(ctx);
  const judgmentRenderer = new JudgmentRenderer(ctx);
  const zones = gestureDetector.getZones();
  const scratchZone = computeScratchZone();

  function registerJudgment(result: JudgmentResult): void {
    judgmentRenderer.register(result);
    scoreManager.addJudgment(result.tier);
    scoreValueEl.textContent = String(scoreManager.getScore());
  }

  /** Called once the run reaches its natural end (song finished, or 2-minute default track elapsed) —
   *  distinct from stopButton's abort path, which bails out without showing a score. Note that
   *  camera.stop() is deliberately NOT called here — a top-10 score needs the live feed for the
   *  photo countdown, so it's deferred until each branch below knows whether that's needed. */
  function endGame(): void {
    stopped = true;
    handTracker.dispose();
    audioEngine.stop();
    void audioCtx.close();
    stopButton.style.display = "none";
    scoreHud.style.display = "none";
    trackInfoEl.style.display = "none";

    const finalScore = scoreManager.getScore();
    const counts = scoreManager.getCounts();
    resultsScoreEl.textContent = String(finalScore);
    resultsBreakdownEl.textContent = `Great ${counts.Great}   Good ${counts.Good}   Bad ${counts.Bad}`;
    resultsOverlay.style.display = "flex";

    let capturedPhoto: string | null = null;

    resultsConfirmButton.onclick = async () => {
      resultsOverlay.style.display = "none";
      if (await qualifiesForTop20(finalScore)) {
        const rank = await computeProjectedRank(finalScore);
        capturedPhoto = await runPhotoCountdown(video, rank);
        camera.stop();
        nameEntryOverlay.style.display = "flex";
      } else {
        camera.stop();
        startOverlay.style.removeProperty("display");
      }
    };

    nameEntrySubmitButton.onclick = async () => {
      const name = nameEntryNameInput.value.trim() || "익명";
      const message = nameEntryMessageInput.value.trim();
      try {
        await addLeaderboardEntry({
          name,
          message,
          score: finalScore,
          speed: speedLabel,
          difficulty: difficultyLabel,
          bgm: bgmLabel,
          photo: capturedPhoto,
        });
      } catch (err) {
        console.error("리더보드 저장 실패:", err);
      }
      nameEntryNameInput.value = "";
      nameEntryMessageInput.value = "";
      nameEntryOverlay.style.display = "none";
      await renderLeaderboard();
      startOverlay.style.removeProperty("display");
    };
  }

  // Hand-tracking runs at camera/inference FPS (often well under 60); rendering runs on its own
  // rAF loop at display refresh rate so note scrolling stays smooth and audio-synced regardless.
  // The render loop always reads whatever hand-tracking state was most recently produced.
  let latestHands: HandFrame[] = [];
  let latestDebug: FingertipDebugSample[] = [];

  let lastFpsSampleTime = performance.now();
  let frameCount = 0;
  let fps = 0;
  let inferenceMsSum = 0;
  let inferenceMsAvg = 0;
  let pressCount = 0;

  let framesSeen = 0;
  let lastDetectError = "";

  camera.onFrame((videoEl, metadata) => {
    framesSeen += 1;

    let result;
    try {
      result = handTracker.detect(videoEl, metadata.mediaTime * 1000, metadata.presentationTime);
    } catch (err) {
      // Surfaced directly in the HUD (not just console.error) because a phone has no devtools —
      // this is the only way to see what actually failed on a device we can't remote-debug.
      lastDetectError = (err as Error).message;
      hud.textContent = `손 인식 오류 (프레임 ${framesSeen}): ${lastDetectError}`;
      return;
    }
    latestHands = result.hands;

    const { events, debug } = gestureDetector.process(result.hands, result.frameTimestampMs);
    latestDebug = debug;
    zoneDebugRenderer.registerPresses(events);
    for (const event of events) {
      pressCount += 1;
      sfxEngine.playKeyTone(event.lane);
      const judgment = judgmentEngine.judgeAttempt(event.lane, audioEngine.getSongTimeMs());
      if (judgment) registerJudgment(judgment);
    }

    const scratchEvent = scratchDetector.process(result.hands, result.frameTimestampMs, scratchZone, canvas.width, canvas.height);
    sfxEngine.updateScratch(scratchDetector.getScratchVelocityPerSec(), scratchDetector.isEngaged());

    // A single qualifying slide anywhere inside a scratch note's hold window is enough to count it —
    // no timing precision required, just "did you slide at least once while the tube was passing through".
    const isScratchActionActive = scratchDetector.isEngaged() && Math.abs(scratchDetector.getScratchVelocityPerSec()) > 0.5;
    judgmentEngine.markHoldActive(SCRATCH_LANE, audioEngine.getSongTimeMs(), isScratchActionActive);

    frameCount += 1;
    inferenceMsSum += result.inferenceMs;
    const now = performance.now();
    if (now - lastFpsSampleTime >= 500) {
      fps = Math.round((frameCount * 1000) / (now - lastFpsSampleTime));
      inferenceMsAvg = inferenceMsSum / frameCount;
      frameCount = 0;
      inferenceMsSum = 0;
      lastFpsSampleTime = now;
    }
    const scratchStatus = scratchDetector.isEngaged()
      ? `engaged (${scratchEvent?.direction ?? "none"}, ${(scratchEvent?.scratchVelocityPerSec ?? 0).toFixed(1)}/s)`
      : "idle";
    hud.textContent = `Delegate: ${delegate}\nFPS: ${fps}\n프레임 수신: ${framesSeen}\nDetect: ${inferenceMsAvg.toFixed(1)}ms\n감지된 손: ${result.hands.length}\n누름 횟수: ${pressCount}\n스크래치: ${scratchStatus}\nAudioCtx: ${audioCtx.state}`;
  });

  // iOS Safari can leave (or put) the AudioContext in "suspended" during the loading/calibration
  // wait — sometimes tens of seconds after the click that originally resumed it — silencing every
  // sound with no visible error. Re-resuming right before playback starts, and again whenever the
  // tab regains focus, is cheap and catches that without needing a fresh user gesture each time.
  if (audioCtx.state !== "running") void audioCtx.resume();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && audioCtx.state !== "running") void audioCtx.resume();
  });

  audioEngine.play();

  function renderFrame(): void {
    if (stopped) return;

    // Note scroll position is recomputed from the audio clock every frame — never accumulated
    // from render deltas — so it can't drift even if a frame is dropped or delayed.
    const songTimeMs = audioEngine.getSongTimeMs();

    if (songTimeMs >= gameDurationMs) {
      endGame();
      return;
    }

    for (const miss of judgmentEngine.sweepMisses(songTimeMs)) {
      registerJudgment(miss);
    }
    for (const holdResult of judgmentEngine.sweepHoldNotes(SCRATCH_LANE, songTimeMs)) {
      registerJudgment(holdResult);
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    zoneDebugRenderer.draw(zones, latestDebug, canvas.width, canvas.height);
    zoneDebugRenderer.drawScratchDisk(scratchZone, scratchDetector.getRotationRad(), scratchDetector.isEngaged(), canvas.width, canvas.height);
    const visibleNotes = noteScheduler.getVisibleNotes(songTimeMs, lookaheadMs, 200);
    noteRenderer.draw(visibleNotes, zones, scratchZone, songTimeMs, lookaheadMs, canvas.width, canvas.height);
    skeletonRenderer.draw(latestHands, canvas.width, canvas.height);
    judgmentRenderer.draw(zones, scratchZone, canvas.width, canvas.height);

    requestAnimationFrame(renderFrame);
  }
  requestAnimationFrame(renderFrame);
}

startButton.addEventListener("click", () => {
  startOverlay.style.display = "none";

  const speedKey = speedSelect.value as keyof typeof SPEED_PRESETS;
  const difficultyKey = difficultySelect.value as keyof typeof DIFFICULTY_PRESETS;
  const lookaheadMs = SPEED_PRESETS[speedKey] ?? SPEED_PRESETS.normal;
  const density = DIFFICULTY_PRESETS[difficultyKey] ?? DIFFICULTY_PRESETS.easy;
  const speedLabel = SPEED_LABELS[speedKey] ?? SPEED_LABELS.normal;
  const difficultyLabel = DIFFICULTY_LABELS[difficultyKey] ?? DIFFICULTY_LABELS.easy;

  // AudioContext must be created/resumed synchronously inside a real click handler
  // for the browser's autoplay policy to treat it as user-initiated.
  const audioCtx = new AudioContext();
  void audioCtx.resume();
  const sfxEngine = new SfxEngine(audioCtx);

  if (selectedSongFile) {
    void startApp(sfxEngine, audioCtx, lookaheadMs, density, selectedSongFile, calibrationToggle.checked, speedLabel, difficultyLabel, null);
  } else if (bgmModeDefaultRadio.checked) {
    const track = pickRandomDefaultTrack();
    fetch(track.fileUrl)
      .then((res) => res.blob())
      .then((blob) => new File([blob], track.fileName, { type: blob.type }))
      .then((file) => startApp(sfxEngine, audioCtx, lookaheadMs, density, file, calibrationToggle.checked, speedLabel, difficultyLabel, track))
      .catch((err) => {
        hud.textContent = `YBJ 힙합 트랙 로드 실패: ${(err as Error).message}`;
        startOverlay.style.removeProperty("display");
      });
  } else {
    void startApp(sfxEngine, audioCtx, lookaheadMs, density, null, calibrationToggle.checked, speedLabel, difficultyLabel, null);
  }
});
