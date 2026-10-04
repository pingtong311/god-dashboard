/** @jest-environment node */

/**
 * 台股交易日日曆（`tradingSessionUtils.TAIWAN_MARKET_HOLIDAYS` ＋ `isTradingDay`）。
 *
 * 為什麼要單獨釘住這張表：
 *   它是**日曆層的唯一真實來源**，`marketBars.isTradingDay()`、
 *   `buildTradingDayWindow()`、`scripts/backfill-market-bars.mjs`、
 *   以及 `scan:trading-dates` 母清單全都依賴它。
 *   表漏一天，下游就會多出「日曆說是交易日、但抓不到資料」的**幽靈日期**——
 *   前端日期選單選到它會是空頁，而**不會有任何錯誤訊息**（最難查的那種）。
 *
 * 2026-10-04 實際踩到：`scan:trading-dates` 母清單出現 2026-09-28（教師節），
 * 但 TWSE MI_INDEX 對該日回「很抱歉，沒有符合條件的資料!」。
 * 用「日曆交易日 − KV 內 mkt:bars: 日期」差集掃出兩筆漏列：
 *   - 2026-07-10（週五）
 *   - 2026-09-28（週一，教師節）
 * 兩筆皆以 TWSE MI_INDEX 實測確認無資料後補進本表。以下測試即為該次的回歸防線。
 */

import { getTradingDayStatus } from '@/lib/tradingSessionUtils';
// ⚠ `isTradingDay` 是 marketBars.ts 的包裝（內部呼叫 getTradingDayStatus），
//    不是 tradingSessionUtils 的匯出——這裡兩者都測，確保包裝沒有走鐘。
import { buildTradingDayWindow, isTradingDay } from '@/lib/marketBars';

/** 以 UTC 午夜建立 Date（與 `buildTradingDayWindow` 的用法一致，避免跨日漂移）。 */
function utcMidnight(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

describe('台股日曆：休市日', () => {
  it.each([
    ['2026-01-01', '元旦'],
    ['2026-02-17', '春節'],
    ['2026-04-03', '清明連假'],
    ['2026-05-01', '勞動節'],
    ['2026-06-19', '端午節'],
    ['2026-09-25', '中秋節'],
    ['2026-10-09', '國慶補假'],
  ])('%s（%s）→ 非交易日', (iso) => {
    const status = getTradingDayStatus(utcMidnight(iso));
    expect(status.isTradingDay).toBe(false);
    expect(status.reason).toBeTruthy();
  });

  it.each([
    ['2026-07-10', '2026-10-04 補列：週五但無交易資料（推測颱風停止交易）'],
    ['2026-09-28', '2026-10-04 補列：教師節（週一）'],
  ])('%s → 非交易日（%s）', (iso) => {
    expect(isTradingDay(utcMidnight(iso))).toBe(false);
  });
});

describe('台股日曆：一般交易日', () => {
  it.each([
    ['2026-07-09', '2026-07-10 的前一交易日'],
    ['2026-07-13', '2026-07-10 的後一交易日'],
    ['2026-09-29', '2026-09-28 的後一交易日'],
    ['2026-10-02', '目前最新的已回填交易日'],
  ])('%s（%s）→ 交易日', (iso) => {
    expect(isTradingDay(utcMidnight(iso))).toBe(true);
  });
});

describe('台股日曆：週末', () => {
  it.each(['2026-09-26', '2026-09-27'])('%s → 非交易日（週末）', (iso) => {
    const status = getTradingDayStatus(utcMidnight(iso));
    expect(status.isTradingDay).toBe(false);
    expect(status.reason).toMatch(/週[六日]/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 效能回歸防線（2026-10-04 新增）
// ─────────────────────────────────────────────────────────────────────────────

describe('台股日曆：不得重複建構 Intl.DateTimeFormat', () => {
  it('buildTradingDayWindow(…, 120) 期間不應再建構任何 Intl.DateTimeFormat', () => {
    // 背景：`Intl.DateTimeFormat` 的**建構**成本極高（遠高於 formatToParts）。
    // 舊版 `taipeiParts()` 每次呼叫都 `new` 一個 formatter，而
    // `buildTradingDayWindow(end, 120)` 會呼叫 `isTradingDay()` 最多 270 次
    // → 實測 `/api/skynet/market-bars?action=read&days=120` 邊緣端 CPU
    //   **25–43ms**（Free plan 上限 10ms）→ 直接 1102。
    //
    // 這個測試用「建構次數計數器」把該缺陷釘死：formatter 已改為模組層級單例，
    // 且**在模組載入時就已建好**，因此呼叫期間的建構次數必須為 0。
    // 若有人日後又在函式內 new，本測試會紅。
    const spy = jest.spyOn(Intl, 'DateTimeFormat');
    try {
      const win = buildTradingDayWindow(utcMidnight('2026-09-30'), 120);
      expect(win).toHaveLength(120);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});
