/** The main-screen background-music playlist — see the served copies under public/audio/mainbgm/
 *  (ASCII slugs; the real source files live in the gitignored MAIN_BGM/ folder, same convention as
 *  DefaultTracks.ts's YBJ_music/ pool). Played sequentially in this array order, looping back to
 *  index 0 once the last track ends — see setupMainBgmPlayer() in main.ts. */
export interface MainBgmTrack {
  fileUrl: string;
  title: string;
}

export const MAIN_BGM_TRACKS: MainBgmTrack[] = [
  { fileUrl: "/audio/mainbgm/mainbgm-01.mp3", title: "Beat Breaker - BJ ver." },
  { fileUrl: "/audio/mainbgm/mainbgm-02.mp3", title: "Beat Breaker - Classic instru." },
  { fileUrl: "/audio/mainbgm/mainbgm-03.mp3", title: "Beat Breaker - DJ ver." },
  { fileUrl: "/audio/mainbgm/mainbgm-04.mp3", title: "무한대" },
];
