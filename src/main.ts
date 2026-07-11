import "./style.css";
import { AudioEngine } from "./audio/AudioEngine";
import { SfxEngine } from "./audio/SfxEngine";
import { adminLogin, WrongAdminPasswordError } from "./game/Admin";
import { runFingerCalibration } from "./calibration/CalibrationFlow";
import { CameraManager } from "./camera/CameraManager";
import { buildChartFromFile } from "./chartGen/ChartBuilder";
import { pickRandomDefaultTrack, type DefaultTrack } from "./game/DefaultTracks";
import {
  addGuestbookEntry,
  adminDeleteGuestbookEntries,
  deleteGuestbookEntry,
  editGuestbookEntry,
  loadGuestbook,
  NoPasswordSetError,
  WrongPasswordError,
  type GuestbookEntry,
} from "./game/Guestbook";
import { addLeaderboardEntry, adminDeleteLeaderboardEntries, computeProjectedRank, loadLeaderboard, qualifiesForTop20 } from "./game/Leaderboard";
import { JudgmentEngine, type JudgmentResult } from "./game/JudgmentEngine";
import { adminSetBanner, loadBanner, type BannerMode } from "./game/Notice";
import { NoteScheduler } from "./game/NoteScheduler";
import { getPlatformIcon, PLATFORM_ICONS } from "./game/PlatformIcons";
import { ScoreManager } from "./game/ScoreManager";
import { adminAddSocialLink, adminDeleteSocialLink, adminUpdateSocialLink, loadSocialLinks } from "./game/SocialLinks";
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
// conflating the two was why doubling one alone didn't fix "the game feels too fast". "extreme"
// (개빠름) is fast's time divided by 1.5 — 1.5x the on-screen scroll speed.
const SPEED_PRESETS: Record<"slow" | "normal" | "fast" | "extreme", number> = {
  slow: 3200,
  normal: 2400,
  fast: 1600,
  extreme: 1067,
};

// Human-readable labels recorded on the leaderboard alongside the score, so a run can be compared
// against others played at the same speed/difficulty rather than just by raw point total.
const SPEED_LABELS: Record<keyof typeof SPEED_PRESETS, string> = {
  slow: "느림",
  normal: "보통",
  fast: "빠름",
  extreme: "개빠름",
};
const DIFFICULTY_LABELS: Record<keyof typeof DIFFICULTY_PRESETS, string> = {
  easy: "쉬움",
  normal: "보통",
  hard: "어려움",
  extreme: "개어려움",
};

// Ordering used to enforce the step-escalation rule: the next step's speed/difficulty must each be
// >= the just-finished step's, and at least one of the two must be strictly greater.
const SPEED_ORDER: (keyof typeof SPEED_PRESETS)[] = ["slow", "normal", "fast", "extreme"];
const DIFFICULTY_ORDER: (keyof typeof DIFFICULTY_PRESETS)[] = ["easy", "normal", "hard", "extreme"];

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
const bgmModeDefaultRadio = document.querySelector<HTMLInputElement>("#bgm-mode-default")!;
const trackInfoEl = document.querySelector<HTMLDivElement>("#track-info")!;
const trackInfoTitleEl = document.querySelector<HTMLDivElement>("#track-info-title")!;
const trackInfoProducerEl = document.querySelector<HTMLDivElement>("#track-info-producer")!;
const calibrationToggle = document.querySelector<HTMLInputElement>("#calibration-toggle")!;
const calibrationStatus = document.querySelector<HTMLDivElement>("#calibration-status")!;
const scoreHud = document.querySelector<HTMLDivElement>("#score-hud")!;
const scoreValueEl = document.querySelector<HTMLDivElement>("#score-value")!;
const resultsOverlay = document.querySelector<HTMLDivElement>("#results-overlay")!;
const resultsStepLabelEl = document.querySelector<HTMLDivElement>("#results-step-label")!;
const resultsScoreEl = document.querySelector<HTMLDivElement>("#results-score")!;
const resultsBreakdownEl = document.querySelector<HTMLDivElement>("#results-breakdown")!;
const resultsNextStepButton = document.querySelector<HTMLButtonElement>("#results-next-step-button")!;
const resultsConfirmButton = document.querySelector<HTMLButtonElement>("#results-confirm-button")!;
const stepSetupOverlay = document.querySelector<HTMLDivElement>("#step-setup-overlay")!;
const stepSetupNumberEl = document.querySelector<HTMLSpanElement>("#step-setup-number")!;
const stepBgmModeDefaultRadio = document.querySelector<HTMLInputElement>("#step-bgm-mode-default")!;
const stepSongFileInput = document.querySelector<HTMLInputElement>("#step-song-file-input")!;
const stepSpeedSelect = document.querySelector<HTMLSelectElement>("#step-speed-select")!;
const stepDifficultySelect = document.querySelector<HTMLSelectElement>("#step-difficulty-select")!;
const stepSetupWarning = document.querySelector<HTMLParagraphElement>("#step-setup-warning")!;
const stepStartButton = document.querySelector<HTMLButtonElement>("#step-start-button")!;
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
const installGuideCards = document.querySelectorAll<HTMLButtonElement>(".install-guide-card");
const installGuideOverlay = document.querySelector<HTMLDivElement>("#install-guide-overlay")!;
const installGuideModalTitle = document.querySelector<HTMLDivElement>("#install-guide-modal-title")!;
const installGuideModalSteps = document.querySelector<HTMLOListElement>("#install-guide-modal-steps")!;
const installGuideCloseButton = document.querySelector<HTMLButtonElement>("#install-guide-close-button")!;
const adminLoginLink = document.querySelector<HTMLButtonElement>("#admin-login-link")!;
const adminLogoutButton = document.querySelector<HTMLButtonElement>("#admin-logout-button")!;
const adminLoginOverlay = document.querySelector<HTMLDivElement>("#admin-login-overlay")!;
const adminLoginPasswordInput = document.querySelector<HTMLInputElement>("#admin-login-password")!;
const adminLoginError = document.querySelector<HTMLSpanElement>("#admin-login-error")!;
const adminLoginSubmitButton = document.querySelector<HTMLButtonElement>("#admin-login-submit")!;
const adminLoginCancelButton = document.querySelector<HTMLButtonElement>("#admin-login-cancel")!;
const leaderboardAdminDeleteButton = document.querySelector<HTMLButtonElement>("#leaderboard-admin-delete-button")!;
const guestbookAdminDeleteButton = document.querySelector<HTMLButtonElement>("#guestbook-admin-delete-button")!;
const adminPanelOpenButton = document.querySelector<HTMLButtonElement>("#admin-panel-open-button")!;
const adminPanelOverlay = document.querySelector<HTMLDivElement>("#admin-panel-overlay")!;
const adminPanelCloseButton = document.querySelector<HTMLButtonElement>("#admin-panel-close-button")!;
const adminNoticeInput = document.querySelector<HTMLTextAreaElement>("#admin-notice-input")!;
const adminGraffitiInput = document.querySelector<HTMLInputElement>("#admin-graffiti-input")!;
const adminBannerModeRadios = document.querySelectorAll<HTMLInputElement>('input[name="admin-banner-mode"]');
const adminBannerSaveButton = document.querySelector<HTMLButtonElement>("#admin-banner-save-button")!;
const adminSocialLinksList = document.querySelector<HTMLDivElement>("#admin-social-links-list")!;
const adminSocialLinkPlatformSelect = document.querySelector<HTMLSelectElement>("#admin-social-link-platform")!;
const adminSocialLinkUrlInput = document.querySelector<HTMLInputElement>("#admin-social-link-url")!;
const adminSocialLinkAddButton = document.querySelector<HTMLButtonElement>("#admin-social-link-add-button")!;
const socialLinksContainer = document.querySelector<HTMLDivElement>("#social-links-container")!;
const noticeBoard = document.querySelector<HTMLDivElement>("#notice-board")!;
const noticeBoardLabel = document.querySelector<HTMLDivElement>("#notice-board-label")!;
const noticeBoardText = document.querySelector<HTMLDivElement>("#notice-board-text")!;
const noticeBoardGraffiti = document.querySelector<HTMLDivElement>("#notice-board-graffiti")!;
const ctx = canvas.getContext("2d")!;

