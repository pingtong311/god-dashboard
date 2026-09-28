/**
 * /swing 波段條件 —— 15 個「可自產」條件的純函式運算層
 * ============================================================================
 * 背景：實站 /swing（股市大佬 TradeBoss）以 16 個頁籤列出「符合歷史條件的股票」。
 * 本站**不代理實站**（上游 blackstockai.com/api/swing-hub 已封鎖，實測 HTTP 403），
 * 一律以**免費官方資料自行計算**（TWSE / TPEX / TDCC 集保 OpenAPI）。
 *
 * 分層：
 *   - 本檔只放「純函式」——輸入為已正規化的序列／上游列，輸出為對齊實站 schema 的
 *     items。所有網路抓取集中在 route（src/app/api/skynet/swing-hub/route.ts），
 *     故本檔可完全以合成資料單元測試（不觸及網路）。
 *
 * 紅漲綠跌：本層只做資料，不涉顏色。
 * 資料誠實：缺資料一律「留白／累積中」，**絕不以 0 或亂數代替、不捏造**。
 *
 * 16 個頁籤中，15 個可自產；`badnews`（新聞負面敘事）本站無任何新聞源 → 留白
 * （由 route 固定回空 + unavailable_reason，本檔不提供該條件）。
 */

import type { CompactBar } from '@/lib/marketBars';
import { calculateSMA } from '@/lib/sma';

// ===========================================================================
// 一、具名門檻常數（＝本站「口徑」；每一項都附中文依據，供人工檢視）
// ===========================================================================

/**
 * 短均線（月線）天數。實站頁籤說明為「月線」，台股慣例月線＝20 日均線。
 */
export const MA_SHORT = 20;

/**
 * 長均線（季線）天數。台股慣例季線＝60 日均線。
 */
export const MA_LONG = 60;

/**
 * 「距月線正負 2%」的容許帶寬（%）。逐字取自實站頁籤說明「正負 2% 內」。
 */
export const PULLBACK_BAND_PCT = 2;

/**
 * 法人「連買」需連續的資料日數。逐字取自實站頁籤說明「連續 3 個資料日買超」。
 */
export const INSTITUTIONAL_STREAK_DAYS = 3;

/**
 * 「20 日新高」的回看天數（取前 20 日的最高價為比較基準）。逐字取自頁籤名稱。
 */
export const BREAK_HIGH_LOOKBACK = 20;

/**
 * 「量增」門檻：當日成交量須 ≥ 前 20 日均量 × 本倍數。
 * 依既有 /tools 頁「成交量為 20 日均量 1.5 倍以上」之口徑。
 */
export const VOLUME_SURGE_MULTIPLE = 1.5;

/**
 * 「20 日區間報酬」的回看天數。逐字取自頁籤名稱。
 */
export const RS_LOOKBACK = 20;

/**
 * 區間報酬門檻（%）：近 20 日報酬須 ≥ 本值才納入。
 * 本站口徑：20% 以上（過濾盤整股，聚焦明顯強勢）。
 */
export const RS_MIN_RETURN_PCT = 20;

/**
 * 區間流動性門檻（張）：近 20 日累計成交張數須 ≥ 本值。
 * 本站口徑：累計 2,000 張（≈ 日均 100 張），排除幾乎無量的冷門股。
 */
export const RS_MIN_TURNOVER_LOTS = 2000;

/**
 * 族群報酬門檻（%）：族群（產業）近 20 日平均報酬須 ≥ 本值。
 * 本站口徑：10%（族群整體需同步轉強，非單一個股）。
 */
export const SECTOR_MIN_AVG_RETURN_PCT = 10;

/**
 * 族群個股報酬門檻（%）：個股近 20 日報酬須 ≥ 本值。
 * 本站口徑：20%（個股須明顯強於族群基本門檻）。
 */
export const SECTOR_MIN_STOCK_RETURN_PCT = 20;

/**
 * 「融資餘額下降」的比較基準：約幾個「交易日」前。逐字取自頁籤說明「約 20 日前」。
 */
export const MARGIN_LOOKBACK_TRADING_DAYS = 20;

/**
 * 融資餘額「下降」的最小張數門檻。本站口徑：至少減少 50 張，過濾日內雜訊。
 */
export const MARGIN_DROP_MIN_LOTS = 50;

/**
 * 月營收 MoM（月增率，%）門檻。本站口徑：> 0（較上月成長）。
 */
export const REVENUE_MOM_MIN_PCT = 0;

/**
 * 月營收 YoY（年增率，%）門檻。本站口徑：> 0（較去年同月成長）。
 */
export const REVENUE_YOY_MIN_PCT = 0;

/**
 * 除權息填息觀察：資料日收盤相對「除權息參考價」回升幅度（%）門檻。
 * 本站口徑：≥ 0（已回到參考價之上，列為「填息中／已填觀察」）。
 */
export const FILL_RECOVERY_MIN_PCT = 0;

/**
 * smart 交集：400 張以上持股比例門檻（%）。本站口徑：≥ 40%（大戶明顯集中）。
 */
export const SMART_WHALE_MIN_BIG_PCT = 40;

/**
 * smart 交集：量比（當日量 ÷ 20 日均量）門檻。本站口徑：≥ 1.2。
 */
export const SMART_VOL_RATIO_MIN = 1.2;

/**
 * smart 交集：區間幅度回看天數。依實站 hint「40 日區間幅度」口徑。
 */
export const SMART_RANGE_LOOKBACK = 40;

/**
 * 多數頁籤的結果上限（取前 N 名）。對齊實站樣本數（多為 20）。
 */
export const SWING_RESULT_LIMIT = 20;

/**
 * 大戶持股兩個頁籤的結果上限。對齊實站樣本數（40）。
 */
export const WHALE_RESULT_LIMIT = 40;

