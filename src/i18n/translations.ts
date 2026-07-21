// Site-wide translation dictionary for the main-screen + game-screen UI (the admin panel and any
// admin-authored free-text content — notice board, Website/Beejay Bros banners, guestbook posts,
// member names — are deliberately left untranslated: the admin panel is owner-only tooling, not a
// visitor-facing surface, and free text would need a live translation call per string rather than a
// static dictionary lookup). Brand/proper nouns (BDJ, Beejay, Jaybot, YBJ, P2B, "Masta Beejay Beat
// Breaker", "Beejay's Deejay Jackey", judgment-tier names Excellent/Great/Good/Bad, "COMBO") are kept
// as-is in every language, matching how rhythm games conventionally keep scoring terminology and
// titles untranslated.
//
// ko/en values match the site's existing text verbatim (zero visual change for anyone who never
// touches the language switcher, since ko is the default). zh/vi/ja/es/fr are original translations,
// not machine-translated pass-throughs — including, per the site owner's request, translating
// otherwise-English UI words (Track/Level/Option/Guests/Crews/etc.) into those languages too, not
// just the Korean sentences.
export type Lang = "ko" | "en" | "zh" | "vi" | "ja" | "es" | "fr";

export interface LanguageOption {
  code: Lang;
  /** Inline SVG markup for the country flag. Emoji flags are NOT used because Windows renders them
   *  as two-letter country codes ("KR", "GB", ...) instead of flag images — confirmed by the site
   *  owner on their own Windows PC — so each flag is hand-drawn as a tiny real SVG instead. */
  flagSvg: string;
  label: string;
}

// A 5-point star polygon centered on the origin (outer radius 1, standard flag inner ratio) —
// shared by the China and Vietnam flags below via transform.
const STAR = `<path d="M0,-1 L0.22,-0.31 L0.95,-0.31 L0.36,0.12 L0.59,0.81 L0,0.38 L-0.59,0.81 L-0.36,0.12 L-0.95,-0.31 L-0.22,-0.31 Z"`;

function flagSvg(inner: string): string {
  return `<svg class="lang-flag-svg" viewBox="0 0 30 20" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${inner}</svg>`;
}

// Flags follow the site owner's explicit country choices (영국 -> UK flag for English, not US).
// Order is the display order in the selector row; ko is first and is the default.
export const LANGUAGES: LanguageOption[] = [
  {
    code: "ko",
    label: "한국어",
    // Taegeukgi: white field, red-over-blue taegeuk (horizontal yin-yang simplification, standard
    // for icon sizes), plus the four corner trigrams as bar triplets perpendicular to the diagonals.
    flagSvg: flagSvg(
      `<rect width="30" height="20" fill="#fff"/>` +
        `<circle cx="15" cy="10" r="5" fill="#0047a0"/>` +
        `<path d="M10,10 A5,5 0 0 1 20,10 Z" fill="#cd2e3a"/>` +
        `<circle cx="12.5" cy="10" r="2.5" fill="#cd2e3a"/>` +
        `<circle cx="17.5" cy="10" r="2.5" fill="#0047a0"/>` +
        ["5 4.2 -56", "25 4.2 56", "5 15.8 56", "25 15.8 -56"]
          .map(
            (pos) =>
              `<g fill="#000" transform="translate(${pos.split(" ")[0]} ${pos.split(" ")[1]}) rotate(${pos.split(" ")[2]})">` +
              `<rect x="-2" y="-1.8" width="4" height="0.9"/><rect x="-2" y="-0.45" width="4" height="0.9"/><rect x="-2" y="0.9" width="4" height="0.9"/></g>`,
          )
          .join(""),
    ),
  },
  {
    code: "en",
    label: "English",
    // Union Jack, icon-simplified: centered saltire + cross (the official off-center red saltire
    // detail is sub-pixel at this size).
    flagSvg: flagSvg(
      `<rect width="30" height="20" fill="#012169"/>` +
        `<path d="M0,0 30,20 M30,0 0,20" stroke="#fff" stroke-width="4"/>` +
        `<path d="M0,0 30,20 M30,0 0,20" stroke="#c8102e" stroke-width="1.6"/>` +
        `<path d="M15,0 V20 M0,10 H30" stroke="#fff" stroke-width="6.6"/>` +
        `<path d="M15,0 V20 M0,10 H30" stroke="#c8102e" stroke-width="3.6"/>`,
    ),
  },
  {
    code: "zh",
    label: "中文",
    // Official 30x20 construction grid: large star at (5,5), four small stars arcing beside it.
    flagSvg: flagSvg(
      `<rect width="30" height="20" fill="#de2910"/>` +
        `<g fill="#ffde00">${STAR} transform="translate(5 5) scale(3)"/>` +
        `${STAR} transform="translate(10 2) scale(1)"/>` +
        `${STAR} transform="translate(12 4) scale(1)"/>` +
        `${STAR} transform="translate(12 7) scale(1)"/>` +
        `${STAR} transform="translate(10 9) scale(1)"/></g>`,
    ),
  },
  {
    code: "vi",
    label: "Tiếng Việt",
    flagSvg: flagSvg(`<rect width="30" height="20" fill="#da251d"/><g fill="#ffff00">${STAR} transform="translate(15 10) scale(6)"/></g>`),
  },
  {
    code: "ja",
    label: "日本語",
    flagSvg: flagSvg(`<rect width="30" height="20" fill="#fff"/><circle cx="15" cy="10" r="6" fill="#bc002d"/>`),
  },
  {
    code: "es",
    label: "Español",
    flagSvg: flagSvg(`<rect width="30" height="20" fill="#aa151b"/><rect y="5" width="30" height="10" fill="#f1bf00"/>`),
  },
  {
    code: "fr",
    label: "Français",
    flagSvg: flagSvg(`<rect width="30" height="20" fill="#0055a4"/><rect x="10" width="10" height="20" fill="#fff"/><rect x="20" width="10" height="20" fill="#ef4135"/>`),
  },
];

export const DEFAULT_LANG: Lang = "ko";

type Dict = Record<Lang, string>;