let selectedSongFile: File | null = null;
let stepSelectedSongFile: File | null = null;

// Admin mode: no session/token, just the password kept in memory (and sessionStorage so a reload
// within the same tab doesn't force re-login) and re-sent with every delete call for the server to
// re-verify — see supabase/schema.sql's admin_login()/admin_delete_* functions.
let adminPassword: string | null = sessionStorage.getItem("bdj-admin-password");
const selectedLeaderboardIds = new Set<number>();
const selectedGuestbookIds = new Set<number>();

songFileInput.addEventListener("change", () => {
  selectedSongFile = songFileInput.files?.[0] ?? null;
});
stepSongFileInput.addEventListener("change", () => {
  stepSelectedSongFile = stepSongFileInput.files?.[0] ?? null;
});

async function renderLeaderboard(): Promise<void> {
  const board = await loadLeaderboard();
  selectedLeaderboardIds.clear();
  leaderboardAdminDeleteButton.hidden = !adminPassword;
  if (board.length === 0) {
    leaderboardBody.innerHTML = `<tr id="leaderboard-empty"><td colspan="10">기록이 없습니다 — 첫 기록의 주인공이 되어보세요!</td></tr>`;
    return;
  }
  leaderboardBody.innerHTML = board
    .map(
      (entry, index) => `
        <tr>
          <td>${adminPassword ? `<input type="checkbox" class="leaderboard-select-checkbox" data-id="${entry.id}" /> ` : ""}${index + 1}</td>
          <td>${escapeHtml(entry.name)}</td>
          <td>${entry.photo ? `<img class="leaderboard-photo-thumb" data-photo-index="${index}" alt="${escapeHtml(entry.name)} 사진" />` : `<span class="leaderboard-photo-empty">-</span>`}</td>
          <td>${escapeHtml(entry.message)}</td>
          <td>${entry.score}</td>
          <td>${escapeHtml(entry.speed)}</td>
          <td>${escapeHtml(entry.difficulty)}</td>
          <td>${entry.step}</td>
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

leaderboardBody.addEventListener("change", (event) => {
  const checkbox = event.target as HTMLInputElement;
  if (!checkbox.classList.contains("leaderboard-select-checkbox")) return;
  const id = Number(checkbox.dataset.id);
  if (checkbox.checked) selectedLeaderboardIds.add(id);
  else selectedLeaderboardIds.delete(id);
});

leaderboardAdminDeleteButton.addEventListener("click", () => {
  if (!adminPassword || selectedLeaderboardIds.size === 0) return;
  if (!window.confirm(`선택한 ${selectedLeaderboardIds.size}개 기록을 삭제하시겠습니까?`)) return;
  void adminDeleteLeaderboardEntries(Array.from(selectedLeaderboardIds), adminPassword)
    .then(() => renderLeaderboard())
    .catch((err) => {
      if (err instanceof WrongAdminPasswordError) {
        forceAdminLogout("관리자 인증이 만료되었습니다. 다시 로그인해주세요.");
      } else {
        console.error("리더보드 삭제 실패:", err);
      }
    });
});

/** Local calendar date, not the ISO string's UTC date — slicing the raw ISO string would show the
 *  wrong day for anyone playing near midnight in a timezone ahead of UTC (e.g. KST). */
function formatLocalDate(dateIso: string): string {
  const d = new Date(dateIso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day} ${hh}:${mm}`;
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

/** Replies skip the reply button (only one level of nesting) and get a subtler card via the
 *  .guestbook-reply class, but are otherwise identical — same edit/delete inline forms, same
 *  admin checkbox when logged in. */
function renderGuestbookEntryHtml(entry: GuestbookEntry, isReply: boolean): string {
  return `
    <div class="guestbook-entry${isReply ? " guestbook-reply" : ""}" data-id="${entry.id}">
      <div class="guestbook-entry-top">
        ${adminPassword ? `<input type="checkbox" class="guestbook-select-checkbox" data-id="${entry.id}" />` : ""}
        <span class="guestbook-entry-name">${escapeHtml(entry.name)}</span>
        <span class="guestbook-entry-date">${formatLocalDate(entry.dateIso)}</span>
      </div>
      <div class="guestbook-entry-message">${escapeHtml(entry.message)}</div>
      <div class="guestbook-entry-actions">
        ${isReply ? "" : `<button type="button" class="guestbook-action-btn" data-action="reply" data-id="${entry.id}">답글쓰기</button>`}
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
      ${
        isReply
          ? ""
          : `<div class="guestbook-inline-form" data-mode="reply" data-id="${entry.id}" hidden>
        <input type="text" class="guestbook-reply-name" placeholder="이름" maxlength="12" />
        <input type="text" class="guestbook-reply-message" placeholder="답글을 남겨주세요" maxlength="80" />
        <input type="password" class="guestbook-reply-password" placeholder="비밀번호 (수정/삭제용)" maxlength="20" />
        <div class="guestbook-inline-actions">
          <button type="button" class="guestbook-confirm-btn" data-action="submit-reply" data-id="${entry.id}">등록</button>
          <button type="button" class="guestbook-cancel-btn" data-action="cancel" data-id="${entry.id}">취소</button>
        </div>
      </div>`
      }
    </div>`;
}

async function renderGuestbook(): Promise<void> {
  const entries = await loadGuestbook();
  selectedGuestbookIds.clear();
  guestbookAdminDeleteButton.hidden = !adminPassword;
  if (entries.length === 0) {
    guestbookList.innerHTML = `<p id="guestbook-empty">아직 방명록이 없습니다 — 첫 글을 남겨보세요!</p>`;
    return;
  }

  const topLevel = entries.filter((e) => e.parentId === null);
  const repliesByParent = new Map<number, GuestbookEntry[]>();
  for (const entry of entries) {
    if (entry.parentId === null) continue;
    const list = repliesByParent.get(entry.parentId) ?? [];
    list.push(entry);
    repliesByParent.set(entry.parentId, list);
  }
  // Oldest reply first within a thread reads more naturally than the newest-first ordering used
  // for top-level entries.
  repliesByParent.forEach((list) => list.sort((a, b) => a.id - b.id));

  guestbookList.innerHTML = topLevel
    .map((entry) => {
      const replies = repliesByParent.get(entry.id) ?? [];
      const repliesHtml = replies.map((reply) => renderGuestbookEntryHtml(reply, true)).join("");
      return renderGuestbookEntryHtml(entry, false) + (repliesHtml ? `<div class="guestbook-replies">${repliesHtml}</div>` : "");
    })
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
    form.querySelectorAll<HTMLInputElement>('input[type="password"], .guestbook-reply-name, .guestbook-reply-message').forEach((input) => {
      input.value = "";
    });
  });
}

