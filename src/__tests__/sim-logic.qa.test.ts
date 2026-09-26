/** @jest-environment jsdom */

/**
 * QA 獨立驗證 — `/sim` 模擬交易頁的純邏輯（費用計算、送單、localStorage 防禦）。
 *
 * ⚠️ 為什麼用「原始碼注入 + 轉譯 + 求值」而不是直接 import？
 *   `src/app/dojo/page.tsx` 是 `'use client'` 的頁面元件，**沒有匯出任何**純函式
 *   （calcAmount / calcFee / calcTax / executeOrder / loadAccount…），因此無法直接
 *   `import` 來測。為了「測到真正出貨的程式碼」而非重寫一份公式（那會變成假測試），
 *   本檔以 TypeScript 的 transpileModule 轉譯**該檔原文**，附掛具名匯出後在受控的
 *   require 環境中求值，再對取出的真實函式做斷言。
 *
 *   效果：若有人把 calcFee 的 Math.floor 改成 Math.round、或賣出漏收證交稅，
 *   這裡的斷言會直接失敗。缺點是較脆弱（函式被改名 / 檔案被搬移會壞）——正確的長期
 *   解法是把這些純函式抽到 `src/lib/`，但那屬於實作變更，非驗證者職責，已在回報中註明。
 */

import fs from 'node:fs';
import path from 'node:path';
import * as ts from 'typescript';

const PAGE_PATH = path.join(process.cwd(), 'src/app/dojo/page.tsx');

/** 需要取出測試的模組內私有函式。 */
const EXPORT_NAMES = [
  'calcAmount',
  'calcFee',
  'calcTax',
  'executeOrder',
  'createInitialAccount',
  'loadAccount',
  'saveAccount',
  'calcMarketValue',
  'calcEquity',
  'upsertEquityPoint',
  'csvCell',
] as const;

type SimModule = {
  calcAmount: (price: number, lots: number) => number;
  calcFee: (amount: number) => number;
  calcTax: (amount: number) => number;
  executeOrder: (account: any, order: any, nowIso: string) => any;
  createInitialAccount: () => any;
  loadAccount: () => any;
  saveAccount: (account: any) => void;
  calcMarketValue: (account: any, prices: Record<string, number>) => number;
  calcEquity: (account: any, prices: Record<string, number>) => number;
  upsertEquityPoint: (curve: any[], date: string, equity: number) => any[];
  csvCell: (value: string | number) => string;
};

function loadSimModule(): SimModule {
  const source = fs.readFileSync(PAGE_PATH, 'utf8');
  const withExports = `${source}\nexport { ${EXPORT_NAMES.join(', ')} };\n`;

  const { outputText } = ts.transpileModule(withExports, {
    fileName: PAGE_PATH,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  });

  const module = { exports: {} as Record<string, unknown> };
  // lucide-react / recharts 等只在 JSX 內被引用，元件不會被執行，用空 proxy 帶過即可。
  const uiStub = new Proxy({}, { get: () => () => null });
  const requireShim = (id: string): unknown => {
    if (id === 'react') return require('react');
    if (id === 'react/jsx-runtime') return require('react/jsx-runtime');
    if (id.endsWith('.css')) return {};
    return uiStub;
  };

  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const run = new Function('require', 'module', 'exports', 'window', 'crypto', outputText);
  run(requireShim, module, module.exports, globalThis.window, globalThis.crypto);

  return module.exports as unknown as SimModule;
}

const sim = loadSimModule();

/* ───────────────────────── 費用計算 ───────────────────────── */