/**
 * 集保持股分級「400 張以上」的起級距（含）。
 * 分級 12＝400–600 張、13＝600–800、14＝800–1000、15＝1000 張以上。
 */
export const TDCC_BIG_MIN_GRADE = 12;

/** 集保持股分級「400 張以上」的迄級距（含，即千張以上）。 */
export const TDCC_BIG_MAX_GRADE = 15;

/** 集保持股分級「千張以上」級距（單獨取用為 k_pct）。 */
export const TDCC_K_GRADE = 15;

/** 集保分級 16＝差異調整、17＝合計，皆須排除（否則比例會重複計算）。 */
export const TDCC_EXCLUDE_GRADES: readonly string[] = ['16', '17'];

/**
 * 只納入「4 位數字」的普通股代號：排除權證（6 碼）、5 碼 ETF 等雜訊，
 * 對齊實站清單皆為 4 碼個股之慣例。
 */
export const COMMON_STOCK_CODE_RE = /^\d{4}$/;

/** 判斷是否為 4 碼普通股代號。 */
export function isCommonStockCode(code: string): boolean {
  return COMMON_STOCK_CODE_RE.test(code);
}

// ===========================================================================
// 二、型別
// ===========================================================================

/** 帶日期的個股 K 棒。 */
export type DatedBar = {
  date: string;
  code: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volumeLots: number;
};

/** 個股代號 → 升冪日 K 序列。 */
export type CodeSeriesMap = Map<string, DatedBar[]>;

/** 個股名稱／產業（來源：TWSE 月營收 OpenAPI，僅上市；上櫃可能缺）。 */
export type StockMeta = { name?: string; industry?: string };
export type StockMetaMap = Map<string, StockMeta>;

/** 條件運算共用情境。 */
export type ConditionContext = {
  series: CodeSeriesMap;
  meta: StockMetaMap;
  /** 價格資料日（'YYYY-MM-DD'），供 items 標註。 */
  asOf: string;
};

/** 對齊實站 schema 的單一 item（欄位皆可選，依條件不同而異）。 */
export type SwingItem = {
  stock_id: string;
  label: string;
  stock_name?: string;
  industry?: string;
  name?: string;
  hint?: string;
  read?: string;
  close?: number;
  change_pct?: number;
  ma20?: number;
  ma60?: number;
  ret20?: number;
  range_pct?: number;
  vol_ratio?: number;
  big_pct?: number;
  k_pct?: number;
  delta_1w?: number | null;
  delta_4w?: number | null;
  up_weeks?: number | null;
  down_weeks?: number | null;
  weeks?: number;
  margin_delta_lots?: number;
  whale_delta_pct?: number | null;
  identity_status?: string;
  price_unit?: string;
  price_scope?: string;
  price_as_of?: string;
  price_status?: string;
  change_scope?: string;
  change_as_of?: string;
  change_status?: string;
};

/** 三大法人單日單一個股淨買賣超（張）。 */
export type T86NetItem = {
  symbol: string;
  name: string;
  foreignNet: number;
  trustNet: number;
  dealerNet: number;
  totalNet: number;
};

/** 三大法人單一資料日。 */
export type T86Day = { date: string; items: T86NetItem[] };

/** 集保大戶比例（單一週）。 */
export type WhaleGrade = { bigPct: number; kPct: number; date: string };

/** 月營收列。 */
export type RevenueRow = {
  code: string;
  name: string;
  industry?: string;
  momPct: number | null;
  yoyPct: number | null;
  month?: string;
};

/** 除權息列。 */
export type ExRightRow = {
  code: string;
  name: string;
  exDate: string;
  refPrice: number | null;
};

// ===========================================================================
// 三、數值／序列工具
// ===========================================================================

/** 四捨五入至指定小數位。 */
export function roundTo(value: number, digits = 2): number {
  if (!Number.isFinite(value)) return 0;
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

/** 由 from → to 的百分比變化（%）；from 無效或為 0 回 null（不捏造）。 */
export function pctChange(from: number, to: number): number | null {
  if (!Number.isFinite(from) || !Number.isFinite(to) || from === 0) return null;
  return ((to - from) / Math.abs(from)) * 100;
}

/** 陣列平均；空陣列回 null。 */
export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/** 解析含千分位逗號的數字；無效回 null。 */
export function toNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).replace(/,/g, '').trim();
  if (s === '' || s === '--' || s === '---') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** 股 → 張（四捨五入）；無效回 0。 */
export function toLots(raw: unknown): number {
  const n = toNumber(raw);
  if (n === null) return 0;
  return Math.round(n / 1000);
}

/** 去除物件所有 key 的 BOM 前綴（TDCC `資料日期` 帶 BOM 的防禦）。 */
export function normalizeKeys(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(row)) {
    out[key.replace(/^\ufeff/, '')] = row[key];
  }
  return out;
}

/**
 * 由 `{ date, twse, tpex }[]`（KV 存檔形狀）建立「代號 → 升冪日 K」序列。
 * 逐日展開緊湊 bar；輸入天數已升冪，輸出序列亦為升冪。
 */
export function buildCodeSeries(
  days: Array<{ date: string; twse: CompactBar[]; tpex: CompactBar[] }>,
): CodeSeriesMap {
  const map: CodeSeriesMap = new Map();
  for (const day of days) {
    const groups: CompactBar[][] = [day.twse ?? [], day.tpex ?? []];
    for (const group of groups) {
      for (const c of group) {
        if (!Array.isArray(c) || c.length < 6) continue;
        const code = String(c[0]);
        const bar: DatedBar = {
          date: day.date,
          code,
          open: Number(c[1]),
          high: Number(c[2]),
          low: Number(c[3]),
          close: Number(c[4]),
          volumeLots: Number(c[5]),
        };
        const arr = map.get(code);
        if (arr) arr.push(bar);
        else map.set(code, [bar]);
      }
    }
  }
  for (const arr of map.values()) {
    arr.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }
  return map;
}