guestbookList.addEventListener("change", (event) => {
  const checkbox = event.target as HTMLInputElement;
  if (!checkbox.classList.contains("guestbook-select-checkbox")) return;
  const id = Number(checkbox.dataset.id);
  if (checkbox.checked) selectedGuestbookIds.add(id);
  else selectedGuestbookIds.delete(id);
});

guestbookAdminDeleteButton.addEventListener("click", () => {
  if (!adminPassword || selectedGuestbookIds.size === 0) return;
  if (!window.confirm(`선택한 ${selectedGuestbookIds.size}개 글을 삭제하시겠습니까? (답글이 있는 글은 답글도 함께 삭제됩니다)`)) return;
  void adminDeleteGuestbookEntries(Array.from(selectedGuestbookIds), adminPassword)
    .then(() => renderGuestbook())
    .catch((err) => {
      if (err instanceof WrongAdminPasswordError) {
        forceAdminLogout("관리자 인증이 만료되었습니다. 다시 로그인해주세요.");
      } else {
        console.error("방명록 삭제 실패:", err);
      }
    });
});

guestbookList.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-action]");
  if (!button) return;
  const id = Number(button.dataset.id);
  const action = button.dataset.action;
  const entry = button.closest<HTMLDivElement>(".guestbook-entry")!;

  if (action === "edit" || action === "delete" || action === "reply") {
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
          errorEl.textContent = "비밀번호가 일치하지 않습니다";
          errorEl.hidden = false;
        } else if (err instanceof NoPasswordSetError) {
          errorEl.textContent = "비밀번호 없이 등록된 글은 수정할 수 없습니다";
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
          errorEl.textContent = "비밀번호가 일치하지 않습니다";
          errorEl.hidden = false;
        } else if (err instanceof NoPasswordSetError) {
          errorEl.textContent = "비밀번호 없이 등록된 글은 삭제할 수 없습니다";
          errorEl.hidden = false;
        } else {
          console.error("방명록 삭제 실패:", err);
        }
      });
    return;
  }

  if (action === "submit-reply") {
    const form = entry.querySelector<HTMLDivElement>(`.guestbook-inline-form[data-mode="reply"][data-id="${id}"]`)!;
    const name = form.querySelector<HTMLInputElement>(".guestbook-reply-name")!.value.trim();
    const message = form.querySelector<HTMLInputElement>(".guestbook-reply-message")!.value.trim();
    const password = form.querySelector<HTMLInputElement>(".guestbook-reply-password")!.value;
    if (!name || !message) return;
    void addGuestbookEntry({ name, message, password, parentId: id })
      .then(() => renderGuestbook())
      .catch((err) => console.error("답글 등록 실패:", err));
  }
});

guestbookForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = guestbookNameInput.value.trim();
  const message = guestbookMessageInput.value.trim();
  const password = guestbookPasswordInput.value;
  if (!name || !message) return;
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

