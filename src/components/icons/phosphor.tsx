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
