export interface DefaultTrack {
  fileUrl: string;
  fileName: string;
  title: string;
  producer: string;
}

// Both tracks are the user's own original work, bundled with the game as a "default music track"
// option distinct from the silent click-track test mode.
export const DEFAULT_TRACKS: DefaultTrack[] = [
  { fileUrl: "/audio/Fatherslife.mp3", fileName: "Fatherslife.mp3", title: "가장의 리듬", producer: "Produced by Yim Bongjin" },
  { fileUrl: "/audio/We2026.mp3", fileName: "We2026.mp3", title: "우리는 (2026년)", producer: "Produced by Yim Bongjin" },
];

export function pickRandomDefaultTrack(): DefaultTrack {
  return DEFAULT_TRACKS[Math.floor(Math.random() * DEFAULT_TRACKS.length)];
}