const INSTALL_GUIDES: Record<"windows" | "macos" | "ios" | "android", { title: string; steps: string[] }> = {
  windows: {
    title: "🖥️ Windows에 설치하기",
    steps: [
      "크롬(Chrome) 또는 엣지(Edge) 브라우저로 이 사이트에 접속하세요.",
      "주소창(맨 위 URL 입력창) 오른쪽 끝의 설치 아이콘(⊕ 모양)을 클릭하세요. 안 보이면 오른쪽 위 점 3개(⋮) 메뉴에서 '설치'를 찾아 클릭하세요.",
      "나타나는 창에서 '설치' 버튼을 클릭하세요.",
      "바탕화면이나 시작 메뉴에 MBBM 아이콘이 생깁니다. 더블클릭하면 브라우저 주소창 없이 바로 게임이 실행됩니다.",
    ],
  },
  macos: {
    title: "💻 macOS에 설치하기",
    steps: [
      "크롬(Chrome) 또는 엣지(Edge) 브라우저로 이 사이트에 접속하세요.",
      "주소창 오른쪽 끝의 설치 아이콘(⊕ 모양)을 클릭하세요. 안 보이면 오른쪽 위 메뉴에서 '설치'를 찾아 클릭하세요.",
      "나타나는 창에서 '설치' 버튼을 클릭하세요.",
      "Dock이나 런치패드에 MBBM 아이콘이 생깁니다. 클릭하면 바로 게임이 실행됩니다.",
      "참고: 사파리(Safari)를 쓰신다면 macOS Sonoma(14) 이상에서 메뉴바의 '파일' → 'Dock에 추가'로도 설치할 수 있어요.",
    ],
  },
  ios: {
    title: "📱 iPhone에 설치하기",
    steps: [
      "반드시 사파리(Safari) 브라우저로 이 사이트에 접속하세요. 다른 브라우저(크롬 등)에서는 이 기능이 보이지 않습니다.",
      "화면 하단(또는 상단) 가운데의 공유 버튼(네모 안에 위쪽 화살표, □↑ 모양)을 탭하세요.",
      "위로 열리는 메뉴를 아래로 스크롤해서 '홈 화면에 추가'를 찾아 탭하세요.",
      "오른쪽 위의 '추가'를 탭하세요.",
      "홈 화면에 MBBM 아이콘이 생깁니다. 아이콘을 탭하면 바로 게임이 실행됩니다.",
    ],
  },
  android: {
    title: "🤖 Android에 설치하기",
    steps: [
      "안드로이드 폰의 크롬(Chrome) 앱으로 이 사이트에 접속하세요.",
      "화면 오른쪽 위의 점 3개(⋮) 메뉴를 탭하세요.",
      "메뉴에서 '앱 설치' 또는 '홈 화면에 추가'를 찾아 탭하세요. 화면 하단에 자동으로 설치 안내 배너가 뜨면 그걸 탭해도 됩니다.",
      "'설치' 버튼을 한 번 더 탭해서 확인하세요.",
      "홈 화면에 MBBM 아이콘이 생깁니다. 아이콘을 탭하면 바로 게임이 실행됩니다.",
    ],
  },
};

installGuideCards.forEach((card) => {
  card.addEventListener("click", () => {
    const platform = card.dataset.platform as keyof typeof INSTALL_GUIDES;
    const guide = INSTALL_GUIDES[platform];
    installGuideModalTitle.textContent = guide.title;
    installGuideModalSteps.innerHTML = guide.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("");
    installGuideOverlay.style.display = "flex";
  });
});

installGuideCloseButton.addEventListener("click", () => {
  installGuideOverlay.style.display = "none";
});

function setAdminModeUI(active: boolean): void {
  adminLoginLink.hidden = active;
  adminLogoutButton.hidden = !active;
  adminPanelOpenButton.hidden = !active;
}

/** Public top-right icon buttons — same for every visitor regardless of admin state. URLs are set
 *  via the `.href` DOM property, never interpolated into the HTML string, since a URL containing a
 *  `"` could otherwise break out of an `href="..."` attribute. */
async function renderSocialLinks(): Promise<void> {
  const links = await loadSocialLinks();
  socialLinksContainer.innerHTML = links
    .map((link) => {
      const icon = getPlatformIcon(link.platform);
      return `<a class="social-link-button" target="_blank" rel="noopener noreferrer" title="${escapeHtml(icon.label)}" data-link-id="${link.id}">${icon.svg}</a>`;
    })
    .join("");
  links.forEach((link) => {
    const a = socialLinksContainer.querySelector<HTMLAnchorElement>(`a[data-link-id="${link.id}"]`);
    if (a) a.href = link.url;
  });
}

/** Editable rows in the admin panel — same DOM-property pattern as renderSocialLinks for the URL. */
async function renderAdminSocialLinksList(): Promise<void> {
  const links = await loadSocialLinks();
  const platformOptions = Object.entries(PLATFORM_ICONS)
    .map(([key, def]) => `<option value="${key}">${escapeHtml(def.label)}</option>`)
    .join("");
  adminSocialLinksList.innerHTML = links
    .map((link) => {
      const icon = getPlatformIcon(link.platform);
      return `
        <div class="admin-social-link-row" data-id="${link.id}">
          <span class="admin-social-link-icon">${icon.svg}</span>
          <select class="admin-social-link-edit-platform">${platformOptions}</select>
          <input type="url" class="admin-social-link-edit-url" />
          <button type="button" data-action="save-link" data-id="${link.id}">저장</button>
          <button type="button" data-action="delete-link" data-id="${link.id}">삭제</button>
        </div>`;
    })
    .join("");
  links.forEach((link) => {
    const row = adminSocialLinksList.querySelector<HTMLDivElement>(`.admin-social-link-row[data-id="${link.id}"]`);
    if (!row) return;
    row.querySelector<HTMLSelectElement>(".admin-social-link-edit-platform")!.value = link.platform;
    row.querySelector<HTMLInputElement>(".admin-social-link-edit-url")!.value = link.url;
  });
}

