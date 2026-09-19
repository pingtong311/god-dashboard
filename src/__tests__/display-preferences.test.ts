/** @jest-environment jsdom */

/**
 * 單元測試 — 全站顯示偏好（src/lib/displayPreferences.ts）
 *
 * 驗證博主三把 localStorage 鍵（obsidian-theme / obsidian-comfort-read /
 * obsidian-updown）與偏好總表（bs-preferences-v1）的讀取、正規化、套用與寫回，
 * 並覆蓋「localStorage 拋錯時不崩潰」的防禦路徑。
 */

import {
  COMFORT_READ_CLASS,
  DEFAULT_DISPLAY_PREFERENCES,
  DENSITY_ATTRIBUTE,
  FONT_SIZE_ATTRIBUTE,
  STORAGE_KEYS,
  THEME_ATTRIBUTE,
  UP_DOWN_ATTRIBUTE,
  applyDisplayPreferences,
  buildDisplayPreferencesInitScript,
  isComfortRead,
  normalizeDensity,
  normalizeFontSize,
  normalizeTheme,
  normalizeUpDown,
  persistDisplayPreferences,
  readDisplayPreferences,
  readPreferencesTable,
} from "@/lib/displayPreferences";

/** 建立可用的假 Storage。 */
function createStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => (map.has(key) ? (map.get(key) as string) : null),
    key: (index: number) => Array.from(map.keys())[index] ?? null,
    removeItem: (key: string) => void map.delete(key),
    setItem: (key: string, value: string) => void map.set(key, value),
  } as Storage;
}

/** 建立「任何操作都拋錯」的假 Storage（模擬隱私模式／被停用）。 */
function createThrowingStorage(): Storage {
  const boom = () => {
    throw new DOMException("SecurityError");
  };
  return {
    get length(): number {
      return boom();
    },
    clear: boom,
    getItem: boom,
    key: boom,
    removeItem: boom,
    setItem: boom,
  } as unknown as Storage;
}

const root = () => document.documentElement;

beforeEach(() => {
  document.documentElement.removeAttribute(THEME_ATTRIBUTE);
  document.documentElement.removeAttribute(UP_DOWN_ATTRIBUTE);
  document.documentElement.removeAttribute(DENSITY_ATTRIBUTE);
  document.documentElement.removeAttribute(FONT_SIZE_ATTRIBUTE);
  document.documentElement.classList.remove(COMFORT_READ_CLASS);
});

describe("正規化：非法值一律回退預設", () => {
  test("normalizeTheme：預設 dark，僅 light／dark 通過", () => {
    expect(normalizeTheme(null)).toBe("dark");
    expect(normalizeTheme(undefined)).toBe("dark");
    expect(normalizeTheme("")).toBe("dark");
    expect(normalizeTheme("Dark")).toBe("dark");
    expect(normalizeTheme("light")).toBe("light");
    expect(normalizeTheme("dark")).toBe("dark");
  });

  test("normalizeUpDown：僅 us 通過，其餘回退台股 tw", () => {
    expect(normalizeUpDown(null)).toBe("tw");
    expect(normalizeUpDown("0")).toBe("tw");
    expect(normalizeUpDown("tw")).toBe("tw");
    expect(normalizeUpDown("US")).toBe("tw");
    expect(normalizeUpDown("us")).toBe("us");
  });

  test("isComfortRead：僅字串 '1' 為開啟", () => {
    expect(isComfortRead("1")).toBe(true);
    expect(isComfortRead("0")).toBe(false);
    expect(isComfortRead(null)).toBe(false);
    expect(isComfortRead(1)).toBe(false);
  });

  test("normalizeDensity / normalizeFontSize", () => {
    expect(normalizeDensity(null)).toBe("comfortable");
    expect(normalizeDensity("compact")).toBe("compact");
    expect(normalizeDensity("COMPACT")).toBe("comfortable");
    expect(normalizeFontSize(null)).toBe("standard");
    expect(normalizeFontSize("huge")).toBe("huge");
    expect(normalizeFontSize("xlarge")).toBe("xlarge");
    expect(normalizeFontSize("giant")).toBe("standard");
  });
});

