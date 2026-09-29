/**
 * scanPayload（掃描結果組裝層）單元測試
 * ----------------------------------------------------------------------------
 * 本檔測的是「組裝層」：把多日全市場日 K（＋上游資料）組成
 * `/api/skynet/pattern-screen`、`/api/skynet/swing-hub` 的回應形狀。
 *
 * 為什麼要單獨測這一層：
 *   Edge（Cloudflare Free plan，CPU 上限 10ms）不能在單次請求內重算 70 天全市場日 K
 *   （實測 503 error code: 1102），故改為「離線預算 + 寫入 KV」。組裝邏輯因此被抽到
 *   src/lib/scanPayload.ts，由「本機預算腳本」與「Edge route」共用——共用就必須有測試
 *   防止兩邊漂移，也防止組裝層在缺資料時偷偷捏造。
 *
 * 全部使用合成資料，不觸及網路／KV／上游。
 */

import {
  buildPatternScreenKvCorrupt,
  buildPatternScreenKvUnbound,
  buildPatternScreenNotReady,
  buildPatternScreenPayload,
  buildSwingHubKvUnbound,
  buildSwingHubNotReady,
  buildSwingHubPayload,
  isUsablePatternScreenPayload,
  isUsableSwingHubPayload,
  SCAN_KV_KEY_PATTERN_SCREEN,
  SCAN_KV_KEY_SWING_HUB,
  NOT_PRECOMPUTED_REASON,
  type ScanDayInput,
  type SwingUpstreams,
} from '../scanPayload';
import { MIN_BARS_FOR_SCAN, PATTERN_ORDER } from '../patternScan';
import type { CompactBar } from '../marketBars';

// ---------------------------------------------------------------------------
// 合成資料工具
// ---------------------------------------------------------------------------

/** 產生連續日期 'YYYY-MM-DD'（升冪）。 */
function datesFrom(startYmd: string, count: number): string[] {
  const [y, m, d] = startYmd.split('-').map(Number);
  const out: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const dt = new Date(Date.UTC(y, m - 1, d + i));
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(dt.getUTCDate()).padStart(2, '0');
    out.push(`${dt.getUTCFullYear()}-${mm}-${dd}`);
  }
  return out;
}

/** 由「轉折路徑」線性內插出收盤序列。 */
function closesFromWaypoints(waypoints: Array<[number, number]>, length: number): number[] {
  const closes = new Array<number>(length).fill(waypoints[0][1]);
  let seg = 0;
  for (let i = 0; i < length; i += 1) {
    while (seg < waypoints.length - 2 && i > waypoints[seg + 1][0]) seg += 1;
    const [i0, p0] = waypoints[seg];
    const [i1, p1] = waypoints[seg + 1];
    const t = i1 === i0 ? 0 : (i - i0) / (i1 - i0);
    closes[i] = p0 + (p1 - p0) * Math.min(1, Math.max(0, t));
  }
  return closes;
}

/** 造出「單一檔 W 底」的多日全市場日 K（twse 放該檔、tpex 空）。 */
function makeWBottomDays(days: number, code = '2330'): ScanDayInput[] {
  const dates = datesFrom('2026-07-01', days);
  const waypoints: Array<[number, number]> = [
    [0, 100],
    [Math.round(days * 0.22), 80],
    [Math.round(days * 0.44), 92],
    [Math.round(days * 0.67), 81],
    [days - 1, 95],
  ];
  const closes = closesFromWaypoints(waypoints, days);
  return dates.map((date, i) => {
    const c = closes[i];
    const bar: CompactBar = [code, c, c + 0.5, c - 0.5, c, 5000];
    return { date, twse: [bar], tpex: [] };
  });
}

/** 造出「單一檔單調遞升」的多日全市場日 K（供 MA60 等均線條件命中）。 */
function makeRisingDays(days: number, code = '2330'): ScanDayInput[] {
  const dates = datesFrom('2026-06-01', days);
  return dates.map((date, i) => {
    const c = 100 + i;
    const bar: CompactBar = [code, c, c + 0.5, c - 0.5, c, 20000];
    return { date, twse: [bar], tpex: [] };
  });
}

