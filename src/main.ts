import "./style.css";
import { getLang, initI18n, LANGUAGES, onLangChange, setLang, t, type Lang, type TKey } from "./i18n";
import { AudioEngine } from "./audio/AudioEngine";
import { SfxEngine } from "./audio/SfxEngine";
import { adminChangePassword, adminLogin, WrongAdminPasswordError } from "./game/Admin";
import { runFingerCalibration } from "./calibration/CalibrationFlow";
import { CameraManager } from "./camera/CameraManager";
import { adminSetChatbotMode, askGemini, GeminiRateLimitedError, isGeminiConfigured, loadChatbotMode, type ChatbotMode, type ChatMessage } from "./game/Chatbot";
import { adminSetSkinDesign, loadSkinDesign, SKIN_DESIGNS, SKIN_LABELS, type SkinDesign } from "./game/SkinDesign";
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
import {
  addLeaderboardEntry,
  adminDeleteLeaderboardEntries,
  computeProjectedRank,
  loadLeaderboard,
  qualifiesForTop20,
  type LeaderboardEntry,
} from "./game/Leaderboard";
import {
  adminDeleteMembers,
  countMembers,
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
import {
  adminAddBeejayBrosLink,
  adminDeleteBeejayBrosLink,
  adminUpdateBeejayBrosLink,
  loadBeejayBrosLinks,
  TooManyBeejayBrosLinksError,
  type BeejayBrosLink,
} from "./game/BeejayBrosLinks";
import { JudgmentEngine, type JudgmentResult } from "./game/JudgmentEngine";
import { adminAddBannerImages, adminDeleteBannerImage, loadBannerImages, type BannerImage } from "./game/BannerImages";
import { adminSetBanner, loadBanner, type BannerMode } from "./game/Notice";
import {
  adminAddNoticePopup,
  adminDeleteNoticePopup,
  adminUpdateNoticePopup,
  loadNoticePopups,
  TooManyNoticePopupsError,
  type NoticePopupItem,
} from "./game/NoticePopups";
import { MAIN_BGM_TRACKS } from "./game/MainBgm";
import { NoteScheduler } from "./game/NoteScheduler";
import { getPlatformIcon, PLATFORM_ICONS } from "./game/PlatformIcons";
import { getOnlineMemberIds, trackMemberOnline, untrackMemberOnline } from "./game/Presence";
import { ScoreManager } from "./game/ScoreManager";
import { adminAddSocialLink, adminDeleteSocialLink, adminUpdateSocialLink, loadSocialLinks, type SocialLink } from "./game/SocialLinks";
import {
  adminAddWebsiteLink,
  adminDeleteWebsiteLink,
  adminUpdateWebsiteLink,
  loadWebsiteLinks,
  TooManyWebsiteLinksError,
  type WebsiteLink,
  type WebsiteLinkAnimation,
  type WebsiteLinkFontFamily,
} from "./game/WebsiteLinks";
import { buildTestChart } from "./game/testChart";
import { DIFFICULTY_PRESETS, SCRATCH_LANE, type ChartDensity } from "./game/types";
import { reportVisit } from "./game/Visits";
import { GestureDetector } from "./handTracking/GestureDetector";
import { HandLandmarkerService } from "./handTracking/HandLandmarkerService";
import { ScratchDetector } from "./handTracking/ScratchDetector";
import type { FingertipDebugSample, HandFrame } from "./handTracking/types";
import { computeScratchZone, resolveScratchZone, type KeyZone } from "./handTracking/ZoneLayout";
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

// Several independent layout-refit functions (language-row positioning, control-group label
// shrinking, notice-board refitting) each register their own "resize" listener and each do their
// own getBoundingClientRect()/scrollHeight layout reads — during a continuous window drag-resize,
// every one of those events re-runs all of them independently. Coalescing every registrant into a
// single shared listener that runs them all together in one requestAnimationFrame tick (instead of
// once per registrant per event) means a resize burst costs one batched layout pass, not N
// independent ones stacked on top of each other.
const resizeRefitCallbacks = new Set<() => void>();
let resizeRefitRafId = 0;
function onWindowResizeRefit(callback: () => void): void {
  resizeRefitCallbacks.add(callback);
}
window.addEventListener("resize", () => {
  if (resizeRefitRafId) return;
  resizeRefitRafId = requestAnimationFrame(() => {
    resizeRefitRafId = 0;
    resizeRefitCallbacks.forEach((cb) => cb());
  });
});

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

// The leaderboard's speed/difficulty/bgm columns store the Korean label above verbatim (SPEED_LABELS/
// DIFFICULTY_LABELS), regardless of which language was active at submit time — changing that would
// mean a schema migration and would leave every historical row stuck in whatever language it was
// written in. Instead, storage stays fixed to Korean and only the leaderboard's DISPLAY reads through
// this reverse lookup into the current language — same historical row, correctly localized every time
// it's rendered, no migration needed.
const SPEED_LABEL_TO_KEY: Record<string, TKey> = {
  느림: "speedSlow", 보통: "speedNormal", 빠름: "speedFast", 개빠름: "speedExtreme",
};
const DIFFICULTY_LABEL_TO_KEY: Record<string, TKey> = {
  쉬움: "difficultyEasy", 어려움: "difficultyHard", 개어려움: "difficultyExtreme",
};
function displaySpeed(stored: string): string {
  const key = SPEED_LABEL_TO_KEY[stored];
  return key ? t(key) : stored === "보통" ? t("speedNormal") : stored;
}
function displayDifficulty(stored: string): string {
  const key = DIFFICULTY_LABEL_TO_KEY[stored];
  return key ? t(key) : stored === "보통" ? t("difficultyNormal") : stored;
}
/** bgm is stored as "YBJ" (brand name, kept as-is) or the Korean words "자유"/"무반주" — same
 *  reverse-lookup-for-display treatment as speed/difficulty above. */
function displayBgm(stored: string): string {
  if (stored === "자유") return t("bgmCustomDisplay");
  if (stored === "무반주") return t("bgmNoneDisplay");
  return stored;
}

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
// Paired with every startOverlay show/hide below — visible only while the start screen itself is
// hidden (active gameplay), so it never bleeds through the start screen's translucent background.
const gameTitleEl = document.querySelector<HTMLDivElement>("#game-title")!;
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
const comboValueEl = document.querySelector<HTMLDivElement>("#combo-value")!;
const resultsOverlay = document.querySelector<HTMLDivElement>("#results-overlay")!;
const resultsStepLabelEl = document.querySelector<HTMLDivElement>("#results-step-label")!;
const resultsScoreEl = document.querySelector<HTMLDivElement>("#results-score")!;
const resultsBreakdownEl = document.querySelector<HTMLDivElement>("#results-breakdown")!;
const resultsNextStepButton = document.querySelector<HTMLButtonElement>("#results-next-step-button")!;
const resultsConfirmButton = document.querySelector<HTMLButtonElement>("#results-confirm-button")!;
const stepSetupOverlay = document.querySelector<HTMLDivElement>("#step-setup-overlay")!;
const stepSetupTitleEl = document.querySelector<HTMLDivElement>("#step-setup-title")!;
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
const membershipProfilePasswordInput = document.querySelector<HTMLInputElement>("#membership-profile-password")!;
const membershipProfileSuccess = document.querySelector<HTMLSpanElement>("#membership-profile-success")!;
const membershipProfileError = document.querySelector<HTMLSpanElement>("#membership-profile-error")!;
const membershipProfileSubmit = document.querySelector<HTMLButtonElement>("#membership-profile-submit")!;
const membershipProfileCancel = document.querySelector<HTMLButtonElement>("#membership-profile-cancel")!;
const membershipProfileWithdrawButton = document.querySelector<HTMLButtonElement>("#membership-profile-withdraw-button")!;
const membersDirectoryOpenCard = document.querySelector<HTMLButtonElement>("#members-directory-open-card")!;
const membersDirectoryOverlay = document.querySelector<HTMLDivElement>("#members-directory-overlay")!;
const membersDirectoryRefreshButton = document.querySelector<HTMLButtonElement>("#members-directory-refresh-button")!;
const membersDirectoryAdminDeleteButton = document.querySelector<HTMLButtonElement>("#members-directory-admin-delete-button")!;
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
const guestbookTitle = document.querySelector<HTMLDivElement>("#guestbook-title")!;
const guestbookScrollBody = document.querySelector<HTMLDivElement>("#guestbook-scroll-body")!;
const guestbookCloseButton = document.querySelector<HTMLButtonElement>("#guestbook-close-button")!;
const photoCountdownOverlay = document.querySelector<HTMLDivElement>("#photo-countdown-overlay")!;
const photoCountdownDescEl = document.querySelector<HTMLDivElement>("#photo-countdown-desc")!;
const photoCountdownNumberEl = document.querySelector<HTMLDivElement>("#photo-countdown-number")!;
const photoLightboxOverlay = document.querySelector<HTMLDivElement>("#photo-lightbox-overlay")!;
const photoLightboxImage = document.querySelector<HTMLImageElement>("#photo-lightbox-image")!;
const photoLightboxDownloadButton = document.querySelector<HTMLButtonElement>("#photo-lightbox-download-button")!;
const languageSelectRow = document.querySelector<HTMLDivElement>("#language-select-row")!;
const installGuideCards = document.querySelectorAll<HTMLButtonElement>(".install-guide-card");
const installGuideOverlay = document.querySelector<HTMLDivElement>("#install-guide-overlay")!;
const installGuideModalTitle = document.querySelector<HTMLDivElement>("#install-guide-modal-title")!;
const installGuideModalSteps = document.querySelector<HTMLOListElement>("#install-guide-modal-steps")!;
const installGuideCloseButton = document.querySelector<HTMLButtonElement>("#install-guide-close-button")!;
const noticePopupOverlay = document.querySelector<HTMLDivElement>("#notice-popup-overlay")!;
const noticePopupList = document.querySelector<HTMLDivElement>("#notice-popup-list")!;
const noticePopupCloseButton = document.querySelector<HTMLButtonElement>("#notice-popup-close-button")!;
const noticePopupHideTodayCheckbox = document.querySelector<HTMLInputElement>("#notice-popup-hide-today-checkbox")!;
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
const adminSocialLinkImageInput = document.querySelector<HTMLInputElement>("#admin-social-link-image-input")!;
const adminSocialLinkImageFilename = document.querySelector<HTMLSpanElement>("#admin-social-link-image-filename")!;
const adminSocialLinkAddButton = document.querySelector<HTMLButtonElement>("#admin-social-link-add-button")!;
const adminSocialLinkError = document.querySelector<HTMLSpanElement>("#admin-social-link-error")!;
const websiteLinksContainer = document.querySelector<HTMLDivElement>("#website-links-container")!;
const adminWebsiteLinksList = document.querySelector<HTMLDivElement>("#admin-website-links-list")!;
const adminWebsiteLinkUrlInput = document.querySelector<HTMLInputElement>("#admin-website-link-url")!;
const adminWebsiteLinkTitleInput = document.querySelector<HTMLInputElement>("#admin-website-link-title")!;
const adminWebsiteLinkTitleFontSizeInput = document.querySelector<HTMLInputElement>("#admin-website-link-title-font-size")!;
const adminWebsiteLinkTitleFontFamilySelect = document.querySelector<HTMLSelectElement>("#admin-website-link-title-font-family")!;
const adminWebsiteLinkTitleBoldInput = document.querySelector<HTMLInputElement>("#admin-website-link-title-bold")!;
const adminWebsiteLinkContentInput = document.querySelector<HTMLInputElement>("#admin-website-link-content")!;
const adminWebsiteLinkContentFontSizeInput = document.querySelector<HTMLInputElement>("#admin-website-link-content-font-size")!;
const adminWebsiteLinkContentFontFamilySelect = document.querySelector<HTMLSelectElement>("#admin-website-link-content-font-family")!;
const adminWebsiteLinkContentBoldInput = document.querySelector<HTMLInputElement>("#admin-website-link-content-bold")!;
const adminWebsiteLinkFontColorInput = document.querySelector<HTMLInputElement>("#admin-website-link-font-color")!;
const adminWebsiteLinkBorderColorInput = document.querySelector<HTMLInputElement>("#admin-website-link-border-color")!;
const adminWebsiteLinkAnimationSelect = document.querySelector<HTMLSelectElement>("#admin-website-link-animation")!;
const adminWebsiteLinkAddButton = document.querySelector<HTMLButtonElement>("#admin-website-link-add-button")!;
const adminWebsiteLinkError = document.querySelector<HTMLSpanElement>("#admin-website-link-error")!;
const beejayBrosPanel = document.querySelector<HTMLDivElement>("#beejay-bros-panel")!;
const beejayBrosLinksContainer = document.querySelector<HTMLDivElement>("#beejay-bros-links-container")!;
const adminBeejayBrosLinkList = document.querySelector<HTMLDivElement>("#admin-beejay-bros-link-list")!;
const adminBeejayBrosLinkUrlInput = document.querySelector<HTMLInputElement>("#admin-beejay-bros-link-url")!;
const adminBeejayBrosLinkTextInput = document.querySelector<HTMLInputElement>("#admin-beejay-bros-link-text")!;
const adminBeejayBrosLinkAddButton = document.querySelector<HTMLButtonElement>("#admin-beejay-bros-link-add-button")!;
const adminBeejayBrosLinkError = document.querySelector<HTMLSpanElement>("#admin-beejay-bros-link-error")!;
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
const adminNoticePopupsList = document.querySelector<HTMLDivElement>("#admin-notice-popups-list")!;
const adminNoticePopupInput = document.querySelector<HTMLTextAreaElement>("#admin-notice-popup-input")!;
const adminNoticePopupAddButton = document.querySelector<HTMLButtonElement>("#admin-notice-popup-add-button")!;
const adminNoticePopupError = document.querySelector<HTMLSpanElement>("#admin-notice-popup-error")!;
const adminNoticePopupSuccess = document.querySelector<HTMLSpanElement>("#admin-notice-popup-success")!;
const adminBannerImagesFilenames = document.querySelector<HTMLSpanElement>("#admin-banner-images-filenames")!;
const adminBannerImagesError = document.querySelector<HTMLSpanElement>("#admin-banner-images-error")!;
const adminBannerImagesSuccess = document.querySelector<HTMLSpanElement>("#admin-banner-images-success")!;
const adminBannerImagesAddButton = document.querySelector<HTMLButtonElement>("#admin-banner-images-add-button")!;
const chatbotPanel = document.querySelector<HTMLDivElement>("#chatbot-panel")!;
const chatbotMode = document.querySelector<HTMLSpanElement>("#chatbot-mode")!;
const adminSkinDesignRadios = document.querySelectorAll<HTMLInputElement>('input[name="admin-skin-design"]');
const adminSkinDesignSaveButton = document.querySelector<HTMLButtonElement>("#admin-skin-design-save-button")!;
const adminSkinDesignError = document.querySelector<HTMLSpanElement>("#admin-skin-design-error")!;
const adminSkinDesignSuccess = document.querySelector<HTMLSpanElement>("#admin-skin-design-success")!;
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

// --- Main-screen BGM player ------------------------------------------------------------------
// Perf fix: this whole section used to sit at the very bottom of the file — functionally fine, but
// it meant startAmbientPlayback()'s bare audio.play() call (and the mainBgmAudio.src assignment inside
// loadMainBgmTrack(), which is what lets the browser actually start fetching the audio bytes) didn't
// run until the JS engine had first finished ~3300 lines of unrelated synchronous work: building the
// language dropdown, i18n setup, and — the big one — kicking off the page's ~10 parallel Supabase
// preload calls (leaderboard/guestbook/social-links/etc.). None of that is awaited before continuing,
// so it was never a *blocking* delay in the async sense, but it's still real wall-clock time the
// script has to execute through first, especially once you add slower parsing/execution on a mobile
// CPU. Moving this block up here — right after the last of the #stage/canvas/chatbot DOM refs it
// doesn't even depend on — means the very first thing the script does after grabbing its own
// elements is attempt to start audio, well before any of that other work begins. Nothing below reads
// from anything defined later in the file (this feature is self-contained), so this is a pure
// reordering with no behavior change beyond "starts sooner."
// Ambient playlist that plays only while the start screen is visible (see MAIN_BGM_TRACKS) — paused
// for the duration of an actual game session and resumed on return, and cut off by an external-link
// click since the visitor's attention has moved elsewhere even though the tab itself hasn't
// navigated. Autoplay-with-sound is blocked by the browser until a real gesture occurs, and iOS
// Safari silently ignores HTMLMediaElement.volume — both handled the same way as the
// single-page-promo-engineering skill's battle-tested background-audio-player reference (GainNode
// volume + a self-removing "unlock" listener), adapted here to this app's overlay-visibility-driven
// play/pause instead of a dedicated Stop button.
const mainBgmAudio = document.querySelector<HTMLAudioElement>("#main-bgm-audio")!;
const mainBgmPrevButton = document.querySelector<HTMLButtonElement>("#main-bgm-prev-button")!;
const mainBgmPlayPauseButton = document.querySelector<HTMLButtonElement>("#main-bgm-play-pause-button")!;
const mainBgmStopButton = document.querySelector<HTMLButtonElement>("#main-bgm-stop-button")!;
const mainBgmNextButton = document.querySelector<HTMLButtonElement>("#main-bgm-next-button")!;
const mainBgmMuteButton = document.querySelector<HTMLButtonElement>("#main-bgm-mute-button")!;
const mainBgmSeekSlider = document.querySelector<HTMLInputElement>("#main-bgm-seek")!;
const mainBgmVolumeSlider = document.querySelector<HTMLInputElement>("#main-bgm-volume")!;
const mainBgmMarqueeTrack = document.querySelector<HTMLDivElement>("#main-bgm-marquee-track")!;
const mainBgmMarqueeCopies = document.querySelectorAll<HTMLSpanElement>(".main-bgm-marquee-copy");

const MAIN_BGM_VOLUME_STORAGE_KEY = "bdj-mainbgm-volume";

let mainBgmTrackIndex = 0;
let mainBgmPreMuteVolume = 0.5;
let mainBgmSeeking = false;
let mainBgmErrorRetryTimer = 0;

// Root-cause fix (4th round — "shows playing but silent until the page is fully reloaded", reported
// live on iPhone): this player used to route output through an AudioContext+GainNode purely so the
// volume slider could work around iOS Safari silently ignoring HTMLMediaElement.volume. That graph
// was created lazily, only inside a real gesture, specifically to avoid the poisoned-graph bug two
// rounds ago — but it turned out to be a second, independent source of the same class of failure:
// the *first* AudioContext a page creates can, in some real-world conditions on iOS, end up in a
// state where resume() resolves and .state reports 'running' while the audio session still never
// actually reaches the speaker. A full page reload (a brand new AudioContext, on a clean page load)
// then works on the very next press — exactly the reported symptom. Rather than keep chasing this
// undocumented iOS state machine through a 4th, 5th... round, the graph is removed entirely: this is
// now a plain <audio> element with no Web Audio involved at all, identical to the ambient/no-gesture
// attempt (startAmbientPlayback below) that has reliably worked every other time it's been tested.
// Trade-off, accepted deliberately: the volume slider no longer has any audible effect on iOS Safari
// specifically — audio.volume was always silently ignored there, with or without this graph; the
// graph was a workaround for that, not a fix for anything this feature's actual priority (autoplay +
// reliably audible playback) depends on. Desktop/Android are unaffected, since audio.volume works
// natively there.
function applyMainBgmVolume(volume: number): void {
  mainBgmAudio.volume = volume;
  mainBgmMuteButton.textContent = volume === 0 ? "🔇" : "🔊";
}

function loadMainBgmTrack(index: number): void {
  // Self-review catch: without this, a manual Next/Prev click during the 700ms error-retry delay
  // (see the 'error' listener below) left that stale timer armed — it read mainBgmTrackIndex fresh
  // at fire time rather than the value from when it was scheduled, so it would silently overwrite
  // whatever track the visitor had just manually picked with "the one after the track that failed
  // earlier," a moment after they'd already moved on. Every track change (manual or automatic)
  // funnels through this one function, so cancelling here covers every case with one line.
  window.clearTimeout(mainBgmErrorRetryTimer);
  mainBgmTrackIndex = ((index % MAIN_BGM_TRACKS.length) + MAIN_BGM_TRACKS.length) % MAIN_BGM_TRACKS.length;
  const track = MAIN_BGM_TRACKS[mainBgmTrackIndex];
  mainBgmAudio.src = track.fileUrl;
  // Reset immediately rather than waiting for 'loadedmetadata' on the new track — otherwise the
  // seek bar would briefly keep showing the previous track's stale position/length.
  mainBgmSeekSlider.value = "0";
  mainBgmSeekSlider.max = "0";
  const marqueeText = `${track.title} — Produced by Yim Bongjin      `;
  mainBgmMarqueeCopies.forEach((el) => {
    el.textContent = marqueeText;
  });
  // Longer titles get a longer scroll duration so the reading speed stays roughly constant instead
  // of a long title whipping past in the same fixed time a short one takes.
  mainBgmMarqueeTrack.style.animationDuration = `${Math.max(8, marqueeText.length * 0.3)}s`;
}

function setMainBgmPlayIcon(isPlaying: boolean): void {
  mainBgmPlayPauseButton.textContent = isPlaying ? "⏸" : "▶";
}

/** The one real playback attempt, used by every caller — player buttons, the document-level unlock
 *  listener, track-end/error auto-advance, and the ambient page-load try below. No Web Audio graph
 *  involved (see applyMainBgmVolume's comment for why that was removed) — just a plain play() call,
 *  so there's no separate context state that can end up in the "reports running but silent" state
 *  that caused a past symptom.
 *
 *  Root-cause fix (6th round — mobile: autoplay inconsistent, and sometimes tapping the screen did
 *  nothing at all even after the "tap to start" hint): a muted-autoplay-then-reveal scheme lived
 *  here for one round, added to shave the delay between "first tap" and "audible sound." It's gone
 *  again — it added real, hard-to-verify-without-a-physical-device risk (muted play() resolving
 *  differently across iOS versions, promise-timing edges around the reveal) for a marginal gain,
 *  and the *actual* bug turned out to be simpler and unrelated (see disarmMainBgmUnlock's comment).
 *  Back to the plain, boring version: try to play, and every caller finds out whether it worked. */
async function playMainBgm(): Promise<void> {
  try {
    await mainBgmAudio.play();
    setMainBgmPlayIcon(true);
    // First-ever successful play (ambient or gesture-driven) since this page load — the ambient
    // unlock listener's one job is done, permanently. See disarmMainBgmUnlock's own comment for why
    // this is the ONLY thing that should ever disarm it (pausing/stopping later must NOT).
    disarmMainBgmUnlock();
  } catch {
    setMainBgmPlayIcon(false);
  }
}

/** Ambient attempt on page load — succeeds instantly on desktop's permissive autoplay policy
 *  (matching the reported "PC works fine" baseline exactly), and is silently rejected on a fresh
 *  mobile visit, falling back to the persistent tap-anywhere listener below (MAIN_BGM_UNLOCK_EVENTS)
 *  to catch the visitor's first real tap whenever it arrives. */
function startAmbientPlayback(): void {
  if (new URLSearchParams(location.search).has("bgm-no-autoplay")) {
    setMainBgmPlayIcon(false);
    return;
  }
  void playMainBgm();
}

/** Pauses playback — also the fix for the "infinite stutter/repeat" once reported when starting a
 *  game session while BGM was playing: pausing the plain <audio> element (there's no separate
 *  AudioContext to also release now — see applyMainBgmVolume's comment) fully frees it from the
 *  shared mobile audio session before the game creates its own AudioContext for sound effects, so
 *  the two no longer contend for the same output.
 *
 *  Self-review catch: this also cancels any pending error-retry timer (see the 'error' listener
 *  below) — without it, a track failure right before the visitor paused/stopped/left would still
 *  fire its 700ms-delayed retry afterward, since loadMainBgmTrack() only clears that timer when a
 *  track actually changes, which none of pause/stop/leaving-the-main-screen do.
 *
 *  Root-cause fix (6th round): this used to ALSO permanently disarm the tap-anywhere unlock
 *  listener on every pause/stop — including the automatic one that fires every single time a
 *  visitor leaves the main screen to play a game (see mainBgmOverlayObserver below). That meant:
 *  after literally one game session, the entire "tap anywhere to start music" mechanism silently
 *  stopped working for the rest of that page load, with nothing left except the dedicated Play
 *  button — exactly matching what was reported ("sometimes tapping does nothing at all"). Disarming
 *  now happens ONLY on a genuinely successful play (see playMainBgm) — never here. The original
 *  concern this was guarding against (Stop/Exit's own click bubbling to the document listener and
 *  immediately re-triggering playback) is handled at its actual source instead — see the
 *  stopPropagation() calls on this player's own buttons and the external-link handler below. */
function pauseMainBgm(): void {
  window.clearTimeout(mainBgmErrorRetryTimer);
  mainBgmAudio.pause();
  setMainBgmPlayIcon(false);
}

/** Full stop for the dedicated Stop button — same as pauseMainBgm plus rewinding to the start,
 *  matching a conventional player's Stop (vs. Pause, which resumes where it left off). */
function stopMainBgm(): void {
  pauseMainBgm();
  mainBgmAudio.currentTime = 0;
  mainBgmSeekSlider.value = "0";
}

mainBgmAudio.addEventListener("ended", () => {
  loadMainBgmTrack(mainBgmTrackIndex + 1);
  void playMainBgm();
});

// Self-review catch: a 404/decode failure on one track (e.g. a bad deploy) fires 'error', never
// 'ended' — without this, the playlist would just silently hang on that one track forever instead
// of skipping past it. mainBgmConsecutiveErrors caps the auto-skip at one full lap of the playlist
// so a deploy where every track is broken fails loud (via console.error below) instead of retrying
// forever. The 700ms delay before each retry is itself a bug fix, found while verifying this: with
// no delay, a transient network hiccup on one track fired 'error' -> retry -> 'error' again fast
// enough to storm the connection with dozens of requests within milliseconds, which is what turned
// a single flaky track into a cascade of failures across the whole playlist.
const MAIN_BGM_ERROR_RETRY_DELAY_MS = 700;
let mainBgmConsecutiveErrors = 0;
mainBgmAudio.addEventListener("playing", () => {
  mainBgmConsecutiveErrors = 0;
});
// Self-review catch (found live, verifying the fix above): preload="auto" on this element means
// the browser can keep trying to buffer the currently-set src in the background even while
// paused — so 'error' can fire at any time, including well after the visitor has already left the
// main screen, not just from a foreground retry. Without the isMainScreenActive() checks below,
// that background failure would arm (or fire, if already armed before leaving) a retry that calls
// playMainBgm() regardless — reviving audio during an actual game session, which is exactly the
// "must never come back alive on its own" guarantee this whole feature exists to uphold. Checked
// both when the error fires AND again inside the delayed callback, since the visitor can also leave
// during the 700ms gap between the two.
mainBgmAudio.addEventListener("error", () => {
  console.error("메인 BGM 트랙 로드 실패:", MAIN_BGM_TRACKS[mainBgmTrackIndex]?.fileUrl, mainBgmAudio.error);
  mainBgmConsecutiveErrors += 1;
  if (mainBgmConsecutiveErrors >= MAIN_BGM_TRACKS.length || !isMainScreenActive()) return;
  mainBgmErrorRetryTimer = window.setTimeout(() => {
    if (!isMainScreenActive()) return;
    loadMainBgmTrack(mainBgmTrackIndex + 1);
    void playMainBgm();
  }, MAIN_BGM_ERROR_RETRY_DELAY_MS);
});

mainBgmAudio.addEventListener("loadedmetadata", () => {
  mainBgmSeekSlider.max = String(mainBgmAudio.duration || 0);
});
mainBgmAudio.addEventListener("timeupdate", () => {
  if (mainBgmSeeking) return;
  mainBgmSeekSlider.value = String(mainBgmAudio.currentTime);
});
mainBgmSeekSlider.addEventListener("pointerdown", () => {
  mainBgmSeeking = true;
});
mainBgmSeekSlider.addEventListener("input", () => {
  mainBgmAudio.currentTime = Number(mainBgmSeekSlider.value);
});
// Self-review catch: 'change' alone left a way to get permanently stuck with mainBgmSeeking=true —
// if the drag gets interrupted before a 'change' fires (the pointer gets captured by something else,
// e.g. a phone call/notification on mobile, or the tab loses focus mid-drag), the seek bar would
// freeze at wherever it was and silently stop tracking real playback forever (timeupdate's handler
// above early-returns while this stays true). pointerup/pointercancel are a safety net that always
// fires once the drag ends for any reason, not just a clean release.
mainBgmSeekSlider.addEventListener("change", () => {
  mainBgmSeeking = false;
});
mainBgmSeekSlider.addEventListener("pointerup", () => {
  mainBgmSeeking = false;
});
mainBgmSeekSlider.addEventListener("pointercancel", () => {
  mainBgmSeeking = false;
});

// Every one of this player's own control buttons stops the click from bubbling to document — see
// disarmMainBgmUnlock's comment for the "clicking Stop immediately un-stops itself" glitch this
// prevents at the source, instead of the previous approach of tearing down the unlock listener on
// every pause (which had the side effect of disabling it long-term, not just for this one click).
mainBgmPlayPauseButton.addEventListener("click", (event) => {
  event.stopPropagation();
  if (mainBgmAudio.paused) {
    void playMainBgm();
  } else {
    pauseMainBgm();
  }
});
mainBgmStopButton.addEventListener("click", (event) => {
  event.stopPropagation();
  stopMainBgm();
});
mainBgmNextButton.addEventListener("click", (event) => {
  event.stopPropagation();
  loadMainBgmTrack(mainBgmTrackIndex + 1);
  void playMainBgm();
});
mainBgmPrevButton.addEventListener("click", (event) => {
  event.stopPropagation();
  loadMainBgmTrack(mainBgmTrackIndex - 1);
  void playMainBgm();
});
mainBgmMuteButton.addEventListener("click", (event) => {
  event.stopPropagation();
  const currentVolume = Number(mainBgmVolumeSlider.value);
  if (currentVolume > 0) {
    mainBgmPreMuteVolume = currentVolume;
    mainBgmVolumeSlider.value = "0";
    applyMainBgmVolume(0);
  } else {
    mainBgmVolumeSlider.value = String(mainBgmPreMuteVolume);
    applyMainBgmVolume(mainBgmPreMuteVolume);
  }
});
mainBgmVolumeSlider.addEventListener("input", () => {
  const volume = Number(mainBgmVolumeSlider.value);
  applyMainBgmVolume(volume);
  // Self-review catch: mainBgmPreMuteVolume was only ever updated from the Mute button's own click
  // handler — dragging the slider straight down to 0 by hand (bypassing that button entirely) left
  // it holding a stale value, so clicking Mute (now showing 🔇, since volume is genuinely 0)
  // afterward to "unmute" would restore whatever old volume happened to be stored instead of
  // anything the visitor actually set. Keeping this updated here for every non-zero value keeps the
  // "restore to" target correct regardless of which control silenced it.
  if (volume > 0) mainBgmPreMuteVolume = volume;
  try {
    localStorage.setItem(MAIN_BGM_VOLUME_STORAGE_KEY, String(volume));
  } catch {
    // Private mode etc.
  }
});

/** True while the start screen is the visible scene — reads the exact same style.display the game
 *  code already flips on #start-overlay (see startButton's click handler above and the various
 *  return-to-start-screen call sites in runSession/finalizeSession), so this needs no changes to
 *  that game-flow code to stay in sync. */
function isMainScreenActive(): boolean {
  return startOverlay.style.display !== "none";
}

// Autoplay-with-sound is blocked until a real user gesture. The fix is a document-level listener
// that attempts playback on the next click/touch/key anywhere, removing itself the moment a native
// 'play' event actually fires so it can never fight a later manual pause. Gated on
// isMainScreenActive() (not just "is it paused") so a gesture that itself just left the main screen
// (e.g. clicking "Let's Start BDJ" as literally the page's first-ever interaction) can't re-trigger
// playback after that same click already hid the start screen synchronously moments earlier.
//
// Root-cause fix (2nd round): 'scroll' was deliberately removed from this list. It is NOT a
// browser-recognized user-activation gesture for autoplay purposes — but this code was treating it
// as one, and on a phone "scroll to look around" is very often the very first thing a visitor does,
// well before their first real tap. That fired this same unlock path anyway, setting up the Web
// Audio graph and calling resume() from a non-gesture context that some mobile browsers never fully
// honor — silently reproducing the exact "shows as playing but is actually silent" bug this
// function exists to prevent, just moved from page-load to first-scroll instead of fixing it.
//
// Self-review catch (same lesson, smaller degree): 'keydown' has the identical risk — whether it
// counts as "real" user activation for autoplay purposes is inconsistent across browsers (some
// specifically exclude Tab, since it's page navigation rather than "interaction with the page").
// Since this is a mouse/touch/hand-tracking game with no meaningful keyboard-only play path,
// there's no real cost to dropping the uncertain trigger.
//
// Root-cause fix (3rd round — iPhone "autoplay never starts" after the section was relocated to
// the top of the file): this list previously used 'touchstart', which WebKit does NOT grant user
// activation for — activation is granted at touchend/click. That flaw was invisible while this
// section sat at the bottom of the file: on a phone, the script finished executing seconds after
// first paint, the visitor had usually already touched the page by then, and WebKit's
// transient-activation window (a few seconds after any touch) let the ambient script-end play()
// attempt through — so music started via THAT path, and the broken touchstart trigger never
// mattered. Relocating the section for faster startup removed that accidental crutch: the ambient
// attempt now fires before any touch (always rejected), every scroll/tap then hit this unlock path
// via touchstart with no activation (play() rejected every time), and iOS often doesn't bubble a
// document-level 'click' for taps on non-interactive elements at all, so the click trigger couldn't
// save it either. 'touchend' is the event WebKit actually grants activation on (it also fires for
// taps on non-interactive elements), which makes the very first tap anywhere genuinely able to
// start playback.
const MAIN_BGM_UNLOCK_EVENTS = ["click", "touchend"] as const;
// True until the very first successful play since this page load (see disarmMainBgmUnlock).
let mainBgmUnlockArmed = true;
// Note: this used to also skip attempts where navigator.userActivation.isActive was false (e.g. a
// touchend ending a scroll pan) — that check existed purely to avoid building the Web Audio graph
// outside a real gesture. Now that there's no graph to poison (see applyMainBgmVolume's comment),
// the check is gone: every click/touchend just tries play() and lets the browser itself be the
// judge, which also means a genuinely-activating event is never skipped by our own overly
// conservative guess at what "counts." Deliberately NOT torn down by pause/stop (see
// disarmMainBgmUnlock) — as long as nothing has ever played yet, every single tap anywhere on the
// page keeps trying, for as long as it takes, rather than a fixed number of attempts.
function tryUnlockMainBgm(): void {
  if (!mainBgmUnlockArmed || !isMainScreenActive() || !mainBgmAudio.paused) return;
  void playMainBgm();
}
/** Root-cause fix (6th round — mobile: "sometimes tapping the screen does nothing at all," even
 *  after the on-screen hint): this used to also fire from pause/stop (Pause/Stop button, leaving the
 *  main screen to play a game, etc.) — meaning after literally one game session, this permanently
 *  stopped listening for the rest of the page's life, since it's never re-armed afterward. From then
 *  on the *only* way to start music again was the dedicated Play button — any other tap anywhere
 *  else on the page silently did nothing, which is exactly the reported symptom. Disarming now
 *  happens only here, called once from playMainBgm()'s success path — a real "first successful play"
 *  is the one and only condition that should ever retire this listener. The original reason
 *  pause/stop used to also call this — Stop's own click bubbling to this same listener and
 *  immediately restarting playback moments after stopping it — is now prevented at its actual
 *  source: every one of this player's own buttons calls stopPropagation(), and so does the
 *  external-link handler below. */
function disarmMainBgmUnlock(): void {
  mainBgmUnlockArmed = false;
  MAIN_BGM_UNLOCK_EVENTS.forEach((evt) => document.removeEventListener(evt, tryUnlockMainBgm));
}
MAIN_BGM_UNLOCK_EVENTS.forEach((evt) => document.addEventListener(evt, tryUnlockMainBgm, { passive: true }));

// Leaving the main screen (game start) fully stops BGM. Returning to it (game end/abort) does NOT
// resume it — by explicit request, coming back from a game session should land on a stopped
// player, not one that silently picked up again, so the visitor has to press play themselves.
// Driven by a MutationObserver on #start-overlay's own style attribute rather than new hooks in the
// game code, since that already toggles display:none/'' at every "session started"/"back to start
// screen" point in runSession/finalizeSession/abortWithMessage.
const mainBgmOverlayObserver = new MutationObserver(() => {
  if (!isMainScreenActive()) {
    stopMainBgm();
  }
});
mainBgmOverlayObserver.observe(startOverlay, { attributes: true, attributeFilter: ["style"] });

// Self-reflection catch (found by tracing the code, not from a live report): the last frame's
// key-zone/scratch-disk graphics stayed painted on #overlay-canvas after a session ended — the
// render loop's own `if (stopped) return;` guard (inside renderFrame, above) exits before its
// clearRect ever runs again — and were faintly visible through #start-overlay's own ~85%-opaque
// background afterward. Reusing the exact same reactive pattern as the BGM observer above (same
// startOverlay style attribute, only ever touched by the game's own start/stop code) clears it the
// moment the start screen reappears, without adding a clear call to each of the ~7 scattered
// "return to start screen" code paths individually. CameraManager.stop() (see that file) is the
// matching fix for the other half of the same symptom — the frozen last camera frame underneath.
//
// Same reasoning applies to runSession()'s per-session resize/orientationchange listeners: rather
// than patching every "return to start screen" exit path (normal end, abort, camera/resource-load
// failure) individually, runSession() stashes one cleanup closure here and this observer runs it
// the moment the start screen reappears, however it got there.
let cleanupSessionResizeHandlers: (() => void) | null = null;
const stageCleanupObserver = new MutationObserver(() => {
  if (isMainScreenActive()) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    cleanupSessionResizeHandlers?.();
    cleanupSessionResizeHandlers = null;
  }
});
stageCleanupObserver.observe(startOverlay, { attributes: true, attributeFilter: ["style"] });