describe('/sim 費用計算（台股實際規則，必須 Math.floor）', () => {
  it('harness 真的取到函式（避免空測）', () => {
    expect(typeof sim.calcAmount).toBe('function');
    expect(typeof sim.calcFee).toBe('function');
    expect(typeof sim.calcTax).toBe('function');
    expect(typeof sim.executeOrder).toBe('function');
  });

  it('成交金額 = 價格 × 張數 × 1000', () => {
    expect(sim.calcAmount(1000, 2)).toBe(2_000_000);
    expect(sim.calcAmount(150.5, 1)).toBe(150_500);
    expect(sim.calcAmount(2460, 1)).toBe(2_460_000);
  });

  it('案例一：2330 買 2 張 @1000 → 手續費 2850、證交稅 0', () => {
    const amount = sim.calcAmount(1000, 2);
    expect(amount).toBe(2_000_000);
    expect(sim.calcFee(amount)).toBe(2850);
    // 買進不課證交稅（由 executeOrder 的 buy 分支保證 tax=0，見下方送單測試）
    expect(sim.calcTax(amount)).toBe(6000); // calcTax 本身只算金額，買賣由呼叫端決定
  });

  it('案例二：2330 賣 2 張 @1000 → 手續費 2850、證交稅 6000', () => {
    const amount = sim.calcAmount(1000, 2);
    expect(sim.calcFee(amount)).toBe(2850);
    expect(sim.calcTax(amount)).toBe(6000);
  });

  it('案例三：0050 買 1 張 @150.5 → 手續費 214（214.4625 無條件捨去）', () => {
    const amount = sim.calcAmount(150.5, 1);
    expect(amount).toBe(150_500);
    expect(sim.calcFee(amount)).toBe(214);
  });

  it('案例四：台積電買 1 張 @2460 → 手續費 3505（3505.5 無條件捨去）', () => {
    const amount = sim.calcAmount(2460, 1);
    expect(amount).toBe(2_460_000);
    expect(sim.calcFee(amount)).toBe(3505);
  });

  it('Math.floor 邊界：小數一律捨去，不得進位（防 Math.round 回歸）', () => {
    // 214.4625 / 3505.5 / 999.99 這類值若用 Math.round 會多算 1 元
    expect(sim.calcFee(150_500)).toBe(214); // 214.4625
    expect(sim.calcFee(2_460_000)).toBe(3505); // 3505.5
    expect(sim.calcTax(333_333)).toBe(999); // 999.999 → 999
    // 反向確認：Math.round 會給出不同答案，證明這裡真的在測 floor
    expect(Math.round(150_500 * 0.001425)).toBe(214);
    expect(Math.round(2_460_000 * 0.001425)).toBe(3506); // round 會變 3506 → floor 才是 3505
  });
});

/* ───────────────────────── 送單邏輯 ───────────────────────── */

describe('/sim executeOrder（買賣、現金/持股不足、參數驗證）', () => {
  const T0 = '2026-09-19T01:00:00.000Z';

  it('初始帳戶：現金 1,000,000、零持股、零交易', () => {
    const acc = sim.createInitialAccount();
    expect(acc.cash).toBe(1_000_000);
    expect(acc.positions).toEqual([]);
    expect(acc.trades).toEqual([]);
    expect(acc.equityCurve).toEqual([]);
    expect(acc.resetAt).toBeNull();
  });

  it('買進：手續費攤入 avgCost、tax=0、現金扣 totalCost', () => {
    const acc = sim.createInitialAccount();
    const r = sim.executeOrder(
      acc,
      { symbol: '2330', name: '台積電', side: 'buy', orderType: 'market', price: 100, lots: 1 },
      T0
    );
    expect(r.ok).toBe(true);
    const fee = Math.floor(100_000 * 0.001425); // 142
    expect(r.trade.fee).toBe(fee);
    expect(r.trade.tax).toBe(0);
    expect(r.account.cash).toBe(1_000_000 - (100_000 + fee));
    expect(r.account.positions[0].lots).toBe(1);
    expect(r.account.positions[0].avgCost).toBeCloseTo((100_000 + fee) / 1000, 10);
  });

  it('賣出：收手續費 + 證交稅、realizedPnl 正確、帳目自洽', () => {
    let acc = sim.createInitialAccount();
    const buy = sim.executeOrder(
      acc,
      { symbol: '2330', name: '台積電', side: 'buy', orderType: 'market', price: 100, lots: 1 },
      T0
    );
    acc = buy.account;
    const sell = sim.executeOrder(
      acc,
      { symbol: '2330', name: '台積電', side: 'sell', orderType: 'market', price: 110, lots: 1 },
      T0
    );
    expect(sell.ok).toBe(true);
    const amount = 110_000;
    const fee = Math.floor(amount * 0.001425); // 156
    const tax = Math.floor(amount * 0.003); // 330
    expect(sell.trade.fee).toBe(fee);
    expect(sell.trade.tax).toBe(tax);
    const netProceeds = amount - fee - tax;
    const costBasis = buy.account.positions[0].avgCost * 1000;
    expect(sell.trade.realizedPnl).toBeCloseTo(netProceeds - costBasis, 6);
    expect(sell.account.positions).toEqual([]); // 全數賣出後無持股
    // 帳目自洽：總資產 − 初始資金 == 已實現損益（此時無未實現）
    expect(sell.account.cash - 1_000_000).toBeCloseTo(sell.trade.realizedPnl, 6);
  });

  it('買進現金不足 → ok:false 且訊息明確（不可靜默失敗）', () => {
    const acc = sim.createInitialAccount();
    const r = sim.executeOrder(
      acc,
      { symbol: '2330', name: '台積電', side: 'buy', orderType: 'market', price: 1000, lots: 2 },
      T0
    );
    expect(r.ok).toBe(false);
    expect(r.error).toContain('現金不足');
  });

  it('賣出無持股 → ok:false', () => {
    const acc = sim.createInitialAccount();
    const r = sim.executeOrder(
      acc,
      { symbol: '2330', name: '台積電', side: 'sell', orderType: 'market', price: 100, lots: 1 },
      T0
    );
    expect(r.ok).toBe(false);
    expect(r.error).toContain('持股');
  });

  it('賣出張數超過持有 → ok:false', () => {
    let acc = sim.createInitialAccount();
    acc = sim.executeOrder(
      acc,
      { symbol: '2330', name: '台積電', side: 'buy', orderType: 'market', price: 100, lots: 1 },
      T0
    ).account;
    const r = sim.executeOrder(
      acc,
      { symbol: '2330', name: '台積電', side: 'sell', orderType: 'market', price: 100, lots: 2 },
      T0
    );
    expect(r.ok).toBe(false);
    expect(r.error).toContain('持股不足');
  });

  it('張數非正整數 / 價格非正 → ok:false', () => {
    const acc = sim.createInitialAccount();
    const base = { symbol: '2330', name: '台積電', side: 'buy', orderType: 'market', price: 100 };
    expect(sim.executeOrder(acc, { ...base, lots: 0 }, T0).ok).toBe(false);
    expect(sim.executeOrder(acc, { ...base, lots: -1 }, T0).ok).toBe(false);
    expect(sim.executeOrder(acc, { ...base, lots: 2.5 }, T0).ok).toBe(false);
    expect(
      sim.executeOrder(acc, { ...base, lots: 1, price: 0 }, T0).ok
    ).toBe(false);
    expect(
      sim.executeOrder(acc, { ...base, lots: 1, price: Number.NaN }, T0).ok
    ).toBe(false);
  });
});