/** 造出完整的 swing 上游（TDCC / T86 ×3 日 / 融資 ×2 / 月營收 / 除權息）。 */
function makeSwingUpstreams(): SwingUpstreams {
  const item = (foreignNet: number, trustNet: number) => ({
    symbol: '2330',
    name: '台積電',
    foreignNet,
    trustNet,
    dealerNet: 0,
    totalNet: foreignNet + trustNet,
  });
  return {
    t86Days: [
      { date: '2026-08-12', items: [item(100, 10)] },
      { date: '2026-08-13', items: [item(120, 20)] },
      { date: '2026-08-14', items: [item(150, 30)] },
    ],
    tdcc: new Map([['2330', { bigPct: 70, kPct: 20, date: '20260918' }]]),
    revenueRows: [
      { code: '2330', name: '台積電', industry: '半導體業', momPct: 5, yoyPct: 10, month: '11508' },
    ],
    exRightRows: [],
    marginToday: new Map([['2330', 8000]]),
    marginBaseline: new Map([['2330', 9000]]),
  };
}

/** 取出指定 tab。 */
function tabOf(tabs: Array<{ id: string; items: unknown[]; unavailable_reason?: string }>, id: string) {
  const t = tabs.find((x) => x.id === id);
  if (!t) throw new Error(`tab 不存在：${id}`);
  return t;
}

// ---------------------------------------------------------------------------
// buildPatternScreenPayload
// ---------------------------------------------------------------------------

