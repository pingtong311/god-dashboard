import type { ReactElement } from 'react';

/**
 * phosphor.tsx — Phosphor 圖示集（逐字複刻博主站使用的 SVG 路徑）
 * ----------------------------------------------------------------------------
 * 來源：博主站 `/Users/sheng-feng/Antigravity-Rule/IOS_design/extracted/site/`
 *       未登入態底部列 `<nav aria-label="手機導覽（未登入）">` 內 5 個 <svg>。
 *
 * ⚠ 博主在底部列的每個圖示都準備了「兩種字重」：
 *     - 未選取（inactive）：regular（線條／外框）版本，`width/height = 22`
 *     - 已選取（active）  ：fill（實心）版本，`width/height = 21`
 *   （以 `<a aria-current="page">` 區分；同一頁僅一項為 active。）
 *   逐頁比對 11 個外殼頁後確認：首頁／文章／學堂／導覽／登入 五項皆同此規則。
 *
 * 命名沿用 Phosphor 官方名稱，並以 `…Fill` 後綴標示實心版本，方便其餘複刻工作
 * 重複使用（例如 guide.html 內的流程圖示）。
 *
 * 每個圖示元件簽名一致：`({ size = 22, className })`，
 * 輸出 `<svg xmlns width height fill="currentColor" viewBox="0 0 256 256" aria-hidden>`。
 */

/** 所有 Phosphor 圖示共用的 props。 */
export type PhosphorIconProps = {
  /** 邊長（px）；預設 22，對應博主未選取態。 */
  size?: number;
  /** 額外 class（選用）。 */
  className?: string;
};

/** 內部共用：以給定路徑輸出標準 Phosphor SVG 外框。 */
function PhosphorGlyph({
  size = 22,
  className,
  path,
}: PhosphorIconProps & { path: string }): ReactElement {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      fill="currentColor"
      viewBox="0 0 256 256"
      className={className}
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}

/* ── 路徑常數（逐字照抄博主 DOM；勿改寫數值） ───────────────────────────── */

/** House（regular／未選取） */
const HOUSE = 'M222.14,105.85l-80-80a20,20,0,0,0-28.28,0l-80,80A19.86,19.86,0,0,0,28,120v96a12,12,0,0,0,12,12h64a12,12,0,0,0,12-12V164h24v52a12,12,0,0,0,12,12h64a12,12,0,0,0,12-12V120A19.86,19.86,0,0,0,222.14,105.85ZM204,204H164V152a12,12,0,0,0-12-12H104a12,12,0,0,0-12,12v52H52V121.65l76-76,76,76Z';
/** House（fill／已選取） */
const HOUSE_FILL = 'M224,120v96a8,8,0,0,1-8,8H160a8,8,0,0,1-8-8V164a4,4,0,0,0-4-4H108a4,4,0,0,0-4,4v52a8,8,0,0,1-8,8H40a8,8,0,0,1-8-8V120a16,16,0,0,1,4.69-11.31l80-80a16,16,0,0,1,22.62,0l80,80A16,16,0,0,1,224,120Z';

/** Article（regular／未選取） */
const ARTICLE = 'M92,108a12,12,0,0,1,12-12h72a12,12,0,0,1,0,24H104A12,12,0,0,1,92,108Zm12,52h72a12,12,0,0,0,0-24H104a12,12,0,0,0,0,24ZM236,64V184a28,28,0,0,1-28,28H36A32,32,0,0,1,4,180V88a12,12,0,0,1,24,0v92a8,8,0,0,0,16,0V64A20,20,0,0,1,64,44H216A20,20,0,0,1,236,64Zm-24,4H68V180a32,32,0,0,1-1,8H208a4,4,0,0,0,4-4Z';
/** Article（fill／已選取） */
const ARTICLE_FILL = 'M216,48H56A16,16,0,0,0,40,64V184a8,8,0,0,1-16,0V88A8,8,0,0,0,8,88v96.11A24,24,0,0,0,32,208H208a24,24,0,0,0,24-24V64A16,16,0,0,0,216,48ZM176,152H96a8,8,0,0,1,0-16h80a8,8,0,0,1,0,16Zm0-32H96a8,8,0,0,1,0-16h80a8,8,0,0,1,0,16Z';

