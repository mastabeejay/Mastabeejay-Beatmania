export interface DefaultTrack {
  fileUrl: string;
  fileName: string;
  title: string;
  producer: string;
}

// All 20 tracks are the user's own original work, bundled with the game as the "YBJ 힙합 트랙"
// option distinct from the silent click-track test mode. Titles are the source file's own name —
// the on-disk filenames under public/audio/ybj are safe ASCII slugs instead (avoids URL-encoding
// pitfalls from the originals' spaces/parentheses/Korean characters), unrelated to what's displayed.
export const DEFAULT_TRACKS: DefaultTrack[] = [
  { fileUrl: "/audio/Fatherslife.mp3", fileName: "Fatherslife.mp3", title: "가장의 리듬", producer: "Produced by Yim Bongjin" },
  { fileUrl: "/audio/We2026.mp3", fileName: "We2026.mp3", title: "우리는 (2026년)", producer: "Produced by Yim Bongjin" },
  { fileUrl: "/audio/ybj/ybj-01.mp3", fileName: "625.mp3", title: "625", producer: "Produced by Yim Bongjin" },
  { fileUrl: "/audio/ybj/ybj-02.mp3", fileName: "B-Jay D-Jaying ver1.mp3", title: "B-Jay D-Jaying ver1", producer: "Produced by Yim Bongjin" },
  { fileUrl: "/audio/ybj/ybj-03.mp3", fileName: "B-Jay D-Jaying ver2.mp3", title: "B-Jay D-Jaying ver2", producer: "Produced by Yim Bongjin" },
  { fileUrl: "/audio/ybj/ybj-04.mp3", fileName: "B-Jay D-Jaying ver3.mp3", title: "B-Jay D-Jaying ver3", producer: "Produced by Yim Bongjin" },
  { fileUrl: "/audio/ybj/ybj-05.mp3", fileName: "B-Jay D-Jaying ver4.mp3", title: "B-Jay D-Jaying ver4", producer: "Produced by Yim Bongjin" },
  { fileUrl: "/audio/ybj/ybj-06.mp3", fileName: "B-Jay Scratch 결판.mp3", title: "B-Jay Scratch 결판", producer: "Produced by Yim Bongjin" },
  { fileUrl: "/audio/ybj/ybj-07.mp3", fileName: "B-Jay Scratch 시판.mp3", title: "B-Jay Scratch 시판", producer: "Produced by Yim Bongjin" },
  { fileUrl: "/audio/ybj/ybj-08.mp3", fileName: "Hoopkyuns.mp3", title: "Hoopkyuns", producer: "Produced by Yim Bongjin" },
  { fileUrl: "/audio/ybj/ybj-09.mp3", fileName: "Move Groove.mp3", title: "Move Groove", producer: "Produced by Yim Bongjin" },
  { fileUrl: "/audio/ybj/ybj-10.mp3", fileName: "강한 남자.mp3", title: "강한 남자", producer: "Produced by Yim Bongjin" },
  { fileUrl: "/audio/ybj/ybj-11.mp3", fileName: "국민 체조.mp3", title: "국민 체조", producer: "Produced by Yim Bongjin" },
  { fileUrl: "/audio/ybj/ybj-12.mp3", fileName: "대한의 이름들.mp3", title: "대한의 이름들", producer: "Produced by Yim Bongjin" },
  { fileUrl: "/audio/ybj/ybj-13.mp3", fileName: "듀스의 이름으로 (Remix).mp3", title: "듀스의 이름으로 (Remix)", producer: "Produced by Yim Bongjin" },
  { fileUrl: "/audio/ybj/ybj-14.mp3", fileName: "듀스의 이름으로.mp3", title: "듀스의 이름으로", producer: "Produced by Yim Bongjin" },
  { fileUrl: "/audio/ybj/ybj-15.mp3", fileName: "아빠의 어깨.mp3", title: "아빠의 어깨", producer: "Produced by Yim Bongjin" },
  { fileUrl: "/audio/ybj/ybj-16.mp3", fileName: "임진년...어느날.mp3", title: "임진년...어느날", producer: "Produced by Yim Bongjin" },
  { fileUrl: "/audio/ybj/ybj-17.mp3", fileName: "찬양가.mp3", title: "찬양가", producer: "Produced by Yim Bongjin" },
  { fileUrl: "/audio/ybj/ybj-18.mp3", fileName: "청령포로 가는 길.mp3", title: "청령포로 가는 길", producer: "Produced by Yim Bongjin" },
];

export function pickRandomDefaultTrack(): DefaultTrack {
  return DEFAULT_TRACKS[Math.floor(Math.random() * DEFAULT_TRACKS.length)];
}
