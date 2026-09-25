/* ============================================================================
 * 全站顯示偏好（Display Preferences）
 * ----------------------------------------------------------------------------
 * 逐字複刻「股市大佬 TradeBoss」網站（blackstockai.com）在每個頁面 <head> 內嵌的
 * 「阻塞式初始化腳本」所還原的顯示設定。抽出檔：IOS_design/extracted/site/*.html
 * （home.html / guide.html / manual.html / school.html / pricing.html / about.html /
 *   methodology.html 的 <head> 內皆為同一組腳本，行號 193 前的 4 段 <script>）。
 *
 * 博主以 4 把 localStorage 鍵 + 4 個 <html> 屬性/class 驅動主題：
 *
 *   (1) obsidian-theme      → <html data-theme="light|dark"> + style.colorScheme
 *                             值域：'light' | 'dark'；非法／缺漏一律回退 'light'
 *                             （★ 預設為「淺色」，逐字對齊實站 inline script 的
 *                               `var t='light'`；:root 的深色 token 只是 CSS 基礎值，
 *                               實際主題由 data-theme 屬性決定）
 *   (2) obsidian-comfort-read → <html class="... comfort-read">
 *                             值域：'1' 表示開啟；其餘（含 null/'0'）視為關閉
 *   (3) obsidian-updown     → <html data-updown="us">
 *                             值域：'us' 表示「美股慣例（綠漲紅跌）」；
 *                             其餘（含 null）＝不設屬性＝台股慣例（紅漲綠跌，預設）
 *   (4) bs-preferences-v1   → JSON 偏好總表，其中
 *                             .fontSize ∈ {standard,large,xlarge,huge} → data-font-size
 *                             .density  === 'compact' ? compact : comfortable → data-density
 *
 * 三把 obsidian-* 鍵與 bs-preferences-v1 彼此「獨立」：前者只管明暗／舒適閱讀／漲跌色，
 * 後者只管字級／密度；博主並未把它們互相備援，故無「誰優先」問題 —— 各讀各的鍵。
 * 本模組的 persistDisplayPreferences() 會「合併」寫入 bs-preferences-v1（不覆蓋其他欄位）。
 *
 * 所有讀寫皆包 try/catch：localStorage 在隱私模式／SSR／被停用時會拋錯，
 * 此時一律回退預設值且不崩潰（對齊博主腳本的 try/catch 行為）。
 * ========================================================================== */

/** 明暗主題：'light' 為預設（逐字對齊實站 inline script `var t='light'`）。 */
export type ThemePreference = "dark" | "light";

/** 漲跌色慣例：'tw'＝台股紅漲綠跌（預設，不設屬性）；'us'＝美股綠漲紅跌（data-updown=us）。 */
export type UpDownPreference = "tw" | "us";

/** 資訊密度（來自 bs-preferences-v1.density）。 */
export type DensityPreference = "comfortable" | "compact";

/** 字級（來自 bs-preferences-v1.fontSize）。 */
export type FontSizePreference = "standard" | "large" | "xlarge" | "huge";

/** 全站顯示偏好快照。 */
export interface DisplayPreferences {
  theme: ThemePreference;
  comfortRead: boolean;
  upDown: UpDownPreference;
  density: DensityPreference;
  fontSize: FontSizePreference;
}

/** localStorage 鍵名（逐字對齊博主）。 */
export const STORAGE_KEYS = {
  theme: "obsidian-theme",
  comfortRead: "obsidian-comfort-read",
  upDown: "obsidian-updown",
  preferences: "bs-preferences-v1",
} as const;

/** <html> 屬性／class 名稱（逐字對齊博主 CSS 選擇器）。 */
export const THEME_ATTRIBUTE = "data-theme";
export const UP_DOWN_ATTRIBUTE = "data-updown";
export const DENSITY_ATTRIBUTE = "data-density";
export const FONT_SIZE_ATTRIBUTE = "data-font-size";
export const COMFORT_READ_CLASS = "comfort-read";

/** 博主 CSS 允許的字級值域（順序即腳本中的 indexOf 檢查順序）。 */
export const FONT_SIZE_VALUES: readonly FontSizePreference[] = [
  "standard",
  "large",
  "xlarge",
  "huge",
];

/** 預設偏好（＝博主在無任何 localStorage 時的行為；主題預設「淺色」）。 */
export const DEFAULT_DISPLAY_PREFERENCES: DisplayPreferences = {
  theme: "light",
  comfortRead: false,
  upDown: "tw",
  density: "comfortable",
  fontSize: "standard",
};

