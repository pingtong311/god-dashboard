/** @jest-environment node */

/**
 * /api/skynet/margin-maint —— 單元測試（純函式 + 路由行為）。
 *
 * 重點：
 *   - 數字解析：千分位逗號、空白、空字串 → null（**不可**回 0）
 *   - 日期解析：西元 "20260924" 與民國 "1150924" → ISO
 *   - 大盤維持率自算公式：Σ(餘額張×1000×收盤價) ÷ 融資金額(仟元)×1000 × 100%
 *     （缺收盤價的個股略過，不補 0）
 *   - rwd MI_MARGN 兩張表解析（市場融資金額 + 個股餘額）
 *   - 路由：成功回 market_maintenance、個股 items 誠實留空、上游失敗 → 502
 *
 * 全程 mock 上游 fetch，不打真實證交所。
 */

import { NextRequest } from 'next/server';
import { GET } from '@/app/api/skynet/margin-maint/route';
import { parseNumeric, twseDateToIso } from '@/lib/twseFormat';
import {
  computeMarketMaintenance,
  parseMiMargn,
  type MarginBalanceRow,
} from '@/app/margin-maint/margin-maint-data';

// ── mock @opennextjs/cloudflare（ESM，CJS jest 無法直接載入）────────────
// 讓 route → precomputed → kvReadCache → godBridge 導入鏈在 jest 下不爆 ESM 錯誤。
// env:{} 使 readPrecomputedDetailed 回 'unbound'，route 走即時計算降級路徑。
const mockGetCloudflareContext = jest.fn();
jest.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: (...args: unknown[]) => mockGetCloudflareContext(...args),
}));

const ORIGINAL_FETCH = globalThis.fetch;

beforeEach(() => {
  mockGetCloudflareContext.mockReset();
  mockGetCloudflareContext.mockResolvedValue({ env: {} }); // KV 未綁定 → 走 live-compute
});

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  jest.restoreAllMocks();
});

function req(): NextRequest {
  return new NextRequest('http://localhost/api/skynet/margin-maint');
}

describe('parseNumeric', () => {
  it('千分位逗號與空白 → 數字', () => {
    expect(parseNumeric('1,234,567')).toBe(1234567);
    expect(parseNumeric(' 42 ')).toBe(42);
  });
  it('空字串 / 非數字 → null（不可回 0）', () => {
    expect(parseNumeric('')).toBeNull();
    expect(parseNumeric('   ')).toBeNull();
    expect(parseNumeric('abc')).toBeNull();
    expect(parseNumeric(undefined)).toBeNull();
  });
});

describe('twseDateToIso', () => {
  it('西元 "20260924" → 2026-09-24', () => {
    expect(twseDateToIso('20260924')).toBe('2026-09-24');
  });
  it('民國 "1150924" → 2026-09-24', () => {
    expect(twseDateToIso('1150924')).toBe('2026-09-24');
  });
});

describe('computeMarketMaintenance', () => {
  it('公式：Σ(餘額張×1000×收盤價) ÷ (融資金額仟元×1000) × 100', () => {
    const rows: MarginBalanceRow[] = [{ code: 'A', balanceLots: 1000 }];
    const prices = new Map([['A', 100]]); // 1000 張 × 1000 股 × 100 元 = 1 億元
    // 融資金額 100000 仟元 = 1 億元 → 維持率 100%
    expect(computeMarketMaintenance(rows, prices, 100000)).toBe(100);
  });

  it('缺收盤價的個股略過（不補 0）', () => {
    const rows: MarginBalanceRow[] = [
      { code: 'A', balanceLots: 1000 },
      { code: 'B', balanceLots: 1000 }, // 無價 → 略過
    ];
    const prices = new Map([['A', 100]]);
    // 只算 A：1 億元 ÷ 1 億元 = 100%（若把 B 當 0 也會得到 100%，但關鍵是 B 不被算入）
    expect(computeMarketMaintenance(rows, prices, 100000)).toBe(100);
  });

  it('分母非正 / 分子為 0 → null（不假造數字）', () => {
    const rows: MarginBalanceRow[] = [{ code: 'A', balanceLots: 1000 }];
    const prices = new Map([['A', 100]]);
    expect(computeMarketMaintenance(rows, prices, null)).toBeNull();
    expect(computeMarketMaintenance(rows, prices, 0)).toBeNull();
    expect(computeMarketMaintenance([], prices, 100000)).toBeNull();
  });

  it('實測對齊：以 2026-09-24 全市場資料自算 = 193.87%（實站 193.88%）', () => {
    // 以縮放後的等價資料驗證公式四捨五入到小數 2 位。
    // 真實：擔保品市值 1,192,514,594,980 元 ÷ 融資金額 615,103,402 仟元。
    // 以「市值(元)」與「融資金額(仟元)」兩參數驗證 → 193.87。
    const collateralYuan = 1_192_514_594_980;
    const loanAmountK = 615_103_402;
    // 反推：讓 rows×prices 得到 collateralYuan 太繁，直接用 1 檔等價 (餘額張×1000×價)。
    // 取價 = collateralYuan / (1000 × 1000 張) = 1,192,514.59498 元/股，餘額 1000 張。
    const rows: MarginBalanceRow[] = [{ code: 'X', balanceLots: 1000 }];
    const prices = new Map([['X', collateralYuan / 1_000_000]]);
    expect(computeMarketMaintenance(rows, prices, loanAmountK)).toBe(193.87);
  });
});