/** GraduationCap（regular／未選取） */
const GRADUATION_CAP = 'M249.8,85.49l-116-64a12,12,0,0,0-11.6,0l-116,64a12,12,0,0,0,0,21l21.8,12v47.76a19.89,19.89,0,0,0,5.09,13.32C46.63,194.7,77,220,128,220a136.88,136.88,0,0,0,40-5.75V240a12,12,0,0,0,24,0V204.12a119.53,119.53,0,0,0,30.91-24.51A19.89,19.89,0,0,0,228,166.29V118.53l21.8-12a12,12,0,0,0,0-21ZM128,45.71,219.16,96,186,114.3a1.88,1.88,0,0,1-.18-.12l-52-28.69a12,12,0,0,0-11.6,21l39,21.49L128,146.3,36.84,96ZM128,196c-40.42,0-64.65-19.07-76-31.27v-33l70.2,38.74a12,12,0,0,0,11.6,0L168,151.64v37.23A110.46,110.46,0,0,1,128,196Zm76-31.27a93.21,93.21,0,0,1-12,10.81V138.39l12-6.62Z';
/** GraduationCap（fill／已選取） */
const GRADUATION_CAP_FILL = 'M176,207.24a119,119,0,0,0,16-7.73V240a8,8,0,0,1-16,0Zm11.76-88.43-56-29.87a8,8,0,0,0-7.52,14.12L171,128l17-9.06Zm64-29.87-120-64a8,8,0,0,0-7.52,0l-120,64a8,8,0,0,0,0,14.12L32,117.87v48.42a15.91,15.91,0,0,0,4.06,10.65C49.16,191.53,78.51,216,128,216a130,130,0,0,0,48-8.76V130.67L171,128l-43,22.93L43.83,106l0,0L25,96,128,41.07,231,96l-18.78,10-.06,0L188,118.94a8,8,0,0,1,4,6.93v73.64a115.63,115.63,0,0,0,27.94-22.57A15.91,15.91,0,0,0,224,166.29V117.87l27.76-14.81a8,8,0,0,0,0-14.12Z';

/** BookOpen（regular／未選取） */
const BOOK_OPEN = 'M232,44H160a43.86,43.86,0,0,0-32,13.85A43.86,43.86,0,0,0,96,44H24A12,12,0,0,0,12,56V200a12,12,0,0,0,12,12H96a20,20,0,0,1,20,20,12,12,0,0,0,24,0,20,20,0,0,1,20-20h72a12,12,0,0,0,12-12V56A12,12,0,0,0,232,44ZM96,188H36V68H96a20,20,0,0,1,20,20V192.81A43.79,43.79,0,0,0,96,188Zm124,0H160a43.71,43.71,0,0,0-20,4.83V88a20,20,0,0,1,20-20h60Z';
/** BookOpen（fill／已選取） */
const BOOK_OPEN_FILL = 'M240,56V200a8,8,0,0,1-8,8H160a24,24,0,0,0-24,23.94,7.9,7.9,0,0,1-5.12,7.55A8,8,0,0,1,120,232a24,24,0,0,0-24-24H24a8,8,0,0,1-8-8V56a8,8,0,0,1,8-8H88a32,32,0,0,1,32,32v87.73a8.17,8.17,0,0,0,7.47,8.25,8,8,0,0,0,8.53-8V80a32,32,0,0,1,32-32h64A8,8,0,0,1,240,56Z';

/** SignIn（regular／未選取） */
const SIGN_IN = 'M144.49,136.49l-40,40a12,12,0,0,1-17-17L107,140H24a12,12,0,0,1,0-24h83L87.51,96.49a12,12,0,0,1,17-17l40,40A12,12,0,0,1,144.49,136.49ZM200,28H136a12,12,0,0,0,0,24h52V204H136a12,12,0,0,0,0,24h64a12,12,0,0,0,12-12V40A12,12,0,0,0,200,28Z';
/** SignIn（fill／已選取） */
const SIGN_IN_FILL = 'M141.66,133.66l-40,40A8,8,0,0,1,88,168V136H24a8,8,0,0,1,0-16H88V88a8,8,0,0,1,13.66-5.66l40,40A8,8,0,0,1,141.66,133.66ZM200,32H136a8,8,0,0,0,0,16h56V208H136a8,8,0,0,0,0,16h64a8,8,0,0,0,8-8V40A8,8,0,0,0,200,32Z';