/** 由序列取「最新兩日收盤」計算漲跌幅（%）；不足兩日回 null。 */
export function changePctFromSeries(bars: DatedBar[] | undefined): number | null {
  if (!bars || bars.length < 2) return null;
  const last = bars[bars.length - 1].close;
  const prev = bars[bars.length - 2].close;
  const p = pctChange(prev, last);
  return p === null ? null : roundTo(p);
}

/** 個股名稱（無則 undefined）。 */
function nameOf(meta: StockMetaMap, code: string): string | undefined {
  const n = meta.get(code)?.name;
  return n && n.length > 0 ? n : undefined;
}

/** 個股產業（無則 undefined）。 */
function industryOf(meta: StockMetaMap, code: string): string | undefined {
  const ind = meta.get(code)?.industry;
  return ind && ind.length > 0 ? ind : undefined;
}

/** 卡片標籤：`代號 名稱`（無名稱則僅代號）。 */
function labelOf(meta: StockMetaMap, code: string): string {
  const n = nameOf(meta, code);
  return n ? `${code} ${n}` : code;
}

/** 為帶收盤價的 item 補上價格來源標註。 */
function withPriceMeta(item: SwingItem, asOf: string): SwingItem {
  if (typeof item.close !== 'number') return item;
  return {
    ...item,
    identity_status: 'ok',
    price_unit: 'TWD',
    price_scope: 'eod_close',
    price_as_of: asOf,
    price_status: 'ok',
  };
}

/** 由高到低排序（tie-break 以代號升冪，確保決定性）。 */
function sortDesc<T extends { stock_id: string }>(items: T[], key: (x: T) => number): T[] {
  return items.sort((a, b) => {
    const d = key(b) - key(a);
    if (d !== 0) return d;
    return a.stock_id < b.stock_id ? -1 : a.stock_id > b.stock_id ? 1 : 0;
  });
}

/** 由低到高排序（tie-break 以代號升冪）。 */
function sortAsc<T extends { stock_id: string }>(items: T[], key: (x: T) => number): T[] {
  return items.sort((a, b) => {
    const d = key(a) - key(b);
    if (d !== 0) return d;
    return a.stock_id < b.stock_id ? -1 : a.stock_id > b.stock_id ? 1 : 0;
  });
}

// ===========================================================================
// 四、日 K 條件（需 KV 全市場序列）
// ===========================================================================

/**
 * ma60：資料日收盤 > MA20 > MA60，且 MA20 較前值增加。
 * 逐字對齊實站頁籤說明。
 */
export function computeMa60(ctx: ConditionContext): SwingItem[] {
  const out: SwingItem[] = [];
  for (const [code, bars] of ctx.series) {
    if (!isCommonStockCode(code)) continue;
    if (bars.length < MA_LONG + 1) continue;
    const closes = bars.map((b) => b.close);
    const ma20 = calculateSMA(closes, MA_SHORT);
    const ma60 = calculateSMA(closes, MA_LONG);
    const i = bars.length - 1;
    const close = closes[i];
    const m20 = ma20[i];
    const m60 = ma60[i];
    const m20Prev = ma20[i - 1];
    if (m20 === null || m60 === null || m20Prev === null) continue;
    if (close > m20 && m20 > m60 && m20 > m20Prev) {
      out.push(
        withPriceMeta(
          {
            stock_id: code,
            label: labelOf(ctx.meta, code),
            stock_name: nameOf(ctx.meta, code),
            industry: industryOf(ctx.meta, code),
            close: roundTo(close),
            ma20: roundTo(m20),
            ma60: roundTo(m60),
            hint: `收盤 ${close.toFixed(2)} > 月線 ${m20.toFixed(2)} > 季線 ${m60.toFixed(2)}`,
          },
          ctx.asOf,
        ),
      );
    }
  }
  return sortDesc(out, (x) => x.close ?? 0).slice(0, SWING_RESULT_LIMIT);
}

/**
 * pullback：資料日收盤高於 MA60，且距 MA20 在正負 2% 內。
 */
export function computePullback(ctx: ConditionContext): SwingItem[] {
  const out: SwingItem[] = [];
  for (const [code, bars] of ctx.series) {
    if (!isCommonStockCode(code)) continue;
    if (bars.length < MA_LONG) continue;
    const closes = bars.map((b) => b.close);
    const ma20 = calculateSMA(closes, MA_SHORT);
    const ma60 = calculateSMA(closes, MA_LONG);
    const i = bars.length - 1;
    const close = closes[i];
    const m20 = ma20[i];
    const m60 = ma60[i];
    if (m20 === null || m60 === null) continue;
    const dev = pctChange(m20, close);
    if (dev === null) continue;
    if (close > m60 && Math.abs(dev) <= PULLBACK_BAND_PCT) {
      out.push(
        withPriceMeta(
          {
            stock_id: code,
            label: labelOf(ctx.meta, code),
            stock_name: nameOf(ctx.meta, code),
            industry: industryOf(ctx.meta, code),
            close: roundTo(close),
            ma20: roundTo(m20),
            hint: `收盤 ${close.toFixed(2)} 距月線 ${dev >= 0 ? '+' : ''}${dev.toFixed(2)}%`,
          },
          ctx.asOf,
        ),
      );
    }
  }
  return sortDesc(out, (x) => -(Math.abs(pctChange(x.ma20 ?? 0, x.close ?? 0) ?? 0))).slice(0, SWING_RESULT_LIMIT);
}

/**
 * reclaim：前一資料日收盤 < MA20，本資料日收盤 > MA20（由月線下方轉為上方）。
 */