describe("readDisplayPreferences：讀取與回退", () => {
  test("空 storage → 預設值（主題為 dark）", () => {
    expect(readDisplayPreferences(createStorage())).toEqual(DEFAULT_DISPLAY_PREFERENCES);
    expect(readDisplayPreferences(createStorage()).theme).toBe("dark");
  });

  test("合法值 → 正確還原", () => {
    const storage = createStorage({
      [STORAGE_KEYS.theme]: "light",
      [STORAGE_KEYS.comfortRead]: "1",
      [STORAGE_KEYS.upDown]: "us",
      [STORAGE_KEYS.preferences]: JSON.stringify({ fontSize: "large", density: "compact" }),
    });
    expect(readDisplayPreferences(storage)).toEqual({
      theme: "light",
      comfortRead: true,
      upDown: "us",
      density: "compact",
      fontSize: "large",
    });
  });

  test("非法值 → 逐項回退（主題回 dark）", () => {
    const storage = createStorage({
      [STORAGE_KEYS.theme]: "blue",
      [STORAGE_KEYS.comfortRead]: "yes",
      [STORAGE_KEYS.upDown]: "jp",
      [STORAGE_KEYS.preferences]: "{ not json",
    });
    expect(readDisplayPreferences(storage)).toEqual(DEFAULT_DISPLAY_PREFERENCES);
  });

  test("bs-preferences-v1 非物件（陣列／字串）→ 視為空表", () => {
    expect(readPreferencesTable(createStorage({ [STORAGE_KEYS.preferences]: "[1,2]" }))).toEqual({});
    expect(readPreferencesTable(createStorage({ [STORAGE_KEYS.preferences]: "\"x\"" }))).toEqual({});
  });
});

describe("applyDisplayPreferences：即時套用到 <html>", () => {
  test("深色＋台股＋關閉舒適閱讀", () => {
    applyDisplayPreferences(
      { theme: "dark", comfortRead: false, upDown: "tw", density: "comfortable", fontSize: "standard" },
      root(),
    );
    expect(root().getAttribute(THEME_ATTRIBUTE)).toBe("dark");
    expect(root().hasAttribute(UP_DOWN_ATTRIBUTE)).toBe(false);
    expect(root().classList.contains(COMFORT_READ_CLASS)).toBe(false);
    expect(root().getAttribute(DENSITY_ATTRIBUTE)).toBe("comfortable");
    expect(root().getAttribute(FONT_SIZE_ATTRIBUTE)).toBe("standard");
  });

  test("淺色＋美股＋開啟舒適閱讀", () => {
    applyDisplayPreferences(
      { theme: "light", comfortRead: true, upDown: "us", density: "compact", fontSize: "huge" },
      root(),
    );
    expect(root().getAttribute(THEME_ATTRIBUTE)).toBe("light");
    expect(root().getAttribute(UP_DOWN_ATTRIBUTE)).toBe("us");
    expect(root().classList.contains(COMFORT_READ_CLASS)).toBe(true);
    expect(root().getAttribute(DENSITY_ATTRIBUTE)).toBe("compact");
    expect(root().getAttribute(FONT_SIZE_ATTRIBUTE)).toBe("huge");
  });

  test("從 us 切回 tw 會移除 data-updown 屬性", () => {
    applyDisplayPreferences(
      { theme: "dark", comfortRead: false, upDown: "us", density: "comfortable", fontSize: "standard" },
      root(),
    );
    expect(root().getAttribute(UP_DOWN_ATTRIBUTE)).toBe("us");
    applyDisplayPreferences(
      { theme: "dark", comfortRead: false, upDown: "tw", density: "comfortable", fontSize: "standard" },
      root(),
    );
    expect(root().hasAttribute(UP_DOWN_ATTRIBUTE)).toBe(false);
  });
});