async function renderBanner(): Promise<void> {
  const banner = await loadBanner();
  const showNotice = banner.displayMode === "notice" && !!banner.message;
  const showGraffiti = banner.displayMode === "graffiti" && !!banner.graffitiText;

  noticeBoardText.textContent = banner.message ?? "";
  noticeBoardText.hidden = !showNotice;
  noticeBoardGraffiti.textContent = banner.graffitiText ?? "";
  noticeBoardGraffiti.hidden = !showGraffiti;
  noticeBoardLabel.hidden = !showNotice;
  noticeBoard.hidden = !showNotice && !showGraffiti;
}

/** Clears admin state everywhere (memory + sessionStorage) and drops back to the logged-out view.
 *  Called both for a deliberate logout and when a stored password gets rejected server-side (e.g.
 *  the owner rotated it in Supabase since the last login) mid-action. */
function forceAdminLogout(alertMessage?: string): void {
  adminPassword = null;
  sessionStorage.removeItem("bdj-admin-password");
  setAdminModeUI(false);
  void renderLeaderboard();
  void renderGuestbook();
  if (alertMessage) window.alert(alertMessage);
}

adminLoginLink.addEventListener("click", () => {
  adminLoginPasswordInput.value = "";
  adminLoginError.hidden = true;
  adminLoginOverlay.style.display = "flex";
  adminLoginPasswordInput.focus();
});

adminLoginCancelButton.addEventListener("click", () => {
  adminLoginOverlay.style.display = "none";
});

adminLoginPasswordInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") adminLoginSubmitButton.click();
});

adminLoginSubmitButton.addEventListener("click", () => {
  const password = adminLoginPasswordInput.value;
  if (!password) return;
  void adminLogin(password).then((ok) => {
    if (!ok) {
      adminLoginError.hidden = false;
      return;
    }
    adminPassword = password;
    sessionStorage.setItem("bdj-admin-password", password);
    adminLoginOverlay.style.display = "none";
    setAdminModeUI(true);
    void renderLeaderboard();
    void renderGuestbook();
  });
});

adminLogoutButton.addEventListener("click", () => forceAdminLogout());

/** Shared by every admin-panel action below — a rejected password means the stored one no longer
 *  matches (e.g. the owner rotated it directly in Supabase), so drop out of admin mode entirely
 *  rather than leaving the panel open in a now-unauthenticated state. */
function handleAdminPanelError(err: unknown, context: string): void {
  if (err instanceof WrongAdminPasswordError) {
    adminPanelOverlay.style.display = "none";
    forceAdminLogout("관리자 인증이 만료되었습니다. 다시 로그인해주세요.");
  } else {
    console.error(context, err);
  }
}

adminPanelOpenButton.addEventListener("click", () => {
  void loadBanner().then((banner) => {
    adminNoticeInput.value = banner.message ?? "";
    adminGraffitiInput.value = banner.graffitiText ?? "";
    adminBannerModeRadios.forEach((radio) => {
      radio.checked = radio.value === banner.displayMode;
    });
  });
  void renderAdminSocialLinksList();
  adminPanelOverlay.style.display = "flex";
});

adminPanelCloseButton.addEventListener("click", () => {
  adminPanelOverlay.style.display = "none";
});

adminBannerSaveButton.addEventListener("click", () => {
  if (!adminPassword) return;
  const checkedRadio = Array.from(adminBannerModeRadios).find((radio) => radio.checked);
  const displayMode = (checkedRadio?.value as BannerMode | undefined) ?? "none";
  void adminSetBanner(adminNoticeInput.value, adminGraffitiInput.value, displayMode, adminPassword)
    .then(() => renderBanner())
    .catch((err) => handleAdminPanelError(err, "배너 저장 실패:"));
});

adminSocialLinkAddButton.addEventListener("click", () => {
  if (!adminPassword) return;
  const platform = adminSocialLinkPlatformSelect.value;
  const url = adminSocialLinkUrlInput.value.trim();
  if (!url) return;
  void adminAddSocialLink(platform, url, adminPassword)
    .then(() => {
      adminSocialLinkUrlInput.value = "";
      return Promise.all([renderAdminSocialLinksList(), renderSocialLinks()]);
    })
    .catch((err) => handleAdminPanelError(err, "링크 추가 실패:"));
});

adminSocialLinksList.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-action]");
  if (!button || !adminPassword) return;
  const id = Number(button.dataset.id);
  const row = button.closest<HTMLDivElement>(".admin-social-link-row")!;
  const action = button.dataset.action;

  if (action === "save-link") {
    const platform = row.querySelector<HTMLSelectElement>(".admin-social-link-edit-platform")!.value;
    const url = row.querySelector<HTMLInputElement>(".admin-social-link-edit-url")!.value.trim();
    if (!url) return;
    void adminUpdateSocialLink(id, platform, url, adminPassword)
      .then(() => Promise.all([renderAdminSocialLinksList(), renderSocialLinks()]))
      .catch((err) => handleAdminPanelError(err, "링크 수정 실패:"));
    return;
  }

  if (action === "delete-link") {
    if (!window.confirm("이 링크 버튼을 삭제하시겠습니까?")) return;
    void adminDeleteSocialLink(id, adminPassword)
      .then(() => Promise.all([renderAdminSocialLinksList(), renderSocialLinks()]))
      .catch((err) => handleAdminPanelError(err, "링크 삭제 실패:"));
  }
});

/** A password carried over from a previous tab session (sessionStorage) is re-verified before
 *  trusting it — the owner may have rotated it in Supabase directly since then. */
async function initAdminSession(): Promise<void> {
  if (!adminPassword) return;
  const stillValid = await adminLogin(adminPassword);
  if (stillValid) {
    setAdminModeUI(true);
  } else {
    adminPassword = null;
    sessionStorage.removeItem("bdj-admin-password");
  }
}

void initAdminSession().then(() => {
  void renderLeaderboard();
  void renderGuestbook();
  void renderSocialLinks();
  void renderBanner();
});

