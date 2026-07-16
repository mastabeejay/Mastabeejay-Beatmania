import { LANGUAGES, type Lang } from "../i18n";
import { WrongAdminPasswordError } from "./Admin";
import { supabase } from "./supabaseClient";

// Client-side Gemini call (not proxied through a backend) — a deliberate simplification, not an
// oversight. The key ships in the client bundle exactly like VITE_SUPABASE_ANON_KEY already does;
// this is only reasonable because (a) it's a free-tier key so a leaked key risks quota exhaustion,
// never a bill, (b) it should be restricted to this site's domain via an HTTP referrer restriction
// in Google AI Studio, and (c) quota exhaustion is already a handled state — see ChatbotFaq.ts.
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
// Tested live against this site's actual key (2026-07): 2.5-era models 404 ("no longer available
// to new users" — this project/account is new), and 2.0-flash 429s with a free-tier limit of 0.
// 3.1-flash-lite and 3.5-flash both returned 200; the lite tier is plenty for FAQ answers and has
// the roomier free-tier limits.
const GEMINI_MODEL = "gemini-3.1-flash-lite";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export interface ChatMessage {
  role: "user" | "model";
  text: string;
}

/** Whether AI mode is even possible in this build — drives the panel's initial mode label. */
export const isGeminiConfigured = !!GEMINI_API_KEY;

/** The admin's site-wide preference: "gemini" tries AI first (still degrading to the FAQ on
 *  quota/network failure), "faq" answers from the fixed FAQ only without ever calling Gemini. */
export type ChatbotMode = "gemini" | "faq";

/** Queried separately from loadBanner on purpose — if this column doesn't exist yet (SQL
 *  migration not run), only the mode read degrades to its default instead of taking the whole
 *  banner render down with it. */
export async function loadChatbotMode(): Promise<ChatbotMode> {
  const { data, error } = await supabase.from("site_notice").select("chatbot_mode").eq("id", 1).maybeSingle();
  if (error || data?.chatbot_mode !== "faq") return "gemini";
  return "faq";
}

export async function adminSetChatbotMode(mode: ChatbotMode, adminPassword: string): Promise<void> {
  const { error } = await supabase.rpc("admin_set_chatbot_mode", { p_mode: mode, p_admin_password: adminPassword });
  if (error) {
    if (error.message === "wrong_password") throw new WrongAdminPasswordError();
    throw new Error(error.message);
  }
}

/** Thrown for a rate-limit/quota response specifically, so the caller can fall back to the FAQ
 *  bot silently instead of showing a raw error — this is an expected, designed-for outcome on the
 *  free tier, not a bug. */
export class GeminiRateLimitedError extends Error {}