describe('buildPatternScreenPayload（pattern-screen 組裝）', () => {
  it('固定 45 天 W 底序列 → ready:true，7 種型態齊備，w_bottom 命中該檔', () => {
    const days = makeWBottomDays(45);
    const nameMap = new Map([['2330', '台積電']]);
    const res = buildPatternScreenPayload({ days, nameMap });

    expect(res.ok).toBe(true);
    expect(res.ready).toBe(true);
    expect(Object.keys(res.patterns ?? {})).toEqual([...PATTERN_ORDER]);
    expect(res.patterns?.w_bottom.count).toBeGreaterThanOrEqual(1);
    expect(res.patterns?.w_bottom.items[0].stock_id).toBe('2330');
    expect(res.patterns?.w_bottom.items[0].stock_name).toBe('台積電');
    expect(res.patterns?.w_bottom.items[0].label).toBe('2330 台積電');
  });

  it('data_date 取視窗「最後一天」', () => {
    const days = makeWBottomDays(45);
    const res = buildPatternScreenPayload({ days });
    const last = days[days.length - 1].date;
    expect(res.data_date).toBe(last);
    expect(res.availableDays).toBe(45);
    expect(res.windowDays).toBe(45);
  });

  it('無名稱對照 → label 僅顯示代號（不捏造名稱）', () => {
    const days = makeWBottomDays(45);
    const res = buildPatternScreenPayload({ days });
    const item = res.patterns?.w_bottom.items[0];
    expect(item?.stock_name).toBe('');
    expect(item?.label).toBe('2330');
  });

  it('反向實驗：日數不足 MIN_BARS_FOR_SCAN → ready:false，絕不回空 patterns 假裝掃過', () => {
    const days = makeWBottomDays(MIN_BARS_FOR_SCAN - 1);
    const res = buildPatternScreenPayload({ days });
    expect(res.ok).toBe(true);
    expect(res.ready).toBe(false);
    expect(res.patterns).toBeUndefined();
    expect(res.availableDays).toBe(MIN_BARS_FOR_SCAN - 1);
    expect(res.minDaysRequired).toBe(MIN_BARS_FOR_SCAN);
    expect(res.reason).toBe('insufficient_data');
  });

  it('髒資料（twse/tpex 非陣列、天數為 0）不崩，且誠實標為未就緒', () => {
    const res = buildPatternScreenPayload({
      days: [{ date: '2026-07-01', twse: 'not-an-array', tpex: null }],
    });
    expect(res.ready).toBe(false);
    expect(res.availableDays).toBe(1);
  });

  it('ETF（0050）不在掃描宇宙內（僅 4 碼上市櫃個股）', () => {
    const days = makeWBottomDays(45, '0050');
    const res = buildPatternScreenPayload({ days });
    expect(res.ready).toBe(true);
    expect(res.scannedStocks).toBe(0);
    expect(res.patterns?.w_bottom.count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// buildSwingHubPayload
// ---------------------------------------------------------------------------

describe('buildSwingHubPayload（swing-hub 組裝）', () => {
  it('上游齊全 + 65 日序列 → ready:true，16 個 tab，ma60 命中 2330', () => {
    const days = makeRisingDays(65);
    const res = buildSwingHubPayload({ days, upstreams: makeSwingUpstreams() });
    const tabs = res.tabs ?? [];

    expect(res.ok).toBe(true);
    expect(res.ready).toBe(true);
    expect(tabs).toHaveLength(16);
    // 價格資料日取 T86 最新資料日。
    expect(res.data_date).toBe('2026-08-14');
    expect(res.week).toBe('2026-09-18');
    expect(res.weeksAccumulated).toBe(1);

    const ma60 = tabOf(tabs, 'ma60');
    expect(ma60.items.length).toBeGreaterThan(0);
    expect((ma60.items[0] as { stock_id: string }).stock_id).toBe('2330');
    expect(ma60.unavailable_reason).toBeUndefined();

    // 法人連買（3 個資料日）。
    expect(tabOf(tabs, 'foreign').items.length).toBeGreaterThan(0);
    expect(tabOf(tabs, 'trust').items.length).toBeGreaterThan(0);
    expect(tabOf(tabs, 'both').items.length).toBeGreaterThan(0);
    // 融資餘額下降（9000 → 8000）。
    expect(tabOf(tabs, 'margin').items.length).toBeGreaterThan(0);
    // 月營收 MoM/YoY 門檻。
    expect(tabOf(tabs, 'revenue').items.length).toBeGreaterThan(0);
  });

  it('badnews 固定留白（本站無新聞資料源）', () => {
    const res = buildSwingHubPayload({ days: makeRisingDays(65), upstreams: makeSwingUpstreams() });
    const badnews = tabOf(res.tabs ?? [], 'badnews');
    expect(badnews.items).toHaveLength(0);
    expect(badnews.unavailable_reason).toBe('本站尚無新聞資料源。');
  });

  it('反向實驗：上游全缺席 + 無日 K → 每個 tab 皆空清單 + unavailable_reason（絕不填 0）', () => {
    const res = buildSwingHubPayload({ days: [] });
    const tabs = res.tabs ?? [];
    expect(tabs).toHaveLength(16);
    for (const tab of tabs) {
      expect(tab.items).toHaveLength(0);
      expect(tab.unavailable_reason).toBeTruthy();
    }
    expect(res.weeksAccumulated).toBe(0);
    expect(res.week).toBe('');
  });

  it('日 K 不足 61 日 → ma60/pullback 誠實留白並說明實際天數', () => {
    const res = buildSwingHubPayload({ days: makeRisingDays(30), upstreams: makeSwingUpstreams() });
    const tabs = res.tabs ?? [];
    const ma60 = tabOf(tabs, 'ma60');
    expect(ma60.items).toHaveLength(0);
    expect(ma60.unavailable_reason).toContain('30');
  });

  it('大戶週增減來不源自算 → whale_delta_provenance 標為 site-mirror 快照', () => {
    const res = buildSwingHubPayload({ days: makeRisingDays(65), upstreams: makeSwingUpstreams() });
    const prov = res.whale_delta_provenance as { source: string; snapshot_date?: string };
    expect(prov.source).toBe('site-mirror');
    expect(prov.snapshot_date).toBe('2026-09-18');
  });
});

// ---------------------------------------------------------------------------
// 尚未預算（not-ready）回應
// ---------------------------------------------------------------------------

describe('尚未預算（not_precomputed）回應', () => {
  it('pattern-screen：reason 固定、文案說清楚是離線預算，且不帶 patterns', () => {
    const res = buildPatternScreenNotReady();
    expect(res.ok).toBe(true);
    expect(res.ready).toBe(false);
    expect(res.reason).toBe(NOT_PRECOMPUTED_REASON);
    expect(res.message).toContain('離線預算');
    expect(res.message).toContain('不是載入中');
    expect(res.patterns).toBeUndefined();
    expect(res.minDaysRequired).toBe(MIN_BARS_FOR_SCAN);
  });

  it('pattern-screen：KV 未綁定／內容損壞各有補充說明', () => {
    expect(buildPatternScreenKvUnbound().message).toContain('KV 尚未綁定');
    expect(buildPatternScreenKvCorrupt().message).toContain('無法解析');
  });

  it('swing-hub：reason 固定、文案說清楚是離線預算，且不帶 tabs', () => {
    const res = buildSwingHubNotReady();
    expect(res.ok).toBe(true);
    expect(res.ready).toBe(false);
    expect(res.reason).toBe(NOT_PRECOMPUTED_REASON);
    expect(res.message).toContain('離線預算');
    expect(res.tabs).toBeUndefined();
    expect(buildSwingHubKvUnbound().message).toContain('KV 尚未綁定');
  });
});

// ---------------------------------------------------------------------------
// KV key 與可用性判定
// ---------------------------------------------------------------------------

describe('KV key 與可用性判定', () => {
  it('KV key 為 scan:pattern-screen / scan:swing-hub', () => {
    expect(SCAN_KV_KEY_PATTERN_SCREEN).toBe('scan:pattern-screen');
    expect(SCAN_KV_KEY_SWING_HUB).toBe('scan:swing-hub');
  });

  it('可用判定：形狀不符一律視為尚未預算（不修補、不捏造）', () => {
    const good = buildPatternScreenPayload({ days: makeWBottomDays(45) });
    expect(isUsablePatternScreenPayload(good)).toBe(true);
    expect(isUsablePatternScreenPayload(null)).toBe(false);
    expect(isUsablePatternScreenPayload('x')).toBe(false);
    expect(isUsablePatternScreenPayload({ ok: true, ready: true })).toBe(false);

    const goodSwing = buildSwingHubPayload({ days: makeRisingDays(65) });
    expect(isUsableSwingHubPayload(goodSwing)).toBe(true);
    expect(isUsableSwingHubPayload(undefined)).toBe(false);
    expect(isUsableSwingHubPayload([])).toBe(false);
  });

  it('組裝結果可 JSON 序列化（供離線腳本寫入 KV）', () => {
    const pattern = buildPatternScreenPayload({ days: makeWBottomDays(45) });
    const swing = buildSwingHubPayload({ days: makeRisingDays(65), upstreams: makeSwingUpstreams() });
    expect(() => JSON.parse(JSON.stringify(pattern))).not.toThrow();
    expect(() => JSON.parse(JSON.stringify(swing))).not.toThrow();
    expect(JSON.parse(JSON.stringify(swing)).tabs).toHaveLength(16);
  });
});

// ---------------------------------------------------------------------------
// 型別層面的資料誠實（欄位不得被 0 冒充）
// ---------------------------------------------------------------------------

describe('資料誠實：序列與上游缺失時不補值', () => {
  it('無上游時 whale 大戶週增減不填入任何數字（delta 為 null 或不帶該欄）', () => {
    const res = buildSwingHubPayload({ days: makeRisingDays(65) });
    const whale = tabOf(res.tabs ?? [], 'whale_in');
    expect(whale.items).toHaveLength(0);
  });

  it('日 K 輸入須為升冪（舊→新），組裝層依此取最後一天為資料日', () => {
    const days = makeRisingDays(65);
    const dates = days.map((d) => d.date);
    expect(dates).toEqual([...dates].sort());
    expect(buildPatternScreenPayload({ days: makeWBottomDays(45) }).data_date).toBe(
      datesFrom('2026-07-01', 45)[44],
    );
  });
});