// Every external social/website/Beejay-Bros link banner opens target="_blank" — the visitor's
// attention has left the main screen even though the tab itself hasn't navigated anywhere, so BGM
// stops the same way it would if they'd started the game (same "stays stopped" rule — no
// auto-resume when they come back). One delegated listener covers all of them (present and future)
// instead of wiring each container separately.
startOverlay.addEventListener("click", (e) => {
  if ((e.target as HTMLElement).closest('a[target="_blank"]')) {
    // Stops this same click from also reaching the document-level tryUnlockMainBgm — otherwise, if
    // nothing has played yet this page load, this exact click (bubbling past startOverlay on its way
    // to document) would immediately restart music a moment after the visitor clicked to leave.
    e.stopPropagation();
    stopMainBgm();
  }
});

{
  let initialVolume = 0.5;
  try {
    const stored = localStorage.getItem(MAIN_BGM_VOLUME_STORAGE_KEY);
    if (stored !== null && Number.isFinite(Number(stored))) initialVolume = Number(stored);
  } catch {
    // Private mode etc.
  }
  mainBgmVolumeSlider.value = String(initialVolume);
  applyMainBgmVolume(initialVolume);
  loadMainBgmTrack(0);
  // Ambient attempt — succeeds instantly on desktop's permissive autoplay policy (matching "PC works
  // fine" exactly), and falls back to the persistent tap-anywhere listener above everywhere else.
  startAmbientPlayback();
  // One-time, honest explanation for the delay rather than silence: if a few seconds have passed and
  // there's still no sound, the visitor almost certainly hasn't touched the screen yet — telling them
  // so turns "why isn't there music" into something they can immediately act on.
  window.setTimeout(() => {
    if (mainBgmUnlockArmed && isMainScreenActive() && mainBgmAudio.paused) showToast(t("bgmTapToStartHint"));
  }, 4000);
}

