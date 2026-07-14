import "./style.css";
import { AudioEngine } from "./audio/AudioEngine";
import { SfxEngine } from "./audio/SfxEngine";
import { adminChangePassword, adminLogin, WrongAdminPasswordError } from "./game/Admin";
import { runFingerCalibration } from "./calibration/CalibrationFlow";
import { CameraManager } from "./camera/CameraManager";
import { adminSetChatbotMode, askGemini, GeminiRateLimitedError, isGeminiConfigured, loadChatbotMode, type ChatbotMode, type ChatMessage } from "./game/Chatbot";
import { matchFaq } from "./game/ChatbotFaq";
import { buildChartFromFile } from "./chartGen/ChartBuilder";
import { pickRandomDefaultTrack, type DefaultTrack } from "./game/DefaultTracks";
import { closeChatInbox, loadDirectMessages, notifyNewMessage, openChatInbox, sendDirectMessage, type DirectMessage } from "./game/DirectMessages";
import {
  addGuestbookEntry,
  addGuestbookHeart,
  adminDeleteGuestbookEntries,
  deleteGuestbookEntry,
  editGuestbookEntry,
  loadGuestbook,
  NoPasswordSetError,
  NotOwnerError as GuestbookNotOwnerError,
  removeGuestbookHeart,
  WrongPasswordError,
  type GuestbookAttachmentType,
  type GuestbookEntry,
} from "./game/Guestbook";
import { addLeaderboardEntry, adminDeleteLeaderboardEntries, computeProjectedRank, loadLeaderboard, qualifiesForTop20 } from "./game/Leaderboard";
import {
  loadMembers,
  memberLogin,
  memberSignup,
  NameTakenError,
  updateMemberProfile,
  withdrawMember,
  WrongMemberPasswordError,
  type Member,
  type MemberDirectoryEntry,
  type MemberGender,
} from "./game/Membership";
import { JudgmentEngine, type JudgmentResult } from "./game/JudgmentEngine";
import { adminAddBannerImages, adminDeleteBannerImage, loadBannerImages, type BannerImage } from "./game/BannerImages";
import { adminSetBanner, loadBanner, type BannerMode } from "./game/Notice";
import { NoteScheduler } from "./game/NoteScheduler";
import { getPlatformIcon, PLATFORM_ICONS } from "./game/PlatformIcons";
import { getOnlineMemberIds, trackMemberOnline, untrackMemberOnline } from "./game/Presence";
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

// Must mirror style.css's mobile breakpoint exactly (width for portrait, height for landscape
// phones) — shared so the two can't quietly drift out of sync with each other.
const MOBILE_MEDIA_QUERY = "(max-width: 640px), (max-height: 480px)";

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
const guestbookMessageInput = document.querySelector<HTMLTextAreaElement>("#guestbook-message")!;
const guestbookPasswordInput = document.querySelector<HTMLInputElement>("#guestbook-password")!;
const guestbookAttachmentInput = document.querySelector<HTMLInputElement>("#guestbook-attachment-input")!;
const guestbookAttachmentFilename = document.querySelector<HTMLSpanElement>("#guestbook-attachment-filename")!;
const guestbookAttachmentError = document.querySelector<HTMLSpanElement>("#guestbook-attachment-error")!;
const membershipAvatar = document.querySelector<HTMLDivElement>("#membership-avatar")!;
const membershipNameLabel = document.querySelector<HTMLSpanElement>("#membership-name-label")!;
const membershipAuthActions = document.querySelector<HTMLDivElement>("#membership-auth-actions")!;
const membershipLoginButton = document.querySelector<HTMLButtonElement>("#membership-login-button")!;
const membershipSignupButton = document.querySelector<HTMLButtonElement>("#membership-signup-button")!;
const membershipLogoutButton = document.querySelector<HTMLButtonElement>("#membership-logout-button")!;
const membershipLoginOverlay = document.querySelector<HTMLDivElement>("#membership-login-overlay")!;
const membershipLoginNameInput = document.querySelector<HTMLInputElement>("#membership-login-name")!;
const membershipLoginPasswordInput = document.querySelector<HTMLInputElement>("#membership-login-password")!;
const membershipLoginError = document.querySelector<HTMLSpanElement>("#membership-login-error")!;
const membershipLoginSubmit = document.querySelector<HTMLButtonElement>("#membership-login-submit")!;
const membershipLoginCancel = document.querySelector<HTMLButtonElement>("#membership-login-cancel")!;
const membershipSignupOverlay = document.querySelector<HTMLDivElement>("#membership-signup-overlay")!;
const membershipSignupNameInput = document.querySelector<HTMLInputElement>("#membership-signup-name")!;
const membershipSignupPasswordInput = document.querySelector<HTMLInputElement>("#membership-signup-password")!;
const membershipSignupPasswordConfirmInput = document.querySelector<HTMLInputElement>("#membership-signup-password-confirm")!;
const membershipSignupPhotoInput = document.querySelector<HTMLInputElement>("#membership-signup-photo-input")!;
const membershipSignupPhotoFilename = document.querySelector<HTMLSpanElement>("#membership-signup-photo-filename")!;
const membershipSignupGenderMale = document.querySelector<HTMLInputElement>("#membership-signup-gender-male")!;
const membershipSignupGenderFemale = document.querySelector<HTMLInputElement>("#membership-signup-gender-female")!;
const membershipSignupBirthdateInput = document.querySelector<HTMLInputElement>("#membership-signup-birthdate")!;
const membershipSignupPhoneInput = document.querySelector<HTMLInputElement>("#membership-signup-phone")!;
const membershipSignupEmailInput = document.querySelector<HTMLInputElement>("#membership-signup-email")!;
const membershipSignupError = document.querySelector<HTMLSpanElement>("#membership-signup-error")!;
const membershipSignupSubmit = document.querySelector<HTMLButtonElement>("#membership-signup-submit")!;
const membershipSignupCancel = document.querySelector<HTMLButtonElement>("#membership-signup-cancel")!;
const membershipProfileOverlay = document.querySelector<HTMLDivElement>("#membership-profile-overlay")!;
const membershipProfilePhotoInput = document.querySelector<HTMLInputElement>("#membership-profile-photo-input")!;
const membershipProfilePhotoFilename = document.querySelector<HTMLSpanElement>("#membership-profile-photo-filename")!;
const membershipProfileGenderMale = document.querySelector<HTMLInputElement>("#membership-profile-gender-male")!;
const membershipProfileGenderFemale = document.querySelector<HTMLInputElement>("#membership-profile-gender-female")!;
const membershipProfileBirthdateInput = document.querySelector<HTMLInputElement>("#membership-profile-birthdate")!;
const membershipProfilePhoneInput = document.querySelector<HTMLInputElement>("#membership-profile-phone")!;
const membershipProfileEmailInput = document.querySelector<HTMLInputElement>("#membership-profile-email")!;
const membershipProfileNewPasswordInput = document.querySelector<HTMLInputElement>("#membership-profile-new-password")!;
const membershipProfileNewPasswordConfirmInput = document.querySelector<HTMLInputElement>("#membership-profile-new-password-confirm")!;
const membershipProfilePasswordInput = document.querySelector<HTMLInputElement>("#membership-profile-password")!;
const membershipProfileSuccess = document.querySelector<HTMLSpanElement>("#membership-profile-success")!;
const membershipProfileError = document.querySelector<HTMLSpanElement>("#membership-profile-error")!;
const membershipProfileSubmit = document.querySelector<HTMLButtonElement>("#membership-profile-submit")!;
const membershipProfileCancel = document.querySelector<HTMLButtonElement>("#membership-profile-cancel")!;
const membershipProfileWithdrawButton = document.querySelector<HTMLButtonElement>("#membership-profile-withdraw-button")!;
const membersDirectoryOpenCard = document.querySelector<HTMLButtonElement>("#members-directory-open-card")!;
const membersDirectoryOverlay = document.querySelector<HTMLDivElement>("#members-directory-overlay")!;
const membersDirectoryRefreshButton = document.querySelector<HTMLButtonElement>("#members-directory-refresh-button")!;
const membersDirectoryCloseButton = document.querySelector<HTMLButtonElement>("#members-directory-close-button")!;
const directChatOverlay = document.querySelector<HTMLDivElement>("#direct-chat-overlay")!;
const directChatTitle = document.querySelector<HTMLDivElement>("#direct-chat-title")!;
const directChatMessages = document.querySelector<HTMLDivElement>("#direct-chat-messages")!;
const directChatInput = document.querySelector<HTMLInputElement>("#direct-chat-input")!;
const directChatSendButton = document.querySelector<HTMLButtonElement>("#direct-chat-send-button")!;
const directChatCloseButton = document.querySelector<HTMLButtonElement>("#direct-chat-close-button")!;
const membersDirectoryList = document.querySelector<HTMLTableSectionElement>("#members-directory-list")!;
const guestbookOpenCard = document.querySelector<HTMLButtonElement>("#guestbook-open-card")!;
const guestbookOverlay = document.querySelector<HTMLDivElement>("#guestbook-overlay")!;
const guestbookCloseButton = document.querySelector<HTMLButtonElement>("#guestbook-close-button")!;
const photoCountdownOverlay = document.querySelector<HTMLDivElement>("#photo-countdown-overlay")!;
const photoCountdownDescEl = document.querySelector<HTMLDivElement>("#photo-countdown-desc")!;
const photoCountdownNumberEl = document.querySelector<HTMLDivElement>("#photo-countdown-number")!;
const photoLightboxOverlay = document.querySelector<HTMLDivElement>("#photo-lightbox-overlay")!;
const photoLightboxImage = document.querySelector<HTMLImageElement>("#photo-lightbox-image")!;
const photoLightboxDownloadButton = document.querySelector<HTMLButtonElement>("#photo-lightbox-download-button")!;
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
const adminBannerSaveError = document.querySelector<HTMLSpanElement>("#admin-banner-save-error")!;
const adminBannerSaveSuccess = document.querySelector<HTMLSpanElement>("#admin-banner-save-success")!;
const adminSocialLinksList = document.querySelector<HTMLDivElement>("#admin-social-links-list")!;
const adminSocialLinkPlatformSelect = document.querySelector<HTMLSelectElement>("#admin-social-link-platform")!;
const adminSocialLinkUrlInput = document.querySelector<HTMLInputElement>("#admin-social-link-url")!;
const adminSocialLinkAddButton = document.querySelector<HTMLButtonElement>("#admin-social-link-add-button")!;
const adminChangeCurrentPasswordInput = document.querySelector<HTMLInputElement>("#admin-change-current-password")!;
const adminChangeNewPasswordInput = document.querySelector<HTMLInputElement>("#admin-change-new-password")!;
const adminChangeConfirmPasswordInput = document.querySelector<HTMLInputElement>("#admin-change-confirm-password")!;
const adminChangePasswordError = document.querySelector<HTMLSpanElement>("#admin-change-password-error")!;
const adminChangePasswordSuccess = document.querySelector<HTMLSpanElement>("#admin-change-password-success")!;
const adminChangePasswordButton = document.querySelector<HTMLButtonElement>("#admin-change-password-button")!;
const socialLinksContainer = document.querySelector<HTMLDivElement>("#social-links-container")!;
const noticeBoard = document.querySelector<HTMLDivElement>("#notice-board")!;
const noticeBoardLabel = document.querySelector<HTMLDivElement>("#notice-board-label")!;
const noticeBoardText = document.querySelector<HTMLDivElement>("#notice-board-text")!;
const noticeBoardGraffiti = document.querySelector<HTMLDivElement>("#notice-board-graffiti")!;
const noticeBoardImages = document.querySelector<HTMLDivElement>("#notice-board-images")!;
const footerRow = document.querySelector<HTMLDivElement>("#footer-row")!;
const adminBannerImagesList = document.querySelector<HTMLDivElement>("#admin-banner-images-list")!;
const adminBannerImagesInput = document.querySelector<HTMLInputElement>("#admin-banner-images-input")!;
const adminBannerImagesFilenames = document.querySelector<HTMLSpanElement>("#admin-banner-images-filenames")!;
const adminBannerImagesError = document.querySelector<HTMLSpanElement>("#admin-banner-images-error")!;
const adminBannerImagesSuccess = document.querySelector<HTMLSpanElement>("#admin-banner-images-success")!;
const adminBannerImagesAddButton = document.querySelector<HTMLButtonElement>("#admin-banner-images-add-button")!;
const chatbotPanel = document.querySelector<HTMLDivElement>("#chatbot-panel")!;
const chatbotMode = document.querySelector<HTMLSpanElement>("#chatbot-mode")!;
const adminChatbotModeRadios = document.querySelectorAll<HTMLInputElement>('input[name="admin-chatbot-mode"]');
const adminChatbotModeSaveButton = document.querySelector<HTMLButtonElement>("#admin-chatbot-mode-save-button")!;
const adminChatbotModeError = document.querySelector<HTMLSpanElement>("#admin-chatbot-mode-error")!;
const adminChatbotModeSuccess = document.querySelector<HTMLSpanElement>("#admin-chatbot-mode-success")!;
const chatbotMessages = document.querySelector<HTMLDivElement>("#chatbot-messages")!;
const chatbotInput = document.querySelector<HTMLInputElement>("#chatbot-input")!;
const chatbotSendButton = document.querySelector<HTMLButtonElement>("#chatbot-send-button")!;
const chatbotCloseButton = document.querySelector<HTMLButtonElement>("#chatbot-close-button")!;
const chatbotToggleButton = document.querySelector<HTMLButtonElement>("#chatbot-toggle-button")!;
const ctx = canvas.getContext("2d")!;