/* ── App 主分頁圖示（Phosphor 路徑；博主底部列使用同套圖示語彙） ─────────── */

/** NotebookPen（regular／未選取）— 看盤日記 */
const NOTEBOOK = 'M196,44H76a20,20,0,0,0-20,20V172a20,20,0,0,0,20,20h32V208a8,8,0,0,0,8,8h24a8,8,0,0,0,8-8V192h48a20,20,0,0,0,20-20V64A20,20,0,0,0,196,44ZM116,200h-8V192h8Zm40-16H76a8,8,0,0,1-8-8V64a8,8,0,0,1,8-8h120a8,8,0,0,1,8,8V176a8,8,0,0,1-8,8Zm-44-24a4,4,0,0,1-4-4V68a4,4,0,0,1,8,0V156A4,4,0,0,1,108,160Zm16-80a4,4,0,0,1-4-4V84a4,4,0,0,1,8,0v4A4,4,0,0,1,124,80Zm-8,44a4,4,0,0,1,4-4h88a4,4,0,0,1,0,8H120A4,4,0,0,1,116,124Zm0,32a4,4,0,0,1,4-4h64a4,4,0,0,1,0,8H120A4,4,0,0,1,116,156Z';
/** NotebookPen（fill／已選取） */
const NOTEBOOK_FILL = 'M188,48H76a16,16,0,0,0-16,16V172a16,16,0,0,0,16,16h36v12a12,12,0,0,0,12,12h16a12,12,0,0,0,12-12V188h52a16,16,0,0,0,16-16V64A16,16,0,0,0,188,48ZM120,204H108V196a4,4,0,0,0-4-4H84V64H188V188H124a4,4,0,0,0-4,4Zm72-12H140V184h52Z';

/** Radar（regular／未選取）— 資金雷達 */
const RADAR = 'M128,28A100,100,0,1,0,228,128,100,100,0,0,0,128,28Zm0,184a84,84,0,1,1,84-84A84,84,0,0,1,128,212Zm0-160a76,76,0,1,0,76,76A76,76,0,0,0,128,52Zm0,132a56,56,0,1,1,56-56A56,56,0,0,1,128,184Zm0-104a48,48,0,1,0,48,48A48,48,0,0,0,128,80Zm0,88a40,40,0,1,1,40-40A40,40,0,0,1,128,168Zm24-40a24,24,0,1,1-24-24A24,24,0,0,1,152,128Z';
/** Radar（fill／已選取） */
const RADAR_FILL = 'M128,48A80,80,0,1,0,208,128,80,80,0,0,0,128,48Zm0,144a64,64,0,1,1,64-64A64,64,0,0,1,128,192Z';

/** Crosshair（regular／未選取）— 戰情室 */
const CROSSHAIR = 'M116,24v28a12,12,0,0,0,24,0V24a12,12,0,0,0-24,0Zm0,180v28a12,12,0,0,0,24,0V204A12,12,0,0,0,116,204ZM24,116H52a12,12,0,0,0,0,24H24a12,12,0,0,0,0-24Zm180,0h28a12,12,0,0,0,0,24h-28a12,12,0,0,0,0-24Zm20.49,72.49a12,12,0,0,0-17,0L152.49,152.49a100.39,100.39,0,0,0,0-48.98l44.86-44.86a12,12,0,0,0,0-17l-22.62-22.62a12,12,0,0,0-17,0L113.51,63.89a100.39,100.39,0,0,0-48.98,0L20.12,18.75a12,12,0,0,0-17,0L-19.51,41.37a12,12,0,0,0,0,17L82.11,110.29a100.39,100.39,0,0,0,0,48.98L-62.75,204.15a12,12,0,0,0,0,17l22.62,22.62a12,12,0,0,0,17,0l64.75-64.75a100.39,100.39,0,0,0,48.98,0l44.86,44.86a12,12,0,0,0,17,0l22.62-22.62a12,12,0,0,0,0-17Zm-56.18-56.18a84,84,0,1,1-14.82-23.76A84.4,84.4,0,0,1,152.29,160.31Z';
/** Crosshair（fill／已選取） */
const CROSSHAIR_FILL = 'M128,52A76,76,0,1,0,204,128,76,76,0,0,0,128,52Zm0,124a48,48,0,1,1,48-48A48,48,0,0,1,128,176Zm-16-160v20a16,16,0,0,0,32,0V16a16,16,0,0,0-32,0Zm0,200v20a16,16,0,0,0,32,0V200A16,16,0,0,0,112,216ZM16,112h20a16,16,0,0,0,0,32H16a16,16,0,0,0,0-32Zm208,0h20a16,16,0,0,0,0,32h-20a16,16,0,0,0,0-32Z';