export function computeReclaim(ctx: ConditionContext): SwingItem[] {
  const out: SwingItem[] = [];
  for (const [code, bars] of ctx.series) {
    if (!isCommonStockCode(code)) continue;
    if (bars.length < MA_SHORT + 1) continue;
    const closes = bars.map((b) => b.close);
    const ma20 = calculateSMA(closes, MA_SHORT);
    const i = bars.length - 1;
    const close = closes[i];
    const closePrev = closes[i - 1];
    const m20 = ma20[i];
    const m20Prev = ma20[i - 1];
    if (m20 === null || m20Prev === null) continue;
    if (closePrev < m20Prev && close > m20) {
      const changePct = changePctFromSeries(bars);
      out.push(
        withPriceMeta(
          {
            stock_id: code,
            label: labelOf(ctx.meta, code),
            stock_name: nameOf(ctx.meta, code),
            industry: industryOf(ctx.meta, code),
            close: roundTo(close),
            ma20: roundTo(m20),
            change_pct: changePct ?? undefined,
            hint: `前日收盤 ${closePrev.toFixed(2)} < 月線 ${m20Prev.toFixed(2)}，資料日收盤 ${close.toFixed(2)} > 月線 ${m20.toFixed(2)}`,
          },
          ctx.asOf,
        ),
      );
    }
  }
  return sortDesc(out, (x) => x.change_pct ?? 0).slice(0, SWING_RESULT_LIMIT);
}

/**
 * break20：資料日收盤為近 20 日新高（高於前 20 日最高價），且成交量 ≥ 20 日均量 1.5 倍。
 */
export function computeBreak20(ctx: ConditionContext): SwingItem[] {
  const out: SwingItem[] = [];
  for (const [code, bars] of ctx.series) {
    if (!isCommonStockCode(code)) continue;
    if (bars.length < BREAK_HIGH_LOOKBACK + 1) continue;
    const i = bars.length - 1;
    const window = bars.slice(i - BREAK_HIGH_LOOKBACK, i); // 前 20 日（不含當日）
    const maxHigh = Math.max(...window.map((b) => b.high));
    const avgVol = mean(window.map((b) => b.volumeLots)) ?? 0;
    const today = bars[i];
    if (avgVol <= 0) continue;
    const volRatio = today.volumeLots / avgVol;
    if (today.close > maxHigh && volRatio >= VOLUME_SURGE_MULTIPLE) {
      const changePct = changePctFromSeries(bars);
      out.push(
        withPriceMeta(
          {
            stock_id: code,
            label: labelOf(ctx.meta, code),
            stock_name: nameOf(ctx.meta, code),
            industry: industryOf(ctx.meta, code),
            close: roundTo(today.close),
            change_pct: changePct ?? undefined,
            vol_ratio: roundTo(volRatio),
            hint: `收盤 ${today.close.toFixed(2)} 突破前 ${BREAK_HIGH_LOOKBACK} 日高 ${maxHigh.toFixed(2)}；量 ${volRatio.toFixed(2)} 倍`,
          },
          ctx.asOf,
        ),
      );
    }
  }
  return sortDesc(out, (x) => x.vol_ratio ?? 0).slice(0, SWING_RESULT_LIMIT);
}

/**
 * rs：近 20 日區間報酬與累計成交張數皆達門檻，依報酬由高到低排序。
 */
export function computeRs(ctx: ConditionContext): SwingItem[] {
  const out: SwingItem[] = [];
  for (const [code, bars] of ctx.series) {
    if (!isCommonStockCode(code)) continue;
    if (bars.length < RS_LOOKBACK + 1) continue;
    const i = bars.length - 1;
    const base = bars[i - RS_LOOKBACK].close;
    const ret = pctChange(base, bars[i].close);
    if (ret === null) continue;
    const turnover = bars
      .slice(i - RS_LOOKBACK + 1, i + 1)
      .reduce((s, b) => s + b.volumeLots, 0);
    if (ret >= RS_MIN_RETURN_PCT && turnover >= RS_MIN_TURNOVER_LOTS) {
      out.push(
        withPriceMeta(
          {
            stock_id: code,
            label: labelOf(ctx.meta, code),
            stock_name: nameOf(ctx.meta, code),
            industry: industryOf(ctx.meta, code),
            close: roundTo(bars[i].close),
            ret20: roundTo(ret, 1),
            hint: `近 ${RS_LOOKBACK} 日區間報酬 ${ret >= 0 ? '+' : ''}${ret.toFixed(1)}%`,
          },
          ctx.asOf,
        ),
      );
    }
  }
  return sortDesc(out, (x) => x.ret20 ?? 0).slice(0, SWING_RESULT_LIMIT);
}

/**
 * sector：族群（產業）近 20 日平均報酬與個股區間報酬皆達門檻。
 * ⚠ 需產業分類（來源：TWSE 月營收 OpenAPI）；若產業地圖為空則回空陣列。
 */