let selectedSongFile: File | null = null;
let stepSelectedSongFile: File | null = null;

// Admin mode: no session/token, just the password kept in memory (and sessionStorage so a reload
// within the same tab doesn't force re-login) and re-sent with every delete call for the server to
// re-verify — see supabase/schema.sql's admin_login()/admin_delete_* functions.
let adminPassword: string | null = sessionStorage.getItem("bdj-admin-password");
const selectedLeaderboardIds = new Set<number>();
const selectedGuestbookIds = new Set<number>();

// BDJ Membership: same no-session pattern as admin above, but cached in localStorage instead of
// sessionStorage so a member stays logged in across browser restarts (a "membership" login should
// behave like a normal site login, not a one-tab admin toggle). `member` itself never carries the
// password — memberPassword is kept alongside it and resent on every member-owned write, verified
// server-side via verify_member() every time (see supabase/schema.sql).
const MEMBER_CREDENTIALS_KEY = "bdj-member-credentials";
let member: Member | null = null;
let memberPassword: string | null = null;

function setMembershipUI(): void {
  if (member) {
    membershipAvatar.style.backgroundImage = member.photoData ? `url(${member.photoData})` : "";
    membershipAvatar.classList.toggle("has-photo", !!member.photoData);
    membershipAvatar.title = member.photoData ? "사진 크게 보기" : "";
    membershipNameLabel.textContent = member.name;
    membershipNameLabel.title = "내 정보 보기/수정";
    membershipAuthActions.hidden = true;
    membershipLogoutButton.hidden = false;
    trackMemberOnline(member.id);
    openChatInbox(member.id, handleIncomingDirectMessage);
  } else {
    membershipAvatar.style.backgroundImage = "";
    membershipAvatar.classList.remove("has-photo");
    membershipAvatar.title = "";
    membershipNameLabel.textContent = "Guest";
    membershipNameLabel.title = "";
    membershipAuthActions.hidden = false;
    membershipLogoutButton.hidden = true;
    closeChatInbox();
    directChatOverlay.style.display = "none";
    activeChatPartnerId = null;
    untrackMemberOnline();
  }

  // Guestbook: a logged-in member's name is fixed and no per-row password is ever needed.
  guestbookNameInput.value = member?.name ?? "";
  guestbookNameInput.readOnly = !!member;
  guestbookPasswordInput.value = "";
  guestbookPasswordInput.disabled = !!member;
  guestbookPasswordInput.placeholder = member ? "회원 로그인 — 비밀번호 불필요" : "비밀번호 (선택-수정/삭제 목적)";

  // Leaderboard's name-entry overlay is only ever shown well after this runs, but the input
  // persists in the DOM the whole time, so setting it here keeps it correct whenever it opens.
  nameEntryNameInput.value = member?.name ?? "";
  nameEntryNameInput.readOnly = !!member;
}

function clearMemberSession(): void {
  member = null;
  memberPassword = null;
  localStorage.removeItem(MEMBER_CREDENTIALS_KEY);
  setMembershipUI();
}

async function restoreMemberSession(): Promise<void> {
  const raw = localStorage.getItem(MEMBER_CREDENTIALS_KEY);
  if (!raw) {
    setMembershipUI();
    return;
  }
  try {
    const { name, password } = JSON.parse(raw) as { name: string; password: string };
    member = await memberLogin(name, password);
    memberPassword = password;
  } catch {
    localStorage.removeItem(MEMBER_CREDENTIALS_KEY);
    member = null;
    memberPassword = null;
  }
  setMembershipUI();
}

void restoreMemberSession();

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
        <tr data-id="${entry.id}">
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
  photoLightboxImage.alt = img.alt;
  photoLightboxOverlay.style.display = "flex";
});

photoLightboxOverlay.addEventListener("click", () => {
  photoLightboxOverlay.style.display = "none";
  photoLightboxImage.src = "";
});

/** Reads whatever's currently shown (photoLightboxImage.src is already a data: URL for every
 *  caller — leaderboard photo, guestbook attachment, member profile photo) rather than tracking a
 *  separate href, so this never needs updating when a new lightbox call site is added. Stops
 *  propagation so downloading doesn't also trigger the overlay's click-anywhere-to-close. */
