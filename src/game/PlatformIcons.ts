export interface PlatformIconDef {
  label: string;
  svg: string;
}

// Simplified, brand-colored glyphs (not the literal trademarked vector files) — same approach
// already used for the YouTube/TikTok buttons this replaces. `custom` covers any link the admin
// wants to add that isn't one of the named platforms (a generic chain-link glyph).
export const PLATFORM_ICONS: Record<string, PlatformIconDef> = {
  youtube: {
    label: "YouTube",
    svg: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect x="1" y="5" width="22" height="14" rx="4" fill="#FF0000"/><path d="M10 8.5L16 12L10 15.5V8.5Z" fill="#FFFFFF"/></svg>`,
  },
  tiktok: {
    label: "TikTok",
    svg: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path transform="translate(-0.6,0)" fill="#25F4EE" d="M16 3c.5 2.3 2 3.9 4 4.2v2.9a7 7 0 0 1-4-1.3v6.4a5.7 5.7 0 1 1-5.7-5.7c.3 0 .6 0 .9.1v3a2.7 2.7 0 1 0 1.8 2.6V3h3z"/><path transform="translate(0.6,0)" fill="#FE2C55" d="M16 3c.5 2.3 2 3.9 4 4.2v2.9a7 7 0 0 1-4-1.3v6.4a5.7 5.7 0 1 1-5.7-5.7c.3 0 .6 0 .9.1v3a2.7 2.7 0 1 0 1.8 2.6V3h3z"/><path fill="#000000" d="M16 3c.5 2.3 2 3.9 4 4.2v2.9a7 7 0 0 1-4-1.3v6.4a5.7 5.7 0 1 1-5.7-5.7c.3 0 .6 0 .9.1v3a2.7 2.7 0 1 0 1.8 2.6V3h3z"/></svg>`,
  },
  instagram: {
    label: "Instagram",
    svg: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="igGrad" x1="0" y1="1" x2="1" y2="0"><stop offset="0%" stop-color="#FEE411"/><stop offset="30%" stop-color="#FD1D6F"/><stop offset="65%" stop-color="#B900B4"/><stop offset="100%" stop-color="#4E00C2"/></linearGradient></defs><rect x="2" y="2" width="20" height="20" rx="6" fill="url(#igGrad)"/><circle cx="12" cy="12" r="4.7" fill="none" stroke="#fff" stroke-width="1.8"/><circle cx="17.3" cy="6.7" r="1.2" fill="#fff"/></svg>`,
  },
  facebook: {
    label: "Facebook",
    svg: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="11" fill="#1877F2"/><path d="M13.6 9.3h1.7V6.8h-2c-2 0-3.3 1.3-3.3 3.4v1.4H8.3v2.6H10V19h2.7v-4.8h1.8l.3-2.6h-2.1v-1.1c0-.7.4-1.2 1-1.2z" fill="#fff"/></svg>`,
  },
  x: {
    label: "X",
    svg: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="2" width="20" height="20" rx="5" fill="#000"/><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  },
  threads: {
    label: "Threads",
    svg: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="2" width="20" height="20" rx="6" fill="#000"/><text x="12" y="16.5" text-anchor="middle" font-family="Georgia, serif" font-weight="700" font-size="13" fill="#fff">@</text></svg>`,
  },
  naver: {
    label: "Naver",
    svg: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="2" width="20" height="20" rx="5" fill="#03C75A"/><path d="M8 7h2.6l4.4 6.1V7H17v10h-2.6l-4.4-6.1V17H8V7z" fill="#fff"/></svg>`,
  },
  kakaotalk: {
    label: "KakaoTalk",
    svg: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="2" width="20" height="20" rx="6" fill="#FEE500"/><ellipse cx="12" cy="11" rx="6.8" ry="5.2" fill="#391B1B"/><path d="M8.3 15l-1.6 3 3.6-2.1z" fill="#391B1B"/></svg>`,
  },
  custom: {
    label: "자유(등록)",
    svg: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="2" width="20" height="20" rx="6" fill="#4B5563"/><path d="M9 15l6-6" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/><path d="M10 9.5H9A2.5 2.5 0 0 0 6.5 12v0A2.5 2.5 0 0 0 9 14.5h1" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M14 14.5h1a2.5 2.5 0 0 0 2.5-2.5v0A2.5 2.5 0 0 0 15 9.5h-1" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>`,
  },
};

export function getPlatformIcon(platform: string): PlatformIconDef {
  return PLATFORM_ICONS[platform] ?? PLATFORM_ICONS.custom;
}