export function computeSector(ctx: ConditionContext): SwingItem[] {
  // 先算每檔近 20 日報酬與所屬產業。
  const rets = new Map<string, number>();
  const industryOfCode = new Map<string, string>();
  for (const [code, bars] of ctx.series) {
    if (!isCommonStockCode(code)) continue;
    if (bars.length < RS_LOOKBACK + 1) continue;
    const ind = industryOf(ctx.meta, code);
    if (!ind) continue;
    const i = bars.length - 1;
    const ret = pctChange(bars[i - RS_LOOKBACK].close, bars[i].close);
    if (ret === null) continue;
    rets.set(code, ret);
    industryOfCode.set(code, ind);
  }
  if (rets.size === 0) return [];

  // 族群平均報酬。
  const groups = new Map<string, number[]>();
  for (const [code, ret] of rets) {
    const ind = industryOfCode.get(code);
    if (!ind) continue;
    const arr = groups.get(ind);
    if (arr) arr.push(ret);
    else groups.set(ind, [ret]);
  }
  const indAvg = new Map<string, number>();
  for (const [ind, arr] of groups) {
    const avg = mean(arr);
    if (avg !== null) indAvg.set(ind, avg);
  }

  const out: SwingItem[] = [];
  for (const [code, ret] of rets) {
    const ind = industryOfCode.get(code);
    if (!ind) continue;
    const avg = indAvg.get(ind);
    if (avg === undefined) continue;
    if (ret >= SECTOR_MIN_STOCK_RETURN_PCT && avg >= SECTOR_MIN_AVG_RETURN_PCT) {
      const bars = ctx.series.get(code);
      out.push(
        withPriceMeta(
          {
            stock_id: code,
            label: labelOf(ctx.meta, code),
            stock_name: nameOf(ctx.meta, code),
            industry: ind,
            close: bars ? roundTo(bars[bars.length - 1].close) : undefined,
            ret20: roundTo(ret, 1),
            hint: `${ind}族群 ${RS_LOOKBACK} 日均 ${avg >= 0 ? '+' : ''}${avg.toFixed(1)}%｜個股 ${ret >= 0 ? '+' : ''}${ret.toFixed(1)}%`,
          },
          ctx.asOf,
        ),
      );
    }
  }
  return sortDesc(out, (x) => x.ret20 ?? 0).slice(0, SWING_RESULT_LIMIT);
}

// ===========================================================================
// 五、法人條件（需 T86）
// ===========================================================================

/**
 * 外資／投信連買：最近 INSTITUTIONAL_STREAK_DAYS 個「資料日」該欄位皆 > 0。
 * @param days 升冪的資料日（僅含有效日）
 * @param field 'foreignNet'（外資）或 'trustNet'（投信）
 */
export function computeInstitutionalStreak(
  ctx: ConditionContext,
  days: T86Day[],
  field: 'foreignNet' | 'trustNet',
): SwingItem[] {
  const recent = days.slice(-INSTITUTIONAL_STREAK_DAYS);
  if (recent.length < INSTITUTIONAL_STREAK_DAYS) return [];

  // 每日 symbol → net 的快速查表。
  const perDay = recent.map((d) => {
    const m = new Map<string, number>();
    for (const it of d.items) m.set(it.symbol, it[field]);
    return m;
  });

  const latest = recent[recent.length - 1];
  const label = field === 'foreignNet' ? '外資' : '投信';
  const out: SwingItem[] = [];
  for (const it of latest.items) {
    if (!isCommonStockCode(it.symbol)) continue;
    let ok = it[field] > 0;
    if (!ok) continue;
    let sum = it[field];
    for (let k = 0; k < perDay.length - 1; k += 1) {
      const v = perDay[k].get(it.symbol);
      if (v === undefined || v <= 0) {
        ok = false;
        break;
      }
      sum += v;
    }
    if (!ok) continue;
    const bars = ctx.series.get(it.symbol);
    const close = bars ? bars[bars.length - 1].close : undefined;
    const changePct = changePctFromSeries(bars);
    out.push(
      withPriceMeta(
        {
          stock_id: it.symbol,
          label: nameOf(ctx.meta, it.symbol) ? `${it.symbol} ${nameOf(ctx.meta, it.symbol)}` : it.symbol,
          stock_name: nameOf(ctx.meta, it.symbol) ?? (it.name || undefined),
          industry: industryOf(ctx.meta, it.symbol),
          close: close === undefined ? undefined : roundTo(close),
          change_pct: changePct ?? undefined,
          hint: `${label}連買 ${INSTITUTIONAL_STREAK_DAYS} 日（合計 ${sum} 張）`,
          change_scope: 'eod',
          change_as_of: ctx.asOf,
          change_status: changePct === null ? 'checking' : 'ok',
        },
        ctx.asOf,
      ),
    );
  }
  return sortDesc(out, (x) => x.change_pct ?? 0).slice(0, SWING_RESULT_LIMIT);
}

/**
 * 雙法人同買：最近一個資料日外資與投信「同時」買超。
 */
export function computeBothBuy(ctx: ConditionContext, latestDay: T86Day): SwingItem[] {
  const out: SwingItem[] = [];
  for (const it of latestDay.items) {
    if (!isCommonStockCode(it.symbol)) continue;
    if (it.foreignNet > 0 && it.trustNet > 0) {
      const bars = ctx.series.get(it.symbol);
      const close = bars ? bars[bars.length - 1].close : undefined;
      const changePct = changePctFromSeries(bars);
      out.push(
        withPriceMeta(
          {
            stock_id: it.symbol,
            label: nameOf(ctx.meta, it.symbol) ? `${it.symbol} ${nameOf(ctx.meta, it.symbol)}` : it.symbol,
            stock_name: nameOf(ctx.meta, it.symbol) ?? (it.name || undefined),
            industry: industryOf(ctx.meta, it.symbol),
            close: close === undefined ? undefined : roundTo(close),
            change_pct: changePct ?? undefined,
            hint: `外資買超 ${it.foreignNet} 張、投信買超 ${it.trustNet} 張`,
            change_scope: 'eod',
            change_as_of: ctx.asOf,
            change_status: changePct === null ? 'checking' : 'ok',
          },
          ctx.asOf,
        ),
      );
    }
  }
  return sortDesc(out, (x) => (x.change_pct ?? 0)).slice(0, SWING_RESULT_LIMIT);
}

// ===========================================================================
// 六、融資條件（需 MI_MARGN）
// ===========================================================================

/**
 * margin：融資餘額較約 20 個交易日前下降（降幅 ≥ MARGIN_DROP_MIN_LOTS 張）。
 * @param today 資料日 代號 → 融資今日餘額（張）
 * @param baseline 基準日（約 20 交易日前）代號 → 融資今日餘額（張）
 */