describe("切換後 localStorage 與 document.documentElement 同步", () => {
  test("persist 後再 apply，兩端一致", () => {
    const storage = createStorage();
    const next = { theme: "light" as const, comfortRead: true, upDown: "us" as const, density: "compact" as const, fontSize: "large" as const };

    expect(persistDisplayPreferences(next, storage)).toBe(true);
    applyDisplayPreferences(next, root());

    // localStorage 端
    expect(storage.getItem(STORAGE_KEYS.theme)).toBe("light");
    expect(storage.getItem(STORAGE_KEYS.comfortRead)).toBe("1");
    expect(storage.getItem(STORAGE_KEYS.upDown)).toBe("us");
    // documentElement 端
    expect(root().getAttribute(THEME_ATTRIBUTE)).toBe("light");
    expect(root().getAttribute(UP_DOWN_ATTRIBUTE)).toBe("us");
    expect(root().classList.contains(COMFORT_READ_CLASS)).toBe(true);

    // 再讀回必須等於寫入值（往返一致）
    expect(readDisplayPreferences(storage)).toEqual(next);
  });

  test("persist 會合併 bs-preferences-v1，不覆蓋其他欄位", () => {
    const storage = createStorage({
      [STORAGE_KEYS.preferences]: JSON.stringify({ density: "comfortable", fontSize: "standard", onboarded: true, theme: "legacy" }),
    });
    persistDisplayPreferences(
      { theme: "light", comfortRead: false, upDown: "tw", density: "compact", fontSize: "huge" },
      storage,
    );
    const table = JSON.parse(storage.getItem(STORAGE_KEYS.preferences) as string);
    expect(table.density).toBe("compact");
    expect(table.fontSize).toBe("huge");
    expect(table.onboarded).toBe(true); // 其他欄位保留
    expect(table.theme).toBe("legacy");
  });
});

describe("防禦：localStorage 拋錯時不崩潰", () => {
  test("readDisplayPreferences 回退預設", () => {
    expect(() => readDisplayPreferences(createThrowingStorage())).not.toThrow();
    expect(readDisplayPreferences(createThrowingStorage())).toEqual(DEFAULT_DISPLAY_PREFERENCES);
  });

  test("persistDisplayPreferences 回傳 false 且不拋錯", () => {
    expect(() =>
      persistDisplayPreferences(DEFAULT_DISPLAY_PREFERENCES, createThrowingStorage()),
    ).not.toThrow();
    expect(persistDisplayPreferences(DEFAULT_DISPLAY_PREFERENCES, createThrowingStorage())).toBe(false);
  });

  test("applyDisplayPreferences 傳入 null root 時不拋錯", () => {
    expect(() => applyDisplayPreferences(DEFAULT_DISPLAY_PREFERENCES, null)).not.toThrow();
  });
});

describe("buildDisplayPreferencesInitScript：阻塞式初始化腳本", () => {
  const script = buildDisplayPreferencesInitScript();

  test("涵蓋三把 obsidian 鍵與偏好總表", () => {
    expect(script).toContain("obsidian-theme");
    expect(script).toContain("obsidian-comfort-read");
    expect(script).toContain("obsidian-updown");
    expect(script).toContain("bs-preferences-v1");
  });

  test("主題非法值回退 dark，且僅 us 才設 data-updown", () => {
    expect(script).toContain("t!=='light'&&t!=='dark'");
    expect(script).toContain("t='dark'");
    expect(script).toContain("s==='us'");
  });

  test("腳本可執行且預設套用 dark（無 localStorage 時）", () => {
    // eslint-disable-next-line no-new-func
    const run = new Function("document", "localStorage", script);
    const fakeStorage = createStorage();
    expect(() => run(document, fakeStorage)).not.toThrow();
    expect(root().getAttribute(THEME_ATTRIBUTE)).toBe("dark");
    expect(root().hasAttribute(UP_DOWN_ATTRIBUTE)).toBe(false);
  });
});