/* ---------------------------------------------------------------------------
 * 正規化（normalizers）—— 純函式，與 DOM／storage 無關，便於單元測試。
 * 對齊博主腳本的判斷式：任何非法／缺漏值都回退到預設。
 * ------------------------------------------------------------------------- */

/** 明暗主題正規化：非 'light'／'dark' 一律回退 'light'（實站預設淺色）。 */
export function normalizeTheme(value: unknown): ThemePreference {
  return value === "light" || value === "dark" ? value : "light";
}

/** 漲跌色正規化：僅 'us' 為美股慣例，其餘一律回退台股慣例 'tw'。 */
export function normalizeUpDown(value: unknown): UpDownPreference {
  return value === "us" ? "us" : "tw";
}

/** 舒適閱讀正規化：僅字串 '1' 視為開啟。 */
export function isComfortRead(value: unknown): boolean {
  return value === "1";
}

/** 密度正規化：僅 'compact' 為精簡，其餘一律回退 'comfortable'。 */
export function normalizeDensity(value: unknown): DensityPreference {
  return value === "compact" ? "compact" : "comfortable";
}

/** 字級正規化：不在值域內一律回退 'standard'。 */
export function normalizeFontSize(value: unknown): FontSizePreference {
  return (FONT_SIZE_VALUES as readonly unknown[]).includes(value)
    ? (value as FontSizePreference)
    : "standard";
}

/* ---------------------------------------------------------------------------
 * Storage 安全存取（localStorage 可能不存在／拋錯）
 * ------------------------------------------------------------------------- */

/** 取得預設 storage（瀏覽器 localStorage）；SSR 或被停用時回傳 null。 */
export function getDefaultStorage(): Storage | null {
  try {
    if (typeof window === "undefined") {
      return null;
    }
    return window.localStorage;
  } catch {
    return null;
  }
}

