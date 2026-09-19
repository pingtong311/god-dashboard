/** @jest-environment jsdom */

/**
 * QA 獨立驗證 — `/watchlist` 純邏輯（代號處理、交易時段判定、localStorage 防禦、CSV 轉義）。
 *
 * 同 sim-logic.qa.test.ts 的理由：`src/app/watchlist/page.tsx` 是 `'use client'` 頁面，
 * 未匯出任何純函式，故以 transpileModule 轉譯**該檔原文**並附掛匯出後求值，
 * 測到的是真正出貨的程式碼。
 */

import fs from 'node:fs';
import path from 'node:path';
import * as ts from 'typescript';

const PAGE_PATH = path.join(process.cwd(), 'src/app/watchlist/page.tsx');

const EXPORT_NAMES = [
  'stripPrefix',
  'todayYmdTaipei',
  'isTwMarketOpen',
  'csvCell',
  'loadState',
  'persistState',
  'DEFAULT_GROUPS',
] as const;

type WatchModule = {
  stripPrefix: (s: string) => string;
  todayYmdTaipei: () => string;
  isTwMarketOpen: (now?: Date) => boolean;
  csvCell: (v: string | number) => string;
  loadState: () => { groups: Array<{ id: string; name: string }>; items: unknown[] };
  persistState: (s: unknown) => void;
  DEFAULT_GROUPS: Array<{ id: string; name: string }>;
};

function loadWatchModule(): WatchModule {
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
  const uiStub = new Proxy({}, { get: () => () => null });
  const requireShim = (id: string): unknown => {
    if (id === 'react') return require('react');
    if (id === 'react/jsx-runtime') return require('react/jsx-runtime');
    if (id === 'next/navigation') return { useRouter: () => ({ push: () => {}, replace: () => {} }) };
    if (id.endsWith('.css')) return {};
    return uiStub;
  };

  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const run = new Function('require', 'module', 'exports', 'window', 'crypto', outputText);
  run(requireShim, module, module.exports, globalThis.window, globalThis.crypto);

  return module.exports as unknown as WatchModule;
}

const watch = loadWatchModule();

describe('/watchlist stripPrefix（去掉 otc: 前綴）', () => {
  it('harness 真的取到函式', () => {
    expect(typeof watch.stripPrefix).toBe('function');
    expect(typeof watch.isTwMarketOpen).toBe('function');
  });

  it('去前綴、大小寫不敏感、無前綴不變', () => {
    expect(watch.stripPrefix('otc:6488')).toBe('6488');
    expect(watch.stripPrefix('OTC:1234')).toBe('1234');
    expect(watch.stripPrefix('2330')).toBe('2330');
  });
});

describe('/watchlist todayYmdTaipei（台北時區 YYYYMMDD）', () => {
  it('格式為 8 位數字', () => {
    expect(watch.todayYmdTaipei()).toMatch(/^\d{8}$/);
  });
});

describe('/watchlist isTwMarketOpen（台北時區週一～五 09:00–13:30）', () => {
  // 台北 = UTC+8；以下用 UTC 建構對應瞬間
  const utc = (s: string) => new Date(s);

  it('週五 10:00 台北 → 開盤中', () => {
    expect(watch.isTwMarketOpen(utc('2026-09-18T02:00:00Z'))).toBe(true);
  });
  it('週六 10:00 台北 → 休市', () => {
    expect(watch.isTwMarketOpen(utc('2026-09-19T02:00:00Z'))).toBe(false);
  });
  it('週日 → 休市', () => {
    expect(watch.isTwMarketOpen(utc('2026-09-20T02:00:00Z'))).toBe(false);
  });
  it('週五 08:30 台北 → 尚未開盤', () => {
    expect(watch.isTwMarketOpen(utc('2026-09-18T00:30:00Z'))).toBe(false);
  });
  it('週五 13:30 台北 → 仍在盤中（含邊界）', () => {
    expect(watch.isTwMarketOpen(utc('2026-09-18T05:30:00Z'))).toBe(true);
  });
  it('週五 13:31 台北 → 已收盤', () => {
    expect(watch.isTwMarketOpen(utc('2026-09-18T05:31:00Z'))).toBe(false);
  });
});

describe('/watchlist csvCell 轉義', () => {
  it('逗號/引號/換行正確處理', () => {
    expect(watch.csvCell('plain')).toBe('plain');
    expect(watch.csvCell('a,b')).toBe('"a,b"');
    expect(watch.csvCell('he said "hi"')).toBe('"he said ""hi"""');
    expect(watch.csvCell('l1\nl2')).toBe('"l1\nl2"');
  });
});

describe('/watchlist localStorage（鍵名、損毀資料防禦）', () => {
  const KEY = 'skynet_watchlist_v1';

  beforeEach(() => window.localStorage.clear());

  it('無資料 → 回預設（預設分群、空清單）', () => {
    const s = watch.loadState();
    expect(s.items).toEqual([]);
    expect(s.groups).toEqual(watch.DEFAULT_GROUPS);
  });

  it('損毀 JSON → 回預設且不拋錯', () => {
    window.localStorage.setItem(KEY, '{{{ not json');
    let s: any;
    expect(() => {
      s = watch.loadState();
    }).not.toThrow();
    expect(s.items).toEqual([]);
    expect(s.groups).toEqual(watch.DEFAULT_GROUPS);
  });

  it('persistState → loadState 可讀回；寫入正確鍵名', () => {
    const state = { groups: [{ id: 'core', name: '核心關注' }], items: [{ symbol: '2330' }] };
    watch.persistState(state);
    expect(window.localStorage.getItem(KEY)).not.toBeNull();
    expect(watch.loadState()).toEqual(state);
  });

  it('groups 為空陣列 → 回退預設分群（不讓 UI 無群組可用）', () => {
    window.localStorage.setItem(KEY, JSON.stringify({ groups: [], items: [] }));
    expect(watch.loadState().groups).toEqual(watch.DEFAULT_GROUPS);
  });

  it('items 非陣列 → 回空陣列（不崩潰）', () => {
    window.localStorage.setItem(KEY, JSON.stringify({ groups: watch.DEFAULT_GROUPS, items: 'oops' }));
    expect(watch.loadState().items).toEqual([]);
  });
});