export const T: Record<string, Dict> = {
  // --- Footer (producer credit stays English in every language — a credit line, not a sentence to
  // localize; the admin toggle buttons ARE translated since they're visible on the main screen even
  // though the panel they open stays Korean-only, owner-facing tooling) ----------------------------
  adminLoginBtn: { ko: "🔐 관리자", en: "🔐 Admin", zh: "🔐 管理员", vi: "🔐 Quản trị", ja: "🔐 管理者", es: "🔐 Administrador", fr: "🔐 Administrateur" },
  adminLogoutBtn: {
    ko: "🔓 관리자 모드 (로그아웃)", en: "🔓 Admin Mode (Log out)", zh: "🔓 管理员模式（登出）", vi: "🔓 Chế độ quản trị (Đăng xuất)", ja: "🔓 管理者モード（ログアウト）", es: "🔓 Modo Administrador (Cerrar sesión)", fr: "🔓 Mode Administrateur (Déconnexion)",
  },
  adminPanelOpenBtn: {
    ko: "⚙️ 관리자 패널", en: "⚙️ Admin Panel", zh: "⚙️ 管理员面板", vi: "⚙️ Bảng quản trị", ja: "⚙️ 管理者パネル", es: "⚙️ Panel de administrador", fr: "⚙️ Panneau d'administration",
  },

  // --- Jaybot toggle / top status row ------------------------------------------------------------
  jaybotOpenAriaLabel: {
    ko: "제이봇 열기", en: "Open Jaybot", zh: "打开 Jaybot", vi: "Mở Jaybot", ja: "Jaybotを開く", es: "Abrir Jaybot", fr: "Ouvrir Jaybot",
  },
  jaybotTagline: {
    ko: "BDJ에 대한 궁금증은<br />저 Jaybot에게 물어봐 주세요.",
    en: "Got questions about BDJ?<br />Ask me, Jaybot!",
    zh: "对 BDJ 有疑问吗？<br />请随时问我 Jaybot！",
    vi: "Có thắc mắc về BDJ?<br />Hãy hỏi Jaybot nhé!",
    ja: "BDJについての疑問は<br />このJaybotに聞いてください。",
    es: "¿Dudas sobre BDJ?<br />¡Pregúntame a mí, Jaybot!",
    fr: "Des questions sur BDJ ?<br />Demandez-moi, à Jaybot !",
  },

  // --- Membership widget --------------------------------------------------------------------------
  membershipPhotoTitle: {
    ko: "사진 크게 보기", en: "View photo", zh: "查看大图", vi: "Xem ảnh lớn", ja: "写真を拡大表示", es: "Ver foto ampliada", fr: "Voir la photo en grand",
  },
  membershipNameTitle: {
    ko: "내 정보 보기/수정", en: "View/edit my info", zh: "查看/修改我的信息", vi: "Xem/sửa thông tin của tôi", ja: "マイページを表示/編集", es: "Ver/editar mi información", fr: "Voir/modifier mes informations",
  },
  membershipLoginBtn: { ko: "Log in", en: "Log in", zh: "登录", vi: "Đăng nhập", ja: "ログイン", es: "Iniciar sesión", fr: "Connexion" },
  membershipJoinBtn: { ko: "Join Crew", en: "Join Crew", zh: "加入团队", vi: "Tham gia Crew", ja: "クルーに参加", es: "Unirse al Crew", fr: "Rejoindre le Crew" },
  membershipLogoutBtn: { ko: "로그아웃", en: "Log out", zh: "登出", vi: "Đăng xuất", ja: "ログアウト", es: "Cerrar sesión", fr: "Déconnexion" },
  membershipGuestLabel: { ko: "Guest", en: "Guest", zh: "游客", vi: "Khách", ja: "ゲスト", es: "Invitado", fr: "Invité" },
  membershipGuestbookLockedTitle: {
    ko: "BDJ Crew 로그인 후 이용 가능합니다",
    en: "Available after logging in as a BDJ Crew",
    zh: "登录 BDJ Crew 后即可使用",
    vi: "Chỉ dùng được sau khi đăng nhập BDJ Crew",
    ja: "BDJ Crewでログイン後にご利用いただけます",
    es: "Disponible tras iniciar sesión como BDJ Crew",
    fr: "Disponible après connexion en tant que BDJ Crew",
  },
  // Two-tier membership: shown instead of membershipGuestbookLockedTitle when the visitor IS
  // logged in but is still '수습' (probationary) — a distinct message from the guest one above,
  // since "log in" isn't the missing step here, admin approval is.
  membershipGuestbookLockedTitleProbation: {
    ko: "관리자 승인 대기 중입니다",
    en: "Awaiting admin approval",
    zh: "正在等待管理员批准",
    vi: "Đang chờ quản trị viên phê duyệt",
    ja: "管理者の承認待ちです",
    es: "Pendiente de aprobación del administrador",
    fr: "En attente d'approbation par l'administrateur",
  },
  // Suffix appended after a probationary member's name in the always-visible status widget.
  membershipProbationaryBadge: {
    ko: "(수습)", en: "(Trainee)", zh: "(见习)", vi: "(Tập sự)", ja: "(見習い)", es: "(Aprendiz)", fr: "(Stagiaire)",
  },
  guestbookPwPlaceholderMember: {
    ko: "회원 로그인 — 비밀번호 불필요", en: "Logged in — no password needed", zh: "已登录会员 — 无需密码", vi: "Đã đăng nhập — không cần mật khẩu", ja: "会員ログイン中 — パスワード不要", es: "Sesión iniciada — no requiere contraseña", fr: "Connecté — mot de passe non requis",
  },
  guestbookPwPlaceholderGuest: {
    ko: "비밀번호 (선택-수정/삭제 목적)", en: "Password (optional — to edit/delete)", zh: "密码（选填，用于修改/删除）", vi: "Mật khẩu (tùy chọn — để sửa/xóa)", ja: "パスワード（任意・編集/削除用）", es: "Contraseña (opcional, para editar/eliminar)", fr: "Mot de passe (facultatif, pour modifier/supprimer)",
  },

  // --- Refresh / exit buttons ----------------------------------------------------------------------
  pwaRefreshBtn: { ko: "🔄 새로고침", en: "🔄 Refresh", zh: "🔄 刷新", vi: "🔄 Làm mới", ja: "🔄 更新", es: "🔄 Actualizar", fr: "🔄 Actualiser" },
  pwaRefreshTitleAttr: { ko: "새로고침", en: "Refresh", zh: "刷新", vi: "Làm mới", ja: "更新", es: "Actualizar", fr: "Actualiser" },
  exitSiteBtn: { ko: "🚪 종료", en: "🚪 Exit", zh: "🚪 退出", vi: "🚪 Thoát", ja: "🚪 終了", es: "🚪 Salir", fr: "🚪 Quitter" },
  exitSiteTitleAttr: { ko: "종료", en: "Exit", zh: "退出", vi: "Thoát", ja: "終了", es: "Salir", fr: "Quitter" },
  exitConfirmMsg: {
    ko: "게임을 종료하고 사이트를 나가시겠습니까?",
    en: "End the game and leave the site?",
    zh: "确定要结束游戏并离开网站吗？",
    vi: "Bạn có muốn kết thúc trò chơi và thoát trang web?",
    ja: "ゲームを終了してサイトを閉じますか？",
    es: "¿Salir del juego y abandonar el sitio?",
    fr: "Quitter le jeu et fermer le site ?",
  },
  exitFallbackMsg: {
    ko: "게임이 종료되었습니다.<br />이 창을 닫아주세요.",
    en: "The game has ended.<br />Please close this window.",
    zh: "游戏已结束。<br />请关闭此窗口。",
    vi: "Trò chơi đã kết thúc.<br />Vui lòng đóng cửa sổ này.",
    ja: "ゲームが終了しました。<br />このウィンドウを閉じてください。",
    es: "El juego ha terminado.<br />Cierra esta ventana.",
    fr: "La partie est terminée.<br />Veuillez fermer cette fenêtre.",
  },

  // --- Leaderboard ---------------------------------------------------------------------------------
  // "BEST 20" is translated for zh/fr only, per the owner's explicit scoping — ko/en/vi/ja/es keep
  // the original English "BEST 20" wording (matching every other rhythm-game brand term).
  leaderboardTitle: {
    ko: "BEST 20 RECORD", en: "BEST 20 RECORD", zh: "最佳 20 纪录", vi: "BEST 20 KỶ LỤC", ja: "BEST 20 記録", es: "MEJORES 20 RÉCORDS", fr: "LES 20 MEILLEURS SCORES",
  },
  leaderboardEmpty: {
    ko: "기록이 없습니다 — 첫 기록의 주인공이 되어보세요!",
    en: "No records yet — be the first to set one!",
    zh: "暂无记录 — 快来创造第一个记录吧！",
    vi: "Chưa có kỷ lục nào — hãy là người đầu tiên lập kỷ lục!",
    ja: "まだ記録がありません — 最初の記録に挑戦してみましょう！",
    es: "Aún no hay récords — ¡sé el primero en conseguir uno!",
    fr: "Aucun record pour l'instant — soyez le premier à en établir un !",
  },
  lbHeaderRank: { ko: "순위", en: "Rank", zh: "排名", vi: "Hạng", ja: "順位", es: "Puesto", fr: "Rang" },
  lbHeaderName: { ko: "이름", en: "Name", zh: "姓名", vi: "Tên", ja: "名前", es: "Nombre", fr: "Nom" },
  lbHeaderPhoto: { ko: "사진", en: "Photo", zh: "照片", vi: "Ảnh", ja: "写真", es: "Foto", fr: "Photo" },
  lbHeaderMessage: { ko: "메세지", en: "Message", zh: "留言", vi: "Lời nhắn", ja: "メッセージ", es: "Mensaje", fr: "Message" },
  lbHeaderScore: { ko: "점수", en: "Score", zh: "分数", vi: "Điểm", ja: "スコア", es: "Puntos", fr: "Score" },
  lbHeaderSpeed: { ko: "속도", en: "Speed", zh: "速度", vi: "Tốc độ", ja: "速度", es: "Velocidad", fr: "Vitesse" },
  lbHeaderDifficulty: { ko: "난이도", en: "Difficulty", zh: "难度", vi: "Độ khó", ja: "難易度", es: "Dificultad", fr: "Difficulté" },
  lbHeaderDate: { ko: "기록일", en: "Date", zh: "日期", vi: "Ngày", ja: "記録日", es: "Fecha", fr: "Date" },
  lbPhotoAlt: {
    ko: "{name} 사진", en: "Photo of {name}", zh: "{name}的照片", vi: "Ảnh của {name}", ja: "{name}の写真", es: "Foto de {name}", fr: "Photo de {name}",
  },
  speedSlow: { ko: "느림", en: "Slow", zh: "慢速", vi: "Chậm", ja: "遅い", es: "Lenta", fr: "Lente" },
  speedNormal: { ko: "보통", en: "Normal", zh: "普通", vi: "Bình thường", ja: "普通", es: "Normal", fr: "Normale" },
  speedFast: { ko: "빠름", en: "Fast", zh: "快速", vi: "Nhanh", ja: "速い", es: "Rápida", fr: "Rapide" },
  speedExtreme: { ko: "개빠름", en: "Extreme", zh: "极速", vi: "Cực nhanh", ja: "超高速", es: "Extrema", fr: "Extrême" },
  difficultyEasy: { ko: "쉬움", en: "Easy", zh: "简单", vi: "Dễ", ja: "簡単", es: "Fácil", fr: "Facile" },
  difficultyNormal: { ko: "보통", en: "Normal", zh: "普通", vi: "Bình thường", ja: "普通", es: "Normal", fr: "Normale" },
  difficultyHard: { ko: "어려움", en: "Hard", zh: "困难", vi: "Khó", ja: "難しい", es: "Difícil", fr: "Difficile" },
  difficultyExtreme: { ko: "개어려움", en: "Extreme", zh: "极难", vi: "Cực khó", ja: "超難関", es: "Extrema", fr: "Extrême" },
  bgmCustomDisplay: { ko: "자유 음원", en: "Custom Track", zh: "自选音源", vi: "Nhạc tự chọn", ja: "自由音源", es: "Pista personalizada", fr: "Piste personnalisée" },
  bgmNoneDisplay: { ko: "무반주", en: "No BGM", zh: "无伴奏", vi: "Không nhạc nền", ja: "伴奏なし", es: "Sin acompañamiento", fr: "Sans accompagnement" },
  bgmTapToStartHint: {
    ko: "🔈 화면을 터치하면 음악이 재생됩니다", en: "🔈 Tap anywhere to start the music", zh: "🔈 点按屏幕即可播放音乐", vi: "🔈 Chạm vào màn hình để phát nhạc", ja: "🔈 画面をタップすると音楽が再生されます", es: "🔈 Toca la pantalla para reproducir la música", fr: "🔈 Touchez l'écran pour lancer la musique",
  },

  // --- Control groups: Track / Level / Option ------------------------------------------------------
  trackGroupTitle: { ko: "Track", en: "Track", zh: "音轨", vi: "Bản nhạc", ja: "トラック", es: "Pista", fr: "Piste" },
  levelGroupTitle: { ko: "Level", en: "Level", zh: "难度设置", vi: "Cấp độ", ja: "レベル", es: "Nivel", fr: "Niveau" },
  optionGroupTitle: { ko: "Option", en: "Option", zh: "选项", vi: "Tùy chọn", ja: "オプション", es: "Opción", fr: "Option" },
  bgmTestLine1: { ko: "무반주", en: "Practice", zh: "免弹奏", vi: "Không nhạc nền", ja: "伴奏なし", es: "Sin acompañamiento", fr: "Sans accompagnement" },
  bgmTestLine2: { ko: "연습", en: "(no BGM)", zh: "练习", vi: "(luyện tập)", ja: "練習", es: "(práctica)", fr: "(entraînement)" },
  bgmDefaultLine1: { ko: "YBJ", en: "YBJ", zh: "YBJ", vi: "YBJ", ja: "YBJ", es: "YBJ", fr: "YBJ" },
  bgmDefaultLine2: { ko: "힙합", en: "Hip-hop", zh: "嘻哈", vi: "Hip-hop", ja: "ヒップホップ", es: "Hip-hop", fr: "Hip-hop" },
  songFileLine1: { ko: "자유", en: "Custom", zh: "自选", vi: "Tự chọn", ja: "自由", es: "Propia", fr: "Personnel" },
  songFileLine2: { ko: "음원", en: "track", zh: "音源", vi: "bài hát", ja: "音源", es: "pista", fr: "morceau" },
  speedFieldLabel: { ko: "속도", en: "Speed", zh: "速度", vi: "Tốc độ", ja: "速度", es: "Velocidad", fr: "Vitesse" },
  difficultyFieldLabel: { ko: "난이도", en: "Difficulty", zh: "难度", vi: "Độ khó", ja: "難易度", es: "Dificultad", fr: "Difficulté" },
  calibrationCheckboxLabel: {
    ko: "Finger Learning", en: "Finger Learning", zh: "手指校准学习", vi: "Học nhận diện ngón tay", ja: "指認識トレーニング", es: "Aprendizaje de dedos", fr: "Apprentissage des doigts",
  },

  // --- Start button / welcome row -------------------------------------------------------------------
  startButtonLabel: {
    ko: "Let's Start BDJ", en: "Let's Start BDJ", zh: "开始 BDJ", vi: "Bắt đầu BDJ", ja: "BDJをスタート", es: "Comenzar BDJ", fr: "Démarrer BDJ",
  },
  // "World" is translated for zh/fr only, per the owner's explicit scoping.
  welcomePrefix: {
    ko: "Welcome to MastaBeejay World :",
    en: "Welcome to MastaBeejay World :",
    zh: "欢迎来到 MastaBeejay 世界：",
    vi: "Chào mừng đến với MastaBeejay World :",
    ja: "MastaBeejay Worldへようこそ：",
    es: "Bienvenido a MastaBeejay World:",
    fr: "Bienvenue dans le monde de MastaBeejay :",
  },
  guestsSuffix: { ko: "Guests", en: "Guests", zh: "位访客", vi: "Khách", ja: "人のGuest", es: "invitados", fr: "invités" },
  crewsSuffix: { ko: "Crews", en: "Crews", zh: "位团员", vi: "Crew", ja: "人のCrew", es: "miembros", fr: "membres" },

  // --- Guestbook / Crews open cards -----------------------------------------------------------------
  guestbookCardLine1: { ko: "Beejay", en: "Beejay", zh: "Beejay", vi: "Beejay", ja: "Beejay", es: "Beejay", fr: "Beejay" },
  guestbookCardLine2: { ko: "Crews Feed", en: "Crews Feed", zh: "团员动态", vi: "Bảng tin Crew", ja: "クルーフィード", es: "Feed del Crew", fr: "Fil du Crew" },
  guestbookCardSub: {
    ko: "방명록 보러가기", en: "View guestbook", zh: "查看留言板", vi: "Xem sổ lưu bút", ja: "ゲストブックを見る", es: "Ver libro de visitas", fr: "Voir le livre d'or",
  },
  crewsCardLine1: { ko: "BDJ", en: "BDJ", zh: "BDJ", vi: "BDJ", ja: "BDJ", es: "BDJ", fr: "BDJ" },
  crewsCardLine2: { ko: "Crews", en: "Crews", zh: "团员", vi: "Crews", ja: "クルー", es: "Crew", fr: "Crew" },
  crewsCardSub: {
    ko: "회원 명부 보기", en: "View member directory", zh: "查看会员名录", vi: "Xem danh sách thành viên", ja: "会員名簿を見る", es: "Ver directorio de miembros", fr: "Voir l'annuaire des membres",
  },

  // --- Notice board ----------------------------------------------------------------------------------
  noticeLabel: { ko: "📢 NOTICE", en: "📢 NOTICE", zh: "📢 公告", vi: "📢 THÔNG BÁO", ja: "📢 お知らせ", es: "📢 AVISO", fr: "📢 AVIS" },

  // --- Install guide ----------------------------------------------------------------------------------
  installSectionLabel: {
    ko: "설치방법", en: "Install Guide", zh: "安装方法", vi: "Cách cài đặt", ja: "インストール方法", es: "Guía de instalación", fr: "Guide d'installation",
  },
  installFooterHint: {
    ko: "💡 이 아이콘은 실시간 웹사이트로 연결되는 바로가기예요. 나중에 게임이 업데이트되어도 다시 설치할 필요 없이 항상 최신 버전이 그대로 열립니다.",
    en: "💡 This icon is a shortcut to the live website. Even after the game is updated later, it always opens the latest version — no reinstalling needed.",
    zh: "💡 此图标是指向实时网站的快捷方式。即使日后游戏更新，也无需重新安装，始终会打开最新版本。",
    vi: "💡 Biểu tượng này là lối tắt đến trang web trực tuyến. Ngay cả khi trò chơi được cập nhật sau này, bạn không cần cài lại — phiên bản mới nhất sẽ luôn mở ra.",
    ja: "💡 このアイコンはライブサイトへのショートカットです。今後ゲームがアップデートされても、再インストールの必要なく常に最新版が開きます。",
    es: "💡 Este icono es un acceso directo al sitio web en vivo. Aunque el juego se actualice más adelante, siempre abrirá la última versión sin necesidad de reinstalar.",
    fr: "💡 Cette icône est un raccourci vers le site en ligne. Même après une future mise à jour du jeu, elle ouvrira toujours la dernière version, sans besoin de réinstaller.",
  },
  installCloseBtn: { ko: "닫기", en: "Close", zh: "关闭", vi: "Đóng", ja: "閉じる", es: "Cerrar", fr: "Fermer" },

  installWinTitle: {
    ko: "🖥️ Windows에 설치하기", en: "🖥️ Install on Windows", zh: "🖥️ 在 Windows 上安装", vi: "🖥️ Cài đặt trên Windows", ja: "🖥️ Windowsにインストール", es: "🖥️ Instalar en Windows", fr: "🖥️ Installer sur Windows",
  },
  installWinStep1: {
    ko: "크롬(Chrome) 또는 엣지(Edge) 브라우저로 이 사이트에 접속하세요.",
    en: "Open this site in Chrome or Edge.",
    zh: "请使用 Chrome 或 Edge 浏览器访问本网站。",
    vi: "Truy cập trang web này bằng trình duyệt Chrome hoặc Edge.",
    ja: "Chrome または Edge ブラウザでこのサイトにアクセスしてください。",
    es: "Accede a este sitio con Chrome o Edge.",
    fr: "Ouvrez ce site avec Chrome ou Edge.",
  },
  installWinStep2: {
    ko: "주소창(맨 위 URL 입력창) 오른쪽 끝의 설치 아이콘(⊕ 모양)을 클릭하세요. 안 보이면 오른쪽 위 점 3개(⋮) 메뉴에서 '설치'를 찾아 클릭하세요.",
    en: "Click the install icon (⊕) at the right edge of the address bar. If you don't see it, open the ⋮ menu at the top right and choose \"Install\".",
    zh: "点击地址栏右侧的安装图标（⊕）。如果没有看到，请打开右上角的 ⋮ 菜单，找到并点击“安装”。",
    vi: "Nhấp vào biểu tượng cài đặt (⊕) ở cuối thanh địa chỉ. Nếu không thấy, hãy mở menu ⋮ ở góc trên bên phải và chọn \"Cài đặt\".",
    ja: "アドレスバー右端のインストールアイコン（⊕）をクリックしてください。表示されない場合は、右上の「⋮」メニューから「インストール」を探してクリックしてください。",
    es: "Haz clic en el icono de instalación (⊕) al final de la barra de direcciones. Si no lo ves, abre el menú ⋮ arriba a la derecha y elige \"Instalar\".",
    fr: "Cliquez sur l'icône d'installation (⊕) à droite de la barre d'adresse. Si elle n'apparaît pas, ouvrez le menu ⋮ en haut à droite et choisissez « Installer ».",
  },
  installWinStep3: {
    ko: "나타나는 창에서 '설치' 버튼을 클릭하세요.",
    en: "Click \"Install\" in the dialog that appears.",
    zh: "在弹出的窗口中点击“安装”按钮。",
    vi: "Nhấp vào nút \"Cài đặt\" trong hộp thoại hiện ra.",
    ja: "表示されるウィンドウで「インストール」ボタンをクリックしてください。",
    es: "Haz clic en \"Instalar\" en la ventana que aparece.",
    fr: "Cliquez sur « Installer » dans la fenêtre qui s'affiche.",
  },
  installWinStep4: {
    ko: "바탕화면이나 시작 메뉴에 BDJ 아이콘이 생깁니다. 더블클릭하면 브라우저 주소창 없이 바로 게임이 실행됩니다.",
    en: "A BDJ icon appears on your desktop or Start menu. Double-click it to launch the game directly, with no browser address bar.",
    zh: "桌面或开始菜单会出现 BDJ 图标。双击即可直接启动游戏，无需浏览器地址栏。",
    vi: "Biểu tượng BDJ sẽ xuất hiện trên màn hình nền hoặc menu Start. Nhấp đúp để mở trò chơi trực tiếp, không cần thanh địa chỉ trình duyệt.",
    ja: "デスクトップまたはスタートメニューにBDJアイコンが作成されます。ダブルクリックするとブラウザのアドレスバーなしでゲームが直接起動します。",
    es: "Aparecerá un icono de BDJ en tu escritorio o menú Inicio. Haz doble clic para iniciar el juego directamente, sin la barra de direcciones del navegador.",
    fr: "Une icône BDJ apparaît sur votre bureau ou dans le menu Démarrer. Double-cliquez dessus pour lancer le jeu directement, sans barre d'adresse.",
  },

  installMacTitle: {
    ko: "💻 macOS에 설치하기", en: "💻 Install on macOS", zh: "💻 在 macOS 上安装", vi: "💻 Cài đặt trên macOS", ja: "💻 macOSにインストール", es: "💻 Instalar en macOS", fr: "💻 Installer sur macOS",
  },
  installMacStep1: {
    ko: "크롬(Chrome) 또는 엣지(Edge) 브라우저로 이 사이트에 접속하세요.",
    en: "Open this site in Chrome or Edge.",
    zh: "请使用 Chrome 或 Edge 浏览器访问本网站。",
    vi: "Truy cập trang web này bằng trình duyệt Chrome hoặc Edge.",
    ja: "Chrome または Edge ブラウザでこのサイトにアクセスしてください。",
    es: "Accede a este sitio con Chrome o Edge.",
    fr: "Ouvrez ce site avec Chrome ou Edge.",
  },
  installMacStep2: {
    ko: "주소창 오른쪽 끝의 설치 아이콘(⊕ 모양)을 클릭하세요. 안 보이면 오른쪽 위 메뉴에서 '설치'를 찾아 클릭하세요.",
    en: "Click the install icon (⊕) at the right edge of the address bar. If you don't see it, look for \"Install\" in the menu at the top right.",
    zh: "点击地址栏右侧的安装图标（⊕）。如果没有看到，请在右上角菜单中找到“安装”。",
    vi: "Nhấp vào biểu tượng cài đặt (⊕) ở cuối thanh địa chỉ. Nếu không thấy, hãy tìm \"Cài đặt\" trong menu ở góc trên bên phải.",
    ja: "アドレスバー右端のインストールアイコン（⊕）をクリックしてください。表示されない場合は、右上のメニューから「インストール」を探してください。",
    es: "Haz clic en el icono de instalación (⊕) al final de la barra de direcciones. Si no lo ves, busca \"Instalar\" en el menú de arriba a la derecha.",
    fr: "Cliquez sur l'icône d'installation (⊕) à droite de la barre d'adresse. Si elle n'apparaît pas, cherchez « Installer » dans le menu en haut à droite.",
  },
  installMacStep3: {
    ko: "나타나는 창에서 '설치' 버튼을 클릭하세요.",
    en: "Click \"Install\" in the dialog that appears.",
    zh: "在弹出的窗口中点击“安装”按钮。",
    vi: "Nhấp vào nút \"Cài đặt\" trong hộp thoại hiện ra.",
    ja: "表示されるウィンドウで「インストール」ボタンをクリックしてください。",
    es: "Haz clic en \"Instalar\" en la ventana que aparece.",
    fr: "Cliquez sur « Installer » dans la fenêtre qui s'affiche.",
  },
  installMacStep4: {
    ko: "Dock이나 런치패드에 BDJ 아이콘이 생깁니다. 클릭하면 바로 게임이 실행됩니다.",
    en: "A BDJ icon appears in the Dock or Launchpad. Click it to launch the game directly.",
    zh: "程序坞或启动台会出现 BDJ 图标。点击即可直接启动游戏。",
    vi: "Biểu tượng BDJ sẽ xuất hiện trên Dock hoặc Launchpad. Nhấp vào để mở trò chơi trực tiếp.",
    ja: "DockまたはLaunchpadにBDJアイコンが作成されます。クリックするとゲームが直接起動します。",
    es: "Aparecerá un icono de BDJ en el Dock o en Launchpad. Haz clic para iniciar el juego directamente.",
    fr: "Une icône BDJ apparaît dans le Dock ou le Launchpad. Cliquez dessus pour lancer le jeu directement.",
  },
  installMacStep5: {
    ko: "참고: 사파리(Safari)를 쓰신다면 macOS Sonoma(14) 이상에서 메뉴바의 '파일' → 'Dock에 추가'로도 설치할 수 있어요.",
    en: "Note: on Safari with macOS Sonoma (14) or later, you can also install via the menu bar's File → Add to Dock.",
    zh: "提示：如果使用 Safari，在 macOS Sonoma (14) 及以上版本中，也可通过菜单栏“文件”→“添加到程序坞”进行安装。",
    vi: "Lưu ý: nếu dùng Safari trên macOS Sonoma (14) trở lên, bạn cũng có thể cài đặt qua menu Tệp → Thêm vào Dock.",
    ja: "参考：Safariをお使いの場合、macOS Sonoma（14）以降ではメニューバーの「ファイル」→「Dockに追加」からもインストールできます。",
    es: "Nota: en Safari con macOS Sonoma (14) o posterior, también puedes instalar desde el menú Archivo → Añadir al Dock.",
    fr: "Remarque : sous Safari avec macOS Sonoma (14) ou version ultérieure, vous pouvez aussi installer via Fichier → Ajouter au Dock dans la barre de menus.",
  },

  installLinuxTitle: {
    ko: "🐧 Linux에 설치하기", en: "🐧 Install on Linux", zh: "🐧 在 Linux 上安装", vi: "🐧 Cài đặt trên Linux", ja: "🐧 Linuxにインストール", es: "🐧 Instalar en Linux", fr: "🐧 Installer sur Linux",
  },
  installLinuxStep1: {
    ko: "크롬(Chrome) 또는 크로미움(Chromium) 브라우저로 이 사이트에 접속하세요.",
    en: "Open this site in Chrome or Chromium.",
    zh: "请使用 Chrome 或 Chromium 浏览器访问本网站。",
    vi: "Truy cập trang web này bằng trình duyệt Chrome hoặc Chromium.",
    ja: "Chrome または Chromium ブラウザでこのサイトにアクセスしてください。",
    es: "Accede a este sitio con Chrome o Chromium.",
    fr: "Ouvrez ce site avec Chrome ou Chromium.",
  },
  installLinuxStep2: {
    ko: "주소창(맨 위 URL 입력창) 오른쪽 끝의 설치 아이콘(⊕ 모양)을 클릭하세요. 안 보이면 오른쪽 위 점 3개(⋮) 메뉴에서 '설치'를 찾아 클릭하세요.",
    en: "Click the install icon (⊕) at the right edge of the address bar. If you don't see it, open the ⋮ menu at the top right and choose \"Install\".",
    zh: "点击地址栏右侧的安装图标（⊕）。如果没有看到，请打开右上角的 ⋮ 菜单，找到并点击“安装”。",
    vi: "Nhấp vào biểu tượng cài đặt (⊕) ở cuối thanh địa chỉ. Nếu không thấy, hãy mở menu ⋮ ở góc trên bên phải và chọn \"Cài đặt\".",
    ja: "アドレスバー右端のインストールアイコン（⊕）をクリックしてください。表示されない場合は、右上の「⋮」メニューから「インストール」を探してクリックしてください。",
    es: "Haz clic en el icono de instalación (⊕) al final de la barra de direcciones. Si no lo ves, abre el menú ⋮ arriba a la derecha y elige \"Instalar\".",
    fr: "Cliquez sur l'icône d'installation (⊕) à droite de la barre d'adresse. Si elle n'apparaît pas, ouvrez le menu ⋮ en haut à droite et choisissez « Installer ».",
  },
  installLinuxStep3: {
    ko: "나타나는 창에서 '설치' 버튼을 클릭하세요.",
    en: "Click \"Install\" in the dialog that appears.",
    zh: "在弹出的窗口中点击“安装”按钮。",
    vi: "Nhấp vào nút \"Cài đặt\" trong hộp thoại hiện ra.",
    ja: "表示されるウィンドウで「インストール」ボタンをクリックしてください。",
    es: "Haz clic en \"Instalar\" en la ventana que aparece.",
    fr: "Cliquez sur « Installer » dans la fenêtre qui s'affiche.",
  },
  installLinuxStep4: {
    ko: "앱 목록(프로그램 런처)에 BDJ 아이콘이 생깁니다. 클릭하면 브라우저 주소창 없이 바로 게임이 실행됩니다.",
    en: "A BDJ icon appears in your app launcher. Click it to launch the game directly, with no browser address bar.",
    zh: "应用列表（程序启动器）中会出现 BDJ 图标。点击即可直接启动游戏，无需浏览器地址栏。",
    vi: "Biểu tượng BDJ sẽ xuất hiện trong danh sách ứng dụng (trình khởi chạy). Nhấp vào để mở trò chơi trực tiếp, không cần thanh địa chỉ trình duyệt.",
    ja: "アプリ一覧（プログラムランチャー）にBDJアイコンが作成されます。クリックするとブラウザのアドレスバーなしでゲームが直接起動します。",
    es: "Aparecerá un icono de BDJ en tu selector de aplicaciones. Haz clic para iniciar el juego directamente, sin la barra de direcciones del navegador.",
    fr: "Une icône BDJ apparaît dans votre liste d'applications. Cliquez dessus pour lancer le jeu directement, sans barre d'adresse.",
  },
  installLinuxStep5: {
    ko: "참고: 파이어폭스(Firefox)는 앱 설치 기능이 없으므로 크롬 계열 브라우저를 사용해 주세요.",
    en: "Note: Firefox has no app-install feature, so please use a Chromium-based browser.",
    zh: "提示：Firefox 没有应用安装功能，请使用 Chromium 系浏览器。",
    vi: "Lưu ý: Firefox không có tính năng cài đặt ứng dụng, vui lòng dùng trình duyệt thuộc dòng Chromium.",
    ja: "参考：Firefoxにはアプリインストール機能がないため、Chrome系ブラウザをご利用ください。",
    es: "Nota: Firefox no tiene función de instalación de apps, usa un navegador basado en Chromium.",
    fr: "Remarque : Firefox ne propose pas de fonction d'installation d'application ; utilisez un navigateur basé sur Chromium.",
  },

  installIosTitle: {
    ko: "📱 iPhone에 설치하기", en: "📱 Install on iPhone", zh: "📱 在 iPhone 上安装", vi: "📱 Cài đặt trên iPhone", ja: "📱 iPhoneにインストール", es: "📱 Instalar en iPhone", fr: "📱 Installer sur iPhone",
  },
  installIosStep1: {
    ko: "반드시 사파리(Safari) 브라우저로 이 사이트에 접속하세요. 다른 브라우저(크롬 등)에서는 이 기능이 보이지 않습니다.",
    en: "Open this site in Safari specifically — this feature isn't available in other browsers (e.g. Chrome).",
    zh: "请务必使用 Safari 浏览器访问本网站，其他浏览器（如 Chrome）中不显示此功能。",
    vi: "Bạn phải truy cập trang này bằng trình duyệt Safari — tính năng này không hiển thị ở các trình duyệt khác (như Chrome).",
    ja: "必ずSafariブラウザでこのサイトにアクセスしてください。他のブラウザ（Chromeなど）ではこの機能は表示されません。",
    es: "Accede a este sitio específicamente con Safari; esta función no está disponible en otros navegadores (p. ej. Chrome).",
    fr: "Ouvrez impérativement ce site avec Safari — cette fonction n'est pas disponible dans les autres navigateurs (Chrome, etc.).",
  },
  installIosStep2: {
    ko: "화면 하단(또는 상단) 가운데의 공유 버튼(네모 안에 위쪽 화살표, □↑ 모양)을 탭하세요.",
    en: "Tap the Share button (a square with an upward arrow, □↑) at the bottom (or top) center of the screen.",
    zh: "点击屏幕底部（或顶部）中间的分享按钮（方框加向上箭头，□↑）。",
    vi: "Nhấn nút Chia sẻ (hình vuông với mũi tên hướng lên, □↑) ở giữa phía dưới (hoặc phía trên) màn hình.",
    ja: "画面下部（または上部）中央の共有ボタン（四角に上矢印、□↑の形）をタップしてください。",
    es: "Toca el botón Compartir (un cuadrado con una flecha hacia arriba, □↑) en la parte inferior o superior central de la pantalla.",
    fr: "Appuyez sur le bouton Partager (un carré avec une flèche vers le haut, □↑) en bas (ou en haut) au centre de l'écran.",
  },
  installIosStep3: {
    ko: "위로 열리는 메뉴를 아래로 스크롤해서 '홈 화면에 추가'를 찾아 탭하세요.",
    en: "Scroll down the menu that opens and tap \"Add to Home Screen\".",
    zh: "在弹出的菜单中向下滚动，找到并点击“添加到主屏幕”。",
    vi: "Cuộn xuống trong menu hiện ra và nhấn \"Thêm vào Màn hình chính\".",
    ja: "開いたメニューを下にスクロールして「ホーム画面に追加」を探してタップしてください。",
    es: "Desplázate por el menú que se abre y toca \"Añadir a pantalla de inicio\".",
    fr: "Faites défiler le menu qui s'ouvre et appuyez sur « Sur l'écran d'accueil ».",
  },
  installIosStep4: {
    ko: "오른쪽 위의 '추가'를 탭하세요.",
    en: "Tap \"Add\" at the top right.",
    zh: "点击右上角的“添加”。",
    vi: "Nhấn \"Thêm\" ở góc trên bên phải.",
    ja: "右上の「追加」をタップしてください。",
    es: "Toca \"Añadir\" arriba a la derecha.",
    fr: "Appuyez sur « Ajouter » en haut à droite.",
  },
  installIosStep5: {
    ko: "홈 화면에 BDJ 아이콘이 생깁니다. 아이콘을 탭하면 바로 게임이 실행됩니다.",
    en: "A BDJ icon appears on your Home Screen. Tap it to launch the game directly.",
    zh: "主屏幕上会出现 BDJ 图标。点击即可直接启动游戏。",
    vi: "Biểu tượng BDJ sẽ xuất hiện trên Màn hình chính. Nhấn vào để mở trò chơi trực tiếp.",
    ja: "ホーム画面にBDJアイコンが作成されます。アイコンをタップするとゲームが直接起動します。",
    es: "Aparecerá un icono de BDJ en tu pantalla de inicio. Tócalo para iniciar el juego directamente.",
    fr: "Une icône BDJ apparaît sur votre écran d'accueil. Appuyez dessus pour lancer le jeu directement.",
  },

  installAndroidTitle: {
    ko: "🤖 Android에 설치하기", en: "🤖 Install on Android", zh: "🤖 在 Android 上安装", vi: "🤖 Cài đặt trên Android", ja: "🤖 Androidにインストール", es: "🤖 Instalar en Android", fr: "🤖 Installer sur Android",
  },
  installAndroidStep1: {
    ko: "안드로이드 폰의 크롬(Chrome) 앱으로 이 사이트에 접속하세요.",
    en: "Open this site in the Chrome app on your Android phone.",
    zh: "请在安卓手机的 Chrome 应用中访问本网站。",
    vi: "Truy cập trang web này bằng ứng dụng Chrome trên điện thoại Android.",
    ja: "Androidスマホの Chrome アプリでこのサイトにアクセスしてください。",
    es: "Accede a este sitio con la app Chrome en tu teléfono Android.",
    fr: "Ouvrez ce site avec l'application Chrome sur votre téléphone Android.",
  },
  installAndroidStep2: {
    ko: "화면 오른쪽 위의 점 3개(⋮) 메뉴를 탭하세요.",
    en: "Tap the ⋮ menu at the top right of the screen.",
    zh: "点击屏幕右上角的 ⋮ 菜单。",
    vi: "Nhấn vào menu ⋮ ở góc trên bên phải màn hình.",
    ja: "画面右上の「⋮」メニューをタップしてください。",
    es: "Toca el menú ⋮ en la parte superior derecha de la pantalla.",
    fr: "Appuyez sur le menu ⋮ en haut à droite de l'écran.",
  },
  installAndroidStep3: {
    ko: "메뉴에서 '앱 설치' 또는 '홈 화면에 추가'를 찾아 탭하세요. 화면 하단에 자동으로 설치 안내 배너가 뜨면 그걸 탭해도 됩니다.",
    en: "Look for \"Install app\" or \"Add to Home screen\" in the menu. If an install banner appears automatically at the bottom, you can tap that instead.",
    zh: "在菜单中找到“安装应用”或“添加到主屏幕”。如果屏幕底部自动弹出安装提示条，也可以直接点击它。",
    vi: "Tìm và nhấn \"Cài đặt ứng dụng\" hoặc \"Thêm vào Màn hình chính\" trong menu. Nếu banner cài đặt tự động hiện ở phía dưới màn hình, bạn có thể nhấn vào đó thay thế.",
    ja: "メニューから「アプリをインストール」または「ホーム画面に追加」を探してタップしてください。画面下部に自動でインストール案内バナーが表示された場合は、それをタップしても構いません。",
    es: "Busca \"Instalar aplicación\" o \"Añadir a pantalla de inicio\" en el menú. Si aparece automáticamente un banner de instalación abajo, también puedes tocarlo.",
    fr: "Cherchez « Installer l'application » ou « Ajouter à l'écran d'accueil » dans le menu. Si une bannière d'installation apparaît automatiquement en bas, vous pouvez aussi appuyer dessus.",
  },
  installAndroidStep4: {
    ko: "'설치' 버튼을 한 번 더 탭해서 확인하세요.",
    en: "Tap \"Install\" once more to confirm.",
    zh: "再次点击“安装”按钮以确认。",
    vi: "Nhấn nút \"Cài đặt\" thêm một lần nữa để xác nhận.",
    ja: "「インストール」ボタンをもう一度タップして確定してください。",
    es: "Toca \"Instalar\" una vez más para confirmar.",
    fr: "Appuyez à nouveau sur « Installer » pour confirmer.",
  },
  installAndroidStep5: {
    ko: "홈 화면에 BDJ 아이콘이 생깁니다. 아이콘을 탭하면 바로 게임이 실행됩니다.",
    en: "A BDJ icon appears on your Home screen. Tap it to launch the game directly.",
    zh: "主屏幕上会出现 BDJ 图标。点击即可直接启动游戏。",
    vi: "Biểu tượng BDJ sẽ xuất hiện trên Màn hình chính. Nhấn vào để mở trò chơi trực tiếp.",
    ja: "ホーム画面にBDJアイコンが作成されます。アイコンをタップするとゲームが直接起動します。",
    es: "Aparecerá un icono de BDJ en tu pantalla de inicio. Tócalo para iniciar el juego directamente.",
    fr: "Une icône BDJ apparaît sur votre écran d'accueil. Appuyez dessus pour lancer le jeu directement.",
  },

  installChromeosTitle: {
    ko: "🌐 ChromeOS(크롬북)에 설치하기", en: "🌐 Install on ChromeOS", zh: "🌐 在 ChromeOS 上安装", vi: "🌐 Cài đặt trên ChromeOS", ja: "🌐 ChromeOS（Chromebook）にインストール", es: "🌐 Instalar en ChromeOS", fr: "🌐 Installer sur ChromeOS",
  },
  installChromeosStep1: {
    ko: "크롬북의 크롬(Chrome) 브라우저로 이 사이트에 접속하세요.",
    en: "Open this site in the Chrome browser on your Chromebook.",
    zh: "请在 Chromebook 的 Chrome 浏览器中访问本网站。",
    vi: "Truy cập trang web này bằng trình duyệt Chrome trên Chromebook.",
    ja: "ChromebookのChromeブラウザでこのサイトにアクセスしてください。",
    es: "Accede a este sitio con el navegador Chrome de tu Chromebook.",
    fr: "Ouvrez ce site avec le navigateur Chrome de votre Chromebook.",
  },
  installChromeosStep2: {
    ko: "주소창(맨 위 URL 입력창) 오른쪽 끝의 설치 아이콘(⊕ 모양)을 클릭하세요. 안 보이면 오른쪽 위 점 3개(⋮) 메뉴에서 '설치'를 찾아 클릭하세요.",
    en: "Click the install icon (⊕) at the right edge of the address bar. If you don't see it, open the ⋮ menu at the top right and choose \"Install\".",
    zh: "点击地址栏右侧的安装图标（⊕）。如果没有看到，请打开右上角的 ⋮ 菜单，找到并点击“安装”。",
    vi: "Nhấp vào biểu tượng cài đặt (⊕) ở cuối thanh địa chỉ. Nếu không thấy, hãy mở menu ⋮ ở góc trên bên phải và chọn \"Cài đặt\".",
    ja: "アドレスバー右端のインストールアイコン（⊕）をクリックしてください。表示されない場合は、右上の「⋮」メニューから「インストール」を探してクリックしてください。",
    es: "Haz clic en el icono de instalación (⊕) al final de la barra de direcciones. Si no lo ves, abre el menú ⋮ arriba a la derecha y elige \"Instalar\".",
    fr: "Cliquez sur l'icône d'installation (⊕) à droite de la barre d'adresse. Si elle n'apparaît pas, ouvrez le menu ⋮ en haut à droite et choisissez « Installer ».",
  },
  installChromeosStep3: {
    ko: "나타나는 창에서 '설치' 버튼을 클릭하세요.",
    en: "Click \"Install\" in the dialog that appears.",
    zh: "在弹出的窗口中点击“安装”按钮。",
    vi: "Nhấp vào nút \"Cài đặt\" trong hộp thoại hiện ra.",
    ja: "表示されるウィンドウで「インストール」ボタンをクリックしてください。",
    es: "Haz clic en \"Instalar\" en la ventana que aparece.",
    fr: "Cliquez sur « Installer » dans la fenêtre qui s'affiche.",
  },
  installChromeosStep4: {
    ko: "런처(화면 왼쪽 아래 ○ 버튼)에 BDJ 아이콘이 생깁니다. 아이콘을 마우스 오른쪽 클릭해서 '선반에 고정'하면 더 편하게 실행할 수 있어요.",
    en: "A BDJ icon appears in the launcher (the ○ button at the bottom left). Right-click it and choose \"Pin to shelf\" for even quicker access.",
    zh: "启动器（屏幕左下角的 ○ 按钮）中会出现 BDJ 图标。右键点击图标并选择“固定到搁架”，使用起来会更方便。",
    vi: "Biểu tượng BDJ sẽ xuất hiện trong launcher (nút ○ ở góc dưới bên trái màn hình). Nhấp chuột phải vào biểu tượng và chọn \"Ghim vào kệ\" để mở nhanh hơn.",
    ja: "ランチャー（画面左下の○ボタン）にBDJアイコンが作成されます。アイコンを右クリックして「シェルフに固定」すると、より便利に起動できます。",
    es: "Aparecerá un icono de BDJ en el launcher (el botón ○ abajo a la izquierda). Haz clic derecho y elige \"Anclar a la barra\" para acceder aún más rápido.",
    fr: "Une icône BDJ apparaît dans le launcher (le bouton ○ en bas à gauche). Faites un clic droit dessus et choisissez « Épingler à l'étagère » pour un accès encore plus rapide.",
  },

  // --- Jaybot panel ------------------------------------------------------------------------------
  chatbotTitleLabel: {
    ko: "Jaybot (제이봇)", en: "Jaybot", zh: "Jaybot", vi: "Jaybot", ja: "Jaybot", es: "Jaybot", fr: "Jaybot",
  },
  chatbotCloseAriaLabel: { ko: "닫기", en: "Close", zh: "关闭", vi: "Đóng", ja: "閉じる", es: "Cerrar", fr: "Fermer" },
  chatbotGreeting: {
    ko: "안녕하세요, 제이봇입니다! BDJ 플레이 방법이나 기능에 대해 무엇이든 물어보세요.",
    en: "Hi, I'm Jaybot! Ask me anything about how to play BDJ or its features.",
    zh: "你好，我是 Jaybot！关于 BDJ 的玩法或功能，欢迎随时提问。",
    vi: "Xin chào, mình là Jaybot! Hãy hỏi mình bất cứ điều gì về cách chơi hoặc tính năng của BDJ.",
    ja: "こんにちは、Jaybotです！BDJの遊び方や機能について何でも聞いてください。",
    es: "¡Hola, soy Jaybot! Pregúntame lo que quieras sobre cómo jugar BDJ o sus funciones.",
    fr: "Bonjour, je suis Jaybot ! Posez-moi toutes vos questions sur le jeu ou les fonctionnalités de BDJ.",
  },
  chatbotInputPlaceholder: {
    ko: "게임에 대해 물어보세요...", en: "Ask about the game...", zh: "请输入关于游戏的问题…", vi: "Hỏi về trò chơi...", ja: "ゲームについて質問してください…", es: "Pregunta sobre el juego...", fr: "Posez une question sur le jeu...",
  },
  chatbotSendBtn: { ko: "전송", en: "Send", zh: "发送", vi: "Gửi", ja: "送信", es: "Enviar", fr: "Envoyer" },
  chatbotModeGemini: {
    ko: "AI Gemini 모드", en: "AI Gemini Mode", zh: "AI Gemini 模式", vi: "Chế độ AI Gemini", ja: "AI Geminiモード", es: "Modo IA Gemini", fr: "Mode IA Gemini",
  },
  chatbotModeFaq: {
    ko: "Local FQA 모드", en: "Local FAQ Mode", zh: "本地 FAQ 模式", vi: "Chế độ FAQ nội bộ", ja: "ローカルFAQモード", es: "Modo FAQ local", fr: "Mode FAQ local",
  },
  chatbotFaqFallback: {
    ko: "죄송해요, 그 질문은 아직 답해드리기 어려워요. 다른 방식으로 물어봐 주시겠어요?",
    en: "Sorry, I can't answer that one yet. Could you try asking a different way?",
    zh: "抱歉，这个问题我暂时还无法回答。可以换个方式问问看吗？",
    vi: "Xin lỗi, mình chưa thể trả lời câu hỏi đó. Bạn thử hỏi theo cách khác được không?",
    ja: "すみません、その質問にはまだお答えできません。別の言い方で聞いていただけますか？",
    es: "Lo siento, todavía no puedo responder a eso. ¿Podrías preguntarlo de otra forma?",
    fr: "Désolé, je ne peux pas encore répondre à cette question. Pourriez-vous la reformuler ?",
  },

  // --- Jaybot FAQ answers (fallback mode) ------------------------------------------------------------
  faqControls: {
    ko: "BDJ는 별도 컨트롤러 없이 웹캠으로 손동작을 인식해서 플레이합니다. beatmania IIDX처럼 5개의 건반 레인과 1개의 스크래치(턴테이블) 레인이 있어요.",
    en: "BDJ is played with hand-motion tracking via webcam — no controller needed. Like beatmania IIDX, it has 5 key lanes plus 1 scratch (turntable) lane.",
    zh: "BDJ 无需额外的控制器，通过网络摄像头识别手部动作即可游玩。和 beatmania IIDX 一样，有 5 条按键轨道和 1 条刮碟（转盘）轨道。",
    vi: "BDJ chơi bằng cách nhận diện cử chỉ tay qua webcam, không cần bộ điều khiển riêng. Giống beatmania IIDX, có 5 làn phím và 1 làn scratch (đĩa quay).",
    ja: "BDJは専用コントローラーなしで、Webカメラによる手の動きの認識でプレイします。beatmania IIDXのように5つの鍵盤レーンと1つのスクラッチ（ターンテーブル）レーンがあります。",
    es: "BDJ se juega con reconocimiento de gestos de mano por webcam, sin mando. Como beatmania IIDX, tiene 5 carriles de teclas y 1 carril de scratch (giradiscos).",
    fr: "BDJ se joue par reconnaissance des gestes de la main via webcam, sans manette. Comme beatmania IIDX, il a 5 pistes de touches et 1 piste de scratch (platine).",
  },
  faqTrack: {
    ko: "Track 항목에서 '무반주 연습'(클릭 트랙 연습), 'YBJ 힙합'(임봉진님 오리지널 힙합 20곡 중 무작위 재생), '자유 음원'(내 음원 파일 업로드) 중 고를 수 있어요. 채보는 음원을 분석해 자동으로 생성됩니다.",
    en: "In Track, choose \"Practice\" (click-track only), \"YBJ Hip-hop\" (a random pick from 20 original tracks by Yim Bongjin), or \"Custom track\" (upload your own audio file). The note chart is generated automatically by analyzing the audio.",
    zh: "在 Track 中可选择“免弹奏练习”（仅点击音轨）、“YBJ 嘻哈”（随机播放林奉振原创的 20 首嘻哈曲目之一）或“自选音源”（上传自己的音频文件）。谱面会通过分析音源自动生成。",
    vi: "Ở mục Track, bạn có thể chọn \"Không nhạc nền\" (chỉ có click track), \"YBJ Hip-hop\" (phát ngẫu nhiên 1 trong 20 bài hip-hop gốc của Yim Bongjin), hoặc \"Nhạc tự chọn\" (tải lên file nhạc của bạn). Bản phổ được tạo tự động bằng cách phân tích âm thanh.",
    ja: "Trackでは「伴奏なし練習」（クリックトラックのみ）、「YBJヒップホップ」（イム・ボンジン氏のオリジナル20曲からランダム再生）、「自由音源」（自分の音源ファイルをアップロード）から選べます。譜面は音源を解析して自動生成されます。",
    es: "En Track puedes elegir \"Práctica\" (solo pista de clics), \"YBJ Hip-hop\" (una de las 20 pistas originales de Yim Bongjin, al azar) o \"Pista personalizada\" (sube tu propio archivo de audio). El mapa de notas se genera automáticamente analizando el audio.",
    fr: "Dans Track, choisissez « Sans accompagnement » (piste de clics uniquement), « YBJ Hip-hop » (une piste aléatoire parmi 20 morceaux originaux de Yim Bongjin) ou « Piste personnelle » (importez votre propre fichier audio). La partition est générée automatiquement en analysant l'audio.",
  },
  faqLevel: {
    ko: "Level 항목에서 속도(느림/보통/빠름/개빠름)와 난이도(쉬움/보통/어려움/개어려움)를 각각 선택할 수 있어요.",
    en: "In Level, choose a speed (Slow/Normal/Fast/Extreme) and a difficulty (Easy/Normal/Hard/Extreme) independently.",
    zh: "在 Level 中可以分别选择速度（慢速/普通/快速/极速）和难度（简单/普通/困难/极难）。",
    vi: "Ở mục Level, bạn có thể chọn tốc độ (Chậm/Bình thường/Nhanh/Cực nhanh) và độ khó (Dễ/Bình thường/Khó/Cực khó) độc lập với nhau.",
    ja: "Levelでは速度（遅い/普通/速い/超高速）と難易度（簡単/普通/難しい/超難関）をそれぞれ選択できます。",
    es: "En Level puedes elegir una velocidad (Lenta/Normal/Rápida/Extrema) y una dificultad (Fácil/Normal/Difícil/Extrema) de forma independiente.",
    fr: "Dans Level, choisissez une vitesse (Lente/Normale/Rapide/Extrême) et une difficulté (Facile/Normale/Difficile/Extrême) indépendamment.",
  },
  faqOption: {
    ko: "Option의 'Finger Learning'은 손가락 인식을 보정하는 캘리브레이션 기능이에요.",
    en: "\"Finger Learning\" in Option is a calibration feature that fine-tunes finger-tracking accuracy.",
    zh: "Option 中的“手指校准学习”是用于校正手指识别精度的功能。",
    vi: "\"Học nhận diện ngón tay\" trong Option là tính năng hiệu chỉnh để cải thiện độ chính xác nhận diện ngón tay.",
    ja: "Optionの「指認識トレーニング」は指認識の精度を調整するキャリブレーション機能です。",
    es: "\"Aprendizaje de dedos\" en Option es una función de calibración que ajusta la precisión del seguimiento de dedos.",
    fr: "« Apprentissage des doigts » dans Option est une fonction d'étalonnage qui affine la précision de suivi des doigts.",
  },
  faqStep: {
    ko: "STEP 모드는 이전 단계보다 속도 또는 난이도 중 하나를 반드시 높여야 다음 단계로 진행할 수 있는 단계적 도전 모드예요.",
    en: "STEP mode is a progressive challenge: you must raise either the speed or the difficulty above the previous step to advance to the next one.",
    zh: "STEP 模式是一种递进挑战：必须将速度或难度中的一项提升到高于上一阶段，才能进入下一阶段。",
    vi: "Chế độ STEP là thử thách tăng dần: bạn phải tăng tốc độ hoặc độ khó cao hơn bước trước để tiến sang bước tiếp theo.",
    ja: "STEPモードは、前のステップより速度または難易度のどちらかを必ず上げないと次のステップに進めない段階的チャレンジモードです。",
    es: "El modo STEP es un desafío progresivo: debes subir la velocidad o la dificultad por encima del paso anterior para avanzar al siguiente.",
    fr: "Le mode STEP est un défi progressif : vous devez augmenter la vitesse ou la difficulté par rapport à l'étape précédente pour passer à la suivante.",
  },
  faqLeaderboard: {
    ko: "리더보드(BEST 20 RECORD)는 상위 20개 기록을 보여주고, 고득점 시 웹캠으로 축하 사진을 찍어 기록과 함께 남길 수 있어요.",
    en: "The leaderboard (BEST 20 RECORD) shows the top 20 scores, and a high score lets you take a celebratory webcam photo to save alongside your record.",
    zh: "排行榜（BEST 20）展示前 20 名的成绩；获得高分时可以用网络摄像头拍摄纪念照片，与记录一起保存。",
    vi: "Bảng xếp hạng (BEST 20) hiển thị 20 kỷ lục cao nhất; khi đạt điểm cao, bạn có thể chụp ảnh kỷ niệm bằng webcam để lưu cùng kỷ lục.",
    ja: "リーダーボード（BEST 20）は上位20件の記録を表示し、高得点時にはWebカメラで記念写真を撮って記録と一緒に残せます。",
    es: "La clasificación (BEST 20) muestra los 20 mejores puntajes; con una puntuación alta puedes tomarte una foto conmemorativa con la webcam para guardarla junto a tu récord.",
    fr: "Le classement (BEST 20) affiche les 20 meilleurs scores ; avec un score élevé, vous pouvez prendre une photo souvenir via la webcam à conserver avec votre record.",
  },
  // Judgment names here match the translated on-screen popups (judgeExcellent/... above) so the
  // FAQ describes exactly what the player sees during play.
  faqScoring: {
    ko: "판정은 Excellent(+60점), Great(+40점), Good(+20점), Bad(-5점) 4단계예요. Good 이상을 연속으로 2번 맞추는 순간부터 Combo가 시작되고, 그 다음부터 맞출 때마다 Combo 수가 1씩 늘면서 '기본 점수 + Combo 수 x 5점'이 가산돼요. Bad가 나오면 Combo는 0으로 초기화됩니다.",
    en: "There are 4 judgment tiers: Excellent (+60), Great (+40), Good (+20), and Bad (-5). Combo starts the moment you hit Good-or-better twice in a row; from then on, each hit adds 1 to the Combo count and adds \"base score + Combo count × 5\" points. A Bad resets the Combo to 0.",
    zh: "判定共 4 档：完美（+60分）、很棒（+40分）、不错（+20分）、失误（-5分）。当连续 2 次达到“不错”及以上时连击开始计数，此后每次命中连击数加 1，并额外获得“基础分 + 连击数 × 5”分。出现失误时连击会归零。",
    vi: "Có 4 mức đánh giá: Excellent (+60), Great (+40), Good (+20), và Bad (-5). Combo bắt đầu khi bạn đạt Good trở lên 2 lần liên tiếp; từ đó mỗi lần trúng sẽ tăng Combo thêm 1 và cộng thêm \"điểm cơ bản + số Combo x 5\". Nếu bị Bad, Combo sẽ về 0.",
    ja: "判定はExcellent（+60点）、Great（+40点）、Good（+20点）、Bad（-5点）の4段階です。Good以上を2回連続で決めた瞬間からComboが始まり、以降は決めるたびにCombo数が1増え、「基本点+Combo数×5点」が加算されます。Badが出るとComboは0にリセットされます。",
    es: "Hay 4 niveles de juicio: Excellent (+60), Great (+40), Good (+20) y Bad (-5). El Combo comienza al lograr Good o mejor dos veces seguidas; a partir de ahí, cada acierto suma 1 al Combo y añade \"puntos base + Combo × 5\". Un Bad reinicia el Combo a 0.",
    fr: "Il y a 4 niveaux de jugement : Excellent (+60), Super (+40), Bien (+20) et Raté (-5). Le Combo démarre dès que vous obtenez Bien ou mieux deux fois de suite ; ensuite, chaque coup ajoute 1 au Combo et rapporte « points de base + Combo × 5 ». Un Raté remet le Combo à 0.",
  },
  faqGuestbook: {
    ko: "방명록은 누구나 글을 남길 수 있고, 비밀번호를 설정하면 나중에 수정/삭제할 수 있어요. 답글도 남길 수 있습니다.",
    en: "Anyone can post to the guestbook, and setting a password lets you edit or delete your post later. Replies are supported too.",
    zh: "留言板任何人都可以留言，设置密码后可在之后修改或删除留言，也支持回复。",
    vi: "Ai cũng có thể để lại lời nhắn trong sổ lưu bút, và nếu đặt mật khẩu bạn có thể sửa/xóa sau này. Cũng có thể trả lời bình luận.",
    ja: "ゲストブックは誰でも投稿でき、パスワードを設定しておけば後から編集・削除ができます。返信も可能です。",
    es: "Cualquiera puede escribir en el libro de visitas, y si defines una contraseña podrás editar o eliminar tu entrada más tarde. También se pueden dejar respuestas.",
    fr: "Tout le monde peut écrire dans le livre d'or ; en définissant un mot de passe, vous pourrez modifier ou supprimer votre message plus tard. Les réponses sont aussi possibles.",
  },
  faqInstall: {
    ko: "BDJ는 PWA(앱처럼 설치 가능한 웹앱)로 설치할 수 있어요. 시작 화면 하단에 플랫폼별 설치 가이드가 있습니다.",
    en: "BDJ can be installed as a PWA (a web app that installs like a native app). The start screen has an install guide for each platform at the bottom.",
    zh: "BDJ 可以作为 PWA（像应用一样安装的网页应用）安装。开始画面底部有各平台的安装指南。",
    vi: "BDJ có thể cài đặt dưới dạng PWA (ứng dụng web cài đặt như ứng dụng thật). Ở dưới màn hình khởi động có hướng dẫn cài đặt cho từng nền tảng.",
    ja: "BDJはPWA（アプリのようにインストールできるWebアプリ）としてインストールできます。スタート画面下部にプラットフォーム別のインストールガイドがあります。",
    es: "BDJ se puede instalar como PWA (una app web que se instala como una app nativa). En la parte inferior de la pantalla de inicio hay una guía de instalación por plataforma.",
    fr: "BDJ peut être installé en tant que PWA (une application web installable comme une app native). Un guide d'installation par plateforme se trouve en bas de l'écran d'accueil.",
  },
  faqAdmin: {
    ko: "관리자 모드는 사이트 운영자(임봉진님)만 접근할 수 있는 기능이라, 그 부분은 답해드리기 어려워요.",
    en: "Admin mode is only accessible to the site owner (Yim Bongjin), so I can't help with that part.",
    zh: "管理员模式只有网站运营者（林奉振先生）才能使用，这部分我无法为您解答。",
    vi: "Chế độ quản trị chỉ chủ trang web (Yim Bongjin) mới truy cập được, nên mình không thể hỗ trợ phần đó.",
    ja: "管理者モードはサイト運営者（イム・ボンジン氏）だけがアクセスできる機能のため、その部分についてはお答えできません。",
    es: "El modo administrador solo puede acceder al propietario del sitio (Yim Bongjin), así que no puedo ayudarte con esa parte.",
    fr: "Le mode administrateur n'est accessible qu'au propriétaire du site (Yim Bongjin), je ne peux donc pas répondre sur ce point.",
  },
  faqCredits: {
    ko: "Beejay(임봉진)님이 2026년에 제작한 게임이에요. YBJ 힙합 트랙 20곡도 전부 임봉진님의 오리지널 창작곡입니다.",
    en: "This game was made by Beejay (Yim Bongjin) in 2026. All 20 YBJ hip-hop tracks are his original compositions too.",
    zh: "这款游戏由 Beejay（林奉振）于 2026 年制作。YBJ 嘻哈的 20 首曲目也全部是他的原创作品。",
    vi: "Trò chơi này do Beejay (Yim Bongjin) sản xuất năm 2026. Cả 20 bài hip-hop YBJ cũng đều là sáng tác gốc của anh ấy.",
    ja: "このゲームはBeejay（イム・ボンジン）氏が2026年に制作しました。YBJヒップホップの20曲も全て氏のオリジナル楽曲です。",
    es: "Este juego fue creado por Beejay (Yim Bongjin) en 2026. Las 20 pistas de hip-hop YBJ también son composiciones originales suyas.",
    fr: "Ce jeu a été créé par Beejay (Yim Bongjin) en 2026. Les 20 morceaux de hip-hop YBJ sont aussi ses compositions originales.",
  },
  faqBeatmania: {
    ko: "beatmania IIDX 등 리듬게임에서 영감을 받아 만든 독자적인 팬 제작 게임이며, Konami나 beatmania IIDX와 공식 제휴 관계는 없어요.",
    en: "This is an independent fan-made game inspired by rhythm games like beatmania IIDX, with no official affiliation with Konami or beatmania IIDX.",
    zh: "本作是受 beatmania IIDX 等音乐游戏启发制作的独立同人游戏，与 Konami 或 beatmania IIDX 没有官方合作关系。",
    vi: "Đây là trò chơi fan-made độc lập lấy cảm hứng từ các game nhịp điệu như beatmania IIDX, không có liên kết chính thức với Konami hay beatmania IIDX.",
    ja: "beatmania IIDXなどのリズムゲームに影響を受けて作られた独自のファンメイドゲームであり、Konamiやbeatmania IIDXとの公式な提携関係はありません。",
    es: "Es un juego independiente hecho por fans, inspirado en juegos de ritmo como beatmania IIDX, sin afiliación oficial con Konami ni beatmania IIDX.",
    fr: "Il s'agit d'un jeu de fans indépendant inspiré de jeux de rythme comme beatmania IIDX, sans affiliation officielle avec Konami ou beatmania IIDX.",
  },
  faqMode: {
    ko: "지금은 Local FQA 모드(미리 준비된 고정 답변 모드)로 동작 중이에요. AI Gemini 모드는 무료 한도가 남아 있고 관리자가 AI 모드로 설정한 경우에 활성화됩니다. 현재 모드는 채팅창 상단에도 표시돼요.",
    en: "I'm currently running in Local FAQ Mode (fixed pre-written answers). AI Gemini Mode activates when there's free-tier quota left and the admin has it enabled. The current mode is also shown at the top of the chat panel.",
    zh: "目前正在以本地 FAQ 模式（预设固定答案）运行。当免费额度充足且管理员启用了 AI 模式时，会切换为 AI Gemini 模式。当前模式也会显示在聊天窗口顶部。",
    vi: "Hiện mình đang hoạt động ở chế độ FAQ nội bộ (câu trả lời cố định soạn sẵn). Chế độ AI Gemini sẽ kích hoạt khi còn hạn mức miễn phí và quản trị viên đã bật chế độ AI. Chế độ hiện tại cũng hiển thị ở đầu khung chat.",
    ja: "現在はローカルFAQモード（あらかじめ用意された固定回答）で動作しています。AI Geminiモードは無料枠が残っていて管理者がAIモードに設定している場合に有効になります。現在のモードはチャットパネル上部にも表示されます。",
    es: "Ahora mismo funciono en Modo FAQ local (respuestas fijas predefinidas). El Modo IA Gemini se activa cuando queda cuota gratuita y el administrador lo ha habilitado. El modo actual también se muestra en la parte superior del panel de chat.",
    fr: "Je fonctionne actuellement en mode FAQ local (réponses fixes préparées). Le mode IA Gemini s'active quand il reste du quota gratuit et que l'administrateur l'a activé. Le mode actuel est aussi affiché en haut du panneau de discussion.",
  },

  // --- Membership: login ---------------------------------------------------------------------------
  membershipLoginTitle: {
    ko: "BDJ Membership 로그인", en: "BDJ Membership Log in", zh: "BDJ Membership 登录", vi: "Đăng nhập BDJ Membership", ja: "BDJ Membership ログイン", es: "Iniciar sesión en BDJ Membership", fr: "Connexion BDJ Membership",
  },
  membershipLoginErrorMismatch: {
    ko: "이름 또는 비밀번호가 일치하지 않습니다",
    en: "Name or password doesn't match",
    zh: "姓名或密码不正确",
    vi: "Tên hoặc mật khẩu không đúng",
    ja: "名前またはパスワードが一致しません",
    es: "El nombre o la contraseña no coinciden",
    fr: "Le nom ou le mot de passe est incorrect",
  },
  membershipLoginErrorGeneric: {
    ko: "로그인에 실패했습니다. 잠시 후 다시 시도해주세요.",
    en: "Login failed. Please try again shortly.",
    zh: "登录失败，请稍后再试。",
    vi: "Đăng nhập thất bại. Vui lòng thử lại sau.",
    ja: "ログインに失敗しました。しばらくしてから再度お試しください。",
    es: "Error al iniciar sesión. Inténtalo de nuevo en un momento.",
    fr: "Échec de la connexion. Veuillez réessayer dans un instant.",
  },
  membershipLoginLoadingText: {
    ko: "로그인 중...", en: "Logging in...", zh: "登录中…", vi: "Đang đăng nhập...", ja: "ログイン中…", es: "Iniciando sesión...", fr: "Connexion en cours...",
  },
  membershipLogoutToast: {
    ko: "로그아웃되었습니다.", en: "You've been logged out.", zh: "已登出。", vi: "Đã đăng xuất.", ja: "ログアウトしました。", es: "Se ha cerrado la sesión.", fr: "Vous avez été déconnecté(e).",
  },

  // --- Membership: signup ---------------------------------------------------------------------------
  membershipSignupTitle: {
    ko: "BDJ Membership 가입", en: "BDJ Membership Sign up", zh: "BDJ Membership 注册", vi: "Đăng ký BDJ Membership", ja: "BDJ Membership 新規登録", es: "Registro en BDJ Membership", fr: "Inscription BDJ Membership",
  },
  membershipSignupNameLabel: {
    ko: "이름 (한글실명)", en: "Name (real Korean name)", zh: "姓名（韩文真实姓名）", vi: "Tên (tên thật bằng tiếng Hàn)", ja: "名前（韓国語の本名）", es: "Nombre (nombre real en coreano)", fr: "Nom (nom réel en coréen)",
  },
  membershipSignupOptionalHint: {
    ko: "선택항목을 입력하지 않으면 회원명부에서 해당 정보는 보이지 않습니다.",
    en: "If you leave an optional field blank, it simply won't be shown in the member directory.",
    zh: "如果不填写选填项，该信息将不会显示在会员名录中。",
    vi: "Nếu không nhập các mục tùy chọn, thông tin đó sẽ không hiển thị trong danh sách thành viên.",
    ja: "任意項目を入力しない場合、その情報は会員名簿に表示されません。",
    es: "Si dejas un campo opcional en blanco, simplemente no se mostrará en el directorio de miembros.",
    fr: "Si vous laissez un champ facultatif vide, il ne sera tout simplement pas affiché dans l'annuaire des membres.",
  },
  membershipSignupPhotoLabel: {
    ko: "📷 사진 등록 (선택)", en: "📷 Add photo (optional)", zh: "📷 上传照片（选填）", vi: "📷 Thêm ảnh (tùy chọn)", ja: "📷 写真登録（任意）", es: "📷 Añadir foto (opcional)", fr: "📷 Ajouter une photo (facultatif)",
  },
  membershipSignupGenderLabel: {
    ko: "성별 (필수)", en: "Gender (required)", zh: "性别（必填）", vi: "Giới tính (bắt buộc)", ja: "性別（必須）", es: "Sexo (obligatorio)", fr: "Sexe (obligatoire)",
  },
  genderMaleLabel: { ko: "남", en: "Male", zh: "男", vi: "Nam", ja: "男性", es: "Hombre", fr: "Homme" },
  genderFemaleLabel: { ko: "여", en: "Female", zh: "女", vi: "Nữ", ja: "女性", es: "Mujer", fr: "Femme" },
  membershipSignupBirthdateLabel: {
    ko: "생년월일 (선택)", en: "Birthdate (optional)", zh: "出生日期（选填）", vi: "Ngày sinh (tùy chọn)", ja: "生年月日（任意）", es: "Fecha de nacimiento (opcional)", fr: "Date de naissance (facultatif)",
  },
  membershipSignupPhoneLabel: {
    ko: "전화번호 (선택)", en: "Phone number (optional)", zh: "电话号码（选填）", vi: "Số điện thoại (tùy chọn)", ja: "電話番号（任意）", es: "Número de teléfono (opcional)", fr: "Numéro de téléphone (facultatif)",
  },
  membershipSignupEmailLabel: {
    ko: "Email (선택)", en: "Email (optional)", zh: "电子邮箱（选填）", vi: "Email (tùy chọn)", ja: "メール（任意）", es: "Correo electrónico (opcional)", fr: "E-mail (facultatif)",
  },
  membershipSignupErrorMissing: {
    ko: "이름과 비밀번호를 입력해주세요.", en: "Please enter your name and password.", zh: "请输入姓名和密码。", vi: "Vui lòng nhập tên và mật khẩu.", ja: "名前とパスワードを入力してください。", es: "Introduce tu nombre y contraseña.", fr: "Veuillez saisir votre nom et votre mot de passe.",
  },
  membershipSignupErrorNameNotKorean: {
    ko: "이름은 한글로만 입력해주세요.", en: "Please enter your name using Korean characters only.", zh: "姓名请仅使用韩文字符输入。", vi: "Vui lòng nhập tên chỉ bằng ký tự tiếng Hàn.", ja: "名前はハングルのみで入力してください。", es: "Introduce el nombre solo con caracteres coreanos.", fr: "Veuillez saisir le nom uniquement en caractères coréens.",
  },
  membershipSignupErrorPasswordDigitsOnly: {
    ko: "비밀번호는 숫자로만 입력해주세요.", en: "Please use digits only for the password.", zh: "密码请仅使用数字。", vi: "Vui lòng chỉ nhập số cho mật khẩu.", ja: "パスワードは数字のみで入力してください。", es: "Usa solo números en la contraseña.", fr: "Veuillez saisir uniquement des chiffres pour le mot de passe.",
  },
  membershipSignupErrorPasswordMismatch: {
    ko: "비밀번호가 서로 일치하지 않습니다.", en: "The passwords don't match.", zh: "两次输入的密码不一致。", vi: "Mật khẩu không khớp nhau.", ja: "パスワードが一致しません。", es: "Las contraseñas no coinciden.", fr: "Les mots de passe ne correspondent pas.",
  },
  membershipSignupErrorGenderRequired: {
    ko: "성별을 선택해주세요.", en: "Please select a gender.", zh: "请选择性别。", vi: "Vui lòng chọn giới tính.", ja: "性別を選択してください。", es: "Selecciona un sexo.", fr: "Veuillez sélectionner un sexe.",
  },
  membershipSignupLoadingText: {
    ko: "가입 처리 중...", en: "Signing up...", zh: "注册处理中…", vi: "Đang xử lý đăng ký...", ja: "登録処理中…", es: "Procesando registro...", fr: "Inscription en cours...",
  },
  membershipSignupErrorNameTaken: {
    ko: "이미 사용 중인 이름입니다. 다른 이름을 입력해주세요.",
    en: "That name is already taken. Please choose a different one.",
    zh: "该姓名已被使用，请输入其他姓名。",
    vi: "Tên này đã được sử dụng. Vui lòng nhập tên khác.",
    ja: "その名前はすでに使用されています。別の名前を入力してください。",
    es: "Ese nombre ya está en uso. Elige otro.",
    fr: "Ce nom est déjà utilisé. Veuillez en choisir un autre.",
  },
  membershipSignupErrorGeneric: {
    ko: "가입에 실패했습니다. 잠시 후 다시 시도해주세요.",
    en: "Sign-up failed. Please try again shortly.",
    zh: "注册失败，请稍后再试。",
    vi: "Đăng ký thất bại. Vui lòng thử lại sau.",
    ja: "登録に失敗しました。しばらくしてから再度お試しください。",
    es: "Error al registrarse. Inténtalo de nuevo en un momento.",
    fr: "Échec de l'inscription. Veuillez réessayer dans un instant.",
  },

  // --- Membership: profile ---------------------------------------------------------------------------
  membershipProfileTitle: { ko: "내 정보", en: "My Info", zh: "我的信息", vi: "Thông tin của tôi", ja: "マイページ", es: "Mi información", fr: "Mes informations" },
  membershipProfilePhotoLabel: {
    ko: "📷 사진 변경", en: "📷 Change photo", zh: "📷 更换照片", vi: "📷 Đổi ảnh", ja: "📷 写真変更", es: "📷 Cambiar foto", fr: "📷 Changer la photo",
  },
  membershipProfileNewPasswordLabel: {
    ko: "새 비밀번호 (선택, 변경 시에만 입력)",
    en: "New password (optional — only if changing)",
    zh: "新密码（选填，仅在需要修改时填写）",
    vi: "Mật khẩu mới (tùy chọn — chỉ nhập nếu muốn đổi)",
    ja: "新しいパスワード（任意・変更する場合のみ入力）",
    es: "Nueva contraseña (opcional, solo si vas a cambiarla)",
    fr: "Nouveau mot de passe (facultatif, à saisir uniquement pour le modifier)",
  },
  membershipProfileCurrentPasswordLabel: {
    ko: "현재 비밀번호 (저장하려면 입력)",
    en: "Current password (required to save)",
    zh: "当前密码（保存需填写）",
    vi: "Mật khẩu hiện tại (nhập để lưu)",
    ja: "現在のパスワード（保存するには入力）",
    es: "Contraseña actual (necesaria para guardar)",
    fr: "Mot de passe actuel (requis pour enregistrer)",
  },
  membershipProfileSuccessMsg: {
    ko: "변경 적용이 되었습니다.", en: "Your changes have been saved.", zh: "更改已生效。", vi: "Đã áp dụng thay đổi.", ja: "変更が適用されました。", es: "Los cambios se han aplicado.", fr: "Les modifications ont été appliquées.",
  },
  membershipProfileCancelBtn: {
    ko: "취소/종료", en: "Cancel / Close", zh: "取消/关闭", vi: "Hủy/Đóng", ja: "キャンセル/閉じる", es: "Cancelar/Cerrar", fr: "Annuler/Fermer",
  },
  membershipProfileWithdrawBtn: {
    ko: "회원 탈퇴", en: "Delete account", zh: "注销账户", vi: "Hủy tài khoản", ja: "退会する", es: "Eliminar cuenta", fr: "Supprimer le compte",
  },
  membershipProfileErrorPwRequired: {
    ko: "비밀번호를 입력해주세요.", en: "Please enter your password.", zh: "请输入密码。", vi: "Vui lòng nhập mật khẩu.", ja: "パスワードを入力してください。", es: "Introduce tu contraseña.", fr: "Veuillez saisir votre mot de passe.",
  },
  membershipProfileErrorNewPwDigitsOnly: {
    ko: "새 비밀번호는 숫자로만 입력해주세요.", en: "The new password must be digits only.", zh: "新密码请仅使用数字。", vi: "Mật khẩu mới chỉ được nhập số.", ja: "新しいパスワードは数字のみで入力してください。", es: "La nueva contraseña debe tener solo números.", fr: "Le nouveau mot de passe ne doit contenir que des chiffres.",
  },
  membershipProfileLoadingText: {
    ko: "저장 중...", en: "Saving...", zh: "保存中…", vi: "Đang lưu...", ja: "保存中…", es: "Guardando...", fr: "Enregistrement...",
  },
  membershipProfileErrorPwMismatch: {
    ko: "비밀번호가 일치하지 않습니다.", en: "The password doesn't match.", zh: "密码不正确。", vi: "Mật khẩu không đúng.", ja: "パスワードが一致しません。", es: "La contraseña no coincide.", fr: "Le mot de passe est incorrect.",
  },
  membershipProfileErrorSaveFailed: {
    ko: "수정에 실패했습니다: {msg}", en: "Update failed: {msg}", zh: "修改失败：{msg}", vi: "Cập nhật thất bại: {msg}", ja: "更新に失敗しました：{msg}", es: "Error al actualizar: {msg}", fr: "Échec de la mise à jour : {msg}",
  },
  membershipProfileWithdrawConfirm: {
    ko: "정말 탈퇴하시겠습니까? 이 작업은 되돌릴 수 없습니다.",
    en: "Are you sure you want to delete your account? This cannot be undone.",
    zh: "确定要注销账户吗？此操作无法撤销。",
    vi: "Bạn có chắc muốn hủy tài khoản? Thao tác này không thể hoàn tác.",
    ja: "本当に退会しますか？この操作は取り消せません。",
    es: "¿Seguro que quieres eliminar tu cuenta? Esta acción no se puede deshacer.",
    fr: "Voulez-vous vraiment supprimer votre compte ? Cette action est irréversible.",
  },
  membershipWithdrawToast: {
    ko: "탈퇴가 완료되었습니다.", en: "Your account has been deleted.", zh: "已完成注销。", vi: "Đã hủy tài khoản.", ja: "退会が完了しました。", es: "Cuenta eliminada correctamente.", fr: "Le compte a été supprimé.",
  },
  membershipWithdrawErrorTemplate: {
    ko: "탈퇴에 실패했습니다: {msg}", en: "Account deletion failed: {msg}", zh: "注销失败：{msg}", vi: "Hủy tài khoản thất bại: {msg}", ja: "退会に失敗しました：{msg}", es: "Error al eliminar la cuenta: {msg}", fr: "Échec de la suppression du compte : {msg}",
  },
  photoLightboxDefaultAlt: {
    ko: "Best 20 기념 사진", en: "Best 20 celebration photo", zh: "Best 20 纪念照片", vi: "Ảnh kỷ niệm Best 20", ja: "Best 20 記念写真", es: "Foto conmemorativa Best 20", fr: "Photo souvenir Best 20",
  },
  photoLightboxProfileAlt: {
    ko: "{name} 프로필 사진", en: "{name}'s profile photo", zh: "{name}的头像", vi: "Ảnh đại diện của {name}", ja: "{name}のプロフィール写真", es: "Foto de perfil de {name}", fr: "Photo de profil de {name}",
  },
  photoLightboxDownloadBtn: {
    ko: "⬇ Download", en: "⬇ Download", zh: "⬇ 下载", vi: "⬇ Tải xuống", ja: "⬇ ダウンロード", es: "⬇ Descargar", fr: "⬇ Télécharger",
  },

  // --- Guestbook overlay --------------------------------------------------------------------------
  guestbookOverlayTitle: {
    ko: "Beejay Crews Feed", en: "Beejay Crews Feed", zh: "Beejay 团员动态", vi: "Bảng tin Crew của Beejay", ja: "Beejay クルーフィード", es: "Feed del Crew de Beejay", fr: "Fil du Crew Beejay",
  },
  guestbookMessagePlaceholder: {
    ko: "메세지를 남겨주세요", en: "Leave a message", zh: "请留下您的留言", vi: "Hãy để lại lời nhắn", ja: "メッセージを残してください", es: "Deja un mensaje", fr: "Laissez un message",
  },
  guestbookAttachmentLabel: {
    ko: "📎 파일첨부", en: "📎 Attach file", zh: "📎 添加附件", vi: "📎 Đính kèm tệp", ja: "📎 ファイル添付", es: "📎 Adjuntar archivo", fr: "📎 Joindre un fichier",
  },
  guestbookEditAttachmentLabel: {
    ko: "📎 사진/동영상 변경", en: "📎 Change photo/video", zh: "📎 更换照片/视频", vi: "📎 Đổi ảnh/video", ja: "📎 写真/動画を変更", es: "📎 Cambiar foto/vídeo", fr: "📎 Changer la photo/vidéo",
  },
  guestbookEmptyMsg: {
    ko: "아직 방명록이 없습니다 — 첫 글을 남겨보세요!",
    en: "No guestbook entries yet — be the first to write one!",
    zh: "还没有留言 — 快来写下第一条吧！",
    vi: "Chưa có lời nhắn nào — hãy là người đầu tiên viết!",
    ja: "まだゲストブックの投稿がありません — 最初の投稿をしてみましょう！",
    es: "Aún no hay entradas — ¡sé el primero en escribir una!",
    fr: "Aucune entrée pour l'instant — soyez le premier à en écrire une !",
  },
  guestbookHeartOnTitle: { ko: "하트 취소", en: "Remove heart", zh: "取消点赞", vi: "Bỏ tim", ja: "ハート取消", es: "Quitar corazón", fr: "Retirer le cœur" },
  guestbookHeartOffTitle: { ko: "하트", en: "Heart", zh: "点赞", vi: "Thả tim", ja: "ハート", es: "Corazón", fr: "Cœur" },
  guestbookReplyBtn: { ko: "답글쓰기", en: "Reply", zh: "回复", vi: "Trả lời", ja: "返信する", es: "Responder", fr: "Répondre" },
  guestbookReplyPlaceholder: {
    ko: "답글을 남겨주세요", en: "Leave a reply", zh: "请输入回复内容", vi: "Hãy để lại câu trả lời", ja: "返信を入力してください", es: "Deja una respuesta", fr: "Laissez une réponse",
  },
  guestbookReplyPasswordPlaceholder: {
    ko: "비밀번호 (수정/삭제용)", en: "Password (for editing/deleting)", zh: "密码（用于修改/删除）", vi: "Mật khẩu (để sửa/xóa)", ja: "パスワード（編集/削除用）", es: "Contraseña (para editar/eliminar)", fr: "Mot de passe (pour modifier/supprimer)",
  },
  guestbookAttachmentUnsupported: {
    ko: "지원하지 않는 파일 형식입니다: {name}", en: "Unsupported file type: {name}", zh: "不支持的文件格式：{name}", vi: "Định dạng tệp không được hỗ trợ: {name}", ja: "対応していないファイル形式です：{name}", es: "Formato de archivo no compatible: {name}", fr: "Format de fichier non pris en charge : {name}",
  },
  guestbookAttachmentTooLarge: {
    ko: "파일이 너무 큽니다 (최대 {mb}MB): {name}", en: "File is too large (max {mb}MB): {name}", zh: "文件过大（最大 {mb}MB）：{name}", vi: "Tệp quá lớn (tối đa {mb}MB): {name}", ja: "ファイルが大きすぎます（最大{mb}MB）：{name}", es: "El archivo es demasiado grande (máx. {mb}MB): {name}", fr: "Fichier trop volumineux (max {mb} Mo) : {name}",
  },
  guestbookAddToast: {
    ko: "등록이 완료되었습니다.", en: "Your post has been added.", zh: "留言已发布。", vi: "Đã đăng thành công.", ja: "投稿が完了しました。", es: "Publicación añadida.", fr: "Message publié.",
  },
  guestbookSaveNoPwAlert: {
    ko: "비밀번호가 일치하여야 수정이 가능합니다.", en: "The password must match before you can save changes.", zh: "密码正确后才能修改。", vi: "Mật khẩu phải khớp thì mới sửa được.", ja: "パスワードが一致しないと修正できません。", es: "La contraseña debe coincidir para poder guardar los cambios.", fr: "Le mot de passe doit correspondre pour pouvoir enregistrer les modifications.",
  },
  guestbookErrorNoPwEdit: {
    ko: "비밀번호 없이 등록된 글은 수정할 수 없습니다", en: "Posts made without a password can't be edited", zh: "未设置密码的留言无法修改", vi: "Bài viết không có mật khẩu thì không thể sửa", ja: "パスワードなしで投稿された内容は編集できません", es: "Las entradas sin contraseña no se pueden editar", fr: "Les messages publiés sans mot de passe ne peuvent pas être modifiés",
  },
  guestbookErrorMemberExpired: {
    ko: "회원 인증이 만료되었습니다. 다시 로그인해주세요.", en: "Your member session has expired. Please log in again.", zh: "会员认证已过期，请重新登录。", vi: "Phiên đăng nhập thành viên đã hết hạn. Vui lòng đăng nhập lại.", ja: "会員認証の有効期限が切れました。再度ログインしてください。", es: "Tu sesión de miembro ha caducado. Inicia sesión de nuevo.", fr: "Votre session de membre a expiré. Veuillez vous reconnecter.",
  },
  guestbookErrorNoPwDelete: {
    ko: "비밀번호 없이 등록된 글은 삭제할 수 없습니다", en: "Posts made without a password can't be deleted", zh: "未设置密码的留言无法删除", vi: "Bài viết không có mật khẩu thì không thể xóa", ja: "パスワードなしで投稿された内容は削除できません", es: "Las entradas sin contraseña no se pueden eliminar", fr: "Les messages publiés sans mot de passe ne peuvent pas être supprimés",
  },
  genericRetryError: {
    ko: "처리 중 오류가 발생했습니다. 다시 시도해주세요.", en: "Something went wrong. Please try again.", zh: "处理时发生错误，请重试。", vi: "Đã xảy ra lỗi. Vui lòng thử lại.", ja: "処理中にエラーが発生しました。もう一度お試しください。", es: "Ha ocurrido un error. Inténtalo de nuevo.", fr: "Une erreur est survenue. Veuillez réessayer.",
  },
  toastDeleted: {
    ko: "삭제가 완료되었습니다.", en: "Deleted successfully.", zh: "已删除。", vi: "Đã xóa thành công.", ja: "削除が完了しました。", es: "Eliminado correctamente.", fr: "Suppression effectuée.",
  },
  toastUpdated: {
    ko: "수정이 완료되었습니다.", en: "Updated successfully.", zh: "已修改。", vi: "Đã cập nhật thành công.", ja: "修正が完了しました。", es: "Actualizado correctamente.", fr: "Modification effectuée.",
  },
  guestbookDeleteAlertError: {
    ko: "삭제 처리 중 오류가 발생했습니다. 다시 시도해주세요.", en: "Something went wrong while deleting. Please try again.", zh: "删除时发生错误，请重试。", vi: "Đã xảy ra lỗi khi xóa. Vui lòng thử lại.", ja: "削除処理中にエラーが発生しました。もう一度お試しください。", es: "Ha ocurrido un error al eliminar. Inténtalo de nuevo.", fr: "Une erreur est survenue lors de la suppression. Veuillez réessayer.",
  },
  guestbookReplyToast: {
    ko: "답글이 등록되었습니다.", en: "Your reply has been posted.", zh: "回复已发布。", vi: "Đã đăng câu trả lời.", ja: "返信が投稿されました。", es: "Respuesta publicada.", fr: "Réponse publiée.",
  },
  guestbookReplyAlertError: {
    ko: "답글 등록 중 오류가 발생했습니다. 다시 시도해주세요.", en: "Something went wrong while posting your reply. Please try again.", zh: "发布回复时发生错误，请重试。", vi: "Đã xảy ra lỗi khi đăng câu trả lời. Vui lòng thử lại.", ja: "返信の投稿中にエラーが発生しました。もう一度お試しください。", es: "Ha ocurrido un error al publicar la respuesta. Inténtalo de nuevo.", fr: "Une erreur est survenue lors de la publication de la réponse. Veuillez réessayer.",
  },
  guestbookScrollTopTitle: {
    ko: "맨 위로 이동", en: "Scroll to top", zh: "回到顶部", vi: "Lên đầu trang", ja: "先頭に戻る", es: "Ir arriba", fr: "Retour en haut",
  },
  guestbookAttachmentAlt: {
    ko: "{name} 첨부 사진", en: "Attachment from {name}", zh: "{name}的附件图片", vi: "Ảnh đính kèm của {name}", ja: "{name}の添付写真", es: "Adjunto de {name}", fr: "Pièce jointe de {name}",
  },

  // --- Generic shared UI labels --------------------------------------------------------------------
  btnSave: { ko: "저장", en: "Save", zh: "保存", vi: "Lưu", ja: "保存", es: "Guardar", fr: "Enregistrer" },
  btnCancel: { ko: "취소", en: "Cancel", zh: "取消", vi: "Hủy", ja: "キャンセル", es: "Cancelar", fr: "Annuler" },
  btnCloseX: { ko: "✕ 닫기", en: "✕ Close", zh: "✕ 关闭", vi: "✕ Đóng", ja: "✕ 閉じる", es: "✕ Cerrar", fr: "✕ Fermer" },
  btnConfirmDelete: { ko: "삭제 확인", en: "Confirm delete", zh: "确认删除", vi: "Xác nhận xóa", ja: "削除確定", es: "Confirmar eliminación", fr: "Confirmer la suppression" },
  btnRegister: { ko: "등록", en: "Submit", zh: "提交", vi: "Đăng", ja: "登録", es: "Enviar", fr: "Valider" },
  pwMismatchError: {
    ko: "비밀번호가 일치하지 않습니다", en: "The password doesn't match", zh: "密码不正确", vi: "Mật khẩu không đúng", ja: "パスワードが一致しません", es: "La contraseña no coincide", fr: "Le mot de passe est incorrect",
  },
  btnEdit: { ko: "수정", en: "Edit", zh: "修改", vi: "Sửa", ja: "編集", es: "Editar", fr: "Modifier" },
  btnDelete: { ko: "삭제", en: "Delete", zh: "删除", vi: "Xóa", ja: "削除", es: "Eliminar", fr: "Supprimer" },
  deletingText: { ko: "삭제 중...", en: "Deleting...", zh: "删除中…", vi: "Đang xóa...", ja: "削除中…", es: "Eliminando...", fr: "Suppression..." },
  registeringText: { ko: "등록 중...", en: "Submitting...", zh: "提交中…", vi: "Đang đăng...", ja: "登録中…", es: "Enviando...", fr: "Envoi en cours..." },
  namePlaceholder: { ko: "이름", en: "Name", zh: "姓名", vi: "Tên", ja: "名前", es: "Nombre", fr: "Nom" },
  passwordPlaceholder: { ko: "비밀번호", en: "Password", zh: "密码", vi: "Mật khẩu", ja: "パスワード", es: "Contraseña", fr: "Mot de passe" },
  guestbookMainPasswordPlaceholder: {
    ko: "비밀번호 (선택-수정/삭제 목적)", en: "Password (optional — to edit/delete)", zh: "密码（选填，用于修改/删除）", vi: "Mật khẩu (tùy chọn — để sửa/xóa)", ja: "パスワード（任意・編集/削除用）", es: "Contraseña (opcional, para editar/eliminar)", fr: "Mot de passe (facultatif, pour modifier/supprimer)",
  },

  // --- Members Directory (Crews) --------------------------------------------------------------------
  crewsDirectoryTitle: { ko: "BDJ Crews", en: "BDJ Crews", zh: "BDJ 团员", vi: "BDJ Crews", ja: "BDJ クルー", es: "BDJ Crew", fr: "BDJ Crew" },
  crewsRefreshBtnTitle: {
    ko: "접속현황 새로고침", en: "Refresh online status", zh: "刷新在线状态", vi: "Làm mới trạng thái trực tuyến", ja: "接続状況を更新", es: "Actualizar estado de conexión", fr: "Actualiser le statut de connexion",
  },
  crewsHeaderNo: { ko: "번호", en: "No.", zh: "编号", vi: "STT", ja: "番号", es: "N.º", fr: "N°" },
  crewsHeaderGender: { ko: "성별", en: "Gender", zh: "性别", vi: "Giới tính", ja: "性別", es: "Sexo", fr: "Sexe" },
  crewsHeaderBirthdate: { ko: "생년월일", en: "Birthdate", zh: "出生日期", vi: "Ngày sinh", ja: "生年月日", es: "Fecha de nacimiento", fr: "Date de naissance" },
  crewsHeaderPhone: { ko: "전화번호", en: "Phone", zh: "电话号码", vi: "Số điện thoại", ja: "電話番号", es: "Teléfono", fr: "Téléphone" },
  crewsHeaderEmail: { ko: "이메일", en: "Email", zh: "电子邮箱", vi: "Email", ja: "メール", es: "Correo", fr: "E-mail" },
  crewsHeaderJoinDate: { ko: "가입일", en: "Joined", zh: "加入日期", vi: "Ngày tham gia", ja: "登録日", es: "Fecha de alta", fr: "Inscription" },
  crewsHeaderOnlineStatus: { ko: "접속현황", en: "Online status", zh: "在线状态", vi: "Trạng thái trực tuyến", ja: "接続状況", es: "Estado de conexión", fr: "Statut de connexion" },
  crewsOnlineNow: { ko: "🟢 접속중", en: "🟢 Online", zh: "🟢 在线", vi: "🟢 Đang trực tuyến", ja: "🟢 接続中", es: "🟢 Conectado", fr: "🟢 Connecté" },
  crewsOfflineNow: { ko: "⚪ -", en: "⚪ -", zh: "⚪ -", vi: "⚪ -", ja: "⚪ -", es: "⚪ -", fr: "⚪ -" },
  crewsRefreshingText: {
    ko: "🔄 새로고침 중...", en: "🔄 Refreshing...", zh: "🔄 刷新中…", vi: "🔄 Đang làm mới...", ja: "🔄 更新中…", es: "🔄 Actualizando...", fr: "🔄 Actualisation...",
  },
  crewsLoadingRow: { ko: "불러오는 중...", en: "Loading...", zh: "加载中…", vi: "Đang tải...", ja: "読み込み中…", es: "Cargando...", fr: "Chargement..." },
  crewsLoginRequiredRow: {
    ko: "로그인한 회원만 볼 수 있습니다.", en: "Only logged-in members can view this.", zh: "仅登录会员可查看。", vi: "Chỉ thành viên đã đăng nhập mới xem được.", ja: "ログインした会員のみ閲覧できます。", es: "Solo los miembros con sesión iniciada pueden verlo.", fr: "Réservé aux membres connectés.",
  },
  crewsLoadFailedRow: {
    ko: "명부를 불러오지 못했습니다.", en: "Couldn't load the member directory.", zh: "无法加载会员名录。", vi: "Không thể tải danh sách thành viên.", ja: "名簿を読み込めませんでした。", es: "No se pudo cargar el directorio de miembros.", fr: "Impossible de charger l'annuaire des membres.",
  },
  crewsEmptyRow: {
    ko: "아직 가입한 회원이 없습니다.", en: "No members have signed up yet.", zh: "暂无注册会员。", vi: "Chưa có thành viên nào đăng ký.", ja: "まだ登録した会員がいません。", es: "Aún no se ha registrado ningún miembro.", fr: "Aucun membre inscrit pour l'instant.",
  },

  // --- Direct chat ------------------------------------------------------------------------------------
  directChatEmptyMsg: {
    ko: "아직 대화가 없습니다. 첫 메시지를 보내보세요!", en: "No messages yet. Send the first one!", zh: "还没有对话，快发送第一条消息吧！", vi: "Chưa có tin nhắn nào. Hãy gửi tin nhắn đầu tiên!", ja: "まだ会話がありません。最初のメッセージを送ってみましょう！", es: "Aún no hay mensajes. ¡Envía el primero!", fr: "Aucun message pour l'instant. Envoyez le premier !",
  },
  directChatLoadFailedMsg: {
    ko: "대화를 불러오지 못했습니다.", en: "Couldn't load the conversation.", zh: "无法加载对话。", vi: "Không thể tải cuộc trò chuyện.", ja: "会話を読み込めませんでした。", es: "No se pudo cargar la conversación.", fr: "Impossible de charger la conversation.",
  },
  directChatInputPlaceholder: {
    ko: "메시지 입력...", en: "Type a message...", zh: "输入消息…", vi: "Nhập tin nhắn...", ja: "メッセージを入力…", es: "Escribe un mensaje...", fr: "Saisissez un message...",
  },
  directChatSendingText: {
    ko: "전송 중...", en: "Sending...", zh: "发送中…", vi: "Đang gửi...", ja: "送信中…", es: "Enviando...", fr: "Envoi en cours...",
  },
  directChatSendFailedAlert: {
    ko: "메시지 전송에 실패했습니다.", en: "Failed to send the message.", zh: "消息发送失败。", vi: "Gửi tin nhắn thất bại.", ja: "メッセージの送信に失敗しました。", es: "Error al enviar el mensaje.", fr: "Échec de l'envoi du message.",
  },
  directChatTitleTemplate: {
    ko: "{name}님과의 대화", en: "Chat with {name}", zh: "与{name}的对话", vi: "Trò chuyện với {name}", ja: "{name}さんとの会話", es: "Chat con {name}", fr: "Discussion avec {name}",
  },

  // --- Results / step setup / name entry / photo / calibration ----------------------------------------
  resultsTitle: { ko: "RESULT", en: "RESULT", zh: "结果", vi: "KẾT QUẢ", ja: "リザルト", es: "RESULTADO", fr: "RÉSULTAT" },
  resultsScoreLabel: {
    ko: "TOTAL SCORE", en: "TOTAL SCORE", zh: "总分", vi: "TỔNG ĐIỂM", ja: "合計スコア", es: "PUNTUACIÓN TOTAL", fr: "SCORE TOTAL",
  },
  // "STEP"/"Step" is translated for zh/fr only, per the owner's explicit scoping — ko/en/vi/ja/es
  // keep the original English "STEP" wording.
  resultsNextStepBtn: {
    ko: "다음 Step 진행", en: "Continue to next Step", zh: "进入下一阶段", vi: "Tiếp tục Step sau", ja: "次のStepへ進む", es: "Continuar al siguiente Step", fr: "Passer à l'étape suivante",
  },
  resultsConfirmBtnContinue: {
    ko: "종료하고 순위 확인", en: "Finish and check ranking", zh: "结束并查看排名", vi: "Kết thúc và xem thứ hạng", ja: "終了して順位を確認", es: "Terminar y ver clasificación", fr: "Terminer et voir le classement",
  },
  resultsConfirmBtnFinal: { ko: "확인", en: "OK", zh: "确定", vi: "Xác nhận", ja: "確認", es: "Aceptar", fr: "OK" },
  resultsStepCompleteTemplate: {
    ko: "STEP {n} 완료", en: "STEP {n} Complete", zh: "第 {n} 阶段完成", vi: "Hoàn thành STEP {n}", ja: "STEP {n} 完了", es: "STEP {n} completado", fr: "Étape {n} terminée",
  },
  resultsBreakdownLabel: {
    ko: "이번 STEP 점수", en: "This STEP's score", zh: "本阶段得分", vi: "Điểm STEP này", ja: "今回のSTEPスコア", es: "Puntos de este STEP", fr: "Score de cette étape",
  },
  stepSetupTitleTemplate: { ko: "STEP {n} 준비", en: "STEP {n} Setup", zh: "第 {n} 阶段准备", vi: "Chuẩn bị STEP {n}", ja: "STEP {n} 準備", es: "Preparación STEP {n}", fr: "Préparation de l'étape {n}" },
  stepSetupHint: {
    ko: "속도 또는 난이도 중 하나는 반드시 이전 단계보다 높아야 진행할 수 있습니다.",
    en: "Either the speed or the difficulty must be higher than the previous step to proceed.",
    zh: "速度或难度中必须有一项高于上一阶段才能继续。",
    vi: "Tốc độ hoặc độ khó phải cao hơn bước trước thì mới có thể tiếp tục.",
    ja: "速度または難易度のどちらかが前のステップより高くないと進めません。",
    es: "La velocidad o la dificultad debe ser mayor que en el paso anterior para continuar.",
    fr: "La vitesse ou la difficulté doit être supérieure à l'étape précédente pour continuer.",
  },
  stepSetupWarning: {
    ko: "속도 또는 난이도 중 하나는 반드시 이전 단계보다 높아야 합니다.",
    en: "Either the speed or the difficulty must be higher than the previous step.",
    zh: "速度或难度中必须有一项高于上一阶段。",
    vi: "Tốc độ hoặc độ khó phải cao hơn bước trước.",
    ja: "速度または難易度のどちらかが前のステップより高くなければなりません。",
    es: "La velocidad o la dificultad debe ser mayor que en el paso anterior.",
    fr: "La vitesse ou la difficulté doit être supérieure à l'étape précédente.",
  },
  stepStartBtn: { ko: "STEP 시작", en: "Start STEP", zh: "开始阶段", vi: "Bắt đầu STEP", ja: "STEP開始", es: "Iniciar STEP", fr: "Démarrer l'étape" },
  nameEntryTitle: {
    ko: "TOP 20 진입!", en: "You made TOP 20!", zh: "进入前 20 名！", vi: "Lọt vào TOP 20!", ja: "TOP 20入り！", es: "¡Entraste al TOP 20!", fr: "Vous êtes parmi les 20 meilleurs !",
  },
  nameEntryDesc: {
    ko: "이름과 메세지를 남겨주세요", en: "Please leave your name and a message", zh: "请留下您的姓名和留言", vi: "Vui lòng để lại tên và lời nhắn", ja: "お名前とメッセージを入力してください", es: "Deja tu nombre y un mensaje", fr: "Laissez votre nom et un message",
  },
  nameEntryMessagePlaceholder: {
    ko: "한마디 메세지", en: "A short message", zh: "留下一句话", vi: "Một lời nhắn ngắn", ja: "一言メッセージ", es: "Un mensaje corto", fr: "Un petit mot",
  },
  photoCountdownRankTemplate: {
    ko: "{rank}위 입성을 축하합니다! 기념촬영을 하겠습니다.",
    en: "Congratulations on reaching #{rank}! Let's take a commemorative photo.",
    zh: "恭喜您获得第 {rank} 名！让我们拍张纪念照吧。",
    vi: "Chúc mừng bạn đạt hạng {rank}! Hãy cùng chụp ảnh kỷ niệm nhé.",
    ja: "{rank}位入りおめでとうございます！記念撮影をします。",
    es: "¡Felicidades por llegar al puesto {rank}! Vamos a tomar una foto conmemorativa.",
    fr: "Félicitations pour votre {rank}ᵉ place ! Prenons une photo souvenir.",
  },
  photoCountdownPoseMsg: {
    ko: "DJ의 자세를 잡아주세요", en: "Strike your best DJ pose", zh: "请摆出 DJ 的姿势", vi: "Hãy tạo dáng như một DJ", ja: "DJのポーズを決めてください", es: "Ponte en pose de DJ", fr: "Prenez la pose du DJ",
  },
  guestStepLimitAlert: {
    ko: "Guest 신분으로는 STEP 2로 넘어갈 수 없습니다.\n-Beejay-",
    en: "Guests can't advance to STEP 2.\n-Beejay-",
    zh: "以游客身份无法进入第 2 阶段。\n-Beejay-",
    vi: "Khách không thể tiến vào STEP 2.\n-Beejay-",
    ja: "ゲストの状態ではSTEP 2に進めません。\n-Beejay-",
    es: "Los invitados no pueden avanzar al STEP 2.\n-Beejay-",
    fr: "Les invités ne peuvent pas passer à l'étape 2.\n-Beejay-",
  },
  stopBtnLabel: { ko: "⏹ 종료", en: "⏹ Stop", zh: "⏹ 结束", vi: "⏹ Dừng", ja: "⏹ 終了", es: "⏹ Detener", fr: "⏹ Arrêter" },

  // --- In-game HUD / camera-loading status -------------------------------------------------------------
  hudCameraPermission: {
    ko: "카메라 권한을 요청하는 중...", en: "Requesting camera permission...", zh: "正在请求摄像头权限…", vi: "Đang yêu cầu quyền truy cập camera...", ja: "カメラの権限をリクエスト中…", es: "Solicitando permiso de cámara...", fr: "Demande d'autorisation de la caméra...",
  },
  hudCameraFailedTemplate: {
    ko: "카메라 접근 실패: {msg}", en: "Camera access failed: {msg}", zh: "摄像头访问失败：{msg}", vi: "Truy cập camera thất bại: {msg}", ja: "カメラアクセス失敗：{msg}", es: "Error al acceder a la cámara: {msg}", fr: "Échec de l'accès à la caméra : {msg}",
  },
  hudResourceLoadingTemplate: {
    ko: "리소스 로딩 중... (손 인식: {delegate})", en: "Loading resources... (hand tracking: {delegate})", zh: "正在加载资源…（手部识别：{delegate}）", vi: "Đang tải tài nguyên... (nhận diện tay: {delegate})", ja: "リソース読み込み中…（手認識：{delegate}）", es: "Cargando recursos... (seguimiento de manos: {delegate})", fr: "Chargement des ressources... (suivi des mains : {delegate})",
  },
  hudResourceFailedTemplate: {
    ko: "리소스 로딩 실패: {msg}", en: "Failed to load resources: {msg}", zh: "资源加载失败：{msg}", vi: "Tải tài nguyên thất bại: {msg}", ja: "リソース読み込み失敗：{msg}", es: "Error al cargar recursos: {msg}", fr: "Échec du chargement des ressources : {msg}",
  },
  hudStepLoadingChartTemplate: {
    ko: "STEP {n} 로딩 중... (음원 분석해서 채보 생성)",
    en: "Loading STEP {n}... (analyzing audio to generate the chart)",
    zh: "正在加载第 {n} 阶段…（分析音源以生成谱面）",
    vi: "Đang tải STEP {n}... (phân tích âm thanh để tạo bản phổ)",
    ja: "STEP {n} 読み込み中…（音源を解析して譜面を生成）",
    es: "Cargando STEP {n}... (analizando el audio para generar el mapa de notas)",
    fr: "Chargement de l'étape {n}... (analyse de l'audio pour générer la partition)",
  },
  hudStepLoadingTemplate: {
    ko: "STEP {n} 로딩 중...", en: "Loading STEP {n}...", zh: "正在加载第 {n} 阶段…", vi: "Đang tải STEP {n}...", ja: "STEP {n} 読み込み中…", es: "Cargando STEP {n}...", fr: "Chargement de l'étape {n}...",
  },
  hudChartFailedTemplate: {
    ko: "음원 처리 실패: {msg}", en: "Failed to process audio: {msg}", zh: "音源处理失败：{msg}", vi: "Xử lý âm thanh thất bại: {msg}", ja: "音源処理失敗：{msg}", es: "Error al procesar el audio: {msg}", fr: "Échec du traitement de l'audio : {msg}",
  },
  hudAudioLoadFailedTemplate: {
    ko: "음원 로드 실패: {msg}", en: "Failed to load audio: {msg}", zh: "音源加载失败：{msg}", vi: "Tải âm thanh thất bại: {msg}", ja: "音源読み込み失敗：{msg}", es: "Error al cargar el audio: {msg}", fr: "Échec du chargement de l'audio : {msg}",
  },
  hudStoppedMsg: { ko: "종료됨", en: "Stopped", zh: "已结束", vi: "Đã dừng", ja: "終了しました", es: "Detenido", fr: "Arrêté" },
  hudDetectErrorTemplate: {
    ko: "손 인식 오류 (프레임 {n}): {msg}", en: "Hand-tracking error (frame {n}): {msg}", zh: "手部识别错误（第 {n} 帧）：{msg}", vi: "Lỗi nhận diện tay (khung hình {n}): {msg}", ja: "手認識エラー（フレーム{n}）：{msg}", es: "Error de seguimiento de manos (fotograma {n}): {msg}", fr: "Erreur de suivi des mains (image {n}) : {msg}",
  },
  hudDebugFramesLabel: { ko: "프레임 수신", en: "Frames", zh: "帧数", vi: "Khung hình", ja: "フレーム受信", es: "Fotogramas", fr: "Images" },
  hudDebugHandsLabel: { ko: "감지된 손", en: "Hands detected", zh: "检测到的手", vi: "Tay phát hiện", ja: "検出された手", es: "Manos detectadas", fr: "Mains détectées" },
  hudDebugPressesLabel: { ko: "누름 횟수", en: "Presses", zh: "按压次数", vi: "Số lần nhấn", ja: "押下回数", es: "Pulsaciones", fr: "Appuis" },
  hudDebugScratchLabel: { ko: "스크래치", en: "Scratch", zh: "刮碟", vi: "Scratch", ja: "スクラッチ", es: "Scratch", fr: "Scratch" },
  // Remaining English terms in the in-game status readout — translated for zh/fr only, per the
  // owner's explicit scoping. ko/en/vi/ja/es keep the original raw English labels/API-state
  // values (Delegate/engaged/idle/running/suspended/closed), same as before this ever had a
  // translation key. GPU/CPU stay as-is everywhere — hardware acronyms, not words.
  hudDebugStepLabel: { ko: "STEP", en: "STEP", zh: "阶段", vi: "STEP", ja: "STEP", es: "STEP", fr: "Étape" },
  hudDebugDelegateLabel: { ko: "Delegate", en: "Delegate", zh: "处理器", vi: "Delegate", ja: "Delegate", es: "Delegate", fr: "Processeur" },
  scratchEngagedLabel: { ko: "engaged", en: "engaged", zh: "转动中", vi: "engaged", ja: "engaged", es: "engaged", fr: "actif" },
  scratchIdleLabel: { ko: "idle", en: "idle", zh: "空闲", vi: "idle", ja: "idle", es: "idle", fr: "inactif" },
  audioStateRunning: { ko: "running", en: "running", zh: "运行中", vi: "running", ja: "running", es: "running", fr: "en cours" },
  audioStateSuspended: { ko: "suspended", en: "suspended", zh: "已暂停", vi: "suspended", ja: "suspended", es: "suspended", fr: "suspendu" },
  audioStateClosed: { ko: "closed", en: "closed", zh: "已关闭", vi: "closed", ja: "closed", es: "closed", fr: "fermé" },

  // --- Judgment popups / combo (canvas-drawn during gameplay + results breakdown) ---------------------
  // Translated for zh/fr only, per the owner's explicit scoping — ko/en/vi/ja/es keep the original
  // English rhythm-game judgment terms (Excellent/Great/Good/Bad/Combo).
  judgeExcellent: { ko: "Excellent", en: "Excellent", zh: "完美", vi: "Excellent", ja: "Excellent", es: "Excellent", fr: "Excellent" },
  judgeGreat: { ko: "Great", en: "Great", zh: "很棒", vi: "Great", ja: "Great", es: "Great", fr: "Super" },
  judgeGood: { ko: "Good", en: "Good", zh: "不错", vi: "Good", ja: "Good", es: "Good", fr: "Bien" },
  judgeBad: { ko: "Bad", en: "Bad", zh: "失误", vi: "Bad", ja: "Bad", es: "Bad", fr: "Raté" },
  comboLabel: { ko: "Combo", en: "Combo", zh: "连击", vi: "Combo", ja: "Combo", es: "Combo", fr: "Combo" },

  // --- Score HUD / leaderboard Step column / footer credit / photo alt --------------------------------
  // All four translated for zh/fr only, per the owner's explicit scoping — ko/en/vi/ja/es keep the
  // exact original English wording these always showed (there was no per-language variant at all
  // before i18n existed).
  scoreHudLabel: { ko: "SCORE", en: "SCORE", zh: "分数", vi: "SCORE", ja: "SCORE", es: "SCORE", fr: "SCORE" },
  lbHeaderStep: { ko: "Step", en: "Step", zh: "阶段", vi: "Step", ja: "Step", es: "Step", fr: "Étape" },
  producedByCredit: {
    ko: "Produced by Beejay (Yim Bongjin) in 2026",
    en: "Produced by Beejay (Yim Bongjin) in 2026",
    zh: "由 Beejay（Yim Bongjin）于 2026 年制作",
    vi: "Produced by Beejay (Yim Bongjin) in 2026",
    ja: "Produced by Beejay (Yim Bongjin) in 2026",
    es: "Produced by Beejay (Yim Bongjin) in 2026",
    fr: "Produit par Beejay (Yim Bongjin) en 2026",
  },
  // This alt text had no per-language variant at all before i18n (a screen-reader-only string,
  // always the literal Korean text below regardless of selected language) — zh/fr get a real
  // translation per the owner's scoping, everyone else keeps that original literal text.
  photoLightboxAltText: {
    ko: "Best 20 기념 사진",
    en: "Best 20 기념 사진",
    zh: "前 20 名纪念照片",
    vi: "Best 20 기념 사진",
    ja: "Best 20 기념 사진",
    es: "Best 20 기념 사진",
    fr: "Photo souvenir des 20 meilleurs",
  },

  // --- Calibration ------------------------------------------------------------------------------------
  calibrationRestPromptTemplate: {
    ko: "왼손 5손가락을 편하게 펴서 보여주세요... {sec}",
    en: "Show your left hand's 5 fingers, relaxed and spread out... {sec}",
    zh: "请放松伸开左手的 5 根手指展示给摄像头… {sec}",
    vi: "Hãy xòe thoải mái 5 ngón tay trái ra... {sec}",
    ja: "左手の5本の指を楽に開いて見せてください… {sec}",
    es: "Muestra los 5 dedos de tu mano izquierda, relajados y extendidos... {sec}",
    fr: "Montrez les 5 doigts de votre main gauche, détendus et écartés... {sec}",
  },
  calibrationPressPromptTemplate: {
    ko: "{round}/{total} 라운드 — {lane}번 건반을 누르세요!",
    en: "Round {round}/{total} — Press key #{lane}!",
    zh: "第 {round}/{total} 轮 — 请按下第 {lane} 号按键！",
    vi: "Vòng {round}/{total} — Hãy nhấn phím số {lane}!",
    ja: "{round}/{total}ラウンド — {lane}番の鍵盤を押してください！",
    es: "Ronda {round}/{total} — ¡Pulsa la tecla n.º {lane}!",
    fr: "Manche {round}/{total} — Appuyez sur la touche n° {lane} !",
  },
  calibrationDoneMsg: {
    ko: "보정 완료!", en: "Calibration complete!", zh: "校准完成！", vi: "Hiệu chỉnh hoàn tất!", ja: "キャリブレーション完了！", es: "¡Calibración completa!", fr: "Étalonnage terminé !",
  },
};