photoLightboxDownloadButton.addEventListener("click", (event) => {
  event.stopPropagation();
  const link = document.createElement("a");
  link.href = photoLightboxImage.src;
  link.download = "beejay-deejay-jackey.jpg";
  link.click();
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

const GUESTBOOK_HEARTED_STORAGE_KEY = "bdj-guestbook-hearted-ids";

/** There's no visitor identity to key a server-side "already hearted" check off of, so one heart
 *  per browser is enforced here via localStorage instead — the button just disables itself once
 *  hearted, remembered across reloads on the same device. */
function getHeartedIds(): Set<number> {
  try {
    const raw = localStorage.getItem(GUESTBOOK_HEARTED_STORAGE_KEY);
    return new Set(raw ? (JSON.parse(raw) as number[]) : []);
  } catch {
    return new Set();
  }
}

function markGuestbookHearted(id: number): void {
  const ids = getHeartedIds();
  ids.add(id);
  localStorage.setItem(GUESTBOOK_HEARTED_STORAGE_KEY, JSON.stringify(Array.from(ids)));
}

function unmarkGuestbookHearted(id: number): void {
  const ids = getHeartedIds();
  ids.delete(id);
  localStorage.setItem(GUESTBOOK_HEARTED_STORAGE_KEY, JSON.stringify(Array.from(ids)));
}

/** Replies skip the reply button (only one level of nesting) and get a subtler card via the
 *  .guestbook-reply class, but are otherwise identical — same edit/delete inline forms, same
 *  admin checkbox when logged in, same heart button. */
function renderGuestbookEntryHtml(entry: GuestbookEntry, isReply: boolean): string {
  const hearted = getHeartedIds().has(entry.id);
  const isOwnEntry = member !== null && entry.memberId === member.id;
  const passwordFieldHtml = isOwnEntry ? "" : `<input type="password" class="guestbook-inline-password" placeholder="비밀번호" maxlength="20" />`;
  return `
    <div class="guestbook-entry${isReply ? " guestbook-reply" : ""}" data-id="${entry.id}">
      <div class="guestbook-entry-top">
        ${adminPassword ? `<input type="checkbox" class="guestbook-select-checkbox" data-id="${entry.id}" />` : ""}
        <span class="guestbook-entry-name">${escapeHtml(entry.name)}</span>
        <span class="guestbook-entry-date">${formatLocalDate(entry.dateIso)}</span>
      </div>
      <div class="guestbook-entry-message">${escapeHtml(entry.message)}</div>
      ${
        entry.attachmentType === "image"
          ? `<img class="guestbook-attachment-thumb" data-attachment-id="${entry.id}" alt="${escapeHtml(entry.name)} 첨부 사진" />`
          : entry.attachmentType === "video"
            ? `<video class="guestbook-attachment-video" data-attachment-id="${entry.id}" controls></video>`
            : ""
      }
      <div class="guestbook-entry-actions">
        <button type="button" class="guestbook-action-btn guestbook-heart-btn${hearted ? " guestbook-hearted" : ""}" data-action="heart" data-id="${entry.id}" title="${hearted ? "하트 취소" : "하트"}"><span class="guestbook-heart-icon">${hearted ? "❤️" : "🤍"}</span> <span class="guestbook-heart-count">${entry.heartCount}</span></button>
        ${isReply ? "" : `<button type="button" class="guestbook-action-btn" data-action="reply" data-id="${entry.id}">답글쓰기</button>`}
        <button type="button" class="guestbook-action-btn" data-action="edit" data-id="${entry.id}">수정</button>
        <button type="button" class="guestbook-action-btn" data-action="delete" data-id="${entry.id}">삭제</button>
      </div>
      <div class="guestbook-inline-form" data-mode="edit" data-id="${entry.id}" hidden>
        <input type="text" class="guestbook-edit-message" maxlength="500" />
        <div class="guestbook-inline-attachment-row">
          <label class="song-file-label guestbook-inline-attachment-label" for="guestbook-edit-attachment-${entry.id}">📎 사진/동영상 변경</label>
          <input type="file" id="guestbook-edit-attachment-${entry.id}" class="guestbook-edit-attachment-input" accept="image/*,video/*" />
          <span class="guestbook-edit-attachment-filename"></span>
        </div>
        ${passwordFieldHtml}
        <span class="guestbook-inline-error" hidden>비밀번호가 일치하지 않습니다</span>
        <div class="guestbook-inline-actions">
          <button type="button" class="guestbook-confirm-btn" data-action="save" data-id="${entry.id}">저장</button>
          <button type="button" class="guestbook-cancel-btn" data-action="cancel" data-id="${entry.id}">취소</button>
        </div>
      </div>
      <div class="guestbook-inline-form" data-mode="delete" data-id="${entry.id}" hidden>
        ${passwordFieldHtml}
        <span class="guestbook-inline-error" hidden>비밀번호가 일치하지 않습니다</span>
        <div class="guestbook-inline-actions">
          <button type="button" class="guestbook-confirm-btn" data-action="confirm-delete" data-id="${entry.id}">삭제 확인</button>
          <button type="button" class="guestbook-cancel-btn" data-action="cancel" data-id="${entry.id}">취소</button>
        </div>
      </div>
      ${
        isReply
          ? ""
          : member
            ? `<div class="guestbook-inline-form" data-mode="reply" data-id="${entry.id}" hidden>
        <input type="text" class="guestbook-reply-message" placeholder="답글을 남겨주세요" maxlength="80" />
        <div class="guestbook-inline-actions">
          <button type="button" class="guestbook-confirm-btn" data-action="submit-reply" data-id="${entry.id}">등록</button>
          <button type="button" class="guestbook-cancel-btn" data-action="cancel" data-id="${entry.id}">취소</button>
        </div>
      </div>`
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
    if (!entry.attachmentData) continue;
    if (entry.attachmentType === "image") {
      const img = guestbookList.querySelector<HTMLImageElement>(`img.guestbook-attachment-thumb[data-attachment-id="${entry.id}"]`);
      if (img) img.src = entry.attachmentData;
    } else if (entry.attachmentType === "video") {
      const video = guestbookList.querySelector<HTMLVideoElement>(`video.guestbook-attachment-video[data-attachment-id="${entry.id}"]`);
      if (video) video.src = entry.attachmentData;
    }
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
    const attachmentInput = form.querySelector<HTMLInputElement>(".guestbook-edit-attachment-input");
    if (attachmentInput) attachmentInput.value = "";
    const attachmentFilename = form.querySelector<HTMLSpanElement>(".guestbook-edit-attachment-filename");
    if (attachmentFilename) attachmentFilename.textContent = "";
  });
}

guestbookList.addEventListener("change", (event) => {
  const target = event.target as HTMLInputElement;
  if (target.classList.contains("guestbook-select-checkbox")) {
    const id = Number(target.dataset.id);
    if (target.checked) selectedGuestbookIds.add(id);
    else selectedGuestbookIds.delete(id);
    return;
  }
  if (target.classList.contains("guestbook-edit-attachment-input")) {
    const form = target.closest<HTMLDivElement>(".guestbook-inline-form")!;
    const filenameEl = form.querySelector<HTMLSpanElement>(".guestbook-edit-attachment-filename")!;
    const file = target.files?.[0];
    filenameEl.textContent = file ? file.name : "";
    const errorEl = form.querySelector<HTMLSpanElement>(".guestbook-inline-error")!;
    errorEl.hidden = true;
  }
});

guestbookList.addEventListener("click", (event) => {
  const img = (event.target as HTMLElement).closest<HTMLImageElement>(".guestbook-attachment-thumb");
  if (!img) return;
  photoLightboxImage.src = img.src;
  photoLightboxImage.alt = img.alt;
  photoLightboxOverlay.style.display = "flex";
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
    const passwordInput = form.querySelector<HTMLInputElement>(".guestbook-inline-password");
    const errorEl = form.querySelector<HTMLSpanElement>(".guestbook-inline-error")!;
    if (!message) return;
    // No password field at all means this entry belongs to the logged-in member — ownership is
    // already proven by being logged in, so there's nothing to alert about here.
    if (passwordInput && !passwordInput.value) {
      window.alert("비밀번호가 일치하여야 수정이 가능합니다.");
      return;
    }

    const attachmentInput = form.querySelector<HTMLInputElement>(".guestbook-edit-attachment-input")!;
    const file = attachmentInput.files?.[0] ?? null;
    const attachmentValidation = validateAttachmentFile(file, errorEl, true);
    if (!attachmentValidation.valid) return;
    const attachmentType = attachmentValidation.type;

    void (file ? readFileAsDataUrl(file) : Promise.resolve(null))
      .then((attachmentData) =>
        passwordInput
          ? editGuestbookEntry(id, message, passwordInput.value, attachmentData, attachmentType)
          : editGuestbookEntry(id, message, null, attachmentData, attachmentType, member!.name, memberPassword!),
      )
      .then(() => renderGuestbook())
      .catch((err) => {
        if (err instanceof WrongPasswordError) {
          errorEl.textContent = "비밀번호가 일치하지 않습니다";
          errorEl.hidden = false;
        } else if (err instanceof NoPasswordSetError) {
          errorEl.textContent = "비밀번호 없이 등록된 글은 수정할 수 없습니다";
          errorEl.hidden = false;
        } else if (err instanceof WrongMemberPasswordError || err instanceof GuestbookNotOwnerError) {
          errorEl.textContent = "회원 인증이 만료되었습니다. 다시 로그인해주세요.";
          errorEl.hidden = false;
          clearMemberSession();
          void renderGuestbook();
        } else {
          console.error("방명록 수정 실패:", err);
        }
      });
    return;
  }

  if (action === "heart") {
    const hearted = getHeartedIds().has(id);
    const iconEl = button.querySelector<HTMLSpanElement>(".guestbook-heart-icon")!;
    const countEl = button.querySelector<HTMLSpanElement>(".guestbook-heart-count")!;
    // Patches just this button instead of calling renderGuestbook() — a full re-fetch would pull
    // down every other entry's data (including any multi-MB attachments) just to update one count.
    void (hearted ? removeGuestbookHeart(id) : addGuestbookHeart(id))
      .then((newCount) => {
        if (hearted) unmarkGuestbookHearted(id);
        else markGuestbookHearted(id);
        iconEl.textContent = hearted ? "🤍" : "❤️";
        countEl.textContent = String(newCount);
        button.title = hearted ? "하트" : "하트 취소";
        button.classList.toggle("guestbook-hearted", !hearted);
      })
      .catch((err) => console.error("방명록 하트 실패:", err));
    return;
  }

  if (action === "confirm-delete") {
    const form = entry.querySelector<HTMLDivElement>(`.guestbook-inline-form[data-mode="delete"][data-id="${id}"]`)!;
    const passwordInput = form.querySelector<HTMLInputElement>(".guestbook-inline-password");
    const errorEl = form.querySelector<HTMLSpanElement>(".guestbook-inline-error")!;
    if (passwordInput && !passwordInput.value) return;
    void (passwordInput ? deleteGuestbookEntry(id, passwordInput.value) : deleteGuestbookEntry(id, null, member!.name, memberPassword!))
      .then(() => renderGuestbook())
      .catch((err) => {
        if (err instanceof WrongPasswordError) {
          errorEl.textContent = "비밀번호가 일치하지 않습니다";
          errorEl.hidden = false;
        } else if (err instanceof NoPasswordSetError) {
          errorEl.textContent = "비밀번호 없이 등록된 글은 삭제할 수 없습니다";
          errorEl.hidden = false;
        } else if (err instanceof WrongMemberPasswordError || err instanceof GuestbookNotOwnerError) {
          errorEl.textContent = "회원 인증이 만료되었습니다. 다시 로그인해주세요.";
          errorEl.hidden = false;
          clearMemberSession();
          void renderGuestbook();
        } else {
          console.error("방명록 삭제 실패:", err);
        }
      });
    return;
  }

  if (action === "submit-reply") {
    const form = entry.querySelector<HTMLDivElement>(`.guestbook-inline-form[data-mode="reply"][data-id="${id}"]`)!;
    const message = form.querySelector<HTMLInputElement>(".guestbook-reply-message")!.value.trim();
    if (!message) return;

    // Logged-in members skip the name/password fields entirely (they don't exist in this form's
    // markup, see renderGuestbookEntryHtml) — same auto-fill/no-password treatment as the main
    // compose form.
    const name = member ? member.name : form.querySelector<HTMLInputElement>(".guestbook-reply-name")!.value.trim();
    const password = member ? "" : form.querySelector<HTMLInputElement>(".guestbook-reply-password")!.value;
    if (!name) return;

    void addGuestbookEntry({ name, message, password, parentId: id, memberName: member?.name, memberPassword: memberPassword ?? undefined })
      .then(() => renderGuestbook())
      .catch((err) => console.error("답글 등록 실패:", err));
  }
});

const GUESTBOOK_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/bmp", "image/webp"];
const GUESTBOOK_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime", "video/ogg"];
const GUESTBOOK_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const GUESTBOOK_VIDEO_MAX_BYTES = 15 * 1024 * 1024;

type AttachmentValidation = { valid: true; type: GuestbookAttachmentType | null } | { valid: false };

/** Shared by every file picker that accepts an image (guestbook attachments, membership signup/
 *  profile photos) — same MIME whitelist and size caps, same inline-error text. allowVideo is false
 *  for the membership photo fields (image only); guestbook attachments allow both. On failure, the
 *  error is already written into errorEl — the caller just needs to bail out on `!valid`. */
function validateAttachmentFile(file: File | null, errorEl: HTMLSpanElement, allowVideo: boolean): AttachmentValidation {
  if (!file) return { valid: true, type: null };
  let type: GuestbookAttachmentType;
  if (GUESTBOOK_IMAGE_TYPES.includes(file.type)) type = "image";
  else if (allowVideo && GUESTBOOK_VIDEO_TYPES.includes(file.type)) type = "video";
  else {
    errorEl.textContent = `지원하지 않는 파일 형식입니다: ${file.name}`;
    errorEl.hidden = false;
    return { valid: false };
  }
  const maxBytes = type === "image" ? GUESTBOOK_IMAGE_MAX_BYTES : GUESTBOOK_VIDEO_MAX_BYTES;
  if (file.size > maxBytes) {
    errorEl.textContent = `파일이 너무 큽니다 (최대 ${maxBytes / (1024 * 1024)}MB): ${file.name}`;
    errorEl.hidden = false;
    return { valid: false };
  }
  return { valid: true, type };
}

guestbookAttachmentInput.addEventListener("change", () => {
  const file = guestbookAttachmentInput.files?.[0];
  guestbookAttachmentFilename.textContent = file ? file.name : "";
  guestbookAttachmentError.hidden = true;
});

guestbookForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = guestbookNameInput.value.trim();
  const message = guestbookMessageInput.value.trim();
  const password = guestbookPasswordInput.value;
  if (!name || !message) return;
  guestbookAttachmentError.hidden = true;

  const file = guestbookAttachmentInput.files?.[0] ?? null;
  const attachmentValidation = validateAttachmentFile(file, guestbookAttachmentError, true);
  if (!attachmentValidation.valid) return;
  const attachmentType = attachmentValidation.type;

  void (file ? readFileAsDataUrl(file) : Promise.resolve(null))
    .then((attachmentData) =>
      addGuestbookEntry({ name, message, password, attachmentData, attachmentType, memberName: member?.name, memberPassword: memberPassword ?? undefined }),
    )
    .then(() => {
      // Keeps the name locked in if still logged in, instead of blanking a field the visitor
      // never got to type into.
      guestbookNameInput.value = member?.name ?? "";
      guestbookMessageInput.value = "";
      guestbookPasswordInput.value = "";
      guestbookAttachmentInput.value = "";
      guestbookAttachmentFilename.textContent = "";
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
      "바탕화면이나 시작 메뉴에 BDJ 아이콘이 생깁니다. 더블클릭하면 브라우저 주소창 없이 바로 게임이 실행됩니다.",
    ],
  },
  macos: {
    title: "💻 macOS에 설치하기",
    steps: [
      "크롬(Chrome) 또는 엣지(Edge) 브라우저로 이 사이트에 접속하세요.",
      "주소창 오른쪽 끝의 설치 아이콘(⊕ 모양)을 클릭하세요. 안 보이면 오른쪽 위 메뉴에서 '설치'를 찾아 클릭하세요.",
      "나타나는 창에서 '설치' 버튼을 클릭하세요.",
      "Dock이나 런치패드에 BDJ 아이콘이 생깁니다. 클릭하면 바로 게임이 실행됩니다.",
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
      "홈 화면에 BDJ 아이콘이 생깁니다. 아이콘을 탭하면 바로 게임이 실행됩니다.",
    ],
  },
  android: {
    title: "🤖 Android에 설치하기",
    steps: [
      "안드로이드 폰의 크롬(Chrome) 앱으로 이 사이트에 접속하세요.",
      "화면 오른쪽 위의 점 3개(⋮) 메뉴를 탭하세요.",
      "메뉴에서 '앱 설치' 또는 '홈 화면에 추가'를 찾아 탭하세요. 화면 하단에 자동으로 설치 안내 배너가 뜨면 그걸 탭해도 됩니다.",
      "'설치' 버튼을 한 번 더 탭해서 확인하세요.",
      "홈 화면에 BDJ 아이콘이 생깁니다. 아이콘을 탭하면 바로 게임이 실행됩니다.",
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

/** Thumbnail rows in the admin panel showing which images are currently uploaded, each with its own
 *  delete button — mirrors renderAdminSocialLinksList's list-of-rows pattern. */
async function renderAdminBannerImagesList(): Promise<void> {
  const images = await loadBannerImages();
  adminBannerImagesList.innerHTML = images
    .map(
      (image, i) => `
        <div class="admin-banner-image-row" data-id="${image.id}">
          <img class="admin-banner-image-thumb" alt="이미지 ${i + 1}" />
          <span>이미지 ${i + 1}</span>
          <button type="button" data-action="delete-image" data-id="${image.id}">삭제</button>
        </div>`
    )
    .join("");
  images.forEach((image) => {
    const thumb = adminBannerImagesList.querySelector<HTMLImageElement>(`.admin-banner-image-row[data-id="${image.id}"] .admin-banner-image-thumb`);
    if (thumb) thumb.src = image.imageData;
  });
}

/** Caps the notice-board's overall height (whichever of notice/graffiti/images it's showing) so
 *  its bottom edge stops a fixed gap above the footer (producer credit + admin link), which is
 *  position:fixed and would otherwise just sit under whatever content happens to reach that far
 *  down — reading as clipped/overlapping. Measured live (not a static CSS value) since the
 *  notice-board's document position depends on everything above it in the page, which isn't
 *  knowable in advance.
 *
 *  #start-overlay is a `justify-content: center` flex column, so this element's own height feeds
 *  back into its own top position (shrinking it moves its top down, by half the shrink amount) —
 *  naively solving `top + height = target` using the pre-resize top overshoots the target every
 *  time. Solved in closed form instead: measuring height H0/top T0 before resizing, and using
 *  T(H) = T0 - (H-H0)/2 (the centering relationship) to solve for the H that puts the bottom edge
 *  exactly GAP_PX above the footer. Verified empirically in the browser preview.
 *
 *  Images mode needs a *definite* pixel height on the inner row specifically (percentage heights
 *  on the <img> children only resolve against a definite parent height), so that's the lever used
 *  there — corrected by the notice-board's own padding/border so it's the *outer* box's edge that
 *  lands GAP_PX above the footer, not just the inner row's. Notice/graffiti mode has no such
 *  constraint, so a max-height directly on the notice-board itself is enough. */
function fitNoticeBoardHeight(showImages: boolean): void {
  const GAP_PX = 35; // ~9mm at the 96 CSS-px/inch reference used throughout this spec
  noticeBoardImages.style.height = "";
  noticeBoard.style.maxHeight = "";
  // Only meaningful on desktop, where the column fits the screen and the board's bottom edge must
  // stop above the fixed footer. On a phone the board sits mid-scroll-column: its measured top is
  // scroll-dependent and often already at/below the footer, which collapsed the cap to its 60px
  // floor and visibly clipped the graffiti text. There the column scrolls, so natural height
  // (plus the stylesheet's own mobile fallback for the images row) is correct.
  if (window.matchMedia(MOBILE_MEDIA_QUERY).matches) return;
  const footerTop = footerRow.getBoundingClientRect().top;

  if (showImages) {
    const boardBottomOffset = noticeBoard.getBoundingClientRect().bottom - noticeBoardImages.getBoundingClientRect().bottom;
    const h0 = noticeBoardImages.getBoundingClientRect().height;
    const t0 = noticeBoardImages.getBoundingClientRect().top;
    const target = footerTop - GAP_PX - boardBottomOffset;
    const available = 2 * (target - t0) - h0;
    noticeBoardImages.style.height = `${Math.max(60, available)}px`;
  } else {
    const h0 = noticeBoard.getBoundingClientRect().height;
    const t0 = noticeBoard.getBoundingClientRect().top;
    const available = 2 * (footerTop - GAP_PX - t0) - h0;
    noticeBoard.style.maxHeight = `${Math.max(60, available)}px`;
  }
}

/** Long graffiti text (up to the input's 60-char cap) can overflow the notice-board's capped box —
 *  its font-size is a CSS clamp() tuned for typical short tags, not worst-case length, and the
 *  board clips overflow rather than growing past the footer. Shrinks the font, one px at a time
 *  down to a readable floor, only as far as actually needed to make the wrapped text's own layout
 *  height fit the board's padded interior; short text is untouched (stays at the CSS clamp value).
 *  Desktop only, as asked.
 *
 *  Measures via offsetHeight, not getBoundingClientRect() — the graffiti span carries a
 *  rotate+skew transform, and skewing a *wide* box (it's a full-width block regardless of how
 *  little text it holds — width isn't a useful fit signal here since word-break just wraps any
 *  excess into more lines) inflates the transformed bounding box's height substantially beyond
 *  the text's real rendered height. Caught empirically: a single short line measured ~78px via
 *  getBoundingClientRect() vs its actual ~53px layout height, so the old width+height check
 *  against the transformed rect was shrinking even text that already fit fine. offsetHeight
 *  reflects the plain (pre-transform) layout box — exactly what determines how many lines the
 *  text wraps into, which is what actually governs whether it fits.
 *
 *  Assumes the font-size has already been reset to "" and fitNoticeBoardHeight() has already run
 *  — both callers do this in that order, since the board's height cap must itself be computed
 *  from the *natural* font size, not from whatever this function shrunk it to on a previous pass
 *  (that ordering bug was caught empirically too: repeated calls ratcheted the font smaller every
 *  time since each pass's height measurement was tainted by the previous pass's shrink). */
function fitGraffitiFontSize(): void {
  if (window.matchMedia(MOBILE_MEDIA_QUERY).matches) return;

  const boardStyle = getComputedStyle(noticeBoard);
  const availableHeight = noticeBoard.clientHeight - parseFloat(boardStyle.paddingTop) - parseFloat(boardStyle.paddingBottom);
  const MIN_FONT_PX = 14;

  let fontSize = parseFloat(getComputedStyle(noticeBoardGraffiti).fontSize);
  while (fontSize > MIN_FONT_PX && noticeBoardGraffiti.offsetHeight > availableHeight) {
    fontSize -= 1;
    noticeBoardGraffiti.style.fontSize = `${fontSize}px`;
  }
}

async function renderBanner(): Promise<void> {
  const banner = await loadBanner();
  const showNotice = banner.displayMode === "notice" && !!banner.message;
  const showGraffiti = banner.displayMode === "graffiti" && !!banner.graffitiText;

  let images: BannerImage[] = [];
  if (banner.displayMode === "images") images = await loadBannerImages();
  const showImages = images.length > 0;

  noticeBoardText.textContent = banner.message ?? "";
  noticeBoardText.hidden = !showNotice;
  noticeBoardGraffiti.textContent = banner.graffitiText ?? "";
  noticeBoardGraffiti.hidden = !showGraffiti;
  noticeBoardLabel.hidden = !showNotice;

  if (showImages) {
    // Set via the DOM property, not interpolated into the HTML attribute above — consistent with
    // how leaderboard/guestbook always avoid putting arbitrary content inside an attribute value.
    noticeBoardImages.innerHTML = images.map((_, i) => `<img data-banner-image-index="${i}" alt="배너 이미지" />`).join("");
    images.forEach((image, i) => {
      const img = noticeBoardImages.querySelector<HTMLImageElement>(`img[data-banner-image-index="${i}"]`);
      if (img) img.src = image.imageData;
    });
  } else {
    noticeBoardImages.innerHTML = "";
  }
  noticeBoardImages.hidden = !showImages;

  noticeBoard.hidden = !showNotice && !showGraffiti && !showImages;
  // Reset the graffiti font back to its natural CSS size *before* fitNoticeBoardHeight measures
  // anything — otherwise, on a second render (e.g. the resize listener below firing again), it
  // would measure the board's height using whatever *already-shrunk* font size a previous
  // fitGraffitiFontSize() pass left in place, computing a too-small cap that then forces the next
  // shrink pass to shrink even further — a ratchet that only ever gets tighter, never recovers.
  if (showGraffiti) noticeBoardGraffiti.style.fontSize = "";
  if (!noticeBoard.hidden) fitNoticeBoardHeight(showImages);
  if (showGraffiti) fitGraffitiFontSize();
}

window.addEventListener("resize", () => {
  if (!noticeBoardGraffiti.hidden) noticeBoardGraffiti.style.fontSize = "";
  if (!noticeBoard.hidden) fitNoticeBoardHeight(!noticeBoardImages.hidden);
  if (!noticeBoardGraffiti.hidden) fitGraffitiFontSize();
});

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

membershipLoginButton.addEventListener("click", () => {
  membershipLoginNameInput.value = "";
  membershipLoginPasswordInput.value = "";
  membershipLoginError.hidden = true;
  membershipLoginOverlay.style.display = "flex";
  membershipLoginNameInput.focus();
});

membershipLoginCancel.addEventListener("click", () => {
  membershipLoginOverlay.style.display = "none";
});

membershipLoginPasswordInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") membershipLoginSubmit.click();
});

membershipLoginSubmit.addEventListener("click", () => {
  const name = membershipLoginNameInput.value.trim();
  const password = membershipLoginPasswordInput.value;
  membershipLoginError.hidden = true;
  if (!name || !password) return;
  void memberLogin(name, password)
    .then((loggedInMember) => {
      member = loggedInMember;
      memberPassword = password;
      localStorage.setItem(MEMBER_CREDENTIALS_KEY, JSON.stringify({ name, password }));
      membershipLoginOverlay.style.display = "none";
      setMembershipUI();
      void renderGuestbook();
      void renderLeaderboard();
    })
    .catch((err) => {
      if (err instanceof WrongMemberPasswordError) {
        membershipLoginError.textContent = "이름 또는 비밀번호가 일치하지 않습니다";
      } else {
        console.error("멤버십 로그인 실패:", err);
        membershipLoginError.textContent = "로그인에 실패했습니다. 잠시 후 다시 시도해주세요.";
      }
      membershipLoginError.hidden = false;
    });
});

membershipLogoutButton.addEventListener("click", () => {
  clearMemberSession();
  void renderGuestbook();
  void renderLeaderboard();
});

membershipSignupButton.addEventListener("click", () => {
  membershipSignupNameInput.value = "";
  membershipSignupPasswordInput.value = "";
  membershipSignupPasswordConfirmInput.value = "";
  membershipSignupPhotoInput.value = "";
  membershipSignupPhotoFilename.textContent = "";
  membershipSignupGenderMale.checked = false;
  membershipSignupGenderFemale.checked = false;
  membershipSignupBirthdateInput.value = "";
  membershipSignupPhoneInput.value = "";
  membershipSignupEmailInput.value = "";
  membershipSignupError.hidden = true;
  membershipSignupOverlay.style.display = "flex";
  membershipSignupNameInput.focus();
});

membershipSignupCancel.addEventListener("click", () => {
  membershipSignupOverlay.style.display = "none";
});

membershipSignupPhotoInput.addEventListener("change", () => {
  const file = membershipSignupPhotoInput.files?.[0];
  membershipSignupPhotoFilename.textContent = file ? file.name : "";
  membershipSignupError.hidden = true;
});

const MEMBER_NAME_KOREAN_ONLY_PATTERN = /^[가-힣]+$/;
const MEMBER_PASSWORD_DIGITS_ONLY_PATTERN = /^[0-9]+$/;

membershipSignupSubmit.addEventListener("click", () => {
  const name = membershipSignupNameInput.value.trim();
  const password = membershipSignupPasswordInput.value;
  const passwordConfirm = membershipSignupPasswordConfirmInput.value;
  membershipSignupError.hidden = true;

  if (!name || !password) {
    membershipSignupError.textContent = "이름과 비밀번호를 입력해주세요.";
    membershipSignupError.hidden = false;
    return;
  }
  // Popups (not the inline error span) per how this was asked for — distinct enough from the rest
  // of this form's validation that a modal interruption is warranted.
  if (!MEMBER_NAME_KOREAN_ONLY_PATTERN.test(name)) {
    window.alert("이름은 한글로만 입력해주세요.");
    return;
  }
  if (!MEMBER_PASSWORD_DIGITS_ONLY_PATTERN.test(password)) {
    window.alert("비밀번호는 숫자로만 입력해주세요.");
    return;
  }
  if (password !== passwordConfirm) {
    membershipSignupError.textContent = "비밀번호가 서로 일치하지 않습니다.";
    membershipSignupError.hidden = false;
    return;
  }
  if (!membershipSignupGenderMale.checked && !membershipSignupGenderFemale.checked) {
    membershipSignupError.textContent = "성별을 선택해주세요.";
    membershipSignupError.hidden = false;
    return;
  }

  const file = membershipSignupPhotoInput.files?.[0] ?? null;
  if (!validateAttachmentFile(file, membershipSignupError, false).valid) return;

  // At least one of the two is checked — validated by the guard above.
  const gender: MemberGender = membershipSignupGenderMale.checked ? "male" : "female";
  const birthdate = membershipSignupBirthdateInput.value || null;
  const phone = membershipSignupPhoneInput.value.trim() || null;
  const email = membershipSignupEmailInput.value.trim() || null;

  void (file ? readFileAsDataUrl(file) : Promise.resolve(null))
    .then((photoData) => memberSignup({ name, password, photoData, gender, birthdate, phone, email }))
    .then((newMember) => {
      member = newMember;
      memberPassword = password;
      localStorage.setItem(MEMBER_CREDENTIALS_KEY, JSON.stringify({ name, password }));
      membershipSignupOverlay.style.display = "none";
      setMembershipUI();
      void renderGuestbook();
      void renderLeaderboard();
    })
    .catch((err) => {
      if (err instanceof NameTakenError) {
        membershipSignupError.textContent = "이미 사용 중인 이름입니다. 다른 이름을 입력해주세요.";
      } else {
        console.error("멤버십 가입 실패:", err);
        membershipSignupError.textContent = "가입에 실패했습니다. 잠시 후 다시 시도해주세요.";
      }
      membershipSignupError.hidden = false;
    });
});

membershipAvatar.addEventListener("click", () => {
  if (!member || !member.photoData) return;
  photoLightboxImage.src = member.photoData;
  photoLightboxImage.alt = `${member.name} 프로필 사진`;
  photoLightboxOverlay.style.display = "flex";
});

membershipNameLabel.addEventListener("click", () => {
  if (!member) return;
  membershipProfilePhotoInput.value = "";
  membershipProfilePhotoFilename.textContent = "";
  membershipProfileGenderMale.checked = member.gender === "male";
  membershipProfileGenderFemale.checked = member.gender === "female";
  membershipProfileBirthdateInput.value = member.birthdate ?? "";
  membershipProfilePhoneInput.value = member.phone ?? "";
  membershipProfileEmailInput.value = member.email ?? "";
  membershipProfileNewPasswordInput.value = "";
  membershipProfileNewPasswordConfirmInput.value = "";
  membershipProfilePasswordInput.value = "";
  membershipProfileSuccess.hidden = true;
  membershipProfileError.hidden = true;
  membershipProfileOverlay.style.display = "flex";
});

membershipProfileCancel.addEventListener("click", () => {
  membershipProfileOverlay.style.display = "none";
});

membershipProfilePhotoInput.addEventListener("change", () => {
  const file = membershipProfilePhotoInput.files?.[0];
  membershipProfilePhotoFilename.textContent = file ? file.name : "";
  membershipProfileError.hidden = true;
});

membershipProfileSubmit.addEventListener("click", () => {
  if (!member) return;
  const password = membershipProfilePasswordInput.value;
  const newPassword = membershipProfileNewPasswordInput.value;
  const newPasswordConfirm = membershipProfileNewPasswordConfirmInput.value;
  membershipProfileSuccess.hidden = true;
  membershipProfileError.hidden = true;

  if (!password) {
    membershipProfileError.textContent = "비밀번호를 입력해주세요.";
    membershipProfileError.hidden = false;
    return;
  }
  if (!membershipProfileGenderMale.checked && !membershipProfileGenderFemale.checked) {
    membershipProfileError.textContent = "성별을 선택해주세요.";
    membershipProfileError.hidden = false;
    return;
  }
  // Blank means "keep the current password" — only validate/apply it when the field was actually
  // touched, same optional-unless-typed treatment as birthdate/phone/email above.
  if (newPassword) {
    if (!MEMBER_PASSWORD_DIGITS_ONLY_PATTERN.test(newPassword)) {
      window.alert("새 비밀번호는 숫자로만 입력해주세요.");
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      membershipProfileError.textContent = "새 비밀번호가 서로 일치하지 않습니다.";
      membershipProfileError.hidden = false;
      return;
    }
  }

  const file = membershipProfilePhotoInput.files?.[0] ?? null;
  if (!validateAttachmentFile(file, membershipProfileError, false).valid) return;

  const currentName = member.name;
  const gender: MemberGender = membershipProfileGenderMale.checked ? "male" : "female";
  const birthdate = membershipProfileBirthdateInput.value || null;
  const phone = membershipProfilePhoneInput.value.trim() || null;
  const email = membershipProfileEmailInput.value.trim() || null;
  // Whatever the member re-authenticates with going forward — the new password if they just set
  // one, otherwise the same current password used to authorize this save.
  const effectivePassword = newPassword || password;

  void (file ? readFileAsDataUrl(file) : Promise.resolve(null))
    .then((photoData) => updateMemberProfile(currentName, password, { gender, birthdate, phone, email, photoData, newPassword: newPassword || null }))
    .then((updatedMember) => {
      member = updatedMember;
      memberPassword = effectivePassword;
      localStorage.setItem(MEMBER_CREDENTIALS_KEY, JSON.stringify({ name: currentName, password: effectivePassword }));
      // Left open (not closed like login/signup) so the success message is actually visible —
      // closing immediately would show it for zero perceptible time.
      membershipProfilePhotoInput.value = "";
      membershipProfilePhotoFilename.textContent = "";
      membershipProfileNewPasswordInput.value = "";
      membershipProfileNewPasswordConfirmInput.value = "";
      membershipProfilePasswordInput.value = "";
      membershipProfileSuccess.hidden = false;
      setMembershipUI();
      void renderGuestbook();
      void renderLeaderboard();
    })
    .catch((err) => {
      if (err instanceof WrongMemberPasswordError) {
        membershipProfileError.textContent = "비밀번호가 일치하지 않습니다.";
        membershipProfileError.hidden = false;
      } else {
        console.error("내 정보 수정 실패:", err);
        // Include the underlying message — a bare "실패했습니다" hides exactly the detail needed to
        // tell a missing DB function apart from a network blip when the user reports it.
        membershipProfileError.textContent = `수정에 실패했습니다: ${err instanceof Error ? err.message : String(err)}`;
        membershipProfileError.hidden = false;
      }
    });
});

/** Irreversible, so it's gated behind both a typed password (re-verified server-side, same as
 *  every other profile action) and a confirm() — one accidental click shouldn't delete an account. */
membershipProfileWithdrawButton.addEventListener("click", () => {
  if (!member) return;
  const password = membershipProfilePasswordInput.value;
  membershipProfileSuccess.hidden = true;
  membershipProfileError.hidden = true;

  if (!password) {
    membershipProfileError.textContent = "비밀번호를 입력해주세요.";
    membershipProfileError.hidden = false;
    return;
  }
  if (!window.confirm("정말 탈퇴하시겠습니까? 이 작업은 되돌릴 수 없습니다.")) return;

  const currentName = member.name;
  void withdrawMember(currentName, password)
    .then(() => {
      clearMemberSession();
      membershipProfileOverlay.style.display = "none";
      void renderGuestbook();
      void renderLeaderboard();
    })
    .catch((err) => {
      if (err instanceof WrongMemberPasswordError) {
        membershipProfileError.textContent = "비밀번호가 일치하지 않습니다.";
        membershipProfileError.hidden = false;
      } else {
        console.error("회원 탈퇴 실패:", err);
        membershipProfileError.textContent = `탈퇴에 실패했습니다: ${err instanceof Error ? err.message : String(err)}`;
        membershipProfileError.hidden = false;
      }
    });
});

/** signupOrder is this member's permanent 1-based signup rank (computed once from the roster's
 *  natural id-ascending order, before the display sort below reorders rows by online status) — it
 *  stays the same regardless of who's currently online, rather than shifting every time the table
 *  re-renders. onlineIds is a snapshot of getOnlineMemberIds() taken once per renderMembersDirectory()
 *  call — same one-shot-per-open pattern as the roster fetch itself, not a live-updating subscription. */
function renderMembersDirectoryEntryHtml(entry: MemberDirectoryEntry, signupOrder: number, onlineIds: Set<number>): string {
  const genderLabel = entry.gender === "male" ? "남" : entry.gender === "female" ? "여" : "-";
  const isOnline = onlineIds.has(entry.id);
  // Chat only ever makes sense against another online member — clicking your own row, or anyone
  // offline, does nothing (no trigger class/attributes at all in that case).
  const canChat = isOnline && entry.id !== member?.id;
  const chatAttrs = canChat ? ` data-chat-member-id="${entry.id}" data-chat-member-name="${escapeHtml(entry.name)}"` : "";
  const chatClass = canChat ? " members-directory-chat-trigger" : "";
  return `
    <tr>
      <td class="members-directory-number">${signupOrder}</td>
      <td><div class="members-directory-avatar${entry.photoData ? " has-photo" : ""}" data-member-id="${entry.id}"></div></td>
      <td class="members-directory-name${chatClass}"${chatAttrs}>${escapeHtml(entry.name)}</td>
      <td>${genderLabel}</td>
      <td>${entry.birthdate ? escapeHtml(entry.birthdate) : "-"}</td>
      <td>${entry.phone ? escapeHtml(entry.phone) : "-"}</td>
      <td>${entry.email ? escapeHtml(entry.email) : "-"}</td>
      <td>${formatLocalDate(entry.dateIso)}</td>
      <td class="members-directory-online${isOnline ? " is-online" : ""}${chatClass}"${chatAttrs}>${isOnline ? "🟢 접속중" : "⚪ -"}</td>
    </tr>`;
}

/** YYYY-MM-DD in the viewer's local timezone — same day-boundary logic as formatLocalDate, but
 *  without the time-of-day part, since two members who joined on the same calendar day (just at
 *  different times) should tie at this step and fall through to the age/name tiebreakers below. */
function localDateOnly(dateIso: string): string {
  const d = new Date(dateIso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Crews directory sort order, most to least important: online now, then earlier signup date,
 *  then older (earlier birthdate — members who skipped it sort after ones who gave it, within the
 *  same signup date), then name in Korean alphabetical order. Each tier only breaks ties left by
 *  the one before it. */
function compareMembersForDirectory(a: MemberDirectoryEntry, b: MemberDirectoryEntry, onlineIds: Set<number>): number {
  const aOnline = onlineIds.has(a.id);
  const bOnline = onlineIds.has(b.id);
  if (aOnline !== bOnline) return aOnline ? -1 : 1;

  const aDate = localDateOnly(a.dateIso);
  const bDate = localDateOnly(b.dateIso);
  if (aDate !== bDate) return aDate < bDate ? -1 : 1;

  if (a.birthdate !== b.birthdate) {
    if (!a.birthdate) return 1;
    if (!b.birthdate) return -1;
    return a.birthdate < b.birthdate ? -1 : 1;
  }

  return a.name.localeCompare(b.name, "ko");
}

async function renderMembersDirectory(): Promise<void> {
  // Crew-only — same login requirement as every other member action, just checked client-side
  // first so a guest sees an explanatory message instead of a request that's just going to be
  // rejected server-side anyway (list_members() also enforces this — see its own comment).
  if (!member || !memberPassword) {
    membersDirectoryList.innerHTML = `<tr id="members-directory-empty"><td colspan="9">로그인한 회원만 볼 수 있습니다.</td></tr>`;
    return;
  }

  let members: MemberDirectoryEntry[];
  try {
    members = await loadMembers(member.name, memberPassword);
  } catch (err) {
    if (err instanceof WrongMemberPasswordError) {
      membersDirectoryList.innerHTML = `<tr id="members-directory-empty"><td colspan="9">회원 인증이 만료되었습니다. 다시 로그인해주세요.</td></tr>`;
      clearMemberSession();
      return;
    }
    // Distinct from the empty state below — "no members yet" when the view can't even be read
    // would hide a real problem (most likely the members_public/list_members migration not having
    // been run yet).
    console.error("회원 명부 조회 실패:", err);
    membersDirectoryList.innerHTML = `<tr id="members-directory-empty"><td colspan="9">명부를 불러오지 못했습니다.</td></tr>`;
    return;
  }
  if (members.length === 0) {
    membersDirectoryList.innerHTML = `<tr id="members-directory-empty"><td colspan="9">아직 가입한 회원이 없습니다.</td></tr>`;
    return;
  }
  const onlineIds = getOnlineMemberIds();
  // signupOrder is captured from the roster's natural id-ascending order (loadMembers()/
  // list_members() already sort that way) before the sort below reorders rows for display.
  const ranked = members
    .map((entry, i) => ({ entry, signupOrder: i + 1 }))
    .sort((a, b) => compareMembersForDirectory(a.entry, b.entry, onlineIds));
  membersDirectoryList.innerHTML = ranked.map(({ entry, signupOrder }) => renderMembersDirectoryEntryHtml(entry, signupOrder, onlineIds)).join("");
  // Set via the DOM property, not interpolated into the HTML above — same reasoning as every other
  // base64 photo in this codebase (guestbook attachments, leaderboard photos).
  for (const entry of members) {
    if (!entry.photoData) continue;
    const avatar = membersDirectoryList.querySelector<HTMLDivElement>(`.members-directory-avatar[data-member-id="${entry.id}"]`);
    if (avatar) avatar.style.backgroundImage = `url(${entry.photoData})`;
  }
}

membersDirectoryOpenCard.addEventListener("click", () => {
  membersDirectoryOverlay.style.display = "flex";
  void renderMembersDirectory();
});

membersDirectoryRefreshButton.addEventListener("click", () => {
  void renderMembersDirectory();
});

membersDirectoryCloseButton.addEventListener("click", () => {
  membersDirectoryOverlay.style.display = "none";
});

// --- BDJ Crews direct chat --------------------------------------------------------------------
// One conversation open at a time (like the shared photo lightbox elsewhere in this file) rather
// than a multi-window messenger — switching partners just reloads the panel against the new one.

let activeChatPartnerId: number | null = null;
let activeChatPartnerName: string | null = null;

function formatMessageTime(dateIso: string): string {
  const d = new Date(dateIso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function renderDirectChatMessages(messages: DirectMessage[]): void {
  if (messages.length === 0) {
    directChatMessages.innerHTML = `<p id="direct-chat-empty">아직 대화가 없습니다. 첫 메시지를 보내보세요!</p>`;
    return;
  }
  directChatMessages.innerHTML = messages
    .map((msg) => {
      const mine = msg.senderId === member?.id;
      return `<div class="direct-chat-message ${mine ? "mine" : "theirs"}">${escapeHtml(msg.message)}<br /><small>${formatMessageTime(msg.dateIso)}</small></div>`;
    })
    .join("");
  directChatMessages.scrollTop = directChatMessages.scrollHeight;
}

/** Opens (or switches) the chat panel onto partnerId — used both for a user-initiated click on an
 *  online Crews row and for an incoming-message nudge from openChatInbox's handler below. */
async function openDirectChat(partnerId: number, partnerName: string): Promise<void> {
  if (!member || !memberPassword) return;
  activeChatPartnerId = partnerId;
  activeChatPartnerName = partnerName;
  directChatTitle.textContent = `${partnerName}님과의 대화`;
  directChatOverlay.style.display = "flex";
  directChatMessages.innerHTML = `<p id="direct-chat-empty">불러오는 중...</p>`;
  try {
    const messages = await loadDirectMessages(member.name, memberPassword, partnerId);
    // The panel may have been switched to a different partner while this was in flight.
    if (activeChatPartnerId === partnerId) renderDirectChatMessages(messages);
  } catch (err) {
    console.error("대화 불러오기 실패:", err);
    if (activeChatPartnerId === partnerId) {
      directChatMessages.innerHTML = `<p id="direct-chat-empty">대화를 불러오지 못했습니다.</p>`;
    }
  }
}

membersDirectoryList.addEventListener("click", (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>("[data-chat-member-id]");
  if (!target) return;
  const partnerId = Number(target.dataset.chatMemberId);
  const partnerName = target.dataset.chatMemberName ?? "";
  void openDirectChat(partnerId, partnerName);
});

directChatCloseButton.addEventListener("click", () => {
  directChatOverlay.style.display = "none";
  activeChatPartnerId = null;
  activeChatPartnerName = null;
});

function sendActiveDirectChatMessage(): void {
  const text = directChatInput.value.trim();
  if (!text || !member || !memberPassword || activeChatPartnerId == null || !activeChatPartnerName) return;
  const partnerId = activeChatPartnerId;
  directChatInput.value = "";
  void sendDirectMessage(member.name, memberPassword, partnerId, text)
    .then(() => {
      notifyNewMessage(partnerId, member!.id, member!.name);
      // Re-fetches rather than appending the single new message locally — simpler, and the
      // conversation is short-lived/small enough that a full reload costs nothing noticeable.
      if (activeChatPartnerId === partnerId) void openDirectChat(partnerId, activeChatPartnerName!);
    })
    .catch((err) => {
      console.error("메시지 전송 실패:", err);
      window.alert("메시지 전송에 실패했습니다.");
    });
}

directChatSendButton.addEventListener("click", sendActiveDirectChatMessage);
directChatInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") sendActiveDirectChatMessage();
});

/** Wired into setMembershipUI() below — an incoming message either refreshes the conversation
 *  already open with that sender, or pops the chat open onto them (this is the "메신저처럼 상대방
 *  화면에도 창이 뜨는" behavior asked for). */
function handleIncomingDirectMessage(fromId: number, fromName: string): void {
  void openDirectChat(fromId, fromName);
}

/** Shared by every admin-panel action below — a rejected password means the stored one no longer
 *  matches (e.g. the owner rotated it directly in Supabase), so drop out of admin mode entirely
 *  rather than leaving the panel open in a now-unauthenticated state. Pass errorSpan for actions
 *  that show their failure inline (not just console.error) — a silent failure there is exactly
 *  what made past bugs ("업로드가 안 되고 있다") hard to diagnose with no visible cause. */
function handleAdminPanelError(err: unknown, context: string, errorSpan?: HTMLSpanElement): void {
  if (err instanceof WrongAdminPasswordError) {
    adminPanelOverlay.style.display = "none";
    forceAdminLogout("관리자 인증이 만료되었습니다. 다시 로그인해주세요.");
    return;
  }
  console.error(context, err);
  if (errorSpan) {
    errorSpan.textContent = `${context} ${err instanceof Error ? err.message : String(err)}`;
    errorSpan.hidden = false;
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
  void loadChatbotMode().then((mode) => {
    chatbotAdminMode = mode;
    adminChatbotModeRadios.forEach((radio) => {
      radio.checked = radio.value === mode;
    });
  });
  void renderAdminSocialLinksList();
  void renderAdminBannerImagesList();
  adminPanelOverlay.style.display = "flex";
});

adminPanelCloseButton.addEventListener("click", () => {
  adminPanelOverlay.style.display = "none";
  adminChangeCurrentPasswordInput.value = "";
  adminChangeNewPasswordInput.value = "";
  adminChangeConfirmPasswordInput.value = "";
  adminChangePasswordError.hidden = true;
  adminChangePasswordSuccess.hidden = true;
  adminBannerSaveError.hidden = true;
  adminBannerSaveSuccess.hidden = true;
  adminBannerImagesInput.value = "";
  adminBannerImagesFilenames.textContent = "";
  adminBannerImagesError.hidden = true;
  adminBannerImagesSuccess.hidden = true;
  adminChatbotModeError.hidden = true;
  adminChatbotModeSuccess.hidden = true;
});

adminChatbotModeSaveButton.addEventListener("click", () => {
  if (!adminPassword) return;
  const checkedRadio = Array.from(adminChatbotModeRadios).find((radio) => radio.checked);
  const mode = (checkedRadio?.value as ChatbotMode | undefined) ?? "gemini";
  adminChatbotModeError.hidden = true;
  adminChatbotModeSuccess.hidden = true;
  void adminSetChatbotMode(mode, adminPassword)
    .then(() => {
      chatbotAdminMode = mode;
      setChatbotModeLabel(chatbotAiModeActive());
      adminChatbotModeSuccess.textContent = `${mode === "faq" ? "Local FQA 모드" : "AI Gemini 모드"} 로 적용 저장되었습니다.`;
      adminChatbotModeSuccess.hidden = false;
    })
    .catch((err) => handleAdminPanelError(err, "제이봇 모드 저장에 실패했습니다:", adminChatbotModeError));
});

// Same labels as the admin-banner-mode-select radio labels — reused here so the save confirmation
// echoes back a name the admin already recognizes from the form above it.
const BANNER_MODE_LABELS: Record<BannerMode, string> = {
  none: "표시 안 함",
  notice: "공지 표시",
  graffiti: "그래피티 표시",
  images: "이미지 표시",
};

adminBannerSaveButton.addEventListener("click", () => {
  if (!adminPassword) return;
  const checkedRadio = Array.from(adminBannerModeRadios).find((radio) => radio.checked);
  const displayMode = (checkedRadio?.value as BannerMode | undefined) ?? "none";
  adminBannerSaveError.hidden = true;
  adminBannerSaveSuccess.hidden = true;
  void adminSetBanner(adminNoticeInput.value, adminGraffitiInput.value, displayMode, adminPassword)
    .then(() => {
      adminBannerSaveSuccess.textContent = `${BANNER_MODE_LABELS[displayMode]} 로 적용 저장되었습니다.`;
      adminBannerSaveSuccess.hidden = false;
      return renderBanner();
    })
    .catch((err) => handleAdminPanelError(err, "배너 저장에 실패했습니다:", adminBannerSaveError));
});

const BANNER_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/bmp"];
const BANNER_IMAGE_MAX_BYTES = 3 * 1024 * 1024;
const BANNER_IMAGE_MAX_COUNT = 4;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

// The label's native for="admin-banner-images-input" already opens the file picker on click — no
// JS needed for that part. This just reflects back what got picked, since a raw <input type="file">
// gives no other visible confirmation once it's styled out of view.
adminBannerImagesInput.addEventListener("change", () => {
  const files = Array.from(adminBannerImagesInput.files ?? []);
  adminBannerImagesFilenames.textContent = files.length > 0 ? `${files.length}개 선택됨: ${files.map((f) => f.name).join(", ")}` : "";
  adminBannerImagesError.hidden = true;
  adminBannerImagesSuccess.hidden = true;
});

adminBannerImagesAddButton.addEventListener("click", () => {
  if (!adminPassword) return;
  const currentAdminPassword = adminPassword;
  const files = Array.from(adminBannerImagesInput.files ?? []);
  adminBannerImagesError.hidden = true;
  adminBannerImagesSuccess.hidden = true;

  if (files.length < 1) {
    adminBannerImagesError.textContent = "추가할 이미지를 선택해주세요.";
    adminBannerImagesError.hidden = false;
    return;
  }
  const remainingSlots = BANNER_IMAGE_MAX_COUNT - adminBannerImagesList.querySelectorAll(".admin-banner-image-row").length;
  if (files.length > remainingSlots) {
    adminBannerImagesError.textContent = `이미지는 최대 ${BANNER_IMAGE_MAX_COUNT}개까지 등록할 수 있습니다 (현재 ${remainingSlots}개 추가 가능).`;
    adminBannerImagesError.hidden = false;
    return;
  }
  for (const file of files) {
    if (!BANNER_IMAGE_TYPES.includes(file.type)) {
      adminBannerImagesError.textContent = `지원하지 않는 파일 형식입니다: ${file.name}`;
      adminBannerImagesError.hidden = false;
      return;
    }
    if (file.size > BANNER_IMAGE_MAX_BYTES) {
      adminBannerImagesError.textContent = `파일이 너무 큽니다 (최대 3MB): ${file.name}`;
      adminBannerImagesError.hidden = false;
      return;
    }
  }

  void Promise.all(files.map(readFileAsDataUrl))
    .then((dataUrls) => adminAddBannerImages(dataUrls, currentAdminPassword))
    .then(() => {
      adminBannerImagesInput.value = "";
      adminBannerImagesFilenames.textContent = "";
      adminBannerImagesSuccess.hidden = false;
      return Promise.all([renderAdminBannerImagesList(), renderBanner()]);
    })
    .catch((err) => handleAdminPanelError(err, "이미지 저장에 실패했습니다:", adminBannerImagesError));
});

adminBannerImagesList.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-action="delete-image"]');
  if (!button || !adminPassword) return;
  const id = Number(button.dataset.id);
  if (!window.confirm("이 이미지를 삭제하시겠습니까?")) return;
  void adminDeleteBannerImage(id, adminPassword)
    .then(() => Promise.all([renderAdminBannerImagesList(), renderBanner()]))
    .catch((err) => handleAdminPanelError(err, "이미지 삭제 실패:"));
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

adminChangePasswordButton.addEventListener("click", () => {
  if (!adminPassword) return;
  const current = adminChangeCurrentPasswordInput.value;
  const next = adminChangeNewPasswordInput.value;
  const confirmNext = adminChangeConfirmPasswordInput.value;
  adminChangePasswordError.hidden = true;
  adminChangePasswordSuccess.hidden = true;
  if (!current || !next) return;
  if (next !== confirmNext) {
    adminChangePasswordError.textContent = "새 비밀번호가 일치하지 않습니다.";
    adminChangePasswordError.hidden = false;
    return;
  }
  void adminChangePassword(current, next)
    .then(() => {
      // The just-changed password becomes the one every subsequent admin action re-sends —
      // otherwise the very next delete/save this session would fail against the now-stale old one.
      adminPassword = next;
      sessionStorage.setItem("bdj-admin-password", next);
      adminChangeCurrentPasswordInput.value = "";
      adminChangeNewPasswordInput.value = "";
      adminChangeConfirmPasswordInput.value = "";
      adminChangePasswordSuccess.hidden = false;
    })
    .catch((err) => {
      if (err instanceof WrongAdminPasswordError) {
        adminChangePasswordError.textContent = "현재 비밀번호가 일치하지 않습니다.";
        adminChangePasswordError.hidden = false;
      } else {
        console.error("비밀번호 변경 실패:", err);
      }
    });
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

// --- Chatbot (Jaybot) ------------------------------------------------------------------------------

const chatbotHistory: ChatMessage[] = [];
let chatbotBusy = false;
// The admin's site-wide preference (loaded from site_notice below): "faq" pins Jaybot to the fixed
// FQA answers without ever calling Gemini; "gemini" tries AI first with the FQA as fallback.
let chatbotAdminMode: ChatbotMode = "gemini";

/** Shown in the panel header so it's visible which brain is answering: Gemini normally, the fixed
 *  FQA when the admin pinned that mode or when the free-tier quota is exhausted (or no key is
 *  configured). Tracks what actually happened on the most recent message. */
function setChatbotModeLabel(aiMode: boolean): void {
  chatbotMode.textContent = aiMode ? "AI Gemini 모드" : "Local FQA 모드";
}

function chatbotAiModeActive(): boolean {
  return chatbotAdminMode === "gemini" && isGeminiConfigured;
}
setChatbotModeLabel(chatbotAiModeActive());
void loadChatbotMode().then((mode) => {
  chatbotAdminMode = mode;
  setChatbotModeLabel(chatbotAiModeActive());
});

function appendChatbotMessage(text: string, role: "user" | "model"): void {
  const el = document.createElement("div");
  el.className = `chatbot-message chatbot-message-${role === "user" ? "user" : "bot"}`;
  el.textContent = text;
  chatbotMessages.appendChild(el);
  chatbotMessages.scrollTop = chatbotMessages.scrollHeight;
}

function answerFromFaq(question: string): void {
  setChatbotModeLabel(false);
  const faqAnswer = matchFaq(question);
  appendChatbotMessage(faqAnswer ?? "죄송해요, 그 질문은 아직 답해드리기 어려워요. 다른 방식으로 물어봐 주시겠어요?", "model");
}

/** Gemini first (free tier) unless the admin pinned FQA mode; on any Gemini failure — quota hit,
 *  network error, no key configured yet — falls back to the fixed FQA answers instead of surfacing
 *  an error to the player. */
async function sendChatbotMessage(): Promise<void> {
  const question = chatbotInput.value.trim();
  if (!question || chatbotBusy) return;
  chatbotBusy = true;
  chatbotInput.value = "";
  appendChatbotMessage(question, "user");

  try {
    if (chatbotAdminMode === "faq") {
      answerFromFaq(question);
      return;
    }
    const answer = await askGemini(chatbotHistory, question);
    chatbotHistory.push({ role: "user", text: question }, { role: "model", text: answer });
    setChatbotModeLabel(true);
    appendChatbotMessage(answer, "model");
  } catch (err) {
    if (!(err instanceof GeminiRateLimitedError)) console.error("Gemini 응답 실패:", err);
    answerFromFaq(question);
  } finally {
    chatbotBusy = false;
  }
}

chatbotSendButton.addEventListener("click", () => void sendChatbotMessage());
chatbotInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") void sendChatbotMessage();
});
chatbotToggleButton.addEventListener("click", () => {
  const opened = chatbotPanel.classList.toggle("chatbot-open");
  // Desktop nicety only: on phones, focusing here pops the soft keyboard the instant the panel
  // opens (covering most of a landscape screen) and used to trigger iOS's focus auto-zoom — the
  // keyboard should appear only when the user actually taps the input field.
  if (opened && !window.matchMedia(MOBILE_MEDIA_QUERY).matches) chatbotInput.focus();
});
chatbotCloseButton.addEventListener("click", () => chatbotPanel.classList.remove("chatbot-open"));

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

/** Standalone (home-screen icon) launch runs in WKWebView, not MobileSafari — and WKWebView has a
 *  long-standing WebKit bug (bugs.webkit.org #170595) where its internal touch-hit-testing
 *  geometry goes stale after an orientation change: the page visually re-renders to the new
 *  orientation, but taps keep resolving against the pre-rotation frame (reported as "have to tap
 *  ~1cm below the real target after portrait->landscape"), until something forces a full
 *  recompute — a manual reload does it instantly, which is exactly why that "fixes" it. Regular
 *  Safari tabs use MobileSafari and don't have this bug at all (confirmed by testing), so this is
 *  scoped to standalone only. iOS 17+'s rotation animation runs long enough that dimensions can
 *  still be settling well past a typical resize-event delay, hence the generous 500ms wait. The
 *  nudge itself — a 1px scroll and back — is the community-established way to force WKWebView to
 *  resync its hit-testing regions without a disruptive full reload; body normally has
 *  overflow:hidden (see above), so it's briefly relaxed just long enough for the nudge to take. */
if (isStandaloneApp) {
  let orientationNudgeTimer = 0;
  const nudgeTouchHitTestingAfterRotation = () => {
    window.clearTimeout(orientationNudgeTimer);
    orientationNudgeTimer = window.setTimeout(() => {
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "auto";
      window.scrollTo(0, 1);
      requestAnimationFrame(() => {
        window.scrollTo(0, 0);
        document.body.style.overflow = previousOverflow;
      });
    }, 500);
  };
  window.addEventListener("orientationchange", nudgeTouchHitTestingAfterRotation);
  window.visualViewport?.addEventListener("resize", nudgeTouchHitTestingAfterRotation);
}

/** On mobile, typing in the Jaybot chat input used to leave the input (and whatever the player
 *  was typing) hidden behind the on-screen keyboard — #chatbot-panel is bottom-anchored to the
 *  *layout* viewport, which most mobile browsers don't shrink when the keyboard opens, only the
 *  *visual* viewport does. Tracking that gap as a CSS variable and adding it to the panel's
 *  `bottom` (see style.css) pushes the whole panel — input row included — back above the keyboard. */
function updateKeyboardInset(): void {
  const viewport = window.visualViewport;
  const inset = viewport ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop) : 0;
  document.documentElement.style.setProperty("--keyboard-inset", `${inset}px`);
}
window.visualViewport?.addEventListener("resize", updateKeyboardInset);
window.visualViewport?.addEventListener("scroll", updateKeyboardInset);

/** Metallic gradient stops mirroring .text-metallic-gold/.text-metallic in style.css, reused here
 *  since canvas text needs its own gradient object rather than a CSS class. */
function goldGradient(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number): CanvasGradient {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, "#fff6d8");
  g.addColorStop(0.3, "#ffd200");
  g.addColorStop(0.5, "#9a6a00");
  g.addColorStop(0.72, "#ffd200");
  g.addColorStop(1, "#fff6d8");
  return g;
}

function chromeGradient(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number): CanvasGradient {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, "#f4f7fa");
  g.addColorStop(0.35, "#c9d3de");
  g.addColorStop(0.55, "#6b7684");
  g.addColorStop(0.8, "#c9d3de");
  g.addColorStop(1, "#f4f7fa");
  return g;
}

/** Draws the "trophy shot" overlay onto an already-captured camera frame: title + score up top,
 *  a decorative luxury-metal turntable/keys graphic along the bottom (a stylized keepsake render,
 *  not the live gameplay hit-zone overlay), and a photo-credit watermark at the very bottom. */
function drawPhotoOverlay(ctx: CanvasRenderingContext2D, width: number, height: number, score: number): void {
  // Letterbox bands behind the text keep it legible over whatever the camera happened to be
  // showing (the metal graphics below get their own shading and don't need this).
  const topBand = ctx.createLinearGradient(0, 0, 0, 80);
  topBand.addColorStop(0, "rgba(3, 5, 10, 0.75)");
  topBand.addColorStop(1, "rgba(3, 5, 10, 0)");
  ctx.fillStyle = topBand;
  ctx.fillRect(0, 0, width, 80);

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font = "700 26px Orbitron, sans-serif";
  ctx.fillStyle = goldGradient(ctx, width / 2 - 140, 0, width / 2 + 140, 0);
  ctx.fillText("Beejay's Deejay Jackey", width / 2, 34);

  ctx.font = "700 20px Orbitron, sans-serif";
  ctx.fillStyle = "#00f0ff";
  ctx.shadowColor = "rgba(0, 240, 255, 0.6)";
  ctx.shadowBlur = 8;
  ctx.fillText(`SCORE ${score.toLocaleString()}`, width / 2, 62);
  ctx.shadowBlur = 0;

  // Bottom deck: a scratch turntable on the left, 5 keys spanning the rest — same left/right split
  // as the real gameplay layout, but rendered as a static luxury-metal keepsake graphic rather than
  // the live hit-zone overlay.
  const deckTop = height - 100;
  const deckBackdrop = ctx.createLinearGradient(0, deckTop, 0, height);
  deckBackdrop.addColorStop(0, "rgba(3, 5, 10, 0)");
  deckBackdrop.addColorStop(0.3, "rgba(3, 5, 10, 0.7)");
  deckBackdrop.addColorStop(1, "rgba(3, 5, 10, 0.85)");
  ctx.fillStyle = deckBackdrop;
  ctx.fillRect(0, deckTop, width, 100);

  const turntableCx = 68;
  const turntableCy = height - 55;
  const turntableR = 40;
  const disc = ctx.createRadialGradient(turntableCx - 10, turntableCy - 10, 4, turntableCx, turntableCy, turntableR);
  disc.addColorStop(0, "#f4f7fa");
  disc.addColorStop(0.5, "#9aa5b1");
  disc.addColorStop(1, "#3a4149");
  ctx.beginPath();
  ctx.arc(turntableCx, turntableCy, turntableR, 0, Math.PI * 2);
  ctx.fillStyle = disc;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = goldGradient(ctx, turntableCx - turntableR, 0, turntableCx + turntableR, 0);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(turntableCx, turntableCy, turntableR * 0.32, 0, Math.PI * 2);
  ctx.fillStyle = goldGradient(ctx, turntableCx - 14, 0, turntableCx + 14, 0);
  ctx.fill();
  // Tonearm — a simple angled bar with a small pivot/head, evoking a real turntable's arm.
  ctx.save();
  ctx.translate(turntableCx + turntableR * 0.55, turntableCy - turntableR * 0.95);
  ctx.rotate((28 * Math.PI) / 180);
  ctx.fillStyle = chromeGradient(ctx, -3, 0, 3, 0);
  ctx.fillRect(-2.5, 0, 5, turntableR * 1.15);
  ctx.beginPath();
  ctx.arc(0, 0, 5, 0, Math.PI * 2);
  ctx.fillStyle = "#ffd200";
  ctx.fill();
  ctx.restore();

  const keysLeft = turntableCx + turntableR + 26;
  const keysRight = width - 16;
  const keyCount = 5;
  const keyGap = 6;
  const keyWidth = (keysRight - keysLeft - keyGap * (keyCount - 1)) / keyCount;
  const keyTop = height - 88;
  const keyHeight = 64;
  for (let i = 0; i < keyCount; i++) {
    const x = keysLeft + i * (keyWidth + keyGap);
    const keyGrad = ctx.createLinearGradient(0, keyTop, 0, keyTop + keyHeight);
    keyGrad.addColorStop(0, "#f4f7fa");
    keyGrad.addColorStop(0.45, "#aab4bf");
    keyGrad.addColorStop(0.55, "#7b8591");
    keyGrad.addColorStop(1, "#454c54");
    ctx.fillStyle = keyGrad;
    const radius = 6;
    ctx.beginPath();
    ctx.moveTo(x + radius, keyTop);
    ctx.arcTo(x + keyWidth, keyTop, x + keyWidth, keyTop + keyHeight, radius);
    ctx.arcTo(x + keyWidth, keyTop + keyHeight, x, keyTop + keyHeight, radius);
    ctx.arcTo(x, keyTop + keyHeight, x, keyTop, radius);
    ctx.arcTo(x, keyTop, x + keyWidth, keyTop, radius);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(255, 210, 0, 0.6)";
    ctx.stroke();
  }

  // Photo-credit watermark, last so it sits above everything else.
  const today = new Date();
  const dateLabel = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  ctx.font = "600 13px Rajdhani, sans-serif";
  ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
  ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
  ctx.shadowBlur = 4;
  ctx.fillText(`Photo by Beejay, 2026. ${dateLabel}.`, width / 2, height - 8);
  ctx.shadowBlur = 0;
}

/** Grabs the current camera frame as a JPEG data URL, then composites the trophy-shot overlay
 *  (title/score/luxury-metal turntable+keys/watermark — see drawPhotoOverlay) on top. Mirrored
 *  horizontally to match what the player actually saw on screen while posing — the live <video> is
 *  only mirrored via a CSS transform, the underlying frame data is not, so an unmirrored capture
 *  would look flipped. */
function capturePhoto(videoEl: HTMLVideoElement, score: number): string {
  const captureCanvas = document.createElement("canvas");
  captureCanvas.width = videoEl.videoWidth;
  captureCanvas.height = videoEl.videoHeight;
  const captureCtx = captureCanvas.getContext("2d")!;
  captureCtx.translate(captureCanvas.width, 0);
  captureCtx.scale(-1, 1);
  captureCtx.drawImage(videoEl, 0, 0, captureCanvas.width, captureCanvas.height);
  // The overlay itself (text, turntable, keys) must NOT be mirrored along with the video frame —
  // undo the flip before drawing it.
  captureCtx.setTransform(1, 0, 0, 1, 0, 0);
  drawPhotoOverlay(captureCtx, captureCanvas.width, captureCanvas.height, score);
  return captureCanvas.toDataURL("image/jpeg", 0.85);
}

/** Counts down over the still-live camera feed (see finalizeSession — camera.stop() is deliberately
 *  deferred until after this resolves) and captures a photo the moment it hits zero. Three phases:
 *  the rank announcement, then a pose prompt, each sitting alone for a couple seconds so they
 *  actually get read, then the 5-4-3-2-1 number — showing everything at once from the start meant
 *  most players never noticed which rank they'd hit, or had time to pose, before the photo fired. */
function runPhotoCountdown(videoEl: HTMLVideoElement, rank: number, score: number): Promise<string> {
  return new Promise((resolve) => {
    photoCountdownDescEl.textContent = `${rank}위 입성을 축하합니다! 기념촬영을 하겠습니다.`;
    photoCountdownNumberEl.textContent = "";
    photoCountdownOverlay.style.display = "flex";

    setTimeout(() => {
      photoCountdownDescEl.textContent = "DJ의 자세를 잡아주세요";

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
          const photo = capturePhoto(videoEl, score);
          photoCountdownOverlay.style.display = "none";
          resolve(photo);
        }, 1000);
      }, 2000);
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
  const capturedPhoto = await runPhotoCountdown(video, rank, cumulativeScore);
  camera.stop();
  nameEntryOverlay.style.display = "flex";

  await new Promise<void>((resolve) => {
    nameEntrySubmitButton.onclick = async () => {
      const name = nameEntryNameInput.value.trim();
      const message = nameEntryMessageInput.value.trim();
      // Matches the guestbook's own required-name behavior — a logged-in member's name is already
      // filled in and locked, so this only ever blocks a guest who left it blank.
      if (!name) return;
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
          memberName: member?.name,
          memberPassword: memberPassword ?? undefined,
        });
      } catch (err) {
        console.error("리더보드 저장 실패:", err);
      }
      // Keeps the name locked in if still logged in, instead of blanking a field the visitor
      // never got to type into.
      nameEntryNameInput.value = member?.name ?? "";
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

  // Sizes the stage to the camera's native aspect ratio and the canvas's drawing buffer to its
  // native resolution, so normalized landmark coordinates map 1:1 onto displayed pixels with no
  // crop/letterbox math. Re-run on every resize (which also fires on mobile orientation change),
  // not just once at session start — some mobile browsers report a different video.videoWidth/
  // videoHeight after a device rotation (the sensor's native orientation swaps), and #stage's CSS
  // box was already being re-fit to that new aspect on resize while the canvas's actual pixel
  // buffer stayed frozen at its start-of-session size — that mismatch is what squished the
  // hand-tracking overlay (keys/turntable) after rotating a couple of times.
  const resyncStageAndCanvas = () => {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    fitStageToViewport(video.videoWidth, video.videoHeight);
  };
  resyncStageAndCanvas();
  window.addEventListener("resize", resyncStageAndCanvas);

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