export function computeMarginDrop(
  ctx: ConditionContext,
  today: Map<string, number>,
  baseline: Map<string, number>,
): SwingItem[] {
  const out: SwingItem[] = [];
  for (const [code, balance] of today) {
    if (!isCommonStockCode(code)) continue;
    const prev = baseline.get(code);
    if (prev === undefined) continue;
    const delta = balance - prev;
    if (delta > -MARGIN_DROP_MIN_LOTS) continue;
    const bars = ctx.series.get(code);
    const close = bars ? bars[bars.length - 1].close : undefined;
    const ret20 =
      bars && bars.length >= RS_LOOKBACK + 1
        ? pctChange(bars[bars.length - 1 - RS_LOOKBACK].close, bars[bars.length - 1].close)
        : null;
    out.push(
      withPriceMeta(
        {
          stock_id: code,
          label: labelOf(ctx.meta, code),
          stock_name: nameOf(ctx.meta, code),
          industry: industryOf(ctx.meta, code),
          close: close === undefined ? undefined : roundTo(close),
          margin_delta_lots: delta,
          ret20: ret20 === null ? undefined : roundTo(ret20, 1),
          hint: `融資餘額 ${prev} → ${balance} 張（${delta} 張）`,
        },
        ctx.asOf,
      ),
    );
  }
  return sortAsc(out, (x) => x.margin_delta_lots ?? 0).slice(0, SWING_RESULT_LIMIT);
}

// ===========================================================================
// 七、月營收條件（需 t187ap05_L）
// ===========================================================================

/**
 * revenue：最近月營收 MoM 與 YoY 皆達門檻，依 MoM 由高到低排序。
 */
export function computeRevenue(rows: RevenueRow[]): SwingItem[] {
  const qualifying = rows
    .filter(
      (r) =>
        isCommonStockCode(r.code) &&
        r.momPct !== null &&
        r.yoyPct !== null &&
        r.momPct >= REVENUE_MOM_MIN_PCT &&
        r.yoyPct >= REVENUE_YOY_MIN_PCT,
    )
    .sort((a, b) => (b.momPct ?? 0) - (a.momPct ?? 0) || (a.code < b.code ? -1 : 1))
    .slice(0, SWING_RESULT_LIMIT);

  return qualifying.map((r) => ({
    stock_id: r.code,
    label: r.name ? `${r.code} ${r.name}` : r.code,
    stock_name: r.name || undefined,
    industry: r.industry,
    identity_status: 'ok',
    price_unit: 'TWD',
    price_scope: 'unavailable',
    price_status: 'checking',
    hint: `${r.month ? `${r.month} ` : ''}月營收 MoM ${(r.momPct ?? 0) >= 0 ? '+' : ''}${(r.momPct ?? 0).toFixed(1)}%、YoY ${(r.yoyPct ?? 0) >= 0 ? '+' : ''}${(r.yoyPct ?? 0).toFixed(1)}%`,
  }));
}

// ===========================================================================
// 八、除權息填息條件（需 TWT48U + 日 K）
// ===========================================================================

/**
 * fill：近期已除權息個股，資料日收盤相對除權息參考價的回升進度。
 * @param rows TWT48U 除權息預告／結果列
 * @param asOf 價格資料日（'YYYY-MM-DD'）；僅計入 exDate ≤ asOf 者
 */
export function computeFill(ctx: ConditionContext, rows: ExRightRow[]): SwingItem[] {
  const out: SwingItem[] = [];
  for (const r of rows) {
    if (!isCommonStockCode(r.code)) continue;
    if (!r.refPrice || r.refPrice <= 0) continue;
    if (!r.exDate || r.exDate > ctx.asOf) continue; // 尚未除權息 → 無法計算回升
    const bars = ctx.series.get(r.code);
    if (!bars || bars.length === 0) continue;
    const after = bars.filter((b) => b.date >= r.exDate);
    if (after.length === 0) continue;
    const close = after[after.length - 1].close;
    const recovery = pctChange(r.refPrice, close);
    if (recovery === null || recovery < FILL_RECOVERY_MIN_PCT) continue;
    out.push(
      withPriceMeta(
        {
          stock_id: r.code,
          label: r.name ? `${r.code} ${r.name}` : labelOf(ctx.meta, r.code),
          stock_name: r.name || nameOf(ctx.meta, r.code),
          industry: industryOf(ctx.meta, r.code),
          close: roundTo(close),
          hint: `除權息 ${r.exDate}｜參考價 ${r.refPrice.toFixed(2)}｜資料日收盤相對參考價 ${recovery >= 0 ? '+' : ''}${recovery.toFixed(1)}%（填息中／已填觀察）`,
        },
        ctx.asOf,
      ),
    );
  }
  return sortDesc(out, (x) => {
    const row = rows.find((r) => r.code === x.stock_id);
    if (!row || !row.refPrice || x.close === undefined) return 0;
    return pctChange(row.refPrice, x.close) ?? 0;
  }).slice(0, SWING_RESULT_LIMIT);
}

// ===========================================================================
// 九、大戶持股條件（需 TDCC 集保 1-5）
// ===========================================================================

/**
 * 大戶持股（whale_in / whale_out）。
 *
 * ⚠ TDCC OpenAPI 1-5 只回「當週」，無歷史週檔 → delta_1w／delta_4w／up_weeks／
 *   down_weeks 一律回 null（前端顯示「累積中」），weeks 回累積週數。
 *   故首版兩方向無法以增減判定；本站誠實作法：皆列出當週 400 張以上比例最高者
 *   （依 big_pct 由高到低），並由 route 於 tab 上加 note 說明。
 *
 * @param whale 代號 → { bigPct, kPct, date }
 * @param weeksAccumulated 已累積的週數（首版為 1）
 */