// --- Language selector ("Language" label + a closed dropdown sharing the BEST-20-title line) -------
// Rendered from LANGUAGES rather than hand-written in index.html so the flag/label/default-active
// state all come from one source of truth (src/i18n/translations.ts). Closed by default (matches
// the site's own 속도/난이도 <select> pattern) — only the current flag shows until the trigger is
// clicked, at which point the full list drops down below it; picking an option closes it again.
// Each option's own tooltip/label is that language's native name — a language switcher
// conventionally shows "Español" rather than translating it, so visitors can find their language
// even if the current UI text is unreadable to them.
const languageDropdownTrigger = document.querySelector<HTMLButtonElement>("#language-dropdown-trigger")!;
const languageDropdownCurrentFlag = document.querySelector<HTMLSpanElement>("#language-dropdown-current-flag")!;
const languageDropdownList = document.querySelector<HTMLDivElement>("#language-dropdown-list")!;
languageDropdownList.innerHTML = LANGUAGES.map(
  (lang) =>
    `<button type="button" class="lang-flag-option" data-lang="${lang.code}" role="option" title="${lang.label}">${lang.flagSvg}<span class="lang-flag-option-label">${lang.label}</span></button>`,
).join("");
function updateLanguageSelectorActiveState(): void {
  const current = getLang();
  languageDropdownCurrentFlag.innerHTML = (LANGUAGES.find((l) => l.code === current) ?? LANGUAGES[0]).flagSvg;
  languageDropdownList.querySelectorAll<HTMLButtonElement>(".lang-flag-option").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.lang === current);
  });
}
updateLanguageSelectorActiveState();
function closeLanguageDropdown(): void {
  languageDropdownList.hidden = true;
  languageDropdownTrigger.setAttribute("aria-expanded", "false");
}
languageDropdownTrigger.addEventListener("click", (event) => {
  event.stopPropagation();
  const opening = languageDropdownList.hidden;
  languageDropdownList.hidden = !opening;
  languageDropdownTrigger.setAttribute("aria-expanded", String(opening));
});
languageDropdownList.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>(".lang-flag-option");
  if (!button) return;
  setLang(button.dataset.lang as Lang);
  closeLanguageDropdown();
});
// Click-outside-to-close, same pattern as every other popover on this site.
document.addEventListener("click", (event) => {
  if (!languageDropdownList.hidden && !(event.target as HTMLElement).closest("#language-dropdown")) closeLanguageDropdown();
});
onLangChange(() => {
  updateLanguageSelectorActiveState();
  document.documentElement.lang = getLang();
  // The BEST-20 title's translated width differs per language, which moves how much left-margin
  // room the row has — re-fit it. rAF so the just-applied translation has laid out first.
  requestAnimationFrame(positionLanguageRow);
});
document.documentElement.lang = getLang();
initI18n();

// Desktop: the row sits absolutely in the BEST-20 title line's left margin, its left edge aligned
// to the first letter ('M') of the centered "Masta Beejay Beat Breaker" tagline above — that x
// position depends on viewport width and font loading, so it's measured live rather than guessed
// in CSS. Mobile keeps the row static (own centered line) — there's no left margin to sit in.
const leaderboardTaglineEl = document.querySelector<HTMLDivElement>("#leaderboard-tagline")!;
const leaderboardTitleRowEl = document.querySelector<HTMLDivElement>("#leaderboard-title-row")!;
function positionLanguageRow(): void {
  if (window.matchMedia(MOBILE_MEDIA_QUERY).matches) {
    languageSelectRow.style.left = "";
    languageSelectRow.style.transform = "";
    return;
  }
  // May well be negative — the tagline is wider than the leaderboard box, so the 'M' sits left of
  // this container's own edge. Absolute positioning is allowed to hang outside it. No shrink-to-fit
  // needed here anymore (unlike the old all-7-flags-inline row) — the closed dropdown is a single
  // fixed-size trigger button, so its width never varies with the selected language.
  const left = leaderboardTaglineEl.getBoundingClientRect().left - leaderboardTitleRowEl.getBoundingClientRect().left;
  languageSelectRow.style.left = `${left}px`;
  languageSelectRow.style.transform = "translateY(-50%)";
}
positionLanguageRow();
onWindowResizeRefit(positionLanguageRow);
// The tagline is Orbitron — until the webfont arrives its fallback-font width is wrong, so
// re-measure once fonts settle.
void document.fonts.ready.then(positionLanguageRow);

/** Same measure-and-shrink technique as fitGraffitiFontSize/fitBeejayBrosLinkText: shrinks el's
 *  font-size (0.5px at a time, down to a floor) until its rendered height is back within
 *  targetHeightPx. Reset to "" first so re-runs (language switch back to a short language) don't
 *  compound a previous shrink. */
function shrinkToFitHeight(el: HTMLElement, targetHeightPx: number, minFontPx = 10): void {
  el.style.fontSize = "";
  let fontSize = parseFloat(getComputedStyle(el).fontSize);
  while (fontSize > minFontPx && el.scrollHeight > targetHeightPx + 0.5) {
    fontSize -= 0.5;
    el.style.fontSize = `${fontSize}px`;
  }
}

/** Same technique, checking width instead — used for the 속도/난이도 field-name span next to each
 *  <select> (see fitControlGroupLabels below), where a longer translation risks pushing the whole
 *  label+select pair wide enough to trip .control-group-body's flex-wrap. */
function shrinkToFitWidth(el: HTMLElement, targetWidthPx: number, minFontPx = 9): void {
  el.style.fontSize = "";
  let fontSize = parseFloat(getComputedStyle(el).fontSize);
  while (fontSize > minFontPx && el.scrollWidth > targetWidthPx + 0.5) {
    fontSize -= 0.5;
    el.style.fontSize = `${fontSize}px`;
  }
}

// A longer vi/es/fr translation used to just grow #track-group/#level-group's own width
// unbounded (see .control-group's max-width comment in style.css), which pushed the 3 groups'
// combined width past #main-controls-row's and made THAT row wrap — roughly doubling the whole
// row's height. Capping each group's width fixes the row-level wrap, but its own labels
// (bgm-mode-select / 자유 음원) can still wrap onto a 2nd line inside that narrower box; this
// shrinks their font just enough that the 2-line height stays within a small, fixed budget —
// the same budget for every language, so Track/Level/Option's height no longer depends on which
// language is selected. Desktop's 34px is roughly 1.6x the single-line height these labels render
// at by default (measured ~21px in Korean/English), giving 2 short lines room without going tiny.
// Mobile already stacks every label onto 2 lines within a much narrower fixed-width box even for
// Korean (measured ~34-38px there), so a longer translation there means MORE wrapped lines, not a
// wider box — same fix, smaller/already-2-line budget so Korean itself is left untouched.
const CONTROL_LABEL_HEIGHT_BUDGET_PX = 34;
const CONTROL_LABEL_HEIGHT_BUDGET_MOBILE_PX = 38;
// 속도/난이도's field-name span, next to its <select> — a longer translation (Velocidad/
// Dificultad, Tốc độ/Độ khó) widened this enough on its own to trip the row-level wrap even after
// the <select> itself got a fixed width (see .settings-select-label select's own comment). 44px
// comfortably covers every language's translation at a readable size; only the genuine outliers
// need any shrink at all.
const SETTINGS_LABEL_WIDTH_BUDGET_PX = 44;
function fitControlGroupLabels(): void {
  const mobile = window.matchMedia(MOBILE_MEDIA_QUERY).matches;
  const heightBudget = mobile ? CONTROL_LABEL_HEIGHT_BUDGET_MOBILE_PX : CONTROL_LABEL_HEIGHT_BUDGET_PX;
  // Mobile's own CSS already sets these labels to 10px (vs desktop's 14px) — shrinkToFitHeight's
  // default 10px floor left zero room to shrink into (the starting size WAS the floor), so nothing
  // ever happened there. A lower floor for mobile actually gives it somewhere to go.
  const minFontPx = mobile ? 7 : 10;
  document.querySelectorAll<HTMLElement>(".bgm-mode-select label, .song-file-label, #calibration-toggle-label, .settings-select-label").forEach((el) => {
    shrinkToFitHeight(el, heightBudget, minFontPx);
  });
  // Desktop only: on mobile .settings-select-label stacks its label above the <select> (column,
  // not row), so this span's own width isn't what risks tripping a wrap there — the height-shrink
  // above already covers it.
  if (!mobile) {
    document.querySelectorAll<HTMLElement>(".settings-select-label > span[data-i18n]").forEach((el) => {
      shrinkToFitWidth(el, SETTINGS_LABEL_WIDTH_BUDGET_PX);
    });
  }
}
onLangChange(() => requestAnimationFrame(fitControlGroupLabels));
fitControlGroupLabels();
onWindowResizeRefit(fitControlGroupLabels);

let selectedSongFile: File | null = null;
let stepSelectedSongFile: File | null = null;

// Admin mode: no session/token, just the password kept in memory (and sessionStorage so a reload
// within the same tab doesn't force re-login) and re-sent with every delete call for the server to
// re-verify — see supabase/schema.sql's admin_login()/admin_delete_* functions.
let adminPassword: string | null = sessionStorage.getItem("bdj-admin-password");
const selectedLeaderboardIds = new Set<number>();
const selectedGuestbookIds = new Set<number>();
const selectedMemberIds = new Set<number>();

// BDJ Membership: same no-session pattern as admin above, but cached in localStorage instead of
// sessionStorage so a member stays logged in across browser restarts (a "membership" login should
// behave like a normal site login, not a one-tab admin toggle). `member` itself never carries the
// password — memberPassword is kept alongside it and resent on every member-owned write, verified
// server-side via verify_member() every time (see supabase/schema.sql).
const MEMBER_CREDENTIALS_KEY = "bdj-member-credentials";
let member: Member | null = null;
let memberPassword: string | null = null;

// BDJ Crews direct chat: one conversation open at a time (like the shared photo lightbox elsewhere
// in this file) rather than a multi-window messenger — switching partners just reloads the panel
// against the new one. Declared here (not down by the rest of the direct-chat code below) because
// setMembershipUI() below references activeChatPartnerId on logout — it used to live next to
// direct-chat's other declarations, hundreds of lines further down, which meant restoreMemberSession()
// (called at module load, long before execution ever reaches that later line) threw "Cannot access
// 'activeChatPartnerId' before initialization" every single page load. The rest of setMembershipUI()
// still ran fine afterward since the error was an unhandled rejection inside an async function
// (restoreMemberSession) invoked via `void`, not a crash visible anywhere — so nothing after that
// point in the function, including this file's own guest/member UI gating, ever actually applied on
// first load.
let activeChatPartnerId: number | null = null;
let activeChatPartnerName: string | null = null;

function setMembershipUI(): void {
  if (member) {
    membershipAvatar.style.backgroundImage = member.photoData ? `url(${member.photoData})` : "";
    membershipAvatar.classList.toggle("has-photo", !!member.photoData);
    membershipAvatar.title = member.photoData ? t("membershipPhotoTitle") : "";
    membershipNameLabel.textContent = member.name;
    membershipNameLabel.title = t("membershipNameTitle");
    membershipAuthActions.hidden = true;
    membershipLogoutButton.hidden = false;
    trackMemberOnline(member.id);
    openChatInbox(member.id, handleIncomingDirectMessage);
  } else {
    membershipAvatar.style.backgroundImage = "";
    membershipAvatar.classList.remove("has-photo");
    membershipAvatar.title = "";
    membershipNameLabel.textContent = t("membershipGuestLabel");
    membershipNameLabel.title = "";
    membershipAuthActions.hidden = false;
    membershipLogoutButton.hidden = true;
    closeChatInbox();
    directChatOverlay.style.display = "none";
    activeChatPartnerId = null;
    untrackMemberOnline();
  }

  // Guests can't use the guestbook at all — greyed out and inert (not just hidden) so it stays
  // visible as a reason to join the crew rather than looking like a missing feature.
  guestbookOpenCard.disabled = !member;
  guestbookOpenCard.title = member ? "" : t("membershipGuestbookLockedTitle");

  // Guestbook: a logged-in member's name is fixed and no per-row password is ever needed.
  guestbookNameInput.value = member?.name ?? "";
  guestbookNameInput.readOnly = !!member;
  guestbookPasswordInput.value = "";
  guestbookPasswordInput.disabled = !!member;
  guestbookPasswordInput.placeholder = member ? t("guestbookPwPlaceholderMember") : t("guestbookPwPlaceholderGuest");

  // Leaderboard's name-entry overlay is only ever shown well after this runs, but the input
  // persists in the DOM the whole time, so setting it here keeps it correct whenever it opens.
  nameEntryNameInput.value = member?.name ?? "";
  nameEntryNameInput.readOnly = !!member;
}
onLangChange(() => setMembershipUI());

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

/** Same reuse-the-mutation's-own-return-value pattern as renderGuestbook — omit `board` to fetch
 *  fresh (e.g. after a login/logout, where no just-mutated list is on hand). */