/** BarChart（regular／未選取）— 圖表 */
const CHART = 'M80,192H64a12,12,0,0,0-12,12v20a12,12,0,0,0,12,12H80a12,12,0,0,0,12-12V204A12,12,0,0,0,80,192Zm72,0H136a12,12,0,0,0-12,12v52a12,12,0,0,0,12,12h16a12,12,0,0,0,12-12V204A12,12,0,0,0,152,192ZM208,96h-16a12,12,0,0,0-12,12v156a12,12,0,0,0,12,12h16a12,12,0,0,0,12-12V108A12,12,0,0,0,208,96Zm-72-52h-16a12,12,0,0,0-12,12v208a12,12,0,0,0,12,12h16a12,12,0,0,0,12-12V56A12,12,0,0,0,136,44Z';
/** BarChart（fill／已選取） */
const CHART_FILL = 'M88,196H68a12,12,0,0,0-12,12v16a12,12,0,0,0,12,12h20a12,12,0,0,0,12-12V208A12,12,0,0,0,88,196Zm68,0H136a12,12,0,0,0-12,12v48a12,12,0,0,0,12,12h20a12,12,0,0,0,12-12V208A12,12,0,0,0,156,196Zm52-96h-20a12,12,0,0,0-12,12v144a12,12,0,0,0,12,12h20a12,12,0,0,0,12-12V112A12,12,0,0,0,208,100Zm-72-48H136a12,12,0,0,0-12,12v188a12,12,0,0,0,12,12h20a12,12,0,0,0,12-12V64A12,12,0,0,0,136,52Z';

/** ChatCircle（regular／未選取）— AI 問答 */
const CHAT = 'M212,32H44A32,32,0,0,0,12,64V168a32,32,0,0,0,32,32h52v32l48-32h68a32,32,0,0,0,32-32V64A32,32,0,0,0,212,32Zm20,136a20,20,0,0,1-20,20H136l-24,16V188H44a20,20,0,0,1-20-20V64A20,20,0,0,1,44,44H212a20,20,0,0,1,20,20Z';
/** ChatCircle（fill／已選取） */
const CHAT_FILL = 'M212,44H44A28,28,0,0,0,16,72V176a28,28,0,0,0,28,28h48v24a8,8,0,0,0,13.2,5.6L152,204h60a28,28,0,0,0,28-28V72A28,28,0,0,0,212,44ZM88,156a8,8,0,0,1,0-16h80a8,8,0,0,1,0,16Zm0-32a8,8,0,0,1,0-16h56a8,8,0,0,1,0,16Z';

/** Gamepad（regular／未選取）— 模擬練習 */
const GAMEPAD = 'M208,68H48A40,40,0,0,0,8,108v40a40,40,0,0,0,40,40,32,32,0,0,0,32,32,32,32,0,0,0,32-32h40a32,32,0,0,0,32,32,32,32,0,0,0,32-32A40,40,0,0,0,248,148V108A40,40,0,0,0,208,68Zm-144,60a12,12,0,0,1-12-12v-12a12,12,0,0,1,24,0v12A12,12,0,0,1,64,128Zm24-24a12,12,0,0,1-12-12v-12a12,12,0,0,1,24,0v12A12,12,0,0,1,88,104Zm80,24a12,12,0,0,1-12-12V92a12,12,0,0,1,24,0v24A12,12,0,0,1,168,128Zm24-24a12,12,0,0,1-12-12V92a12,12,0,0,1,24,0v12A12,12,0,0,1,192,104Z';
/** Gamepad（fill／已選取） */
const GAMEPAD_FILL = 'M208,76H48A32,32,0,0,0,16,108v40a32,32,0,0,0,32,32,24,24,0,0,0,24,24h16a24,24,0,0,0,24-24h32a24,24,0,0,0,24,24h16a24,24,0,0,0,24-24,32,32,0,0,0,32-32V108A32,32,0,0,0,208,76Zm-160,48H56V92a4,4,0,0,1,4-4H72a4,4,0,0,1,4,4v32A4,4,0,0,1,72,128Zm24-32H88v24H80Zm80,32h-8V92h8Zm24,0h-8V92h8Z';