void reportVisit().then((count) => {
  if (count !== null) visitorCountEl.textContent = count.toLocaleString();
});

// Installed as a home-screen/desktop app (standalone display mode) has no browser chrome at all —
// no address bar, no pull-to-refresh in some contexts — so there's otherwise no way to reload.
// `navigator.standalone` is iOS Safari's older, non-standard equivalent of the same check.
const pwaRefreshButton = document.querySelector<HTMLButtonElement>("#pwa-refresh-button")!;
const isStandaloneApp =
  window.matchMedia("(display-mode: standalone)").matches ||
  ("standalone" in navigator && (navigator as unknown as { standalone?: boolean }).standalone === true);
if (isStandaloneApp) {
  pwaRefreshButton.style.display = "block";
}
pwaRefreshButton.addEventListener("click", () => {
  window.location.reload();
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

/** Counts down over the still-live camera feed (see finalizeSession — camera.stop() is deliberately
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

interface StepSettings {
  songFile: File | null;
  density: ChartDensity;
  lookaheadMs: number;
  speedKey: keyof typeof SPEED_PRESETS;
  difficultyKey: keyof typeof DIFFICULTY_PRESETS;
  speedLabel: string;
  difficultyLabel: string;
  defaultTrack: DefaultTrack | null;
  bgmLabel: string;
}

function buildStepSettings(
  speedKey: keyof typeof SPEED_PRESETS,
  difficultyKey: keyof typeof DIFFICULTY_PRESETS,
  songFile: File | null,
  defaultTrack: DefaultTrack | null,
): StepSettings {
  return {
    songFile,
    density: DIFFICULTY_PRESETS[difficultyKey] ?? DIFFICULTY_PRESETS.easy,
    lookaheadMs: SPEED_PRESETS[speedKey] ?? SPEED_PRESETS.normal,
    speedKey,
    difficultyKey,
    speedLabel: SPEED_LABELS[speedKey] ?? SPEED_LABELS.normal,
    difficultyLabel: DIFFICULTY_LABELS[difficultyKey] ?? DIFFICULTY_LABELS.easy,
    defaultTrack,
    bgmLabel: defaultTrack ? "YBJ" : songFile ? "자유" : "무반주",
  };
}

/** A selected file always wins; otherwise the default-track radio fetches and wraps one of the
 *  bundled YBJ tracks as a File so it flows through the same source-agnostic chart pipeline. */
async function resolveBgmSelection(
  songFile: File | null,
  useDefaultTrack: boolean,
): Promise<{ songFile: File | null; defaultTrack: DefaultTrack | null }> {
  if (songFile) return { songFile, defaultTrack: null };
  if (!useDefaultTrack) return { songFile: null, defaultTrack: null };
  const track = pickRandomDefaultTrack();
  const blob = await fetch(track.fileUrl).then((res) => res.blob());
  return { songFile: new File([blob], track.fileName, { type: blob.type }), defaultTrack: track };
}

type StepOutcome =
  | { aborted: true }
  | { aborted: false; finalScore: number; counts: { Great: number; Good: number; Bad: number } };

/** Runs exactly one step's worth of gameplay (one song/track, load through natural end) on an
 *  already-initialized camera/hand-tracker, resolving once the step ends. Resolves aborted:true
 *  immediately on the stop button — the caller must not proceed to any leaderboard/continuation
 *  flow in that case, since a mid-run abort forfeits the whole run's eligibility. */
function playStep(
  camera: CameraManager,
  handTracker: HandLandmarkerService,
  sfxEngine: SfxEngine,
  audioCtx: AudioContext,
  calibratedZones: KeyZone[] | undefined,
  delegate: "GPU" | "CPU",
  settings: StepSettings,
  stepNumber: number,
): Promise<StepOutcome> {
  return new Promise((resolve) => {
    void (async () => {
      const { songFile, density, lookaheadMs, defaultTrack } = settings;

      const audioEngine = new AudioEngine(audioCtx);
      const scoreManager = new ScoreManager();

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
        // The scratch sample player fires grains on its own independent timer, keyed off the last
        // engaged/velocity state it was given — if the player was mid-scratch at this exact instant,
        // silencing it here (not just letting updateScratch calls stop) prevents that timer from
        // reading a permanently-frozen "still engaged" state and playing grains forever.
        sfxEngine.updateScratch(0, false);
        sfxEngine.dispose();
        void audioCtx.close();
        stopButton.style.display = "none";
        scoreHud.style.display = "none";
        trackInfoEl.style.display = "none";
        calibrationStatus.style.display = "none";
        startOverlay.style.removeProperty("display");
        hud.textContent = "중단됨";
        resolve({ aborted: true });
      };

      hud.textContent = songFile ? `STEP ${stepNumber} 로딩 중... (음원 분석해서 채보 생성)` : `STEP ${stepNumber} 로딩 중...`;

      const loadChart = songFile
        ? buildChartFromFile(audioCtx, songFile, density).then((built) => {
            audioEngine.loadBuffer(built.audioBuffer);
            return built.chart.notes;
          })
        : audioEngine.loadClickTrack(TEST_BPM, TEST_BEAT_COUNT).then(() => buildTestChart(TEST_BPM, TEST_BEAT_COUNT, density));

      const chart = await loadChart;
      if (stopped) return; // stop button hit while the chart was still loading

      const noteScheduler = new NoteScheduler(chart);
      const judgmentEngine = new JudgmentEngine(chart);

      // A selected song plays to its natural end; the default test track runs for a fixed 2 minutes.
      const gameDurationMs = songFile ? audioEngine.getDurationMs() : DEFAULT_GAME_DURATION_MS;

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

      // Swaps CameraManager's active callback (see its onFrame docstring) instead of piling on a
      // second pump loop. Once `stopped` flips true this becomes a no-op, so a step that just ended
      // doesn't keep burning inference cycles while the results/step-setup overlay is up.
      camera.onFrame((videoEl, metadata) => {
        if (stopped) return;
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
        hud.textContent = `STEP: ${stepNumber}\nDelegate: ${delegate}\nFPS: ${fps}\n프레임 수신: ${framesSeen}\nDetect: ${inferenceMsAvg.toFixed(1)}ms\n감지된 손: ${result.hands.length}\n누름 횟수: ${pressCount}\n스크래치: ${scratchStatus}\nAudioCtx: ${audioCtx.state}`;
      });

      // iOS Safari can leave the AudioContext "suspended" right before a step starts — re-resuming
      // here (in addition to the session-level visibilitychange handler) catches that per-step.
      if (audioCtx.state !== "running") await audioCtx.resume();
      audioEngine.play();

      function renderFrame(): void {
        if (stopped) return;

        // Note scroll position is recomputed from the audio clock every frame — never accumulated
        // from render deltas — so it can't drift even if a frame is dropped or delayed.
        const songTimeMs = audioEngine.getSongTimeMs();

        if (songTimeMs >= gameDurationMs) {
          stopped = true;
          audioEngine.stop();
          // See stopButton.onclick above — same reasoning: a step can end mid-scratch, and without
          // this the sample player's independent grain timer would keep reading a frozen "engaged"
          // state and playing grains forever through the still-open AudioContext.
          sfxEngine.updateScratch(0, false);
          stopButton.style.display = "none";
          scoreHud.style.display = "none";
          trackInfoEl.style.display = "none";
          resolve({ aborted: false, finalScore: scoreManager.getScore(), counts: scoreManager.getCounts() });
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
    })();
  });
}

/** Shows the just-finished step's score plus the run's cumulative total, and asks whether to
 *  continue to another (harder) step or stop here and lock in eligibility for the leaderboard. */
function showStepResults(
  stepNumber: number,
  stepScore: number,
  counts: { Great: number; Good: number; Bad: number },
  cumulativeScore: number,
  canContinue: boolean,
): Promise<"continue" | "end"> {
  return new Promise((resolve) => {
    resultsStepLabelEl.textContent = `STEP ${stepNumber} 완료`;
    resultsScoreEl.textContent = String(cumulativeScore);
    resultsBreakdownEl.textContent = `이번 STEP 점수 ${stepScore}  ·  Great ${counts.Great}   Good ${counts.Good}   Bad ${counts.Bad}`;
    resultsNextStepButton.style.display = canContinue ? "inline-block" : "none";
    resultsConfirmButton.textContent = canContinue ? "종료하고 순위 확인" : "확인";
    resultsOverlay.style.display = "flex";

    resultsNextStepButton.onclick = () => {
      resultsOverlay.style.display = "none";
      resolve("continue");
    };
    resultsConfirmButton.onclick = () => {
      resultsOverlay.style.display = "none";
      resolve("end");
    };
  });
}

/** Lets the player reselect BGM/speed/difficulty for the next step. Speed and difficulty can only
 *  be set to the previous step's level or higher, and at least one of the two must strictly
 *  increase — enforced live via disabled <option>s and a validity check gating the start button. */
function showStepSetup(stepNumber: number, prevSettings: StepSettings): Promise<StepSettings> {
  return new Promise((resolve) => {
    stepSetupNumberEl.textContent = String(stepNumber);
    stepSelectedSongFile = null;
    stepSongFileInput.value = "";
    stepBgmModeDefaultRadio.checked = true;

    const prevSpeedIdx = SPEED_ORDER.indexOf(prevSettings.speedKey);
    const prevDifficultyIdx = DIFFICULTY_ORDER.indexOf(prevSettings.difficultyKey);

    stepSpeedSelect.querySelectorAll("option").forEach((option) => {
      const opt = option as HTMLOptionElement;
      opt.disabled = SPEED_ORDER.indexOf(opt.value as keyof typeof SPEED_PRESETS) < prevSpeedIdx;
    });
    stepDifficultySelect.querySelectorAll("option").forEach((option) => {
      const opt = option as HTMLOptionElement;
      opt.disabled = DIFFICULTY_ORDER.indexOf(opt.value as keyof typeof DIFFICULTY_PRESETS) < prevDifficultyIdx;
    });
    stepSpeedSelect.value = prevSettings.speedKey;
    stepDifficultySelect.value = prevSettings.difficultyKey;

    function validate(): boolean {
      const newSpeedIdx = SPEED_ORDER.indexOf(stepSpeedSelect.value as keyof typeof SPEED_PRESETS);
      const newDifficultyIdx = DIFFICULTY_ORDER.indexOf(stepDifficultySelect.value as keyof typeof DIFFICULTY_PRESETS);
      const valid = newSpeedIdx > prevSpeedIdx || newDifficultyIdx > prevDifficultyIdx;
      stepStartButton.disabled = !valid;
      stepSetupWarning.hidden = valid;
      return valid;
    }
    validate();
    stepSpeedSelect.onchange = validate;
    stepDifficultySelect.onchange = validate;

    stepSetupOverlay.style.display = "flex";

    stepStartButton.onclick = () => {
      if (!validate()) return;
      const speedKey = stepSpeedSelect.value as keyof typeof SPEED_PRESETS;
      const difficultyKey = stepDifficultySelect.value as keyof typeof DIFFICULTY_PRESETS;
      const useDefault = stepBgmModeDefaultRadio.checked;

      stepStartButton.disabled = true;
      void resolveBgmSelection(stepSelectedSongFile, useDefault)
        .then((resolved) => {
          stepSetupOverlay.style.display = "none";
          resolve(buildStepSettings(speedKey, difficultyKey, resolved.songFile, resolved.defaultTrack));
        })
        .catch((err) => {
          stepStartButton.disabled = false;
          hud.textContent = `음원 로드 실패: ${(err as Error).message}`;
        });
    };
  });
}

/** The true end of a run (player chose to stop, or ran out of room to escalate further) — checks
 *  the cumulative score against the leaderboard and runs the photo/name-entry flow if it qualifies.
 *  Note that camera.stop() is deliberately deferred until after the photo countdown (or skipped
 *  straight to if not qualifying) — the countdown needs the live feed. */
async function finalizeSession(
  cumulativeScore: number,
  finalSettings: StepSettings,
  camera: CameraManager,
  stepsCompleted: number,
): Promise<void> {
  if (!(await qualifiesForTop20(cumulativeScore))) {
    camera.stop();
    startOverlay.style.removeProperty("display");
    return;
  }

  const rank = await computeProjectedRank(cumulativeScore);
  const capturedPhoto = await runPhotoCountdown(video, rank);
  camera.stop();
  nameEntryOverlay.style.display = "flex";

  await new Promise<void>((resolve) => {
    nameEntrySubmitButton.onclick = async () => {
      const name = nameEntryNameInput.value.trim() || "익명";
      const message = nameEntryMessageInput.value.trim();
      try {
        await addLeaderboardEntry({
          name,
          message,
          score: cumulativeScore,
          speed: finalSettings.speedLabel,
          difficulty: finalSettings.difficultyLabel,
          step: stepsCompleted,
          bgm: finalSettings.bgmLabel,
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
      resolve();
    };
  });
}

/** One "session" = camera + hand-tracker set up once, then one or more escalating steps chained
 *  together with the player's consent after each. The leaderboard only ever sees the final
 *  cumulative score, submitted once the player stops (or can no longer escalate speed/difficulty
 *  any further). Calibration also only runs once here, not per step. */
async function runSession(
  sfxEngine: SfxEngine,
  audioCtx: AudioContext,
  initialSettings: StepSettings,
  enableCalibration: boolean,
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

  // Size the stage to the camera's native aspect ratio and the canvas's drawing buffer to its
  // native resolution, so normalized landmark coordinates map 1:1 onto displayed pixels with no
  // crop/letterbox math. Done once — the camera/stage don't change between steps.
  fitStageToViewport(video.videoWidth, video.videoHeight);
  window.addEventListener("resize", () => fitStageToViewport(video.videoWidth, video.videoHeight));
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  // Safari's WebGL backend has been unreliable with MediaPipe's GPU delegate — hand tracking would
  // detect once and then silently stop producing results on later frames. CPU is slower but stable
  // there. ?delegate=cpu/gpu (used for perf A/B testing) always overrides this default.
  const delegateOverride = new URLSearchParams(location.search).get("delegate")?.toUpperCase();
  const isSafari = /^((?!chrome|crios|fxios|android).)*safari/i.test(navigator.userAgent);
  const delegate: "GPU" | "CPU" =
    delegateOverride === "CPU" || delegateOverride === "GPU" ? delegateOverride : isSafari ? "CPU" : "GPU";

  hud.textContent = `리소스 로딩 중... (손 인식: ${delegate})`;
  const handTracker = new HandLandmarkerService();
  await Promise.all([handTracker.initialize({ delegate }), sfxEngine.loadScratchSample("/audio/Hiphop_Deejaying.mp3")]);

  // Calibration only happens once, up front — re-running it before every step would add another
  // 15-20s wait to a run that may span several steps.
  let calibratedZones: KeyZone[] | undefined;
  if (enableCalibration) {
    calibrationStatus.style.display = "block";
    calibratedZones = await runFingerCalibration(camera, handTracker, (text) => {
      calibrationStatus.textContent = text;
    });
    calibrationStatus.style.display = "none";
  }

  // iOS Safari can leave (or put) the AudioContext in "suspended" during the loading/calibration
  // wait — sometimes tens of seconds after the click that originally resumed it — silencing every
  // sound with no visible error. Re-resuming whenever the tab regains focus is cheap and catches
  // that without needing a fresh user gesture each time.
  if (audioCtx.state !== "running") void audioCtx.resume();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && audioCtx.state !== "running") void audioCtx.resume();
  });

  let cumulativeScore = 0;
  let step = 1;
  let settings = initialSettings;

  for (;;) {
    const outcome = await playStep(camera, handTracker, sfxEngine, audioCtx, calibratedZones, delegate, settings, step);
    if (outcome.aborted) return;

    cumulativeScore += outcome.finalScore;

    const speedIdx = SPEED_ORDER.indexOf(settings.speedKey);
    const difficultyIdx = DIFFICULTY_ORDER.indexOf(settings.difficultyKey);
    const canContinue = speedIdx < SPEED_ORDER.length - 1 || difficultyIdx < DIFFICULTY_ORDER.length - 1;

    const choice = await showStepResults(step, outcome.finalScore, outcome.counts, cumulativeScore, canContinue);

    if (choice === "end") {
      handTracker.dispose();
      // Must happen before audioCtx.close() — otherwise the scratch sample player's independent
      // grain timer keeps firing against a closed context and throws on every tick indefinitely.
      sfxEngine.dispose();
      void audioCtx.close();
      await finalizeSession(cumulativeScore, settings, camera, step);
      return;
    }

    settings = await showStepSetup(step + 1, settings);
    step += 1;
  }
}

startButton.addEventListener("click", () => {
  startOverlay.style.display = "none";

  const speedKey = (speedSelect.value as keyof typeof SPEED_PRESETS) || "normal";
  const difficultyKey = (difficultySelect.value as keyof typeof DIFFICULTY_PRESETS) || "easy";
  const enableCalibration = calibrationToggle.checked;

  // AudioContext must be created/resumed synchronously inside a real click handler
  // for the browser's autoplay policy to treat it as user-initiated.
  const audioCtx = new AudioContext();
  void audioCtx.resume();
  const sfxEngine = new SfxEngine(audioCtx);

  void resolveBgmSelection(selectedSongFile, bgmModeDefaultRadio.checked)
    .then((resolved) =>
      runSession(sfxEngine, audioCtx, buildStepSettings(speedKey, difficultyKey, resolved.songFile, resolved.defaultTrack), enableCalibration),
    )
    .catch((err) => {
      hud.textContent = `음원 로드 실패: ${(err as Error).message}`;
      startOverlay.style.removeProperty("display");
    });
});