export function computeWhale(
  ctx: ConditionContext,
  whale: Map<string, WhaleGrade>,
  weeksAccumulated: number,
): SwingItem[] {
  const out: SwingItem[] = [];
  for (const [code, g] of whale) {
    if (!isCommonStockCode(code)) continue;
    if (!(g.bigPct > 0)) continue; // 無 400 張以上持股 → 不列入
    out.push({
      stock_id: code,
      label: labelOf(ctx.meta, code),
      stock_name: nameOf(ctx.meta, code),
      industry: industryOf(ctx.meta, code),
      big_pct: roundTo(g.bigPct),
      k_pct: roundTo(g.kPct),
      delta_1w: null,
      delta_4w: null,
      up_weeks: null,
      down_weeks: null,
      weeks: weeksAccumulated,
      identity_status: 'ok',
      price_unit: 'TWD',
      price_scope: 'unavailable',
      price_as_of: ctx.asOf,
      price_status: 'checking',
      hint: `400 張以上持股 ${g.bigPct.toFixed(2)}%（千張以上 ${g.kPct.toFixed(2)}%）；週增減累積中`,
    });
  }
  return sortDesc(out, (x) => x.big_pct ?? 0).slice(0, WHALE_RESULT_LIMIT);
}

// ===========================================================================
// 十、交集條件（smart）
// ===========================================================================

/**
 * smart：融資餘額下降 ＋ 400 張以上持股比例達門檻 ＋ 量價（量比）達門檻之交集。
 *
 * @param marginDelta 代號 → 融資餘額變化（張，負值為下降）
 * @param whale 代號 → 大戶比例
 */
export function computeSmart(
  ctx: ConditionContext,
  marginDelta: Map<string, number>,
  whale: Map<string, WhaleGrade>,
): SwingItem[] {
  const out: SwingItem[] = [];
  for (const [code, bars] of ctx.series) {
    if (!isCommonStockCode(code)) continue;
    const delta = marginDelta.get(code);
    if (delta === undefined || delta >= 0) continue; // 需融資下降
    const w = whale.get(code);
    if (!w || w.bigPct < SMART_WHALE_MIN_BIG_PCT) continue;
    if (bars.length < SMART_RANGE_LOOKBACK + 1) continue;
    const i = bars.length - 1;
    const window = bars.slice(i - SMART_RANGE_LOOKBACK + 1, i + 1);
    const hi = Math.max(...window.map((b) => b.high));
    const lo = Math.min(...window.map((b) => b.low));
    const rangePct = lo > 0 ? ((hi - lo) / lo) * 100 : null;
    if (rangePct === null) continue;
    const prevWindow = bars.slice(i - 20, i);
    const avgVol = mean(prevWindow.map((b) => b.volumeLots)) ?? 0;
    if (avgVol <= 0) continue;
    const volRatio = bars[i].volumeLots / avgVol;
    if (volRatio < SMART_VOL_RATIO_MIN) continue;
    out.push(
      withPriceMeta(
        {
          stock_id: code,
          label: labelOf(ctx.meta, code),
          stock_name: nameOf(ctx.meta, code),
          name: nameOf(ctx.meta, code),
          industry: industryOf(ctx.meta, code),
          close: roundTo(bars[i].close),
          range_pct: roundTo(rangePct, 1),
          vol_ratio: roundTo(volRatio),
          margin_delta_lots: delta,
          whale_delta_pct: null,
          hint: `${SMART_RANGE_LOOKBACK} 日區間幅度 ${rangePct.toFixed(1)}%、量比 ${volRatio.toFixed(1)}；融資餘額減少 ${-delta} 張、400 張以上持股 ${w.bigPct.toFixed(2)}%`,
          read: `同一歷史觀察窗內：區間幅度 ${rangePct.toFixed(1)}%、量比 ${volRatio.toFixed(1)}、融資餘額減少 ${-delta} 張、400 張以上持股比例 ${w.bigPct.toFixed(2)}%。只描述條件同時發生，不推論交易人身分或後續方向。`,
        },
        ctx.asOf,
      ),
    );
  }
  return sortDesc(out, (x) => x.vol_ratio ?? 0).slice(0, SWING_RESULT_LIMIT);
}

// ===========================================================================
// 十一、上游列解析（純函式，集中於此以便單元測試兩個必踩的坑）
// ===========================================================================

/**
 * 解析 TDCC 集保戶股權分散表（OpenAPI 1-5）。
 *
 * 兩個必踩的坑（本函式已處理，並有單元測試把關）：
 *   1. `證券代號` 為**右補空格**的 6 字元（例：`'2330  '`）→ 一律 `.trim()`。
 *   2. `資料日期` 這個 key **帶 BOM**（`'\ufeff資料日期'`）→ 以 normalizeKeys 去 BOM。
 *
 * 分級 12–15 累加為 400 張以上比例（big_pct）；15 為千張以上比例（k_pct）；
 * 16（差異調整）、17（合計）排除。
 *
 * @returns 代號 → { bigPct, kPct, date }
 */