/** Star（regular／未選取）— 我的關注 */
const STAR = 'M128,20L47.4,64.7l13.5,54.2L128,164l67.1-45.1L208.6,64.7Zm-48.1,66.1,48.1,28.1L148.1,144a4,4,0,0,0,5.4,0l20.8-12.1L128,144l-46.3-12.1,20.8,12.1a4,4,0,0,0,5.4,0l20.8-12.1Z';
/** Star（fill／已選取） */
const STAR_FILL = 'M131.7,24.3a12,12,0,0,0-13.4,0L37.8,73.5a12,12,0,0,0-6,13.4L50,156.7a12,12,0,0,0,9.4,9L121.3,176a12,12,0,0,0,13.4,0l74.3-32.3a12,12,0,0,0,6.6-9.5l7.5-70a12,12,0,0,0-6-13.4Zm-6.7,145.8L50.7,139.4l-10.1-49.6L125,52.9l84.4,36.9-10.1,49.6Z';

/** PieChart（regular／未選取）— 籌碼研究 */
const PIE = 'M224,128a96,96,0,1,1-96-96V128Zm-96-84a84,84,0,0,0,0,168V128Z';
/** PieChart（fill／已選取） */
const PIE_FILL = 'M216,128a88,88,0,1,1-88-88V128Zm-88-76a76,76,0,0,0,0,152V128Z';

/** MoreHorizontal（regular／未選取）— 更多 */
const MORE = 'M96,128a16,16,0,1,1-16-16A16,16,0,0,1,96,128Zm64,0a16,16,0,1,1-16-16A16,16,0,0,1,160,128Zm64,0a16,16,0,1,1-16-16A16,16,0,0,1,224,128Z';
/** MoreHorizontal（fill／已選取） */
const MORE_FILL = 'M96,120a8,8,0,1,1-8-8A8,8,0,0,1,96,120Zm64,0a8,8,0,1,1-8-8A8,8,0,0,1,160,120Zm64,0a8,8,0,1,1-8-8A8,8,0,0,1,224,120Z';

/* ── 對外匯出（regular） ────────────────────────────────────────────────── */

/** 首頁 — House（regular）。 */
export function PhosphorHouse(props: PhosphorIconProps): ReactElement {
  return <PhosphorGlyph {...props} path={HOUSE} />;
}

/** 文章 — Article（regular）。 */
export function PhosphorArticle(props: PhosphorIconProps): ReactElement {
  return <PhosphorGlyph {...props} path={ARTICLE} />;
}

/** 學堂 — GraduationCap（regular）。 */
export function PhosphorGraduationCap(props: PhosphorIconProps): ReactElement {
  return <PhosphorGlyph {...props} path={GRADUATION_CAP} />;
}

/** 導覽 — BookOpen（regular）。 */
export function PhosphorBookOpen(props: PhosphorIconProps): ReactElement {
  return <PhosphorGlyph {...props} path={BOOK_OPEN} />;
}

/** 登入 — SignIn（regular）。 */
export function PhosphorSignIn(props: PhosphorIconProps): ReactElement {
  return <PhosphorGlyph {...props} path={SIGN_IN} />;
}

/* ── 對外匯出（fill，博主「已選取」態使用） ─────────────────────────────── */

/** 首頁 — House（fill）。 */
export function PhosphorHouseFill(props: PhosphorIconProps): ReactElement {
  return <PhosphorGlyph {...props} path={HOUSE_FILL} />;
}