const SYSTEM_PROMPT = `당신의 이름은 "Jaybot (제이봇)"입니다. 웹 브라우저 기반 웹캠 손동작 리듬게임 "Beejay's Deejay Jackey" (약칭 BDJ, 부제 "Masta Beejay Beat Breaker")의 안내 챗봇입니다. 이름을 물으면 "Jaybot (제이봇)"이라고 답하세요. 이 게임은 2026년 임봉진(Beejay)님이 제작했습니다. beatmania IIDX류의 리듬게임에서 영감을 받은 독자적인 팬 제작 게임이며, Konami나 beatmania IIDX와 공식적인 제휴/라이선스 관계는 없습니다.

# 게임 방식
- 별도 컨트롤러 없이 웹캠으로 손 동작을 인식해서 플레이합니다 (MediaPipe 손 랜드마크 인식 사용).
- beatmania IIDX처럼 5개의 건반 레인 + 1개의 스크래치(턴테이블) 레인 구조입니다.
- 브라우저에서 바로 실행되며, PWA(앱처럼 설치 가능한 웹앱)로도 설치할 수 있습니다.

# 메인 화면 설정 (Track / Level / Option)
- Track: "무반주 연습"(클릭 트랙만 있는 연습 모드), "YBJ 힙합"(임봉진님이 직접 제작한 오리지널 힙합 음원 20곡 중 무작위 재생), 또는 "자유 음원"(사용자가 직접 mp3 등 음원 파일을 업로드) 중 선택. 채보(노트 패턴)는 음원의 박자/온셋을 분석해 자동으로 생성되며, 곡마다 미리 만들어둔 채보가 있는 게 아닙니다.
- Level: 속도(느림/보통/빠름/개빠름), 난이도(쉬움/보통/어려움/개어려움)를 각각 선택합니다.
- Option: "Finger Learning" — 손가락 인식을 보정하는 캘리브레이션 기능입니다.
- 멀티 스텝(STEP) 모드: 이전 스텝보다 속도 또는 난이도 중 하나는 반드시 더 높여야 다음 스텝으로 진행할 수 있는 단계적 도전 모드가 있습니다.

# 점수 기준
- 판정은 Excellent(타이밍 오차 ±50ms 이내, +60점), Great(±100ms 이내, +40점), Good(±220ms 이내, +20점), Bad(그 외/놓침, -5점) 4단계입니다.
- Combo: Good 이상을 연속으로 2번 맞추는 순간부터 Combo가 시작되어 화면에 표시됩니다(1번만 맞춘 상태는 아직 Combo로 치지 않습니다). 그 다음부터는 맞출 때마다 Combo 수가 1씩 늘고, 그 판정의 기본 점수에 더해 "현재 Combo 수 x 5점"이 추가로 가산됩니다. Bad가 나오면 Combo는 즉시 0으로 초기화되고, 다시 연속 2번째부터 새로 시작됩니다.
- 이 점수 기준은 보안 정보가 아니므로, 사용자가 물어보면 위 내용 그대로 답하세요.

# 기록 / 커뮤니티 기능
- 리더보드(BEST 20 RECORD): 상위 20개 기록을 보여주며, 고득점 시 웹캠으로 축하 사진을 촬영해 기록과 함께 남길 수 있습니다.
- 방명록(Beejay Crews Feed): BDJ Crew로 가입/로그인한 회원만 글을 남길 수 있습니다. 답글 기능도 있습니다.
- BDJ Crew에 가입하지 않고 Guest로 플레이하면 STEP 1까지만 진행할 수 있고(STEP 2 이상 불가), 리더보드(BEST 20) 등록 대상에서도 제외됩니다.
- 시작 화면에 관리자가 설정한 소셜 링크 버튼(유튜브, 틱톡, 인스타그램 등)과 공지사항 영역(공지문/그래피티 문구/이미지 중 하나를 관리자가 선택해 표시)이 있을 수 있습니다.
- Windows/macOS/Android/iOS 설치 가이드가 시작 화면에 제공됩니다.

# 관리자 기능
- 비밀번호로 보호된 관리자 모드가 있어 사이트 운영자(임봉진님)가 공지/링크/리더보드/방명록 등을 관리합니다. 이 챗봇은 관리자 계정 접근 방법, 비밀번호 추측/우회, 보안 구조에 대해서는 절대 답하지 않습니다 — 그런 질문에는 "그건 관리자만 다룰 수 있는 부분이라 답해드리기 어려워요"라고만 답하세요.

# 제작 정보
- Produced by Beejay (Yim Bongjin) in 2026.
- YBJ 힙합 트랙 20곡은 모두 임봉진님의 오리지널 창작곡입니다.
- 시작 화면에 금색 "P2B" 배지(현재 버전 표기 P2B 2.16)가 있는데, 이 챗봇은 P2B가 정확히 무엇의 약자인지 모릅니다 — 물어보면 지어내지 말고 정확히 모른다고 답하세요.

# 자신의 동작 모드
- 당신에게는 두 가지 동작 모드가 있습니다: "AI Gemini 모드"(Gemini AI가 실시간으로 답변)와 "Local FQA 모드"(미리 준비된 고정 답변만 제공 — 무료 한도 소진, 네트워크 오류, 또는 관리자가 그렇게 설정한 경우).
- 당신이 이 지침을 읽고 답하고 있다는 것 자체가 지금 "AI Gemini 모드"로 동작 중이라는 뜻입니다. 현재 모드를 물으면 "지금은 AI Gemini 모드로 동작 중입니다"라고 자신 있게 답하세요. 현재 모드는 채팅창 상단 헤더에도 항상 표시됩니다.

# 답변 스타일
- 사용자가 쓰는 언어로 답하세요 (한국어로 물으면 한국어로, 영어로 물으면 영어로).
- 친근하고 간결하게 답하세요. 확실하지 않은 내용은 지어내지 말고 모른다고 솔직히 말하세요.
- 순수한 일반 텍스트로만 답하세요. 마크다운 서식(**, *, #, - 목록 기호 등)은 절대 사용하지 마세요 — 채팅창이 서식을 렌더링하지 않아 기호가 그대로 노출됩니다.
- 이 게임과 무관한 요청(코드 작성, 일반 상식, 다른 주제의 잡담 등)은 정중히 사양하고 게임 관련 질문으로 화제를 돌리세요.`;