/* ───────────────────────── localStorage 防禦 ───────────────────────── */

describe('/sim localStorage（鍵名、損毀資料防禦、SSR 安全）', () => {
  const KEY = 'skynet_sim_account_v1';

  beforeEach(() => {
    window.localStorage.clear();
  });

  it('saveAccount 寫入正確鍵名、loadAccount 可讀回', () => {
    const acc = sim.createInitialAccount();
    acc.cash = 555_000;
    sim.saveAccount(acc);
    expect(window.localStorage.getItem(KEY)).not.toBeNull();
    const back = sim.loadAccount();
    expect(back.cash).toBe(555_000);
  });

  it('localStorage 為損毀 JSON → 退回全新帳戶且不拋錯', () => {
    window.localStorage.setItem(KEY, '{ not valid json ');
    let acc: any;
    expect(() => {
      acc = sim.loadAccount();
    }).not.toThrow();
    expect(acc.cash).toBe(1_000_000);
    expect(acc.positions).toEqual([]);
  });

  it('欄位型別錯誤 → 逐欄位過濾 / 回退，不崩潰', () => {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({
        cash: 'oops',
        positions: [{ symbol: '2330', name: 'x', lots: 1, avgCost: 100, note: '' }, { bogus: true }],
        trades: 'not-an-array',
        equityCurve: [{ date: '2026-09-19', equity: 100 }, { bad: 1 }],
        resetAt: 123,
      })
    );
    const acc = sim.loadAccount();
    expect(acc.cash).toBe(1_000_000); // 非數字 → 回退
    expect(acc.positions).toHaveLength(1); // 只留合法那筆
    expect(acc.trades).toEqual([]); // 非陣列 → 空
    expect(acc.equityCurve).toHaveLength(1); // 只留合法那筆
    expect(acc.resetAt).toBeNull(); // 非字串 → null
  });
});

/* ───────────────────────── 市值 / 資產 ───────────────────────── */

describe('/sim 市值與總資產', () => {
  it('無報價時以成本為 fallback，市值不歸零', () => {
    const acc = sim.createInitialAccount();
    acc.positions = [{ symbol: '2330', name: '台積電', lots: 2, avgCost: 1000, note: '' }];
    const mv = sim.calcMarketValue(acc, {});
    expect(mv).toBe(2_000_000);
    expect(sim.calcEquity(acc, {})).toBe(acc.cash + 2_000_000);
  });

  it('有報價時用即時價計算市值', () => {
    const acc = sim.createInitialAccount();
    acc.positions = [{ symbol: '2330', name: '台積電', lots: 2, avgCost: 1000, note: '' }];
    expect(sim.calcMarketValue(acc, { '2330': 1100 })).toBe(2_200_000);
  });
});

/* ───────────────────────── CSV 轉義 ───────────────────────── */

describe('/sim CSV 欄位轉義', () => {
  it('含逗號 / 引號 / 換行的欄位會被正確包覆與跳脫', () => {
    expect(sim.csvCell('plain')).toBe('plain');
    expect(sim.csvCell('a,b')).toBe('"a,b"');
    expect(sim.csvCell('he said "hi"')).toBe('"he said ""hi"""');
    expect(sim.csvCell('line1\nline2')).toBe('"line1\nline2"');
    expect(sim.csvCell(123)).toBe('123');
  });
});