/** 文章 — Article（fill）。 */
export function PhosphorArticleFill(props: PhosphorIconProps): ReactElement {
  return <PhosphorGlyph {...props} path={ARTICLE_FILL} />;
}

/** 學堂 — GraduationCap（fill）。 */
export function PhosphorGraduationCapFill(props: PhosphorIconProps): ReactElement {
  return <PhosphorGlyph {...props} path={GRADUATION_CAP_FILL} />;
}

/** 導覽 — BookOpen（fill）。 */
export function PhosphorBookOpenFill(props: PhosphorIconProps): ReactElement {
  return <PhosphorGlyph {...props} path={BOOK_OPEN_FILL} />;
}

/** 登入 — SignIn（fill）。 */
export function PhosphorSignInFill(props: PhosphorIconProps): ReactElement {
  return <PhosphorGlyph {...props} path={SIGN_IN_FILL} />;
}

/* ── App 主分頁圖示（regular） ────────────────────────────────────────────── */

/** 看盤日記 — Notebook（regular）。 */
export function PhosphorNotebook(props: PhosphorIconProps): ReactElement {
  return <PhosphorGlyph {...props} path={NOTEBOOK} />;
}

/** 資金雷達 — Radar（regular）。 */
export function PhosphorRadar(props: PhosphorIconProps): ReactElement {
  return <PhosphorGlyph {...props} path={RADAR} />;
}

/** 戰情室 — Crosshair（regular）。 */
export function PhosphorCrosshair(props: PhosphorIconProps): ReactElement {
  return <PhosphorGlyph {...props} path={CROSSHAIR} />;
}

/** 圖表 — BarChart（regular）。 */
export function PhosphorChart(props: PhosphorIconProps): ReactElement {
  return <PhosphorGlyph {...props} path={CHART} />;
}

/** AI 問答 — ChatCircle（regular）。 */
export function PhosphorChat(props: PhosphorIconProps): ReactElement {
  return <PhosphorGlyph {...props} path={CHAT} />;
}

/** 模擬練習 — Gamepad（regular）。 */
export function PhosphorGamepad(props: PhosphorIconProps): ReactElement {
  return <PhosphorGlyph {...props} path={GAMEPAD} />;
}

/** 我的關注 — Star（regular）。 */
export function PhosphorStar(props: PhosphorIconProps): ReactElement {
  return <PhosphorGlyph {...props} path={STAR} />;
}

/** 籌碼研究 — PieChart（regular）。 */
export function PhosphorPie(props: PhosphorIconProps): ReactElement {
  return <PhosphorGlyph {...props} path={PIE} />;
}

/** 更多 — MoreHorizontal（regular）。 */
export function PhosphorMore(props: PhosphorIconProps): ReactElement {
  return <PhosphorGlyph {...props} path={MORE} />;
}

/* ── App 主分頁圖示（fill，博主「已選取」態使用） ─────────────────────────── */

/** 看盤日記 — Notebook（fill）。 */
export function PhosphorNotebookFill(props: PhosphorIconProps): ReactElement {
  return <PhosphorGlyph {...props} path={NOTEBOOK_FILL} />;
}

/** 資金雷達 — Radar（fill）。 */
export function PhosphorRadarFill(props: PhosphorIconProps): ReactElement {
  return <PhosphorGlyph {...props} path={RADAR_FILL} />;
}

/** 戰情室 — Crosshair（fill）。 */
export function PhosphorCrosshairFill(props: PhosphorIconProps): ReactElement {
  return <PhosphorGlyph {...props} path={CROSSHAIR_FILL} />;
}

/** 圖表 — BarChart（fill）。 */
export function PhosphorChartFill(props: PhosphorIconProps): ReactElement {
  return <PhosphorGlyph {...props} path={CHART_FILL} />;
}

/** AI 問答 — ChatCircle（fill）。 */
export function PhosphorChatFill(props: PhosphorIconProps): ReactElement {
  return <PhosphorGlyph {...props} path={CHAT_FILL} />;
}

/** 更多 — MoreHorizontal（fill）。 */
export function PhosphorMoreFill(props: PhosphorIconProps): ReactElement {
  return <PhosphorGlyph {...props} path={MORE_FILL} />;
}
