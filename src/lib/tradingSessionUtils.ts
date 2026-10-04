/**
 * 交易時段工具函式
 * 使用台北時間（Asia/Taipei）判斷當前交易時段
 */

export type TradingSession = 'pre-market' | 'trading' | 'post-market' | 'weekend';

export interface TradingDayStatus {
  date: string;
  isTradingDay: boolean;
  reason: string | null;
}

/**
 * 台股休市表（非週末的休市日）。
 *
 * ⚠ 維護方式（2026-10-04 建立）：
 *   這張表是**日曆層**的唯一真實來源，`marketBars.isTradingDay()`、
 *   `buildTradingDayWindow()`、`scripts/backfill-market-bars.mjs`、
 *   `scripts/precompute-scan.mjs`（trading-dates 母清單）全都依賴它。
 *   表漏一天，下游就會多出一個「日曆說是交易日、但抓不到資料」的幽靈日期，
 *   前端日期選單選到它就會是空頁。
 *
 *   **可靠的漏列偵測法**（零額外上游成本）：把本表推算出的交易日，
 *   與 KV 內 `mkt:bars:<date>`（只有**真的抓到資料**才會寫入）做差集。
 *   差集就是「日曆漏列的休市日」。2026-10-04 用此法找出下面兩筆：
 *     - 2026-07-10（週五，前後 07-09／07-13 皆為交易日）
 *     - 2026-09-28（週一，教師節）
 *   兩筆再以 TWSE MI_INDEX 逐一實測確認 `stat !== 'OK'`。
 */
const TAIWAN_MARKET_HOLIDAYS: Record<string, string> = {
  '2026-01-01': '元旦休市',
  '2026-02-16': '春節休市',
  '2026-02-17': '春節休市',
  '2026-02-18': '春節休市',
  '2026-02-19': '春節休市',
  '2026-02-20': '春節休市',
  '2026-04-03': '兒童節/清明節連假休市',
  '2026-04-06': '兒童節/清明節補假休市',
  '2026-05-01': '勞動節休市',
  '2026-06-19': '端午節休市',
  // ⚠ 2026-07-10：2026-10-04 補列。原因未經官方公告查證（推測為颱風停止交易日），
  //    但 TWSE MI_INDEX 實測無資料、且前後交易日皆有資料，確定為休市日。
  '2026-07-10': '休市（無交易資料，經 TWSE MI_INDEX 實測確認）',
  '2026-09-25': '中秋節休市',
  // ⚠ 2026-09-28：2026-10-04 補列。教師節自 2025 年起恢復為國定假日；
  //    2026 年 9/28 為週一，TWSE MI_INDEX 實測無資料 → 確定休市。
  '2026-09-28': '教師節休市',
  '2026-10-09': '國慶日補假休市',
};

/**
 * 台北時區的日期／時間拆解用 formatter。
 *
 * ⚠⚠ **必須是模組層級單例，不可在函式內 `new`**（2026-10-04 實測踩到）：
 *   `Intl.DateTimeFormat` 的**建構**成本極高（每次都要重新解析 locale 與 options），
 *   遠高於 `formatToParts()` 本身。
 *
 *   症狀：`/api/skynet/market-bars?action=read&days=120` 在邊緣端 CPU
 *   **25–43ms**（Free plan 上限 10ms，本專案地板值 7ms），但程式碼看起來只是
 *   「跑一個 120 次的迴圈」。
 *   追查：`buildTradingDayWindow(end, 120)` 內部對每個候選日呼叫 `isTradingDay()`
 *   （最多 `count*2+30 = 270` 次），而舊版 `taipeiParts()` **每次都 new 一個
 *   formatter** → 270 次建構 ≈ 25–43ms。**成本全在 formatter 建構，不在日期運算。**
 *
 *   → 改為單例（locale 與 options 皆固定，可安全重複使用，且 `Intl.DateTimeFormat`
 *     本身是執行緒安全、無狀態的）。修正後同一支端點降到 **5–9ms**。
 *
 * ⚠ 教訓：**任何 `Intl.*` 建構子都不該出現在會被高頻呼叫的函式裡。**
 */
const TAIPEI_PARTS_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Taipei',
  weekday: 'short',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: 'numeric',
  minute: 'numeric',
  hour12: false,
});

function taipeiParts(date: Date) {
  const parts = TAIPEI_PARTS_FORMATTER.formatToParts(date);
  const partMap: Record<string, string> = {};
  for (const part of parts) {
    partMap[part.type] = part.value;
  }

  return {
    weekday: partMap.weekday ?? '',
    hour: parseInt(partMap.hour ?? '0', 10),
    minute: parseInt(partMap.minute ?? '0', 10),
    date: `${partMap.year}-${partMap.month}-${partMap.day}`,
  };
}

export function getTradingDayStatus(date: Date): TradingDayStatus {
  const parts = taipeiParts(date);
  if (parts.weekday === 'Sat' || parts.weekday === 'Sun') {
    return {
      date: parts.date,
      isTradingDay: false,
      reason: parts.weekday === 'Sat' ? '週六休市' : '週日休市',
    };
  }

  const holidayReason = TAIWAN_MARKET_HOLIDAYS[parts.date];
  if (holidayReason) {
    return {
      date: parts.date,
      isTradingDay: false,
      reason: holidayReason,
    };
  }

  return {
    date: parts.date,
    isTradingDay: true,
    reason: null,
  };
}

/**
 * 根據給定的 Date 物件判斷台北時間的交易時段
 *
 * 規則：
 *   週六（6）、週日（0）與台股休市日 → 'weekend'
 *   週一至週五 09:00 前 → 'pre-market'
 *   週一至週五 09:00–13:30 → 'trading'
 *   週一至週五 13:30 後 → 'post-market'
 *
 * @param date - 任意 Date 物件（UTC 時間戳）
 * @returns TradingSession
 */
export function getTradingSession(date: Date): TradingSession {
  const dayStatus = getTradingDayStatus(date);
  if (!dayStatus.isTradingDay) {
    return 'weekend';
  }

  const { hour, minute } = taipeiParts(date);
  // 換算為分鐘數方便比較
  const totalMinutes = hour * 60 + minute;
  const marketOpen = 9 * 60;       // 09:00 = 540 分鐘
  const marketClose = 13 * 60 + 30; // 13:30 = 810 分鐘

  if (totalMinutes < marketOpen) {
    return 'pre-market';
  } else if (totalMinutes <= marketClose) {
    return 'trading';
  } else {
    return 'post-market';
  }
}