export function parseTdccRows(raw: unknown): Map<string, WhaleGrade> {
  const out = new Map<string, WhaleGrade>();
  if (!Array.isArray(raw)) return out;
  const acc = new Map<string, { big: number; k: number; date: string }>();
  for (const row of raw) {
    if (row === null || typeof row !== 'object' || Array.isArray(row)) continue;
    const r = normalizeKeys(row as Record<string, unknown>);
    const code = String(r['證券代號'] ?? '').trim();
    if (!code) continue;
    const grade = String(r['持股分級'] ?? '').trim();
    if (TDCC_EXCLUDE_GRADES.includes(grade)) continue;
    const pct = toNumber(r['占集保庫存數比例%']);
    if (pct === null) continue;
    const date = String(r['資料日期'] ?? '').trim();
    let entry = acc.get(code);
    if (!entry) {
      entry = { big: 0, k: 0, date };
      acc.set(code, entry);
    }
    if (date) entry.date = date;
    const g = Number(grade);
    if (Number.isFinite(g) && g >= TDCC_BIG_MIN_GRADE && g <= TDCC_BIG_MAX_GRADE) {
      entry.big += pct;
    }
    if (grade === String(TDCC_K_GRADE)) entry.k = pct;
  }
  for (const [code, e] of acc) {
    out.set(code, { bigPct: roundTo(e.big), kPct: roundTo(e.k), date: e.date });
  }
  return out;
}

/**
 * 解析 TWSE T86 三大法人列（欄位索引沿用既有 t86 route 的實測口徑）。
 * 單位由「股」換算為「張」。
 */
export function parseT86Rows(raw: unknown): T86NetItem[] {
  const data = (raw as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return [];
  const out: T86NetItem[] = [];
  for (const row of data) {
    if (!Array.isArray(row) || row.length < 19) continue;
    const symbol = String(row[0] ?? '').trim();
    if (!symbol) continue;
    out.push({
      symbol,
      name: String(row[1] ?? '').trim(),
      foreignNet: toLots(row[4]),
      trustNet: toLots(row[10]),
      dealerNet: toLots(row[11]),
      totalNet: toLots(row[18]),
    });
  }
  return out;
}

/**
 * MI_MARGN（rwd 陣列形式）「融資今日餘額」的欄位索引。
 * rwd 每列為：0 代號、1 名稱、2 融資買進、3 融資賣出、4 融資現金償還、5 融資前日餘額、6 融資今日餘額、…
 */
export const MARGN_RWD_TODAY_BALANCE_INDEX = 6;

/**
 * 解析 MI_MARGN 融資融券餘額列 → 代號 → 融資今日餘額（張）。
 * 相容三種來源形狀：
 *   - OpenAPI 物件列（`股票代號` + `融資今日餘額`）
 *   - rwd 物件列（`代號` + `融資今日餘額`）
 *   - rwd 陣列列（index 0 = 代號、index 6 = 融資今日餘額）
 */
export function parseMarginRows(raw: unknown): Map<string, number> {
  const out = new Map<string, number>();
  if (!Array.isArray(raw)) return out;
  for (const row of raw) {
    if (Array.isArray(row)) {
      // rwd 陣列形式。
      const code = String(row[0] ?? '').trim();
      if (!code) continue;
      const bal = toNumber(row[MARGN_RWD_TODAY_BALANCE_INDEX]);
      if (bal !== null) out.set(code, bal);
      continue;
    }
    if (row !== null && typeof row === 'object') {
      const r = normalizeKeys(row as Record<string, unknown>);
      const code = String(r['股票代號'] ?? r['代號'] ?? '').trim();
      if (!code) continue;
      const bal = toNumber(r['融資今日餘額']);
      if (bal !== null) out.set(code, bal);
    }
  }
  return out;
}

/** 解析民國年月（'11508' → '2026-08'）。 */
export function formatRocMonth(raw: string): string | undefined {
  const m = /^(\d{2,3})(\d{2})$/.exec(raw.trim());
  if (!m) return undefined;
  const year = Number(m[1]) + 1911;
  return `${year}-${m[2]}`;
}

/**
 * 解析 TWSE 月營收 OpenAPI t187ap05_L 列。
 * 此來源同時提供公司名稱與產業別（＝本站名稱／產業的主要來源，僅上市）。
 */
export function parseRevenueRows(raw: unknown): RevenueRow[] {
  if (!Array.isArray(raw)) return [];
  const out: RevenueRow[] = [];
  for (const row of raw) {
    if (row === null || typeof row !== 'object' || Array.isArray(row)) continue;
    const r = normalizeKeys(row as Record<string, unknown>);
    const code = String(r['公司代號'] ?? '').trim();
    if (!code) continue;
    out.push({
      code,
      name: String(r['公司名稱'] ?? '').trim(),
      industry: String(r['產業別'] ?? '').trim() || undefined,
      momPct: toNumber(r['營業收入-上月比較增減(%)']),
      yoyPct: toNumber(r['營業收入-去年同月增減(%)']),
      month: formatRocMonth(String(r['資料年月'] ?? '')),
    });
  }
  return out;
}

/** 解析民國日期（'115年09月23日' → '2026-09-23'）。 */
export function parseRocDate(raw: string): string | null {
  const m = /(\d{2,3})年(\d{1,2})月(\d{1,2})日/.exec(raw.trim());
  if (!m) return null;
  const year = Number(m[1]) + 1911;
  return `${year}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}

/** 由「參考價試算」欄位取出數值；含 HTML 標籤或「待公告」時回 null。 */
export function extractRefPrice(raw: string): number | null {
  const text = raw.replace(/<[^>]*>/g, ' ').trim();
  const m = /-?\d+(\.\d+)?/.exec(text);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * 解析 TWSE TWT48U 除權除息預告表。
 * 欄位：0 除權除息日期、1 股票代號、2 名稱、9 參考價試算。
 */
export function parseExRightRows(raw: unknown): ExRightRow[] {
  const data = (raw as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return [];
  const out: ExRightRow[] = [];
  for (const row of data) {
    if (!Array.isArray(row) || row.length < 10) continue;
    const code = String(row[1] ?? '').trim();
    if (!code) continue;
    out.push({
      code,
      name: String(row[2] ?? '').trim(),
      exDate: parseRocDate(String(row[0] ?? '')) ?? '',
      refPrice: extractRefPrice(String(row[9] ?? '')),
    });
  }
  return out;
}
