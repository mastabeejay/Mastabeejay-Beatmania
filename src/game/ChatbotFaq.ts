// No-AI fallback for when Gemini is unavailable (free-tier quota hit, network error, or no API key
// configured yet) — plain keyword matching against a hand-written fact list, so the chatbot never
// just goes silent even when the AI path fails.
interface FaqEntry {
  keywords: string[];
  answer: string;
}

const FAQ_ENTRIES: FaqEntry[] = [
  {
    keywords: ["조작", "플레이", "하는법", "하는 법", "시작", "컨트롤러", "손동작", "웹캠"],
    answer:
      "BDJ는 별도 컨트롤러 없이 웹캠으로 손동작을 인식해서 플레이합니다. beatmania IIDX처럼 5개의 건반 레인과 1개의 스크래치(턴테이블) 레인이 있어요.",
  },
  {
    keywords: ["track", "트랙", "무반주", "ybj", "힙합", "자유 음원", "음원"],
    answer:
      "Track 항목에서 '무반주 연습'(클릭 트랙 연습), 'YBJ 힙합'(임봉진님 오리지널 힙합 20곡 중 무작위 재생), '자유 음원'(내 음원 파일 업로드) 중 고를 수 있어요. 채보는 음원을 분석해 자동으로 생성됩니다.",
  },
  {
    keywords: ["level", "속도", "난이도"],
    answer: "Level 항목에서 속도(느림/보통/빠름/개빠름)와 난이도(쉬움/보통/어려움/개어려움)를 각각 선택할 수 있어요.",
  },
  {
    keywords: ["option", "finger learning", "핑거", "캘리브레이션", "보정"],
    answer: "Option의 'Finger Learning'은 손가락 인식을 보정하는 캘리브레이션 기능이에요.",
  },
  {
    keywords: ["step", "스텝", "단계"],
    answer: "STEP 모드는 이전 단계보다 속도 또는 난이도 중 하나를 반드시 높여야 다음 단계로 진행할 수 있는 단계적 도전 모드예요.",
  },
  {
    keywords: ["리더보드", "순위", "기록", "best 20", "점수"],
    answer: "리더보드(BEST 20 RECORD)는 상위 20개 기록을 보여주고, 고득점 시 웹캠으로 축하 사진을 찍어 기록과 함께 남길 수 있어요.",
  },
  {
    keywords: ["방명록", "guestbook", "guest board", "글쓰기", "댓글"],
    answer: "방명록은 누구나 글을 남길 수 있고, 비밀번호를 설정하면 나중에 수정/삭제할 수 있어요. 답글도 남길 수 있습니다.",
  },
  {
    keywords: ["설치", "pwa", "앱", "install"],
    answer: "BDJ는 PWA(앱처럼 설치 가능한 웹앱)로 설치할 수 있어요. 시작 화면 하단에 Windows/macOS/Android/iOS별 설치 가이드가 있습니다.",
  },
  {
    keywords: ["관리자", "admin", "비밀번호 찾기", "비번"],
    answer: "관리자 모드는 사이트 운영자(임봉진님)만 접근할 수 있는 기능이라, 그 부분은 답해드리기 어려워요.",
  },
  {
    keywords: ["제작", "만든", "누가", "produced", "beejay", "임봉진", "p2b"],
    answer: "Beejay(임봉진)님이 2026년에 제작한 게임이에요. YBJ 힙합 트랙 20곡도 전부 임봉진님의 오리지널 창작곡입니다.",
  },
  {
    keywords: ["beatmania", "iidx", "코나미", "konami"],
    answer: "beatmania IIDX 등 리듬게임에서 영감을 받아 만든 독자적인 팬 제작 게임이며, Konami나 beatmania IIDX와 공식 제휴 관계는 없어요.",
  },
  // This entry only ever answers when the FQA path is actually active (Gemini answers this
  // question itself via its system prompt when AI mode is running), so a flat "지금은 Local FQA
  // 모드" is always accurate here.
  {
    keywords: ["모드", "mode", "제미나이", "gemini", "fqa", "faq", "ai야", "ai 모드"],
    answer:
      "지금은 Local FQA 모드(미리 준비된 고정 답변 모드)로 동작 중이에요. AI Gemini 모드는 무료 한도가 남아 있고 관리자가 AI 모드로 설정한 경우에 활성화됩니다. 현재 모드는 채팅창 상단에도 표시돼요.",
  },
];

/** Scores each entry by how many of its keywords appear in the question and returns the best
 *  match, or null if nothing scores above zero — callers show a generic "잘 모르겠어요" message
 *  in that case rather than a wrong guess. */
export function matchFaq(question: string): string | null {
  const lower = question.toLowerCase();
  let best: FaqEntry | null = null;
  let bestScore = 0;
  for (const entry of FAQ_ENTRIES) {
    const score = entry.keywords.reduce((count, kw) => (lower.includes(kw.toLowerCase()) ? count + 1 : count), 0);
    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }
  return best?.answer ?? null;
}
