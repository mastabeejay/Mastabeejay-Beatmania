import { DEFAULT_LANG, LANGUAGES, T, type Lang } from "./translations";

export { DEFAULT_LANG, LANGUAGES, type Lang };
export type TKey = keyof typeof T;

const LANG_STORAGE_KEY = "bdj-lang";

function loadStoredLang(): Lang {
  try {
    const stored = localStorage.getItem(LANG_STORAGE_KEY);
    if (stored && LANGUAGES.some((l) => l.code === stored)) return stored as Lang;
  } catch {
    // localStorage unavailable (private mode, etc.) — fall through to default.
  }
  return DEFAULT_LANG;
}

let currentLang: Lang = loadStoredLang();
const listeners = new Set<(lang: Lang) => void>();

export function getLang(): Lang {
  return currentLang;
}

/** Looks up a dictionary key for the current language, falling back to Korean (never to the raw
 *  key) if a translation is somehow missing, then substitutes any {var} placeholders. */
export function t(key: TKey, vars?: Record<string, string | number>): string {
  const entry = T[key];
  let str: string = entry ? (entry[currentLang] ?? entry.ko) : key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replaceAll(`{${k}}`, String(v));
    }
  }
  return str;
}

/** Registers a callback to run whenever the language changes — used by dynamic render functions
 *  (leaderboard rows, open overlays, etc.) that build their own HTML from t() and so can't be
 *  covered by the generic data-i18n DOM walk below. */
export function onLangChange(callback: (lang: Lang) => void): void {
  listeners.add(callback);
}

/** Walks every element carrying a data-i18n* attribute and applies the current language's text.
 *  Four attribute flavors, matching how the string is actually consumed:
 *    data-i18n            -> textContent (safe: only ever holds plain translated text, never
 *                             attacker-controlled HTML)
 *    data-i18n-html        -> innerHTML (only used for the couple of strings that legitimately
 *                             contain a <br/>, both fully author-controlled in translations.ts)
 *    data-i18n-placeholder -> the placeholder attribute (inputs)
 *    data-i18n-title       -> the title attribute (tooltips) */
function applyStaticTranslations(): void {
  document.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n as keyof typeof T);
  });
  document.querySelectorAll<HTMLElement>("[data-i18n-html]").forEach((el) => {
    el.innerHTML = t(el.dataset.i18nHtml as keyof typeof T);
  });
  document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("[data-i18n-placeholder]").forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder as keyof typeof T);
  });
  document.querySelectorAll<HTMLElement>("[data-i18n-title]").forEach((el) => {
    el.title = t(el.dataset.i18nTitle as keyof typeof T);
  });
  document.querySelectorAll<HTMLImageElement>("img[data-i18n-alt]").forEach((el) => {
    el.alt = t(el.dataset.i18nAlt as keyof typeof T);
  });
}

export function setLang(lang: Lang): void {
  currentLang = lang;
  try {
    localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    // Ignore — the choice just won't survive a reload in this browsing mode.
  }
  applyStaticTranslations();
  listeners.forEach((cb) => cb(lang));
}

/** Call once at startup, after the DOM (including every data-i18n attribute) exists. */
export function initI18n(): void {
  applyStaticTranslations();
}