async function renderLeaderboard(board?: LeaderboardEntry[]): Promise<void> {
  board ??= await loadLeaderboard();
  selectedLeaderboardIds.clear();
  leaderboardAdminDeleteButton.hidden = !adminPassword;
  if (board.length === 0) {
    leaderboardBody.innerHTML = `<tr id="leaderboard-empty"><td colspan="10">${t("leaderboardEmpty")}</td></tr>`;
    return;
  }
  leaderboardBody.innerHTML = board
    .map(
      (entry, index) => `
        <tr data-id="${entry.id}">
          <td>${adminPassword ? `<input type="checkbox" class="leaderboard-select-checkbox" data-id="${entry.id}" /> ` : ""}${index + 1}</td>
          <td>${escapeHtml(entry.name)}</td>
          <td>${entry.photo ? `<img class="leaderboard-photo-thumb" data-photo-index="${index}" alt="${escapeHtml(t("lbPhotoAlt", { name: entry.name }))}" />` : `<span class="leaderboard-photo-empty">-</span>`}</td>
          <td>${escapeHtml(entry.message)}</td>
          <td>${entry.score}</td>
          <td>${escapeHtml(displaySpeed(entry.speed))}</td>
          <td>${escapeHtml(displayDifficulty(entry.difficulty))}</td>
          <td>${entry.step}</td>
          <td>${escapeHtml(displayBgm(entry.bgm))}</td>
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
onLangChange(() => void renderLeaderboard());

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
    .then((board) => {
      showToast("삭제가 완료되었습니다.");
      return renderLeaderboard(board);
    })
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

const toastEl = document.querySelector<HTMLDivElement>("#toast")!;
let toastHideTimer = 0;

/** Brief "it worked" confirmation for an action whose success isn't otherwise obvious at a glance
 *  (a modal that just closes, a list that quietly re-renders) — complements withButtonLoading's
 *  in-flight state below with a clear after-the-fact one. Repeated calls restart the timer instead
 *  of stacking, so a rapid string of actions just keeps the latest message visible. */
function showToast(message: string): void {
  window.clearTimeout(toastHideTimer);
  toastEl.textContent = message;
  toastEl.hidden = false;
  // Next frame, so the browser registers the `hidden` removal before the opacity transition starts.
  requestAnimationFrame(() => toastEl.classList.add("toast-visible"));
  toastHideTimer = window.setTimeout(() => {
    toastEl.classList.remove("toast-visible");
    toastHideTimer = window.setTimeout(() => {
      toastEl.hidden = true;
    }, 200);
  }, 2000);
}

/** Disables the button and swaps its label for a loading message while `action` is in flight —
 *  every action this wraps crosses the network to Supabase, and with no visual change a click
 *  looked identical to a click that didn't register at all until the response eventually landed. */
async function withButtonLoading<T>(button: HTMLButtonElement, loadingText: string, action: () => Promise<T>): Promise<T> {
  const originalText = button.textContent;
  const originalDisabled = button.disabled;
  button.disabled = true;
  button.classList.add("is-loading");
  button.textContent = loadingText;
  try {
    return await action();
  } finally {
    button.disabled = originalDisabled;
    button.classList.remove("is-loading");
    button.textContent = originalText;
  }
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
  const passwordFieldHtml = isOwnEntry ? "" : `<input type="password" class="guestbook-inline-password" placeholder="${escapeHtml(t("passwordPlaceholder"))}" maxlength="20" />`;
  const pwMismatchError = escapeHtml(t("pwMismatchError"));
  return `
    <div class="guestbook-entry${isReply ? " guestbook-reply" : ""}" data-id="${entry.id}">
      <div class="guestbook-entry-top">
        <div class="guestbook-entry-left">
          ${adminPassword ? `<input type="checkbox" class="guestbook-select-checkbox" data-id="${entry.id}" />` : ""}
          ${entry.memberPhotoData ? `<div class="guestbook-entry-avatar" data-guestbook-avatar-id="${entry.id}"></div>` : ""}
          <span class="guestbook-entry-name">${escapeHtml(entry.name)}</span>
        </div>
        <span class="guestbook-entry-date">${formatLocalDate(entry.dateIso)}</span>
      </div>
      <div class="guestbook-entry-message">${escapeHtml(entry.message)}</div>
      ${
        entry.attachmentType === "image"
          ? `<img class="guestbook-attachment-thumb" data-attachment-id="${entry.id}" alt="${escapeHtml(t("guestbookAttachmentAlt", { name: entry.name }))}" />`
          : entry.attachmentType === "video"
            ? `<video class="guestbook-attachment-video" data-attachment-id="${entry.id}" controls></video>`
            : ""
      }
      <div class="guestbook-entry-actions">
        <button type="button" class="guestbook-action-btn guestbook-heart-btn${hearted ? " guestbook-hearted" : ""}" data-action="heart" data-id="${entry.id}" title="${hearted ? escapeHtml(t("guestbookHeartOnTitle")) : escapeHtml(t("guestbookHeartOffTitle"))}"><span class="guestbook-heart-icon">${hearted ? "❤️" : "🤍"}</span> <span class="guestbook-heart-count">${entry.heartCount}</span></button>
        ${isReply ? "" : `<button type="button" class="guestbook-action-btn" data-action="reply" data-id="${entry.id}">${escapeHtml(t("guestbookReplyBtn"))}</button>`}
        <button type="button" class="guestbook-action-btn" data-action="edit" data-id="${entry.id}">${escapeHtml(t("btnEdit"))}</button>
        <button type="button" class="guestbook-action-btn" data-action="delete" data-id="${entry.id}">${escapeHtml(t("btnDelete"))}</button>
      </div>
      <div class="guestbook-inline-form" data-mode="edit" data-id="${entry.id}" hidden>
        <input type="text" class="guestbook-edit-message" maxlength="500" />
        <div class="guestbook-inline-attachment-row">
          <label class="song-file-label guestbook-inline-attachment-label" for="guestbook-edit-attachment-${entry.id}">${escapeHtml(t("guestbookEditAttachmentLabel"))}</label>
          <input type="file" id="guestbook-edit-attachment-${entry.id}" class="guestbook-edit-attachment-input" accept="image/*,video/*" />
          <span class="guestbook-edit-attachment-filename"></span>
        </div>
        ${passwordFieldHtml}
        <span class="guestbook-inline-error" hidden>${pwMismatchError}</span>
        <div class="guestbook-inline-actions">
          <button type="button" class="guestbook-confirm-btn" data-action="save" data-id="${entry.id}">${escapeHtml(t("btnSave"))}</button>
          <button type="button" class="guestbook-cancel-btn" data-action="cancel" data-id="${entry.id}">${escapeHtml(t("btnCancel"))}</button>
        </div>
      </div>
      <div class="guestbook-inline-form" data-mode="delete" data-id="${entry.id}" hidden>
        ${passwordFieldHtml}
        <span class="guestbook-inline-error" hidden>${pwMismatchError}</span>
        <div class="guestbook-inline-actions">
          <button type="button" class="guestbook-confirm-btn" data-action="confirm-delete" data-id="${entry.id}">${escapeHtml(t("btnConfirmDelete"))}</button>
          <button type="button" class="guestbook-cancel-btn" data-action="cancel" data-id="${entry.id}">${escapeHtml(t("btnCancel"))}</button>
        </div>
      </div>
      ${
        isReply
          ? ""
          : member
            ? `<div class="guestbook-inline-form" data-mode="reply" data-id="${entry.id}" hidden>
        <input type="text" class="guestbook-reply-message" placeholder="${escapeHtml(t("guestbookReplyPlaceholder"))}" maxlength="80" />
        <div class="guestbook-inline-actions">
          <button type="button" class="guestbook-confirm-btn" data-action="submit-reply" data-id="${entry.id}">${escapeHtml(t("btnRegister"))}</button>
          <button type="button" class="guestbook-cancel-btn" data-action="cancel" data-id="${entry.id}">${escapeHtml(t("btnCancel"))}</button>
        </div>
      </div>`
            : `<div class="guestbook-inline-form" data-mode="reply" data-id="${entry.id}" hidden>
        <input type="text" class="guestbook-reply-name" placeholder="${escapeHtml(t("namePlaceholder"))}" maxlength="12" />
        <input type="text" class="guestbook-reply-message" placeholder="${escapeHtml(t("guestbookReplyPlaceholder"))}" maxlength="80" />
        <input type="password" class="guestbook-reply-password" placeholder="${escapeHtml(t("guestbookReplyPasswordPlaceholder"))}" maxlength="20" />
        <div class="guestbook-inline-actions">
          <button type="button" class="guestbook-confirm-btn" data-action="submit-reply" data-id="${entry.id}">${escapeHtml(t("btnRegister"))}</button>
          <button type="button" class="guestbook-cancel-btn" data-action="cancel" data-id="${entry.id}">${escapeHtml(t("btnCancel"))}</button>
        </div>
      </div>`
      }
    </div>`;
}

/** Pass the fresh row set straight from a mutating RPC's own return value (add/edit/delete already
 *  get `setof guestbook_public` back) to skip a redundant round trip for the exact same query —
 *  omit it (e.g. after a login/logout, where no such list is on hand) to fetch fresh instead. */
async function renderGuestbook(entries?: GuestbookEntry[]): Promise<void> {
  entries ??= await loadGuestbook();
  selectedGuestbookIds.clear();
  guestbookAdminDeleteButton.hidden = !adminPassword;
  if (entries.length === 0) {
    guestbookList.innerHTML = `<p id="guestbook-empty">${t("guestbookEmptyMsg")}</p>`;
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
    if (entry.memberPhotoData) {
      const avatar = guestbookList.querySelector<HTMLDivElement>(`.guestbook-entry-avatar[data-guestbook-avatar-id="${entry.id}"]`);
      if (avatar) avatar.style.backgroundImage = `url(${entry.memberPhotoData})`;
    }
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
onLangChange(() => {
  if (guestbookOverlay.style.display !== "none") void renderGuestbook();
});

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
  const adminPasswordSnapshot = adminPassword;
  void withButtonLoading(guestbookAdminDeleteButton, "삭제 중...", () =>
    adminDeleteGuestbookEntries(Array.from(selectedGuestbookIds), adminPasswordSnapshot)
      .then((entries) => {
        showToast("삭제가 완료되었습니다.");
        return renderGuestbook(entries);
      })
      .catch((err) => {
        if (err instanceof WrongAdminPasswordError) {
          forceAdminLogout("관리자 인증이 만료되었습니다. 다시 로그인해주세요.");
        } else {
          console.error("방명록 삭제 실패:", err);
          window.alert("삭제 처리 중 오류가 발생했습니다. 다시 시도해주세요.");
        }
      }),
  );
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
      window.alert(t("guestbookSaveNoPwAlert"));
      return;
    }

    const attachmentInput = form.querySelector<HTMLInputElement>(".guestbook-edit-attachment-input")!;
    const file = attachmentInput.files?.[0] ?? null;
    const attachmentValidation = validateAttachmentFile(file, errorEl, true);
    if (!attachmentValidation.valid) return;
    const attachmentType = attachmentValidation.type;

    void withButtonLoading(button, t("membershipProfileLoadingText"), () =>
      (file ? readFileAsDataUrl(file) : Promise.resolve(null))
        .then((attachmentData) =>
          passwordInput
            ? editGuestbookEntry(id, message, passwordInput.value, attachmentData, attachmentType)
            : editGuestbookEntry(id, message, null, attachmentData, attachmentType, member!.name, memberPassword!),
        )
        .then((entries) => {
          showToast(t("toastUpdated"));
          return renderGuestbook(entries);
        })
        .catch((err) => {
          if (err instanceof WrongPasswordError) {
            errorEl.textContent = t("pwMismatchError");
            errorEl.hidden = false;
          } else if (err instanceof NoPasswordSetError) {
            errorEl.textContent = t("guestbookErrorNoPwEdit");
            errorEl.hidden = false;
          } else if (err instanceof WrongMemberPasswordError || err instanceof GuestbookNotOwnerError) {
            errorEl.textContent = t("guestbookErrorMemberExpired");
            errorEl.hidden = false;
            clearMemberSession();
            void renderGuestbook();
          } else {
            console.error("방명록 수정 실패:", err);
            errorEl.textContent = t("genericRetryError");
            errorEl.hidden = false;
          }
        }),
    );
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
        button.title = hearted ? t("guestbookHeartOffTitle") : t("guestbookHeartOnTitle");
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
    void withButtonLoading(button, t("deletingText"), () =>
      (passwordInput ? deleteGuestbookEntry(id, passwordInput.value) : deleteGuestbookEntry(id, null, member!.name, memberPassword!))
        .then((entries) => {
          showToast(t("toastDeleted"));
          return renderGuestbook(entries);
        })
        .catch((err) => {
          if (err instanceof WrongPasswordError) {
            errorEl.textContent = t("pwMismatchError");
            errorEl.hidden = false;
          } else if (err instanceof NoPasswordSetError) {
            errorEl.textContent = t("guestbookErrorNoPwDelete");
            errorEl.hidden = false;
          } else if (err instanceof WrongMemberPasswordError || err instanceof GuestbookNotOwnerError) {
            errorEl.textContent = t("guestbookErrorMemberExpired");
            errorEl.hidden = false;
            clearMemberSession();
            void renderGuestbook();
          } else {
            console.error("방명록 삭제 실패:", err);
            errorEl.textContent = t("genericRetryError");
            errorEl.hidden = false;
          }
        }),
    );
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

    void withButtonLoading(button, t("registeringText"), () =>
      addGuestbookEntry({ name, message, password, parentId: id, memberName: member?.name, memberPassword: memberPassword ?? undefined })
        .then((entries) => {
          showToast(t("guestbookReplyToast"));
          return renderGuestbook(entries);
        })
        .catch((err) => {
          console.error("답글 등록 실패:", err);
          window.alert(t("guestbookReplyAlertError"));
        }),
    );
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
    errorEl.textContent = t("guestbookAttachmentUnsupported", { name: file.name });
    errorEl.hidden = false;
    return { valid: false };
  }
  const maxBytes = type === "image" ? GUESTBOOK_IMAGE_MAX_BYTES : GUESTBOOK_VIDEO_MAX_BYTES;
  if (file.size > maxBytes) {
    errorEl.textContent = t("guestbookAttachmentTooLarge", { mb: maxBytes / (1024 * 1024), name: file.name });
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
    .then((entries) => {
      // Keeps the name locked in if still logged in, instead of blanking a field the visitor
      // never got to type into.
      guestbookNameInput.value = member?.name ?? "";
      guestbookMessageInput.value = "";
      guestbookPasswordInput.value = "";
      guestbookAttachmentInput.value = "";
      guestbookAttachmentFilename.textContent = "";
      showToast(t("guestbookAddToast"));
      return renderGuestbook(entries);
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

guestbookTitle.style.cursor = "pointer";
guestbookTitle.title = t("guestbookScrollTopTitle");
guestbookTitle.addEventListener("click", () => {
  guestbookScrollBody.scrollTo({ top: 0, behavior: "smooth" });
});

const INSTALL_GUIDES: Record<"windows" | "macos" | "linux" | "ios" | "android" | "chromeos", { titleKey: TKey; stepKeys: TKey[] }> = {
  windows: { titleKey: "installWinTitle", stepKeys: ["installWinStep1", "installWinStep2", "installWinStep3", "installWinStep4"] },
  macos: { titleKey: "installMacTitle", stepKeys: ["installMacStep1", "installMacStep2", "installMacStep3", "installMacStep4", "installMacStep5"] },
  linux: { titleKey: "installLinuxTitle", stepKeys: ["installLinuxStep1", "installLinuxStep2", "installLinuxStep3", "installLinuxStep4", "installLinuxStep5"] },
  ios: { titleKey: "installIosTitle", stepKeys: ["installIosStep1", "installIosStep2", "installIosStep3", "installIosStep4", "installIosStep5"] },
  android: { titleKey: "installAndroidTitle", stepKeys: ["installAndroidStep1", "installAndroidStep2", "installAndroidStep3", "installAndroidStep4", "installAndroidStep5"] },
  chromeos: { titleKey: "installChromeosTitle", stepKeys: ["installChromeosStep1", "installChromeosStep2", "installChromeosStep3", "installChromeosStep4"] },
};

let openInstallGuidePlatform: keyof typeof INSTALL_GUIDES | null = null;
function renderInstallGuideModal(platform: keyof typeof INSTALL_GUIDES): void {
  const guide = INSTALL_GUIDES[platform];
  installGuideModalTitle.textContent = t(guide.titleKey);
  installGuideModalSteps.innerHTML = guide.stepKeys.map((key) => `<li>${escapeHtml(t(key))}</li>`).join("");
}
installGuideCards.forEach((card) => {
  card.addEventListener("click", () => {
    const platform = card.dataset.platform as keyof typeof INSTALL_GUIDES;
    openInstallGuidePlatform = platform;
    renderInstallGuideModal(platform);
    installGuideOverlay.style.display = "flex";
  });
});
onLangChange(() => {
  if (openInstallGuidePlatform) renderInstallGuideModal(openInstallGuidePlatform);
});

installGuideCloseButton.addEventListener("click", () => {
  installGuideOverlay.style.display = "none";
  openInstallGuidePlatform = null;
});

function setAdminModeUI(active: boolean): void {
  adminLoginLink.hidden = active;
  adminLogoutButton.hidden = !active;
  adminPanelOpenButton.hidden = !active;
}

/** Public top-right icon buttons — same for every visitor regardless of admin state. URLs are set
 *  via the `.href` DOM property, never interpolated into the HTML string, since a URL containing a
 *  `"` could otherwise break out of an `href="..."` attribute.
 *
 *  Accepts an already-fetched list so admin add/edit/delete handlers can hand back the RPC's own
 *  return value (every one of them already resolves to the fresh list) instead of this — and
 *  renderAdminSocialLinksList — each independently re-querying the same rows right after. */
async function renderSocialLinks(preloaded?: SocialLink[]): Promise<void> {
  const links = preloaded ?? (await loadSocialLinks());
  socialLinksContainer.innerHTML = links
    .map((link) => {
      if (link.imageData) {
        return `<a class="social-link-button" target="_blank" rel="noopener noreferrer" data-link-id="${link.id}"><img class="social-link-image" alt="" /></a>`;
      }
      const icon = getPlatformIcon(link.platform);
      return `<a class="social-link-button" target="_blank" rel="noopener noreferrer" title="${escapeHtml(icon.label)}" data-link-id="${link.id}">${icon.svg}</a>`;
    })
    .join("");
  links.forEach((link) => {
    const a = socialLinksContainer.querySelector<HTMLAnchorElement>(`a[data-link-id="${link.id}"]`);
    if (!a) return;
    a.href = link.url;
    if (link.imageData) {
      const img = a.querySelector<HTMLImageElement>(".social-link-image");
      if (img) img.src = link.imageData;
    }
  });
}

/** Editable rows in the admin panel — same DOM-property pattern as renderSocialLinks for the URL
 *  (and the same optional-preloaded-list parameter, for the same reason). */
async function renderAdminSocialLinksList(preloaded?: SocialLink[]): Promise<void> {
  const links = preloaded ?? (await loadSocialLinks());
  const platformOptions = Object.entries(PLATFORM_ICONS)
    .map(([key, def]) => `<option value="${key}">${escapeHtml(def.label)}</option>`)
    .join("");
  adminSocialLinksList.innerHTML = links
    .map((link) => {
      const icon = getPlatformIcon(link.platform);
      const preview = link.imageData ? `<img class="admin-social-link-image-thumb" alt="" />` : `<span class="admin-social-link-icon">${icon.svg}</span>`;
      return `
        <div class="admin-social-link-row" data-id="${link.id}">
          ${preview}
          <select class="admin-social-link-edit-platform">${platformOptions}</select>
          <input type="url" class="admin-social-link-edit-url" />
          <label class="admin-social-link-edit-image-trigger" for="admin-social-link-edit-image-${link.id}" title="이미지 변경">🖼️</label>
          <input type="file" id="admin-social-link-edit-image-${link.id}" class="admin-social-link-edit-image-input" accept="image/jpeg,image/png,image/bmp" />
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
    if (link.imageData) {
      const thumb = row.querySelector<HTMLImageElement>(".admin-social-link-image-thumb");
      if (thumb) thumb.src = link.imageData;
    }
  });
}

const WEBSITE_LINK_FONT_CLASS: Record<WebsiteLinkFontFamily, string> = {
  body: "website-link-font-body",
  display: "website-link-font-display",
  graffiti: "website-link-font-graffiti",
};

const WEBSITE_LINK_FONT_FAMILY_OPTIONS = `
  <option value="display">테크</option>
  <option value="body">기본</option>
  <option value="graffiti">그래피티</option>
`;

/** Public banners under the Jaybot launcher — same href-via-DOM-property pattern as
 *  renderSocialLinks. Colors/sizes are admin-chosen but validated server-side (hex-only, 8-32px
 *  range — see admin_add_website_link in supabase/schema.sql), so they're safe to interpolate
 *  directly into the style attribute; the title/content text still goes through escapeHtml like
 *  any other admin-authored text shown on this site (e.g. the notice banner).
 *
 *  Same optional-preloaded-list parameter as renderSocialLinks, for the same reason. */
async function renderWebsiteLinks(preloaded?: WebsiteLink[]): Promise<void> {
  const links = preloaded ?? (await loadWebsiteLinks());
  websiteLinksContainer.innerHTML = links
    .map((link) => {
      const titleFontClass = WEBSITE_LINK_FONT_CLASS[link.titleFontFamily] ?? WEBSITE_LINK_FONT_CLASS.body;
      const contentFontClass = WEBSITE_LINK_FONT_CLASS[link.contentFontFamily] ?? WEBSITE_LINK_FONT_CLASS.body;
      const bannerStyle = `border-color:${link.borderColor}; --wl-glow-color:${link.borderColor};`;
      const titleStyle = `font-size:${link.titleFontSize}px; color:${link.fontColor}; font-weight:${link.titleBold ? 700 : 400};`;
      const contentStyle = `font-size:${link.contentFontSize}px; color:${link.fontColor}; font-weight:${link.contentBold ? 700 : 400};`;
      return `
        <a class="website-link-banner anim-${link.animation}" target="_blank" rel="noopener noreferrer" data-link-id="${link.id}" style="${bannerStyle}">
          <span class="website-link-title ${titleFontClass}" style="${titleStyle}">${escapeHtml(link.title)}</span>
          ${link.content ? `<span class="website-link-content ${contentFontClass}" style="${contentStyle}">${escapeHtml(link.content)}</span>` : ""}
        </a>`;
    })
    .join("");
  links.forEach((link) => {
    const a = websiteLinksContainer.querySelector<HTMLAnchorElement>(`a[data-link-id="${link.id}"]`);
    if (a) a.href = link.url;
  });
}

/** Editable rows in the admin panel — mirrors renderAdminSocialLinksList's shape (including the
 *  optional-preloaded-list parameter), but with independent font-size/family/bold controls for
 *  title and content (see the add-form's own .admin-website-field-group for why the two are split
 *  apart). */
async function renderAdminWebsiteLinksList(preloaded?: WebsiteLink[]): Promise<void> {
  const links = preloaded ?? (await loadWebsiteLinks());
  adminWebsiteLinksList.innerHTML = links
    .map(
      (link) => `
        <div class="admin-website-link-row" data-id="${link.id}">
          <input type="url" class="admin-website-link-edit-url" />
          <div class="admin-website-field-group">
            <span class="admin-website-field-group-label">제목</span>
            <input type="text" class="admin-website-link-edit-title" maxlength="20" />
            <input type="number" class="admin-website-link-edit-title-font-size" min="8" max="32" />
            <select class="admin-website-link-edit-title-font-family">${WEBSITE_LINK_FONT_FAMILY_OPTIONS}</select>
            <label class="admin-website-field-label"><input type="checkbox" class="admin-website-link-edit-title-bold" /> 굵게</label>
          </div>
          <div class="admin-website-field-group">
            <span class="admin-website-field-group-label">내용</span>
            <input type="text" class="admin-website-link-edit-content" maxlength="60" />
            <input type="number" class="admin-website-link-edit-content-font-size" min="8" max="32" />
            <select class="admin-website-link-edit-content-font-family">${WEBSITE_LINK_FONT_FAMILY_OPTIONS}</select>
            <label class="admin-website-field-label"><input type="checkbox" class="admin-website-link-edit-content-bold" /> 굵게</label>
          </div>
          <input type="color" class="admin-website-link-edit-font-color" />
          <input type="color" class="admin-website-link-edit-border-color" />
          <select class="admin-website-link-edit-animation">
            <option value="none">없음</option>
            <option value="pulse">펄스</option>
            <option value="bounce">바운스</option>
            <option value="fade">페이드</option>
            <option value="glow">글로우</option>
          </select>
          <button type="button" data-action="save-website-link" data-id="${link.id}">저장</button>
          <button type="button" data-action="delete-website-link" data-id="${link.id}">삭제</button>
        </div>`,
    )
    .join("");
  links.forEach((link) => {
    const row = adminWebsiteLinksList.querySelector<HTMLDivElement>(`.admin-website-link-row[data-id="${link.id}"]`);
    if (!row) return;
    row.querySelector<HTMLInputElement>(".admin-website-link-edit-url")!.value = link.url;
    row.querySelector<HTMLInputElement>(".admin-website-link-edit-title")!.value = link.title;
    row.querySelector<HTMLInputElement>(".admin-website-link-edit-title-font-size")!.value = String(link.titleFontSize);
    row.querySelector<HTMLSelectElement>(".admin-website-link-edit-title-font-family")!.value = link.titleFontFamily;
    row.querySelector<HTMLInputElement>(".admin-website-link-edit-title-bold")!.checked = link.titleBold;
    row.querySelector<HTMLInputElement>(".admin-website-link-edit-content")!.value = link.content;
    row.querySelector<HTMLInputElement>(".admin-website-link-edit-content-font-size")!.value = String(link.contentFontSize);
    row.querySelector<HTMLSelectElement>(".admin-website-link-edit-content-font-family")!.value = link.contentFontFamily;
    row.querySelector<HTMLInputElement>(".admin-website-link-edit-content-bold")!.checked = link.contentBold;
    row.querySelector<HTMLInputElement>(".admin-website-link-edit-font-color")!.value = link.fontColor;
    row.querySelector<HTMLInputElement>(".admin-website-link-edit-border-color")!.value = link.borderColor;
    row.querySelector<HTMLSelectElement>(".admin-website-link-edit-animation")!.value = link.animation;
  });
}

/** Auto-shrinks one Beejay Bros button's text to fit its fixed ~4cm x 1.2cm box — same
 *  measure-and-shrink technique as fitGraffitiFontSize (offsetHeight against the padded box), just
 *  applied per-banner and over a much smaller size range. Measured rather than derived from a
 *  character-count formula since actual rendered width depends on the glyph mix (Korean/English),
 *  not just length. */
function fitBeejayBrosLinkText(banner: HTMLElement, textEl: HTMLElement): void {
  const MAX_FONT_PX = 15;
  const MIN_FONT_PX = 9;
  const bannerStyle = getComputedStyle(banner);
  const availableHeight = banner.clientHeight - parseFloat(bannerStyle.paddingTop) - parseFloat(bannerStyle.paddingBottom);
  let fontSize = MAX_FONT_PX;
  textEl.style.fontSize = `${fontSize}px`;
  while (fontSize > MIN_FONT_PX && textEl.offsetHeight > availableHeight) {
    fontSize -= 1;
    textEl.style.fontSize = `${fontSize}px`;
  }
}

/** Public "Beejay Bros" link buttons in the right margin, below the login widget — same
 *  href-via-DOM-property + optional-preloaded-list pattern as renderWebsiteLinks/renderSocialLinks.
 *  The whole panel (gold metallic frame included) hides itself when there are no links yet, rather
 *  than showing an empty bordered box. */
async function renderBeejayBrosLinks(preloaded?: BeejayBrosLink[]): Promise<void> {
  const links = preloaded ?? (await loadBeejayBrosLinks());
  beejayBrosPanel.hidden = links.length === 0;
  beejayBrosLinksContainer.innerHTML = links
    .map((link) => `<a class="beejay-bros-link-banner" target="_blank" rel="noopener noreferrer" data-link-id="${link.id}"><span class="beejay-bros-link-text"></span></a>`)
    .join("");
  links.forEach((link) => {
    const a = beejayBrosLinksContainer.querySelector<HTMLAnchorElement>(`a[data-link-id="${link.id}"]`);
    if (!a) return;
    a.href = link.url;
    const textEl = a.querySelector<HTMLSpanElement>(".beejay-bros-link-text")!;
    textEl.textContent = link.text;
    fitBeejayBrosLinkText(a, textEl);
  });
}

/** Editable rows in the admin panel — mirrors renderAdminWebsiteLinksList's shape, minus the
 *  per-row styling controls that feature has (this one has no admin-configurable font/color/
 *  animation — see beejay_bros_links' own schema comment for why). */
async function renderAdminBeejayBrosLinksList(preloaded?: BeejayBrosLink[]): Promise<void> {
  const links = preloaded ?? (await loadBeejayBrosLinks());
  adminBeejayBrosLinkList.innerHTML = links
    .map(
      (link) => `
        <div class="admin-beejay-bros-link-row" data-id="${link.id}">
          <input type="url" class="admin-beejay-bros-link-edit-url" />
          <input type="text" class="admin-beejay-bros-link-edit-text" maxlength="40" />
          <button type="button" data-action="save-beejay-bros-link" data-id="${link.id}">저장</button>
          <button type="button" data-action="delete-beejay-bros-link" data-id="${link.id}">삭제</button>
        </div>`,
    )
    .join("");
  links.forEach((link) => {
    const row = adminBeejayBrosLinkList.querySelector<HTMLDivElement>(`.admin-beejay-bros-link-row[data-id="${link.id}"]`);
    if (!row) return;
    row.querySelector<HTMLInputElement>(".admin-beejay-bros-link-edit-url")!.value = link.url;
    row.querySelector<HTMLInputElement>(".admin-beejay-bros-link-edit-text")!.value = link.text;
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

/** preloaded, when given, skips the fetch — same reuse-the-mutation's-own-return-value pattern as
 *  renderLeaderboard/renderMembersDirectory, used after add/save/delete already got the fresh list
 *  back from their own RPC call. Shows every notice regardless of enabled state (unlike the
 *  main-screen popup itself) so the admin can re-enable one without re-typing it. */
async function renderAdminNoticePopupsList(preloaded?: NoticePopupItem[]): Promise<void> {
  const notices = preloaded ?? (await loadNoticePopups());
  adminNoticePopupsList.innerHTML = notices
    .map(
      (notice) => `
        <div class="admin-notice-popup-row" data-id="${notice.id}">
          <textarea class="admin-notice-popup-edit-content" maxlength="300"></textarea>
          <div class="admin-notice-popup-row-actions">
            <label><input type="checkbox" class="admin-notice-popup-edit-enabled" /> 사용</label>
            <button type="button" data-action="save-notice-popup" data-id="${notice.id}">저장</button>
            <button type="button" data-action="delete-notice-popup" data-id="${notice.id}">삭제</button>
          </div>
        </div>`,
    )
    .join("");
  notices.forEach((notice) => {
    const row = adminNoticePopupsList.querySelector<HTMLDivElement>(`.admin-notice-popup-row[data-id="${notice.id}"]`);
    if (!row) return;
    row.querySelector<HTMLTextAreaElement>(".admin-notice-popup-edit-content")!.value = notice.content;
    row.querySelector<HTMLInputElement>(".admin-notice-popup-edit-enabled")!.checked = notice.enabled;
  });
  // 3-of-3 used up — hide the add row entirely instead of letting the admin type into it and only
  // finding out about the cap from an error after clicking Add.
  adminNoticePopupAddButton.hidden = notices.length >= 3;
  adminNoticePopupInput.hidden = notices.length >= 3;
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

onWindowResizeRefit(() => {
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
  void withButtonLoading(membershipLoginSubmit, t("membershipLoginLoadingText"), () =>
    memberLogin(name, password)
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
          membershipLoginError.textContent = t("membershipLoginErrorMismatch");
        } else {
          console.error("멤버십 로그인 실패:", err);
          membershipLoginError.textContent = t("membershipLoginErrorGeneric");
        }
        membershipLoginError.hidden = false;
      }),
  );
});

membershipLogoutButton.addEventListener("click", () => {
  clearMemberSession();
  showToast(t("membershipLogoutToast"));
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
    membershipSignupError.textContent = t("membershipSignupErrorMissing");
    membershipSignupError.hidden = false;
    return;
  }
  // Popups (not the inline error span) per how this was asked for — distinct enough from the rest
  // of this form's validation that a modal interruption is warranted.
  if (!MEMBER_NAME_KOREAN_ONLY_PATTERN.test(name)) {
    window.alert(t("membershipSignupErrorNameNotKorean"));
    return;
  }
  if (!MEMBER_PASSWORD_DIGITS_ONLY_PATTERN.test(password)) {
    window.alert(t("membershipSignupErrorPasswordDigitsOnly"));
    return;
  }
  if (password !== passwordConfirm) {
    membershipSignupError.textContent = t("membershipSignupErrorPasswordMismatch");
    membershipSignupError.hidden = false;
    return;
  }
  if (!membershipSignupGenderMale.checked && !membershipSignupGenderFemale.checked) {
    membershipSignupError.textContent = t("membershipSignupErrorGenderRequired");
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

  void withButtonLoading(membershipSignupSubmit, t("membershipSignupLoadingText"), () =>
    (file ? readFileAsDataUrl(file) : Promise.resolve(null))
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
          membershipSignupError.textContent = t("membershipSignupErrorNameTaken");
        } else {
          console.error("멤버십 가입 실패:", err);
          membershipSignupError.textContent = t("membershipSignupErrorGeneric");
        }
        membershipSignupError.hidden = false;
      }),
  );
});

membershipAvatar.addEventListener("click", () => {
  if (!member || !member.photoData) return;
  photoLightboxImage.src = member.photoData;
  photoLightboxImage.alt = t("photoLightboxProfileAlt", { name: member.name });
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
  membershipProfileSuccess.hidden = true;
  membershipProfileError.hidden = true;

  if (!password) {
    membershipProfileError.textContent = t("membershipProfileErrorPwRequired");
    membershipProfileError.hidden = false;
    return;
  }
  if (!membershipProfileGenderMale.checked && !membershipProfileGenderFemale.checked) {
    membershipProfileError.textContent = t("membershipSignupErrorGenderRequired");
    membershipProfileError.hidden = false;
    return;
  }
  // Blank means "keep the current password" — only validate/apply it when the field was actually
  // touched, same optional-unless-typed treatment as birthdate/phone/email above. No separate
  // confirm field — a typo here is low-stakes (just edit the profile again), and dropping it
  // removes exactly the "do all 3 password fields need the same value?" confusion this caused.
  if (newPassword && !MEMBER_PASSWORD_DIGITS_ONLY_PATTERN.test(newPassword)) {
    window.alert(t("membershipProfileErrorNewPwDigitsOnly"));
    return;
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

  void withButtonLoading(membershipProfileSubmit, t("membershipProfileLoadingText"), () =>
    (file ? readFileAsDataUrl(file) : Promise.resolve(null))
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
        membershipProfilePasswordInput.value = "";
        membershipProfileSuccess.hidden = false;
        setMembershipUI();
        void renderGuestbook();
        void renderLeaderboard();
      })
      .catch((err) => {
        if (err instanceof WrongMemberPasswordError) {
          membershipProfileError.textContent = t("membershipProfileErrorPwMismatch");
          membershipProfileError.hidden = false;
        } else {
          console.error("내 정보 수정 실패:", err);
          // Include the underlying message — a bare "실패했습니다" hides exactly the detail needed to
          // tell a missing DB function apart from a network blip when the user reports it.
          membershipProfileError.textContent = t("membershipProfileErrorSaveFailed", { msg: err instanceof Error ? err.message : String(err) });
          membershipProfileError.hidden = false;
        }
      }),
  );
});

/** Irreversible, so it's gated behind both a typed password (re-verified server-side, same as
 *  every other profile action) and a confirm() — one accidental click shouldn't delete an account. */
membershipProfileWithdrawButton.addEventListener("click", () => {
  if (!member) return;
  const password = membershipProfilePasswordInput.value;
  membershipProfileSuccess.hidden = true;
  membershipProfileError.hidden = true;

  if (!password) {
    membershipProfileError.textContent = t("membershipProfileErrorPwRequired");
    membershipProfileError.hidden = false;
    return;
  }
  if (!window.confirm(t("membershipProfileWithdrawConfirm"))) return;

  const currentName = member.name;
  void withdrawMember(currentName, password)
    .then(() => {
      clearMemberSession();
      membershipProfileOverlay.style.display = "none";
      showToast(t("membershipWithdrawToast"));
      void renderGuestbook();
      void renderLeaderboard();
    })
    .catch((err) => {
      if (err instanceof WrongMemberPasswordError) {
        membershipProfileError.textContent = t("membershipProfileErrorPwMismatch");
        membershipProfileError.hidden = false;
      } else {
        console.error("회원 탈퇴 실패:", err);
        membershipProfileError.textContent = t("membershipWithdrawErrorTemplate", { msg: err instanceof Error ? err.message : String(err) });
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
  const genderLabel = entry.gender === "male" ? t("genderMaleLabel") : entry.gender === "female" ? t("genderFemaleLabel") : "-";
  const isOnline = onlineIds.has(entry.id);
  // Chat only ever makes sense against another online member — clicking your own row, or anyone
  // offline, does nothing (no trigger class/attributes at all in that case).
  const canChat = isOnline && entry.id !== member?.id;
  const chatAttrs = canChat ? ` data-chat-member-id="${entry.id}" data-chat-member-name="${escapeHtml(entry.name)}"` : "";
  const chatClass = canChat ? " members-directory-chat-trigger" : "";
  // Injected into the existing number column rather than a dedicated column — same space-saving
  // approach as the leaderboard's own admin checkbox, and it means no header/colspan changes are
  // needed just because an admin happens to also be logged in.
  const adminCheckbox = adminPassword ? `<input type="checkbox" class="members-directory-select-checkbox" data-id="${entry.id}" /> ` : "";
  return `
    <tr>
      <td class="members-directory-number">${adminCheckbox}${signupOrder}</td>
      <td><div class="members-directory-avatar${entry.photoData ? " has-photo" : ""}" data-member-id="${entry.id}"></div></td>
      <td class="members-directory-name${chatClass}"${chatAttrs}>${escapeHtml(entry.name)}</td>
      <td>${genderLabel}</td>
      <td>${entry.birthdate ? escapeHtml(entry.birthdate) : "-"}</td>
      <td>${entry.phone ? escapeHtml(entry.phone) : "-"}</td>
      <td>${entry.email ? escapeHtml(entry.email) : "-"}</td>
      <td>${formatLocalDate(entry.dateIso)}</td>
      <td class="members-directory-online${isOnline ? " is-online" : ""}${chatClass}"${chatAttrs}>${isOnline ? t("crewsOnlineNow") : t("crewsOfflineNow")}</td>
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

/** preloaded, when given, skips the roster fetch entirely — same reuse-the-mutation's-own-return-
 *  value pattern as renderLeaderboard/renderGuestbook, used after the admin force-withdraw action
 *  below already got the fresh list back from admin_delete_members(). */
async function renderMembersDirectory(preloaded?: MemberDirectoryEntry[]): Promise<void> {
  membersDirectoryAdminDeleteButton.hidden = !adminPassword;
  selectedMemberIds.clear();

  let members: MemberDirectoryEntry[];
  if (preloaded) {
    members = preloaded;
  } else {
    // Crew-only — same login requirement as every other member action, just checked client-side
    // first so a guest sees an explanatory message instead of a request that's just going to be
    // rejected server-side anyway (list_members() also enforces this — see its own comment).
    if (!member || !memberPassword) {
      membersDirectoryList.innerHTML = `<tr id="members-directory-empty"><td colspan="9">${t("crewsLoginRequiredRow")}</td></tr>`;
      return;
    }

    // The roster fetch (photos included) can take a real moment — without this, the popup just sat
    // there unchanged until it landed, indistinguishable from the click not having registered.
    membersDirectoryList.innerHTML = `<tr id="members-directory-empty"><td colspan="9">${t("crewsLoadingRow")}</td></tr>`;

    try {
      members = await loadMembers(member.name, memberPassword);
    } catch (err) {
      if (err instanceof WrongMemberPasswordError) {
        membersDirectoryList.innerHTML = `<tr id="members-directory-empty"><td colspan="9">${t("guestbookErrorMemberExpired")}</td></tr>`;
        clearMemberSession();
        return;
      }
      // Distinct from the empty state below — "no members yet" when the view can't even be read
      // would hide a real problem (most likely the members_public/list_members migration not having
      // been run yet).
      console.error("회원 명부 조회 실패:", err);
      membersDirectoryList.innerHTML = `<tr id="members-directory-empty"><td colspan="9">${t("crewsLoadFailedRow")}</td></tr>`;
      return;
    }
  }
  if (members.length === 0) {
    membersDirectoryList.innerHTML = `<tr id="members-directory-empty"><td colspan="9">${t("crewsEmptyRow")}</td></tr>`;
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
onLangChange(() => {
  if (membersDirectoryOverlay.style.display !== "none") void renderMembersDirectory();
});

membersDirectoryOpenCard.addEventListener("click", () => {
  membersDirectoryOverlay.style.display = "flex";
  void renderMembersDirectory();
});

membersDirectoryRefreshButton.addEventListener("click", () => {
  void withButtonLoading(membersDirectoryRefreshButton, t("crewsRefreshingText"), renderMembersDirectory);
});

membersDirectoryCloseButton.addEventListener("click", () => {
  membersDirectoryOverlay.style.display = "none";
});

membersDirectoryList.addEventListener("change", (event) => {
  const checkbox = event.target as HTMLInputElement;
  if (!checkbox.classList.contains("members-directory-select-checkbox")) return;
  const id = Number(checkbox.dataset.id);
  if (checkbox.checked) selectedMemberIds.add(id);
  else selectedMemberIds.delete(id);
});

// Force-withdrawal ("kick") — same shape as the leaderboard/guestbook admin bulk-delete buttons:
// confirm, call the RPC with the shared admin password, then re-render from its own returned
// (already-fresh) roster instead of re-fetching.
membersDirectoryAdminDeleteButton.addEventListener("click", () => {
  if (!adminPassword || selectedMemberIds.size === 0) return;
  if (!window.confirm(`선택한 ${selectedMemberIds.size}명을 강제 탈퇴시키겠습니까? 되돌릴 수 없습니다.`)) return;
  void adminDeleteMembers(Array.from(selectedMemberIds), adminPassword)
    .then((roster) => {
      showToast("강제 탈퇴가 완료되었습니다.");
      return renderMembersDirectory(roster);
    })
    .catch((err) => {
      if (err instanceof WrongAdminPasswordError) {
        forceAdminLogout("관리자 인증이 만료되었습니다. 다시 로그인해주세요.");
      } else {
        console.error("회원 강제 탈퇴 실패:", err);
        window.alert("탈퇴 처리 중 오류가 발생했습니다. 다시 시도해주세요.");
      }
    });
});

// --- BDJ Crews direct chat --------------------------------------------------------------------
// activeChatPartnerId/activeChatPartnerName are declared up near `member`/`memberPassword` instead
// of here — see the comment there for why.

function formatMessageTime(dateIso: string): string {
  const d = new Date(dateIso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function renderDirectChatMessages(messages: DirectMessage[]): void {
  if (messages.length === 0) {
    directChatMessages.innerHTML = `<p id="direct-chat-empty">${t("directChatEmptyMsg")}</p>`;
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
  directChatTitle.textContent = t("directChatTitleTemplate", { name: partnerName });
  directChatOverlay.style.display = "flex";
  directChatMessages.innerHTML = `<p id="direct-chat-empty">${t("crewsLoadingRow")}</p>`;
  try {
    const messages = await loadDirectMessages(member.name, memberPassword, partnerId);
    // The panel may have been switched to a different partner while this was in flight.
    if (activeChatPartnerId === partnerId) renderDirectChatMessages(messages);
  } catch (err) {
    console.error("대화 불러오기 실패:", err);
    if (activeChatPartnerId === partnerId) {
      directChatMessages.innerHTML = `<p id="direct-chat-empty">${t("directChatLoadFailedMsg")}</p>`;
    }
  }
}
onLangChange(() => {
  if (directChatOverlay.style.display !== "none" && activeChatPartnerId != null && activeChatPartnerName) {
    directChatTitle.textContent = t("directChatTitleTemplate", { name: activeChatPartnerName });
  }
});

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
  void withButtonLoading(directChatSendButton, t("directChatSendingText"), () =>
    sendDirectMessage(member!.name, memberPassword!, partnerId, text)
      .then(() => {
        notifyNewMessage(partnerId, member!.id, member!.name);
        // Re-fetches rather than appending the single new message locally — simpler, and the
        // conversation is short-lived/small enough that a full reload costs nothing noticeable.
        if (activeChatPartnerId === partnerId) return openDirectChat(partnerId, activeChatPartnerName!);
      })
      .catch((err) => {
        console.error("메시지 전송 실패:", err);
        window.alert(t("directChatSendFailedAlert"));
      }),
  );
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
  adminSkinDesignRadios.forEach((radio) => {
    radio.checked = radio.value === currentSkinDesign;
  });
  void renderAdminSocialLinksList();
  void renderAdminBannerImagesList();
  void renderAdminWebsiteLinksList();
  void renderAdminBeejayBrosLinksList();
  void renderAdminNoticePopupsList();
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
  adminSkinDesignError.hidden = true;
  adminSkinDesignSuccess.hidden = true;
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

// No GIF here — an SNS button image is a small static icon replacement, not a banner.
const SNS_LINK_IMAGE_TYPES = ["image/jpeg", "image/png", "image/bmp"];
const SNS_LINK_IMAGE_MAX_BYTES = 3 * 1024 * 1024;

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
    .then(() => {
      showToast("삭제가 완료되었습니다.");
      return Promise.all([renderAdminBannerImagesList(), renderBanner()]);
    })
    .catch((err) => handleAdminPanelError(err, "이미지 삭제 실패:"));
});

adminNoticePopupAddButton.addEventListener("click", () => {
  if (!adminPassword) return;
  const content = adminNoticePopupInput.value.trim();
  if (!content) return;
  adminNoticePopupError.hidden = true;
  adminNoticePopupSuccess.hidden = true;
  const currentAdminPassword = adminPassword;
  void withButtonLoading(adminNoticePopupAddButton, "추가 중...", () => adminAddNoticePopup(content, currentAdminPassword))
    .then((notices) => {
      adminNoticePopupInput.value = "";
      adminNoticePopupSuccess.textContent = "공지가 추가되었습니다.";
      adminNoticePopupSuccess.hidden = false;
      return renderAdminNoticePopupsList(notices);
    })
    .catch((err) => {
      if (err instanceof TooManyNoticePopupsError) {
        adminNoticePopupError.textContent = "공지창 팝업은 최대 3개까지 등록할 수 있습니다.";
        adminNoticePopupError.hidden = false;
      } else {
        handleAdminPanelError(err, "공지 추가 실패:", adminNoticePopupError);
      }
    });
});

adminNoticePopupsList.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-action]");
  if (!button || !adminPassword) return;
  const row = button.closest<HTMLDivElement>(".admin-notice-popup-row")!;
  const id = Number(button.dataset.id);
  const currentAdminPassword = adminPassword;

  if (button.dataset.action === "save-notice-popup") {
    const content = row.querySelector<HTMLTextAreaElement>(".admin-notice-popup-edit-content")!.value.trim();
    const enabled = row.querySelector<HTMLInputElement>(".admin-notice-popup-edit-enabled")!.checked;
    if (!content) return;
    adminNoticePopupError.hidden = true;
    adminNoticePopupSuccess.hidden = true;
    void withButtonLoading(button, "저장 중...", () => adminUpdateNoticePopup(id, content, enabled, currentAdminPassword))
      .then((notices) => {
        showToast("저장되었습니다.");
        return renderAdminNoticePopupsList(notices);
      })
      .catch((err) => handleAdminPanelError(err, "공지 저장 실패:", adminNoticePopupError));
  } else if (button.dataset.action === "delete-notice-popup") {
    if (!window.confirm("이 공지를 삭제하시겠습니까?")) return;
    void adminDeleteNoticePopup(id, currentAdminPassword)
      .then((notices) => {
        showToast("삭제가 완료되었습니다.");
        return renderAdminNoticePopupsList(notices);
      })
      .catch((err) => handleAdminPanelError(err, "공지 삭제 실패:", adminNoticePopupError));
  }
});

// Same "reflect back what got picked" purpose as adminBannerImagesInput's change listener — the
// styled label hides the raw <input type="file">, so this is the only visible confirmation.
adminSocialLinkImageInput.addEventListener("change", () => {
  const file = adminSocialLinkImageInput.files?.[0];
  adminSocialLinkImageFilename.textContent = file ? file.name : "";
  adminSocialLinkError.hidden = true;
});

adminSocialLinkAddButton.addEventListener("click", () => {
  if (!adminPassword) return;
  const currentAdminPassword = adminPassword;
  const platform = adminSocialLinkPlatformSelect.value;
  const url = adminSocialLinkUrlInput.value.trim();
  adminSocialLinkError.hidden = true;
  if (!url) return;

  const file = adminSocialLinkImageInput.files?.[0] ?? null;
  if (file) {
    if (!SNS_LINK_IMAGE_TYPES.includes(file.type)) {
      adminSocialLinkError.textContent = `지원하지 않는 파일 형식입니다: ${file.name}`;
      adminSocialLinkError.hidden = false;
      return;
    }
    if (file.size > SNS_LINK_IMAGE_MAX_BYTES) {
      adminSocialLinkError.textContent = `파일이 너무 큽니다 (최대 3MB): ${file.name}`;
      adminSocialLinkError.hidden = false;
      return;
    }
  }

  void (file ? readFileAsDataUrl(file) : Promise.resolve(null))
    .then((imageData) => adminAddSocialLink(platform, url, currentAdminPassword, imageData))
    .then((links) => {
      adminSocialLinkUrlInput.value = "";
      adminSocialLinkImageInput.value = "";
      adminSocialLinkImageFilename.textContent = "";
      showToast("추가가 완료되었습니다.");
      // adminAddSocialLink already returns the fresh list — reuse it for both renders instead of
      // each independently re-querying the same rows right after.
      return Promise.all([renderAdminSocialLinksList(links), renderSocialLinks(links)]);
    })
    .catch((err) => handleAdminPanelError(err, "링크 추가 실패:", adminSocialLinkError));
});

/** Shared by the add-form and every list row's save handler — same field set either way. */
function readWebsiteLinkFontSize(input: HTMLInputElement, errorLabel: string): number | null {
  const value = Number(input.value);
  if (!Number.isFinite(value) || value < 8 || value > 32) {
    adminWebsiteLinkError.textContent = `${errorLabel} 글자 크기는 8~32 사이여야 합니다.`;
    adminWebsiteLinkError.hidden = false;
    return null;
  }
  return value;
}

adminWebsiteLinkAddButton.addEventListener("click", () => {
  if (!adminPassword) return;
  const currentAdminPassword = adminPassword;
  const url = adminWebsiteLinkUrlInput.value.trim();
  const title = adminWebsiteLinkTitleInput.value.trim();
  const content = adminWebsiteLinkContentInput.value.trim();
  adminWebsiteLinkError.hidden = true;
  if (!url || !title) return;

  const titleFontSize = readWebsiteLinkFontSize(adminWebsiteLinkTitleFontSizeInput, "제목");
  if (titleFontSize === null) return;
  const contentFontSize = readWebsiteLinkFontSize(adminWebsiteLinkContentFontSizeInput, "내용");
  if (contentFontSize === null) return;

  void withButtonLoading(adminWebsiteLinkAddButton, "추가 적용 중입니다", () =>
    adminAddWebsiteLink(
      {
        url,
        title,
        titleFontSize,
        titleFontFamily: adminWebsiteLinkTitleFontFamilySelect.value as WebsiteLinkFontFamily,
        titleBold: adminWebsiteLinkTitleBoldInput.checked,
        content,
        contentFontSize,
        contentFontFamily: adminWebsiteLinkContentFontFamilySelect.value as WebsiteLinkFontFamily,
        contentBold: adminWebsiteLinkContentBoldInput.checked,
        fontColor: adminWebsiteLinkFontColorInput.value,
        borderColor: adminWebsiteLinkBorderColorInput.value,
        animation: adminWebsiteLinkAnimationSelect.value as WebsiteLinkAnimation,
      },
      currentAdminPassword,
    ),
  )
    .then((links) => {
      adminWebsiteLinkUrlInput.value = "";
      adminWebsiteLinkTitleInput.value = "";
      adminWebsiteLinkContentInput.value = "";
      showToast("추가가 완료되었습니다.");
      return Promise.all([renderAdminWebsiteLinksList(links), renderWebsiteLinks(links)]);
    })
    .catch((err) => {
      if (err instanceof TooManyWebsiteLinksError) {
        adminWebsiteLinkError.textContent = "Website 링크는 최대 10개까지 등록할 수 있습니다.";
        adminWebsiteLinkError.hidden = false;
      } else {
        handleAdminPanelError(err, "Website 링크 추가 실패:", adminWebsiteLinkError);
      }
    });
});

adminBeejayBrosLinkAddButton.addEventListener("click", () => {
  if (!adminPassword) return;
  const currentAdminPassword = adminPassword;
  const url = adminBeejayBrosLinkUrlInput.value.trim();
  const text = adminBeejayBrosLinkTextInput.value.trim();
  adminBeejayBrosLinkError.hidden = true;
  if (!url || !text) return;

  void withButtonLoading(adminBeejayBrosLinkAddButton, "추가 적용 중입니다", () => adminAddBeejayBrosLink(url, text, currentAdminPassword))
    .then((links) => {
      adminBeejayBrosLinkUrlInput.value = "";
      adminBeejayBrosLinkTextInput.value = "";
      showToast("추가가 완료되었습니다.");
      return Promise.all([renderAdminBeejayBrosLinksList(links), renderBeejayBrosLinks(links)]);
    })
    .catch((err) => {
      if (err instanceof TooManyBeejayBrosLinksError) {
        adminBeejayBrosLinkError.textContent = "Beejay Bros 링크는 최대 10개까지 등록할 수 있습니다.";
        adminBeejayBrosLinkError.hidden = false;
      } else {
        handleAdminPanelError(err, "Beejay Bros 링크 추가 실패:", adminBeejayBrosLinkError);
      }
    });
});

adminBeejayBrosLinkList.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-action]");
  if (!button || !adminPassword) return;
  const id = Number(button.dataset.id);
  const row = button.closest<HTMLDivElement>(".admin-beejay-bros-link-row")!;
  const action = button.dataset.action;

  if (action === "save-beejay-bros-link") {
    const currentAdminPassword = adminPassword;
    const url = row.querySelector<HTMLInputElement>(".admin-beejay-bros-link-edit-url")!.value.trim();
    const text = row.querySelector<HTMLInputElement>(".admin-beejay-bros-link-edit-text")!.value.trim();
    if (!url || !text) return;

    void adminUpdateBeejayBrosLink(id, url, text, currentAdminPassword)
      .then((links) => {
        showToast("수정이 완료되었습니다.");
        return Promise.all([renderAdminBeejayBrosLinksList(links), renderBeejayBrosLinks(links)]);
      })
      .catch((err) => handleAdminPanelError(err, "Beejay Bros 링크 수정 실패:"));
    return;
  }

  if (action === "delete-beejay-bros-link") {
    if (!window.confirm("이 Beejay Bros 링크를 삭제하시겠습니까?")) return;
    void adminDeleteBeejayBrosLink(id, adminPassword)
      .then((links) => {
        showToast("삭제가 완료되었습니다.");
        return Promise.all([renderAdminBeejayBrosLinksList(links), renderBeejayBrosLinks(links)]);
      })
      .catch((err) => handleAdminPanelError(err, "Beejay Bros 링크 삭제 실패:"));
  }
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
    const currentAdminPassword = adminPassword;
    const platform = row.querySelector<HTMLSelectElement>(".admin-social-link-edit-platform")!.value;
    const url = row.querySelector<HTMLInputElement>(".admin-social-link-edit-url")!.value.trim();
    if (!url) return;

    // Left empty, the image stays whatever it already was (adminUpdateSocialLink/the RPC's
    // coalesce-on-null both treat "no new file chosen" as "leave the existing image alone").
    const imageInput = row.querySelector<HTMLInputElement>(".admin-social-link-edit-image-input")!;
    const file = imageInput.files?.[0] ?? null;
    if (file) {
      if (!SNS_LINK_IMAGE_TYPES.includes(file.type)) {
        adminSocialLinkError.textContent = `지원하지 않는 파일 형식입니다: ${file.name}`;
        adminSocialLinkError.hidden = false;
        return;
      }
      if (file.size > SNS_LINK_IMAGE_MAX_BYTES) {
        adminSocialLinkError.textContent = `파일이 너무 큽니다 (최대 3MB): ${file.name}`;
        adminSocialLinkError.hidden = false;
        return;
      }
    }

    void (file ? readFileAsDataUrl(file) : Promise.resolve(null))
      .then((imageData) => adminUpdateSocialLink(id, platform, url, currentAdminPassword, imageData))
      .then((links) => {
        showToast("수정이 완료되었습니다.");
        return Promise.all([renderAdminSocialLinksList(links), renderSocialLinks(links)]);
      })
      .catch((err) => handleAdminPanelError(err, "링크 수정 실패:", adminSocialLinkError));
    return;
  }

  if (action === "delete-link") {
    if (!window.confirm("이 링크 버튼을 삭제하시겠습니까?")) return;
    void adminDeleteSocialLink(id, adminPassword)
      .then((links) => {
        showToast("삭제가 완료되었습니다.");
        return Promise.all([renderAdminSocialLinksList(links), renderSocialLinks(links)]);
      })
      .catch((err) => handleAdminPanelError(err, "링크 삭제 실패:"));
  }
});

adminWebsiteLinksList.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-action]");
  if (!button || !adminPassword) return;
  const id = Number(button.dataset.id);
  const row = button.closest<HTMLDivElement>(".admin-website-link-row")!;
  const action = button.dataset.action;

  if (action === "save-website-link") {
    const currentAdminPassword = adminPassword;
    const url = row.querySelector<HTMLInputElement>(".admin-website-link-edit-url")!.value.trim();
    const title = row.querySelector<HTMLInputElement>(".admin-website-link-edit-title")!.value.trim();
    const content = row.querySelector<HTMLInputElement>(".admin-website-link-edit-content")!.value.trim();
    if (!url || !title) return;

    const titleFontSize = readWebsiteLinkFontSize(row.querySelector<HTMLInputElement>(".admin-website-link-edit-title-font-size")!, "제목");
    if (titleFontSize === null) return;
    const contentFontSize = readWebsiteLinkFontSize(row.querySelector<HTMLInputElement>(".admin-website-link-edit-content-font-size")!, "내용");
    if (contentFontSize === null) return;

    void adminUpdateWebsiteLink(
      id,
      {
        url,
        title,
        titleFontSize,
        titleFontFamily: row.querySelector<HTMLSelectElement>(".admin-website-link-edit-title-font-family")!.value as WebsiteLinkFontFamily,
        titleBold: row.querySelector<HTMLInputElement>(".admin-website-link-edit-title-bold")!.checked,
        content,
        contentFontSize,
        contentFontFamily: row.querySelector<HTMLSelectElement>(".admin-website-link-edit-content-font-family")!.value as WebsiteLinkFontFamily,
        contentBold: row.querySelector<HTMLInputElement>(".admin-website-link-edit-content-bold")!.checked,
        fontColor: row.querySelector<HTMLInputElement>(".admin-website-link-edit-font-color")!.value,
        borderColor: row.querySelector<HTMLInputElement>(".admin-website-link-edit-border-color")!.value,
        animation: row.querySelector<HTMLSelectElement>(".admin-website-link-edit-animation")!.value as WebsiteLinkAnimation,
      },
      currentAdminPassword,
    )
      .then((links) => {
        showToast("수정이 완료되었습니다.");
        return Promise.all([renderAdminWebsiteLinksList(links), renderWebsiteLinks(links)]);
      })
      .catch((err) => handleAdminPanelError(err, "Website 링크 수정 실패:"));
    return;
  }

  if (action === "delete-website-link") {
    if (!window.confirm("이 Website 링크를 삭제하시겠습니까?")) return;
    void adminDeleteWebsiteLink(id, adminPassword)
      .then((links) => {
        showToast("삭제가 완료되었습니다.");
        return Promise.all([renderAdminWebsiteLinksList(links), renderWebsiteLinks(links)]);
      })
      .catch((err) => handleAdminPanelError(err, "Website 링크 삭제 실패:"));
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

// Every list's own fetch doesn't depend on admin status, so start them all immediately, in parallel
// with the admin-session re-check below, instead of only after it resolves — that used to serialize
// 6 independent round trips behind 1 unrelated one. The actual RENDER still waits for
// initAdminSession() to settle (reusing this already-fetched data, so no extra round trip) since
// each render reads the now-finalized `adminPassword` to decide whether to show admin-only controls
// — rendering before that settles risked a flash of admin controls from a stale cached password that
// would then never get hidden again (none of these re-render reactively on their own).
const leaderboardPreload = loadLeaderboard();
const guestbookPreload = loadGuestbook();
const socialLinksPreload = loadSocialLinks();
const websiteLinksPreload = loadWebsiteLinks();
const beejayBrosLinksPreload = loadBeejayBrosLinks();
void renderBanner(); // doesn't reference adminPassword at all — no need to wait for anything

// --- Notice popup: up to 3 admin-authored notices in a dismissible modal on main-screen load -----
const NOTICE_POPUP_HIDE_TODAY_KEY = "bdj-notice-popup-hide-date";

/** YYYY-MM-DD in the viewer's local timezone — same shape as this file's other local-day helpers
 *  (localDateOnly for the Crews directory), used here so "today" always means the visitor's own
 *  calendar day, not UTC. */
function todayDateString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isNoticePopupHiddenToday(): boolean {
  try {
    return localStorage.getItem(NOTICE_POPUP_HIDE_TODAY_KEY) === todayDateString();
  } catch {
    return false; // Private mode etc. — just shows every visit instead of erroring.
  }
}

function renderNoticePopupList(notices: NoticePopupItem[]): void {
  noticePopupList.innerHTML = notices.map((n) => `<div class="notice-popup-item">${escapeHtml(n.content)}</div>`).join("");
}

/** Runs once at boot, independent of everything else above — a network fetch, so deliberately not
 *  on any hot path (BGM autoplay, admin session) that's already been tuned for speed elsewhere in
 *  this file. Silently does nothing if the check-today flag is set, or if there are no enabled
 *  notices, rather than showing an empty/pointless popup. */
async function maybeShowNoticePopup(): Promise<void> {
  if (isNoticePopupHiddenToday()) return;
  const notices = (await loadNoticePopups()).filter((n) => n.enabled);
  if (notices.length === 0) return;
  renderNoticePopupList(notices);
  noticePopupHideTodayCheckbox.checked = false;
  noticePopupOverlay.style.display = "flex";
}
void maybeShowNoticePopup();

noticePopupCloseButton.addEventListener("click", () => {
  noticePopupOverlay.style.display = "none";
});
// Checking the box both closes the popup immediately and remembers today's date so it doesn't
// reappear on a later visit/reload the same day — the X button alone only closes it for now.
noticePopupHideTodayCheckbox.addEventListener("change", () => {
  if (!noticePopupHideTodayCheckbox.checked) return;
  try {
    localStorage.setItem(NOTICE_POPUP_HIDE_TODAY_KEY, todayDateString());
  } catch {
    // Private mode etc. — the popup still closes now, it just won't stay suppressed past this visit.
  }
  noticePopupOverlay.style.display = "none";
});

// Perf fix: each render used to `await` its own preload one after another inside a single chain —
// so e.g. renderGuestbook() couldn't run until renderLeaderboard()'s own await resolved, even though
// guestbook's data may have already arrived first. That's an artificial coupling with no reason
// behind it (each section is independent), and on a slow connection it turned "5 sections populate
// as their own data arrives" into "5 sections populate in strict relay order, gated by whichever is
// slowest of the ones before it" — a visible contributor to the main screen filling in gradually
// instead of all at once. Each pair below still waits for admin-session status (shared, so it's
// resolved once) AND its own data, but the 5 are otherwise fully independent of each other now.
const adminSessionReady = initAdminSession();
void Promise.all([adminSessionReady, leaderboardPreload]).then(([, data]) => renderLeaderboard(data));
void Promise.all([adminSessionReady, guestbookPreload]).then(([, data]) => renderGuestbook(data));
void Promise.all([adminSessionReady, socialLinksPreload]).then(([, data]) => renderSocialLinks(data));
void Promise.all([adminSessionReady, websiteLinksPreload]).then(([, data]) => renderWebsiteLinks(data));
void Promise.all([adminSessionReady, beejayBrosLinksPreload]).then(([, data]) => renderBeejayBrosLinks(data));

// A reload of an already-open tab shouldn't bump the visit counter again — only the very first load
// in this browser session does. sessionStorage (unlike localStorage) is cleared once the tab/browser
// is fully closed but survives a plain refresh, which is exactly the "once per real visit" line the
// site owner asked for; the cached count itself is reused on later reloads so the number displayed
// doesn't regress to "-" while waiting on a fetch that would just increment it again.
const VISIT_COUNT_SESSION_KEY = "bdj-visit-count-cache";
const cachedVisitCount = sessionStorage.getItem(VISIT_COUNT_SESSION_KEY);
const visitCountPromise = cachedVisitCount
  ? Promise.resolve(Number(cachedVisitCount))
  : reportVisit().then((count) => {
      if (count !== null) sessionStorage.setItem(VISIT_COUNT_SESSION_KEY, String(count));
      return count;
    });

void Promise.all([visitCountPromise, countMembers()]).then(([visitCount, crewCount]) => {
  if (visitCount !== null) {
    document.querySelectorAll<HTMLElement>(".visitor-count").forEach((el) => (el.textContent = visitCount.toLocaleString()));
  }
  document.querySelectorAll<HTMLElement>(".crew-count").forEach((el) => (el.textContent = crewCount.toLocaleString()));
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
let chatbotLastAnswerWasAi = false;
function setChatbotModeLabel(aiMode: boolean): void {
  chatbotLastAnswerWasAi = aiMode;
  chatbotMode.textContent = aiMode ? t("chatbotModeGemini") : t("chatbotModeFaq");
}
onLangChange(() => setChatbotModeLabel(chatbotLastAnswerWasAi));

function chatbotAiModeActive(): boolean {
  return chatbotAdminMode === "gemini" && isGeminiConfigured;
}
setChatbotModeLabel(chatbotAiModeActive());
void loadChatbotMode().then((mode) => {
  chatbotAdminMode = mode;
  setChatbotModeLabel(chatbotAiModeActive());
});

// --- [Skin design set]: admin-selectable site-wide visual skin -------------------------------------
// The last-known skin is cached in localStorage and applied synchronously at boot so returning
// visitors don't get a flash of the other skin while the site_notice read is in flight; the server
// value then reconciles (and is what first-time visitors get once it arrives).
const SKIN_STORAGE_KEY = "bdj-skin";
const storedSkin = localStorage.getItem(SKIN_STORAGE_KEY) as SkinDesign | null;
let currentSkinDesign: SkinDesign = storedSkin && SKIN_DESIGNS.includes(storedSkin) ? storedSkin : "original";

function applySkinDesign(skin: SkinDesign): void {
  currentSkinDesign = skin;
  // "original" gets no class (it's the unskinned default); every other skin is its own
  // html.theme-<name> class, generalized over SKIN_DESIGNS so adding a new skin here never needs
  // a matching new toggle() line.
  for (const candidate of SKIN_DESIGNS) {
    if (candidate !== "original") document.documentElement.classList.toggle(`theme-${candidate}`, candidate === skin);
  }
  try {
    localStorage.setItem(SKIN_STORAGE_KEY, skin);
  } catch {
    // Private mode etc. — the skin still applies this visit, it just won't pre-apply next time.
  }
}

applySkinDesign(currentSkinDesign);
void loadSkinDesign().then(applySkinDesign);

adminSkinDesignSaveButton.addEventListener("click", () => {
  if (!adminPassword) return;
  const checkedRadio = Array.from(adminSkinDesignRadios).find((radio) => radio.checked);
  const skin = (checkedRadio?.value as SkinDesign | undefined) ?? "original";
  adminSkinDesignError.hidden = true;
  adminSkinDesignSuccess.hidden = true;
  void withButtonLoading(adminSkinDesignSaveButton, "저장 중...", () => adminSetSkinDesign(skin, adminPassword!))
    .then(() => {
      applySkinDesign(skin);
      adminSkinDesignSuccess.textContent = `'${SKIN_LABELS[skin]}' 스킨으로 적용 저장되었습니다.`;
      adminSkinDesignSuccess.hidden = false;
    })
    .catch((err) => handleAdminPanelError(err, "스킨 저장에 실패했습니다:", adminSkinDesignError));
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
  appendChatbotMessage(faqAnswer ?? t("chatbotFaqFallback"), "model");
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
    const answer = await askGemini(chatbotHistory, question, getLang());
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
const exitSiteButton = document.querySelector<HTMLButtonElement>("#exit-site-button")!;
const isStandaloneApp =
  window.matchMedia("(display-mode: standalone)").matches ||
  ("standalone" in navigator && (navigator as unknown as { standalone?: boolean }).standalone === true);
if (isStandaloneApp) {
  pwaRefreshButton.style.display = "block";
  // Same rationale as the refresh button above — standalone has no browser chrome (no tab close
  // button) to fall back on, so it's the only mode where an in-app exit control is worth showing.
  exitSiteButton.style.display = "block";
}
pwaRefreshButton.addEventListener("click", () => {
  window.location.reload();
});
const exitFallbackOverlay = document.querySelector<HTMLDivElement>("#exit-fallback-overlay")!;
exitSiteButton.addEventListener("click", () => {
  if (!window.confirm(t("exitConfirmMsg"))) return;
  // Self-review catch: window.close() below silently no-ops on some platforms (iOS standalone in
  // particular — see the fallback overlay further down), leaving the page open with BGM still
  // audibly playing behind a screen that's asking the visitor to leave. stopMainBgm is declared
  // later in this file as a hoisted function declaration, so calling it here is safe.
  stopMainBgm();
  // `open("", "_self")` re-targets this window as "opened by script" first — several Android
  // WebView/Chrome builds only allow a page to window.close() itself when that's true, and
  // otherwise silently no-op it (this is why it worked on PC — a desktop PWA's window already
  // qualifies on its own — but did nothing on mobile).
  window.open("", "_self");
  window.close();
  // Still here means the platform refused to close the window/tab outright — true on iOS Safari's
  // home-screen standalone mode in particular, which never allows a script to exit its own app;
  // there's no client-side way around that. Show a clear "close this yourself" screen instead of
  // silently doing nothing (a short delay so this never flashes on the platforms where close() DID
  // work — the window is already gone by the time this fires there).
  window.setTimeout(() => {
    exitFallbackOverlay.style.display = "flex";
  }, 150);
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
// The keyboard-closed height to compare against — seeded at load (before any input is ever
// focused, so definitely keyboard-closed) and re-seeded on width changes (see below), rather than
// read fresh from window.innerHeight on every check. window.innerHeight and visualViewport.height
// come from two different, independently-updating browser mechanisms (mobile browser chrome
// collapsing/expanding shifts one without the other) — comparing visualViewport against its own
// past self avoids that drift, which was why the very first keyboard-open under-computed the
// inset until an orientation change happened to resync things.
let restingViewportHeight = window.visualViewport?.height ?? window.innerHeight;
let lastViewportWidth = window.innerWidth;

function updateKeyboardInset(): void {
  const viewport = window.visualViewport;
  if (!viewport) return;
  // A real orientation/resize changes width; the on-screen keyboard never does — this is what
  // tells the two apart, so an orientation change re-seeds the baseline instead of being
  // misread as "the keyboard closed by however much the whole viewport just shrank/grew".
  if (window.innerWidth !== lastViewportWidth) {
    lastViewportWidth = window.innerWidth;
    restingViewportHeight = viewport.height;
  } else if (viewport.height > restingViewportHeight) {
    restingViewportHeight = viewport.height;
  }
  const inset = Math.max(0, restingViewportHeight - viewport.height);
  document.documentElement.style.setProperty("--keyboard-inset", `${inset}px`);
}
window.visualViewport?.addEventListener("resize", updateKeyboardInset);
window.visualViewport?.addEventListener("scroll", updateKeyboardInset);
window.addEventListener("orientationchange", updateKeyboardInset);

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

/** Draws the title/score band up top and the photo-credit watermark at the very bottom onto an
 *  already-captured, already-composited frame. The keys/scratch turntable themselves are NOT drawn
 *  here — they come from compositing the real #overlay-canvas (see capturePhoto), which already
 *  shows exactly what the player saw during play, not a separately invented graphic. */
function drawPhotoTextOverlay(ctx: CanvasRenderingContext2D, width: number, height: number, score: number): void {
  // Letterbox band behind the text keeps it legible over whatever the camera happened to be
  // showing.
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

  // Photo-credit watermark, last so it sits above everything else. 2026 is the site's fixed
  // production year (matches "Produced by Beejay ... in 2026" elsewhere) — only the date changes.
  const today = new Date();
  const dateLabel = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  ctx.font = "600 13px Rajdhani, sans-serif";
  ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
  ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
  ctx.shadowBlur = 4;
  ctx.fillText(`Photo by Beejay, 2026. ${dateLabel}.`, width / 2, height - 8);
  ctx.shadowBlur = 0;
}

/** Grabs the current camera frame as a JPEG data URL, composites the real #overlay-canvas on top
 *  (the same hand-tracking zones/scratch-disk pixels the player was just looking at — not a
 *  separately invented graphic), then adds the title/score/watermark text. Mirrored horizontally
 *  to match what the player actually saw on screen while posing — the live <video> is only
 *  mirrored via a CSS transform, the underlying frame data is not, so an unmirrored capture would
 *  look flipped. #overlay-canvas itself is drawn in already-mirrored coordinate space (see
 *  ZoneLayout.ts), so it must NOT be mirrored a second time here. */
function capturePhoto(videoEl: HTMLVideoElement, score: number): string {
  const captureCanvas = document.createElement("canvas");
  captureCanvas.width = videoEl.videoWidth;
  captureCanvas.height = videoEl.videoHeight;
  const captureCtx = captureCanvas.getContext("2d")!;
  captureCtx.translate(captureCanvas.width, 0);
  captureCtx.scale(-1, 1);
  captureCtx.drawImage(videoEl, 0, 0, captureCanvas.width, captureCanvas.height);
  // Everything from here on (the overlay canvas, the text) is already in correct/mirrored
  // coordinate space and must NOT be mirrored again — undo the flip first.
  captureCtx.setTransform(1, 0, 0, 1, 0, 0);
  captureCtx.drawImage(canvas, 0, 0, captureCanvas.width, captureCanvas.height);
  drawPhotoTextOverlay(captureCtx, captureCanvas.width, captureCanvas.height, score);
  return captureCanvas.toDataURL("image/jpeg", 0.85);
}

/** Counts down over the still-live camera feed (see finalizeSession — camera.stop() is deliberately
 *  deferred until after this resolves) and captures a photo the moment it hits zero. Three phases:
 *  the rank announcement, then a pose prompt, each sitting alone for a couple seconds so they
 *  actually get read, then the 5-4-3-2-1 number — showing everything at once from the start meant
 *  most players never noticed which rank they'd hit, or had time to pose, before the photo fired. */
function runPhotoCountdown(videoEl: HTMLVideoElement, rank: number, score: number): Promise<string> {
  return new Promise((resolve) => {
    photoCountdownDescEl.textContent = t("photoCountdownRankTemplate", { rank });
    photoCountdownNumberEl.textContent = "";
    photoCountdownOverlay.style.display = "flex";

    setTimeout(() => {
      photoCountdownDescEl.textContent = t("photoCountdownPoseMsg");

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

/** The in-game status readout shows the AudioContext's own state string — translated per the site
 *  owner's request (running/suspended were raw English API values in every language). Unknown
 *  values pass through untouched. */
function translateAudioState(state: AudioContextState): string {
  if (state === "running") return t("audioStateRunning");
  if (state === "suspended") return t("audioStateSuspended");
  if (state === "closed") return t("audioStateClosed");
  return state;
}

type StepOutcome =
  | { aborted: true }
  | { aborted: false; finalScore: number; counts: { Excellent: number; Great: number; Good: number; Bad: number } };

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
      comboValueEl.hidden = true;
      if (defaultTrack) {
        trackInfoTitleEl.textContent = defaultTrack.title;
        trackInfoProducerEl.textContent = defaultTrack.producer;
        trackInfoEl.style.display = "block";
      } else {
        trackInfoEl.style.display = "none";
      }

      // Shared teardown for both a manual stop and a chart-load failure below — either way, the
      // camera/hand-tracker/audio resources this step already acquired need to be released and the
      // player returned to the start screen rather than left on a frozen loading message.
      const abortWithMessage = (message: string) => {
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
    gameTitleEl.style.visibility = "hidden";
        hud.textContent = message;
        resolve({ aborted: true });
      };

      stopButton.onclick = () => {
        stopped = true;
        abortWithMessage(t("hudStoppedMsg"));
      };

      hud.textContent = songFile ? t("hudStepLoadingChartTemplate", { n: stepNumber }) : t("hudStepLoadingTemplate", { n: stepNumber });

      const loadChart = songFile
        ? buildChartFromFile(audioCtx, songFile, density).then((built) => {
            audioEngine.loadBuffer(built.audioBuffer);
            return built.chart.notes;
          })
        : audioEngine.loadClickTrack(TEST_BPM, TEST_BEAT_COUNT).then(() => buildTestChart(TEST_BPM, TEST_BEAT_COUNT, density));

      // Without this, a decode/analysis failure (e.g. an unsupported uploaded file) left the promise
      // returned by playStep() permanently unsettled — the "STEP 로딩 중" message never changed and
      // there was no way back to the start screen short of reloading the page.
      let chart: Awaited<typeof loadChart>;
      try {
        chart = await loadChart;
      } catch (err) {
        console.error("채보 생성 실패:", err);
        abortWithMessage(t("hudChartFailedTemplate", { msg: (err as Error).message }));
        return;
      }
      if (stopped) return; // stop button hit while the chart was still loading

      // Both generators (assignLanes for a real upload, buildTestChart for the click-track) push all
      // key notes in time order, then all scratch notes in time order, so the combined array is two
      // sorted runs concatenated rather than one globally sorted list. JudgmentEngine's scan-cursor
      // below relies on a single ascending-by-timeMs array; sorting once here (order doesn't matter
      // to NoteScheduler's filter, and same-lane notes were already relatively time-ordered, so
      // nothing renders differently) is cheaper than teaching every consumer about the two-run shape.
      chart.sort((a, b) => a.timeMs - b.timeMs);

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
        const outcome = scoreManager.addJudgment(result.tier);
        judgmentRenderer.register(result, outcome.combo);
        scoreValueEl.textContent = String(outcome.score);
        comboValueEl.hidden = outcome.combo <= 0;
        if (outcome.combo > 0) comboValueEl.textContent = `${t("comboLabel")} ${outcome.combo}`;
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
          hud.textContent = t("hudDetectErrorTemplate", { n: framesSeen, msg: lastDetectError });
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
          ? `${t("scratchEngagedLabel")} (${scratchEvent?.direction ?? "none"}, ${(scratchEvent?.scratchVelocityPerSec ?? 0).toFixed(1)}/s)`
          : t("scratchIdleLabel");
        hud.textContent = `${t("hudDebugStepLabel")}: ${stepNumber}\n${t("hudDebugDelegateLabel")}: ${delegate}\nFPS: ${fps}\n${t("hudDebugFramesLabel")}: ${framesSeen}\nDetect: ${inferenceMsAvg.toFixed(1)}ms\n${t("hudDebugHandsLabel")}: ${result.hands.length}\n${t("hudDebugPressesLabel")}: ${pressCount}\n${t("hudDebugScratchLabel")}: ${scratchStatus}\nAudioCtx: ${translateAudioState(audioCtx.state)}`;
      });

      // iOS Safari can leave the AudioContext "suspended" right before a step starts — re-resuming
      // here (in addition to the session-level visibilitychange handler) catches that per-step.
      if (audioCtx.state !== "running") await audioCtx.resume();
      audioEngine.play();

      // Uncapped, this loop redraws at the display's native refresh rate — on a 144-240Hz gaming
      // monitor that's 2.4-4x more full-scene redraws per second than a 60Hz phone screen, for
      // identical per-call cost (the canvas is a fixed 640x480 buffer everywhere, never resized to
      // the display). Each redraw allocates fresh arrays/objects (getVisibleNotes' filter, the
      // skeleton renderer's per-landmark map) and, while a judgment is showing, runs a shadowBlur
      // pass — one of Canvas2D's most expensive primitives. None of that scales down on a slower
      // display; it scales UP on a faster one, which is what showed up as PC-only stutter (mobile
      // screens run at 60Hz; gaming monitors commonly don't). Capping to ~60fps here keeps the
      // total draw cost per second constant regardless of the monitor's refresh rate.
      const TARGET_FRAME_MS = 1000 / 60;
      let lastRenderTime = 0;

      function renderFrame(now: number): void {
        if (stopped) return;
        if (now - lastRenderTime < TARGET_FRAME_MS) {
          requestAnimationFrame(renderFrame);
          return;
        }
        lastRenderTime = now;

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
        // Resolved once per frame (fixed geometry math against the current canvas size) instead of
        // separately inside each of the 3 renderers below that need it — same result every time,
        // computing it 3x per frame was pure waste.
        const resolvedScratch = resolveScratchZone(scratchZone, canvas.width, canvas.height);
        zoneDebugRenderer.draw(zones, latestDebug, canvas.width, canvas.height);
        zoneDebugRenderer.drawScratchDisk(resolvedScratch, scratchDetector.getRotationRad(), scratchDetector.isEngaged());
        const visibleNotes = noteScheduler.getVisibleNotes(songTimeMs, lookaheadMs, 200);
        noteRenderer.draw(visibleNotes, zones, resolvedScratch, songTimeMs, lookaheadMs, canvas.width, canvas.height);
        skeletonRenderer.draw(latestHands, canvas.width, canvas.height);
        judgmentRenderer.draw(zones, resolvedScratch, canvas.width, canvas.height);

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
  counts: { Excellent: number; Great: number; Good: number; Bad: number },
  cumulativeScore: number,
  canContinue: boolean,
): Promise<"continue" | "end"> {
  return new Promise((resolve) => {
    resultsStepLabelEl.textContent = t("resultsStepCompleteTemplate", { n: stepNumber });
    resultsScoreEl.textContent = String(cumulativeScore);
    resultsBreakdownEl.textContent = `${t("resultsBreakdownLabel")} ${stepScore}  ·  ${t("judgeExcellent")} ${counts.Excellent}   ${t("judgeGreat")} ${counts.Great}   ${t("judgeGood")} ${counts.Good}   ${t("judgeBad")} ${counts.Bad}`;
    resultsNextStepButton.style.display = canContinue ? "inline-block" : "none";
    resultsConfirmButton.textContent = canContinue ? t("resultsConfirmBtnContinue") : t("resultsConfirmBtnFinal");
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
    stepSetupTitleEl.textContent = t("stepSetupTitleTemplate", { n: stepNumber });
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
          hud.textContent = t("hudAudioLoadFailedTemplate", { msg: (err as Error).message });
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
  // Guests are excluded from the leaderboard entirely — never even reaches the qualify check below,
  // regardless of score.
  if (!member) {
    camera.stop();
    startOverlay.style.removeProperty("display");
    gameTitleEl.style.visibility = "hidden";
    return;
  }
  if (!(await qualifiesForTop20(cumulativeScore))) {
    camera.stop();
    startOverlay.style.removeProperty("display");
    gameTitleEl.style.visibility = "hidden";
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
      let updatedBoard: LeaderboardEntry[] | undefined;
      try {
        updatedBoard = await addLeaderboardEntry({
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
      await renderLeaderboard(updatedBoard);
      startOverlay.style.removeProperty("display");
    gameTitleEl.style.visibility = "hidden";
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
  hud.textContent = t("hudCameraPermission");

  const camera = new CameraManager(video);

  // Safari's WebGL backend has been unreliable with MediaPipe's GPU delegate — hand tracking would
  // detect once and then silently stop producing results on later frames. CPU is slower but stable
  // there. ?delegate=cpu/gpu (used for perf A/B testing) always overrides this default. Computed up
  // here (doesn't depend on the camera at all) so the hand-tracker load right below can start
  // immediately rather than waiting on camera.start() first.
  const delegateOverride = new URLSearchParams(location.search).get("delegate")?.toUpperCase();
  const isSafari = /^((?!chrome|crios|fxios|android).)*safari/i.test(navigator.userAgent);
  const delegate: "GPU" | "CPU" =
    delegateOverride === "CPU" || delegateOverride === "GPU" ? delegateOverride : isSafari ? "CPU" : "GPU";

  // Kicked off in parallel with camera.start() below rather than after it — none of the three
  // (camera permission, hand-tracker init, audio sample fetch) depend on each other, so starting
  // them concurrently cuts the wait from sum-of-three to max-of-three. If camera.start() fails, this
  // is simply left to finish unused in the background (a little wasted network/GPU work, no harm);
  // the .catch(() => {}) below only exists to prevent an unhandled-rejection warning in that case.
  const handTracker = new HandLandmarkerService();
  const resourcesPromise = Promise.all([handTracker.initialize({ delegate }), sfxEngine.loadScratchSample("/audio/Hiphop_Deejaying.mp3")]);
  resourcesPromise.catch(() => {});

  try {
    await camera.start();
  } catch (err) {
    // Self-review catch: this early return used to skip past the hand-tracker init and audio-
    // sample fetch kicked off just above — both were still running in the background against a
    // session that's now abandoned, leaking a live AudioContext (and, via SfxEngine, its scratch-
    // sample player's setInterval tick) indefinitely. Same cleanup the function's other exit paths
    // already perform. No camera.stop() here — camera.start() itself is what threw, so no stream
    // was ever assigned.
    handTracker.dispose();
    sfxEngine.dispose();
    void audioCtx.close();
    hud.textContent = t("hudCameraFailedTemplate", { msg: (err as Error).message });
    startOverlay.style.removeProperty("display");
    gameTitleEl.style.visibility = "hidden";
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
  let resyncRetryTimer = 0;
  const scheduleResync = () => {
    resyncStageAndCanvas();
    // A rotation can fire "resize" before the camera stream itself has reported its (possibly
    // swapped) post-rotation videoWidth/videoHeight, baking in stale dimensions on this immediate
    // call — a short delayed re-check catches that once the stream has actually settled, which is
    // what let repeated rotations eventually squish the display even after the immediate resync
    // above was added (this delayed half was still missing).
    window.clearTimeout(resyncRetryTimer);
    resyncRetryTimer = window.setTimeout(resyncStageAndCanvas, 350);
  };
  scheduleResync();
  window.addEventListener("resize", scheduleResync);
  window.addEventListener("orientationchange", scheduleResync);
  // Picked up by stageCleanupObserver above the moment the start screen reappears — covers every
  // exit path (normal end, abort, resource-load failure below) from one place instead of needing
  // a matching removeEventListener at each. Without this, every "Let's Start BDJ" click permanently
  // stacked one more pair of listeners for the rest of the tab's life, each doing a full canvas/
  // stage resize computation on every future resize/rotation event.
  cleanupSessionResizeHandlers = () => {
    window.clearTimeout(resyncRetryTimer);
    window.removeEventListener("resize", scheduleResync);
    window.removeEventListener("orientationchange", scheduleResync);
  };

  hud.textContent = t("hudResourceLoadingTemplate", { delegate });
  // Own try/catch (rather than letting this reject up into the caller's single catch-all) so a hand-
  // tracker/GPU-delegate init failure surfaces as what it actually is instead of being mislabeled as
  // an audio-load failure — the two were sharing one message before this. This resolves quickly (or
  // has already resolved) since it started in parallel with camera.start() above, not after it.
  try {
    await resourcesPromise;
  } catch (err) {
    // Same leak as the camera.start() catch above, plus camera.stop() specifically here — unlike
    // that earlier path, camera.start() already succeeded by this point, so there's a live stream
    // to release, not just a discarded attempt.
    camera.stop();
    handTracker.dispose();
    sfxEngine.dispose();
    void audioCtx.close();
    hud.textContent = t("hudResourceFailedTemplate", { msg: (err as Error).message });
    startOverlay.style.removeProperty("display");
    gameTitleEl.style.visibility = "hidden";
    return;
  }

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
    // Guests never get to escalate past STEP 1, regardless of how much speed/difficulty headroom
    // is left — only a logged-in member can continue.
    const canContinue = member ? speedIdx < SPEED_ORDER.length - 1 || difficultyIdx < DIFFICULTY_ORDER.length - 1 : false;

    const choice = await showStepResults(step, outcome.finalScore, outcome.counts, cumulativeScore, canContinue);

    if (choice === "end") {
      handTracker.dispose();
      // Must happen before audioCtx.close() — otherwise the scratch sample player's independent
      // grain timer keeps firing against a closed context and throws on every tick indefinitely.
      sfxEngine.dispose();
      void audioCtx.close();
      if (!member) {
        window.alert(t("guestStepLimitAlert"));
      }
      await finalizeSession(cumulativeScore, settings, camera, step);
      return;
    }

    settings = await showStepSetup(step + 1, settings);
    step += 1;
  }
}

startButton.addEventListener("click", () => {
  startOverlay.style.display = "none";
  gameTitleEl.style.visibility = "visible";

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
      hud.textContent = t("hudAudioLoadFailedTemplate", { msg: (err as Error).message });
      startOverlay.style.removeProperty("display");
    gameTitleEl.style.visibility = "hidden";
    });
});

