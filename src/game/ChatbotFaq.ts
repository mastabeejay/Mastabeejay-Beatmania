import { t, type TKey } from "../i18n";

// No-AI fallback for when Gemini is unavailable (free-tier quota hit, network error, or no API key
// configured yet) — plain keyword matching against a hand-written fact list, so the chatbot never
// just goes silent even when the AI path fails. Keywords stay Korean/English (typed-question
// matching, not display) — the ANSWER is looked up in the visitor's currently selected UI language
// via the translations dictionary (see src/i18n/translations.ts, faq* keys).
interface FaqEntry {
  keywords: string[];
  answerKey: TKey;
}

const FAQ_ENTRIES: FaqEntry[] = [
  {
    keywords: ["조작", "플레이", "하는법", "하는 법", "시작", "컨트롤러", "손동작", "웹캠"],
    answerKey: "faqControls",
  },
  {
    keywords: ["track", "트랙", "무반주", "ybj", "힙합", "자유 음원", "음원"],
    answerKey: "faqTrack",
  },
  {
    keywords: ["level", "속도", "난이도"],
    answerKey: "faqLevel",
  },
  {
    keywords: ["option", "finger learning", "핑거", "캘리브레이션", "보정"],
    answerKey: "faqOption",
  },
  {
    keywords: ["step", "스텝", "단계"],
    answerKey: "faqStep",
  },
  {
    keywords: ["리더보드", "순위", "기록", "best 20"],
    answerKey: "faqLeaderboard",
  },
  {
    keywords: ["판정", "굿", "그레이트", "그레잇", "엑설런트", "익셀런트", "배드", "콤보", "combo", "점수 기준", "채점", "점수는", "스코어"],
    answerKey: "faqScoring",
  },
  {
    keywords: ["방명록", "guestbook", "guest board", "글쓰기", "댓글"],
    answerKey: "faqGuestbook",
  },
  {
    keywords: ["설치", "pwa", "앱", "install"],
    answerKey: "faqInstall",
  },
  {
    keywords: ["관리자", "admin", "비밀번호 찾기", "비번"],
    answerKey: "faqAdmin",
  },
  {
    keywords: ["제작", "만든", "누가", "produced", "beejay", "임봉진", "p2b"],
    answerKey: "faqCredits",
  },
  {
    keywords: ["beatmania", "iidx", "코나미", "konami"],
    answerKey: "faqBeatmania",
  },
  // This entry only ever answers when the FQA path is actually active (Gemini answers this
  // question itself via its system prompt when AI mode is running), so a flat "지금은 Local FQA
  // 모드" is always accurate here.
  {
    keywords: ["모드", "mode", "제미나이", "gemini", "fqa", "faq", "ai야", "ai 모드"],
    answerKey: "faqMode",
  },
];

/** Scores each entry by how many of its keywords appear in the question and returns the best
 *  match, translated into the visitor's currently selected UI language (t() reads that directly —
 *  no language parameter needed here), or null if nothing scores above zero. */
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
  return best ? t(best.answerKey) : null;
}