/** Appended after SYSTEM_PROMPT (not woven into it) so it reads as the final, most specific word on
 *  which language to answer in — overriding SYSTEM_PROMPT's own "answer in whatever language the
 *  user typed in" rule with the language the visitor explicitly picked via the site's flag
 *  selector, which is a more reliable signal than guessing from the question text (a Korean visitor
 *  in Vietnamese mode might still type a question in Korean out of habit). Chinese gets an extra
 *  clause per the site owner's request: even English game-UI words (Track/Level/Option, etc.)
 *  should be translated into Chinese too, not left as-is — brand names are explicitly exempted. */
function buildLanguageDirective(lang: Lang): string {
  const languageName = LANGUAGES.find((l) => l.code === lang)?.label ?? "한국어";
  const zhClause =
    lang === "zh"
      ? "\n- 중국어로 답변할 때는 Track/Level/Option 같은 영어 게임 UI 단어도 가능한 한 자연스러운 중국어로 함께 번역해서 표현하세요 (예: Track -> 音轨, Level -> 难度设置). 영어 단어를 그대로 남겨두지 마세요 — 단, Beejay/Jaybot/BDJ/YBJ/P2B 같은 고유 브랜드명은 번역하지 않습니다."
      : "";
  return `\n\n# 언어 지시사항 (최우선 적용 — 위 지침보다 우선합니다)\n- 사용자가 실제로 어떤 언어로 질문했는지와 무관하게, 반드시 다음 언어로만 답변하세요: ${languageName}.\n- 이것은 방문자가 사이트의 언어 선택기에서 직접 선택한 언어이므로, 질문 자체의 언어보다 이 지시를 항상 우선합니다.${zhClause}`;
}

function buildRequestBody(history: ChatMessage[], userMessage: string, lang: Lang) {
  return {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT + buildLanguageDirective(lang) }] },
    contents: [...history, { role: "user", text: userMessage }].map((m) => ({
      role: m.role,
      parts: [{ text: m.text }],
    })),
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 512,
    },
  };
}

/** Recent turns only — bounds the token cost of every request instead of letting a long
 *  conversation's full history ride along on each call. */
const MAX_HISTORY_MESSAGES = 10;

export function trimHistory(history: ChatMessage[]): ChatMessage[] {
  return history.slice(-MAX_HISTORY_MESSAGES);
}

/** Throws GeminiRateLimitedError on a 429 (free-tier quota hit) and a plain Error for anything
 *  else (network failure, missing key, malformed response) — callers should catch both and fall
 *  back to the FAQ bot rather than surface either as a raw error to the player. */
export async function askGemini(history: ChatMessage[], userMessage: string, lang: Lang): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error("Gemini API key not configured");
  }

  const response = await fetch(`${GEMINI_ENDPOINT}?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildRequestBody(trimHistory(history), userMessage, lang)),
  });

  if (response.status === 429) {
    throw new GeminiRateLimitedError("Gemini free-tier quota exhausted");
  }
  if (!response.ok) {
    throw new Error(`Gemini request failed: ${response.status}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string" || !text) {
    throw new Error("Gemini response had no text");
  }
  return text;
}