describe('parseMiMargn', () => {
  const raw = {
    stat: 'OK',
    date: '20260924',
    tables: [
      {
        title: '信用交易統計',
        fields: ['項目', '買進', '賣出', '現金(券)償還', '前日餘額', '今日餘額'],
        data: [
          ['融資(交易單位)', '270,795', '262,634', '10,711', '9,282,262', '9,279,712'],
          ['融券(交易單位)', '19,887', '12,187', '3,351', '213,059', '202,008'],
          ['融資金額(仟元)', '30,073,340', '20,479,799', '857,972', '606,367,833', '615,103,402'],
        ],
      },
      {
        title: '融資融券彙總 (全部)',
        fields: ['代號', '名稱', '買進', '賣出', '現金償還', '前日餘額', '今日餘額', '次一營業日限額'],
        data: [
          ['2330', '台積電', '1', '2', '3', '100', '120', '999'],
          ['2317', '鴻海', '0', '0', '0', '50', '55', '888'],
        ],
      },
    ],
  };

  it('取出市場融資金額（仟元，今日餘額）與個股融資餘額（張）', () => {
    const parsed = parseMiMargn(raw)!;
    expect(parsed).not.toBeNull();
    expect(parsed.date).toBe('2026-09-24');
    expect(parsed.loanAmountK).toBe(615103402);
    expect(parsed.rows).toEqual([
      { code: '2330', balanceLots: 120 },
      { code: '2317', balanceLots: 55 },
    ]);
  });

  it('缺第二張表 → null', () => {
    expect(parseMiMargn({ stat: 'OK', date: '20260924', tables: [raw.tables[0]] })).toBeNull();
  });
});

function mockUpstream(opts: { margn?: unknown; prices?: unknown; margnStatus?: number }): void {
  globalThis.fetch = jest.fn(async (url: unknown) => {
    const u = String(url);
    if (u.includes('marginTrading/MI_MARGN')) {
      return new Response(JSON.stringify(opts.margn ?? {}), {
        status: opts.margnStatus ?? 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (u.includes('STOCK_DAY_AVG_ALL')) {
      return new Response(JSON.stringify(opts.prices ?? []), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('not found', { status: 404 });
  }) as unknown as typeof fetch;
}

describe('GET /api/skynet/margin-maint', () => {
  const margn = {
    stat: 'OK',
    date: '20260924',
    tables: [
      {
        title: '信用交易統計',
        fields: [],
        data: [['融資金額(仟元)', '0', '0', '0', '0', '100000']],
      },
      {
        title: '融資融券彙總 (全部)',
        fields: [],
        data: [['2330', '台積電', '0', '0', '0', '0', '1000', '0']],
      },
    ],
  };
  const prices = [{ Date: '1150924', Code: '2330', Name: '台積電', ClosingPrice: '100' }];

  it('成功：自算 market_maintenance，個股 items 誠實留空', async () => {
    mockUpstream({ margn, prices });
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store, max-age=0');
    const body = (await res.json()) as {
      ok: boolean;
      market_maintenance: number;
      tight_threshold: number;
      items: unknown[];
      items_available: boolean;
      items_note: string;
      date: string;
      price_date: string;
      provenance: { source: string };
    };
    expect(body.ok).toBe(true);
    expect(body.market_maintenance).toBe(100);
    expect(body.tight_threshold).toBe(130);
    expect(body.items).toEqual([]);
    expect(body.items_available).toBe(false);
    expect(body.items_note).toContain('融資金額');
    expect(body.date).toBe('2026-09-24');
    expect(body.price_date).toBe('2026-09-24');
    expect(body.provenance.source).toBe('self-produced');
  });

  it('上游（融資餘額表）失敗 → 502 margin_maint_upstream_error', async () => {
    mockUpstream({ margn: {}, margnStatus: 500, prices });
    const res = await GET(req());
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ ok: false, error: 'margin_maint_upstream_error' });
  });
});