function safeGetItem(storage: Storage | null, key: string): string | null {
  if (!storage) {
    return null;
  }
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(storage: Storage | null, key: string, value: string): boolean {
  if (!storage) {
    return false;
  }
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/** 讀取並解析 bs-preferences-v1（偏好總表）；失敗一律回傳空物件。 */
export function readPreferencesTable(storage?: Storage | null): Record<string, unknown> {
  const store = storage ?? getDefaultStorage();
  const raw = safeGetItem(store, STORAGE_KEYS.preferences);
  if (!raw) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

/* ---------------------------------------------------------------------------
 * 讀取／套用／寫回
 * ------------------------------------------------------------------------- */

/**
 * 從 localStorage 讀取完整顯示偏好（含合法化）。
 * 任何鍵缺漏或非法值都會回退到 DEFAULT_DISPLAY_PREFERENCES 的對應值。
 */
export function readDisplayPreferences(storage?: Storage | null): DisplayPreferences {
  const store = storage ?? getDefaultStorage();
  const table = readPreferencesTable(store);
  return {
    theme: normalizeTheme(safeGetItem(store, STORAGE_KEYS.theme)),
    comfortRead: isComfortRead(safeGetItem(store, STORAGE_KEYS.comfortRead)),
    upDown: normalizeUpDown(safeGetItem(store, STORAGE_KEYS.upDown)),
    density: normalizeDensity(table.density),
    fontSize: normalizeFontSize(table.fontSize),
  };
}

/**
 * 將顯示偏好「完整同步」套用到 <html>（documentElement）。
 *  - data-theme      一律設定（light|dark）
 *  - colorScheme     inline style（對齊博主：避免原生控件配色不匹配）
 *  - comfort-read    class 依 comfortRead 加／移除
 *  - data-updown     僅 upDown==='us' 時設定，否則移除屬性（＝台股慣例）
 *  - data-density / data-font-size 一律設定
 *
 * 此函式用於「執行期切換」（需能雙向移除屬性）；<head> 的初始化腳本則採用
 * 博主原始的「單向」最小邏輯（見 buildDisplayPreferencesInitScript）。
 */
export function applyDisplayPreferences(
  preferences: DisplayPreferences,
  root?: HTMLElement | null,
): void {
  const element =
    root ?? (typeof document !== "undefined" ? document.documentElement : null);
  if (!element) {
    return;
  }

  element.setAttribute(THEME_ATTRIBUTE, preferences.theme);
  try {
    element.style.colorScheme = preferences.theme === "light" ? "light" : "dark";
  } catch {
    /* 某些環境（jsdom 邊緣案例）style 可能不可寫；忽略 */
  }

  if (preferences.comfortRead) {
    element.classList.add(COMFORT_READ_CLASS);
  } else {
    element.classList.remove(COMFORT_READ_CLASS);
  }

  if (preferences.upDown === "us") {
    element.setAttribute(UP_DOWN_ATTRIBUTE, "us");
  } else {
    element.removeAttribute(UP_DOWN_ATTRIBUTE);
  }

  element.setAttribute(DENSITY_ATTRIBUTE, preferences.density);
  element.setAttribute(FONT_SIZE_ATTRIBUTE, preferences.fontSize);
}

/**
 * 將顯示偏好寫回 localStorage。
 *  - obsidian-theme / obsidian-comfort-read / obsidian-updown 直接覆寫。
 *  - bs-preferences-v1 以「合併」方式更新 density／fontSize，
 *    保留偏好總表中其他（非顯示）欄位，避免破壞同事／博主的其他設定。
 * 回傳是否至少寫入一鍵（storage 不可用時為 false）。
 */
export function persistDisplayPreferences(
  preferences: DisplayPreferences,
  storage?: Storage | null,
): boolean {
  const store = storage ?? getDefaultStorage();
  if (!store) {
    return false;
  }

  let ok = false;
  ok = safeSetItem(store, STORAGE_KEYS.theme, preferences.theme) || ok;
  ok =
    safeSetItem(store, STORAGE_KEYS.comfortRead, preferences.comfortRead ? "1" : "0") || ok;
  ok = safeSetItem(store, STORAGE_KEYS.upDown, preferences.upDown) || ok;

  const merged = {
    ...readPreferencesTable(store),
    density: preferences.density,
    fontSize: preferences.fontSize,
  };
  try {
    store.setItem(STORAGE_KEYS.preferences, JSON.stringify(merged));
    ok = true;
  } catch {
    /* 配額／隱私模式：忽略，維持已寫入的其他鍵 */
  }

  return ok;
}

/**
 * <head> 阻塞式初始化腳本（逐字複刻博主 4 段 inline script，維持原順序與最小邏輯）。
 * 由 src/app/layout.tsx 以 dangerouslySetInnerHTML 注入，於 <body> 首次繪製前同步執行，
 * 避免 FOUC（主題閃爍）。SSR 時 <html> 不寫死 data-theme，交由本腳本決定。
 *
 * 輸出＝實站 4 段 <script> 內容的逐字串接（無分隔字元），因此
 * `buildDisplayPreferencesInitScript()` === 實站原文（見測試鎖定）。
 */
export function buildDisplayPreferencesInitScript(): string {
  return [
    // (1) 明暗主題 —— 逐字照抄實站：預設 'light'，再被合法 storage 值覆寫；
    //     setAttribute / colorScheme 在 try 之外，catch 不改變 t（仍為 'light'）。
    "(function(){var t='light';try{",
    "var saved=localStorage.getItem('obsidian-theme');",
    "if(saved==='light'||saved==='dark')t=saved;",
    "}catch(e){}",
    "document.documentElement.setAttribute('data-theme',t);",
    "document.documentElement.style.colorScheme=t;",
    "})();",
    // (2) 舒適閱讀（逐字照抄；注意 add('comfort-read') 後無分號）
    "(function(){try{",
    "if(localStorage.getItem('obsidian-comfort-read')==='1')",
    "document.documentElement.classList.add('comfort-read')",
    "}catch(e){}})();",
    // (3) 漲跌色（僅 us 才設屬性）
    "(function(){try{",
    "var s=localStorage.getItem('obsidian-updown');",
    "if(s==='us')document.documentElement.setAttribute('data-updown','us');",
    "}catch(e){}})();",
    // (4) 偏好總表：字級／密度（逐字照抄，含實站原始換行與縮排）
    "\n(function(){\n  try {\n",
    "    var prefs = JSON.parse(localStorage.getItem('bs-preferences-v1') || '{}');\n",
    "    var root = document.documentElement;\n",
    "    prefs = prefs && typeof prefs === 'object' ? prefs : {};\n",
    "    root.setAttribute('data-font-size', ['standard','large','xlarge','huge'].indexOf(prefs.fontSize) >= 0 ? prefs.fontSize : 'standard');\n",
    "    root.setAttribute('data-density', prefs.density === 'compact' ? 'compact' : 'comfortable');\n",
    "  } catch(e){}\n",
    "})();\n",
  ].join("");
}
