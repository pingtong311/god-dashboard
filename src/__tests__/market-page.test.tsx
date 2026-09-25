/** @jest-environment jsdom */

/**
 * /market 大盤與國際頁 —— 忠實度與誠實標示測試（SPEC 會員四頁 §2，M0–M14）。
 * ----------------------------------------------------------------------------
 * - className／文案／aria 屬性逐字對齊 tab-market.html
 * - 有真實來源的區塊（M6 台指期×加權、M12 上市廣度）以 mock fetch 驅動
 * - 無對接來源的區塊（M7 近 10 日圖、M8 產業熱力、M9 成交動能）驗證骨架 +
 *   role="status" + 「資料尚未入庫」，並斷言不含 capture 以外的造假數字
 *
 * 註：本專案未掛 @testing-library/jest-dom，故一律用原生 matcher
 *   （toBeTruthy / toContain / getAttribute），與 stock-page.test.tsx 慣例一致。
 */

import { act, fireEvent, render, screen } from '@testing-library/react';
import FuturesIndexStats from '@/app/market/FuturesIndexStats';
import IndexMiniChart from '@/app/market/IndexMiniChart';
import MarketBreadthCards from '@/app/market/MarketBreadthCards';
import MarketHero from '@/app/market/MarketHero';
import { MarketCaveatView } from '@/app/market/MarketPageCaveat';
import MarketSummaryPanel from '@/app/market/MarketSummaryPanel';
import MarketTabs from '@/app/market/MarketTabs';
import SectorMomentumTable from '@/app/market/SectorMomentumTable';
import SectorTurnoverTreemap from '@/app/market/SectorTurnoverTreemap';
import TaiwanMarketTab from '@/app/market/TaiwanMarketTab';

/** FuturesOptionsPanel 是 async server component，jsdom 無法直接 render，stub 掉。 */
jest.mock('@/components/FuturesOptionsPanel', () => ({
  __esModule: true,
  default: () => <section aria-label="大盤期權" data-testid="futures-options" />,
}));

const SHARE_NETWORK_PATH =
  'M176,156a43.78,43.78,0,0,0-29.09,11L106.1,140.8a44.07,44.07,0,0,0,0-25.6L146.91,89a43.83,43.83,0,1,0-13-20.17L93.09,95a44,44,0,1,0,0,65.94L133.9,187.2A44,44,0,1,0,176,156Zm0-120a20,20,0,1,1-20,20A20,20,0,0,1,176,36ZM64,148a20,20,0,1,1,20-20A20,20,0,0,1,64,148Zm112,72a20,20,0,1,1,20-20A20,20,0,0,1,176,220Z';

/** jsdom 無全域 Response，以最小 mock 物件取代（stock-page.test.tsx 同慣例）。 */
function jsonResponse(body: unknown, ok = true): Response {
  return { ok, status: ok ? 200 : 500, json: async () => body } as unknown as Response;
}

const FUTURES_BODY = {
  ok: true,
  data: {
    name: '台股期近月',
    lastPrice: 48123,
    change: -212,
    changePercent: -0.44,
    sourceLabel: '收盤 09/24',
    source: 'taifex-openapi-close',
    date: '2026-09-24',
    contract: '2026-10',
  },
};

const OVERVIEW_BODY = {
  ok: true,
  data: {
    date: '2026-09-24',
    indexClose: {
      symbol: 'tse_t00.tw',
      name: '加權指數',
      price: 48024.6,
      change: -131.5,
      changePercent: -0.27,
      source: 'twse-mi-index-close',
    },
    breadth: {
      up: 368,
      down: 505,
      flat: 16,
      noTrade: 5,
      upLimit: 0,
      downLimit: 0,
      upRatio: 368 / 889,
    },
    turnover: { total: 713700000000, categories: [] },
    topGainers: [],
    institutionalBuy: [],
    sectorFocus: [],
  },
};

let fetchMock: jest.Mock;

beforeEach(() => {
  fetchMock = jest.fn(async (url: string) =>
    jsonResponse(url.includes('/futures') ? FUTURES_BODY : OVERVIEW_BODY),
  );
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  delete (globalThis as Record<string, unknown>).fetch;
});

/** 讀取 data-stat 卡片們（label／值／顏色語意）。 */
function readStatCards(container: HTMLElement): { label: string; value: string; tone: string }[] {
  return Array.from(container.querySelectorAll('.data-stat')).map((card) => {
    const value = card.querySelector('.num');
    return {
      label: card.querySelector('div div')?.textContent ?? '',
      value: value?.textContent ?? '',
      tone: value?.className ?? '',
    };
  });
}

describe('M1 頁首 hero（大盤與國際）', () => {
  it('section className 逐字、h1 與狀態文案', () => {
    render(<MarketHero />);
    const section = document.querySelector('.hero-hud');
    expect(section?.className).toBe(
      'hero-hud flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3.5',
    );
    expect(section?.querySelector('h1')?.textContent).toBe('大盤與國際');
    expect(section?.textContent).toContain('收盤最後快照');
  });

  it('分享按鈕帶 Phosphor ShareNetwork 圖示', () => {
    render(<MarketHero />);
    const button = screen.getByRole('button', { name: '分享' });
    expect(button.className).toBe(
      'inline-flex min-h-9 items-center gap-1 rounded-lg border border-accent/45 bg-accent/10 px-3 text-[12.5px] font-black text-accent transition active:scale-[0.97]',
    );
    expect(button.querySelector('path')?.getAttribute('d')).toBe(SHARE_NETWORK_PATH);
  });

  it('點分享優先呼叫 Web Share API', async () => {
    const share = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    render(<MarketHero />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '分享' }));
    });
    expect(share).toHaveBeenCalledTimes(1);
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ title: '大盤與國際' }));
  });

  it('無 Web Share 時退回複製連結', async () => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<MarketHero />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '分享' }));
    });
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0]?.[0]).toContain('http');
  });
});

describe('M3 客觀漲跌摘要（規則加總）', () => {
  it('外殼 className 含結尾雙空格 + 紅色左邊框', () => {
    render(<MarketSummaryPanel />);
    const panel = document.querySelector('.data-panel.hud-panel.glass');
    expect(panel?.className).toBe(
      'data-panel hud-panel glass rounded-2xl p-5  mt-4 border-l-2 border-l-red-500',
    );
  });

  it('規則算出「外圍市場下跌項目較多」(text-red-400)', () => {
    render(<MarketSummaryPanel />);
    const headline = screen.getByText('外圍市場下跌項目較多');
    expect(headline.className).toBe('mt-1 text-xl font-black text-red-400');
  });

  it('5 條明細逐字，含內部連結與外資期貨口數', () => {
    const { container } = render(<MarketSummaryPanel />);
    const items = screen.getAllByText(/· /);
    expect(items).toHaveLength(5);
    const link = screen.getByRole('link', { name: '半導體' });
    expect(link.getAttribute('href')).toBe('/sector/?cat=semiconductor');
    expect(link.className).toBe('font-bold text-accent underline');
    expect(items[0]?.textContent).toContain('費城');
    expect(items[0]?.textContent).toContain('跌 1.82%');
    expect(items[4]?.textContent).toContain('外資期貨淨未平倉 -77,031 口');
    expect(container.textContent).toContain('韓國綜合漲 1.04%');
  });

  it('結論與明細數量由規則輸出（快照 4 跌 1 漲 → 偏空）', () => {
    render(<MarketSummaryPanel />);
    expect(screen.getByText('依台指期、費半、那斯達克、台幣匯率自動加權判讀；為氣氛描述，非漲跌預測。')).toBeTruthy();
  });
});

describe('M4 大盤分頁 sticky nav', () => {
  it('4 個 button，台灣市場 active', () => {
    render(
      <MarketTabs>
        <div>台灣市場內容</div>
      </MarketTabs>,
    );
    const nav = document.querySelector('nav[aria-label="大盤分頁"]');
    expect(nav?.className).toBe(
      'sticky top-[3.9rem] z-20 -mx-4 mt-5 border-y border-line/70 bg-bg/90 px-4 py-1.5 backdrop-blur md:mx-0 md:rounded-2xl md:border',
    );
    const buttons = screen.getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(['台灣市場', '籌碼燈號', '國際連動', '其他']);
    expect(buttons[0]?.getAttribute('aria-current')).toBe('page');
    expect(buttons[0]?.className).toBe(
      'min-h-11 shrink-0 rounded-xl px-4 text-[12.5px] font-black transition active:scale-95 bg-accent-soft text-accent',
    );
    expect(buttons[1]?.className).toBe(
      'min-h-11 shrink-0 rounded-xl px-4 text-[12.5px] font-black transition active:scale-95 text-muted hover:bg-surface-2',
    );
    expect(buttons[1]?.getAttribute('aria-current')).toBeNull();
  });

  it('切到「國際連動」：台灣市場內容卸載，改顯示「內容尚未入庫」', () => {
    render(
      <MarketTabs>
        <div>台灣市場內容</div>
      </MarketTabs>,
    );
    fireEvent.click(screen.getByRole('button', { name: '國際連動' }));
    expect(screen.queryByText('台灣市場內容')).toBeNull();
    expect(screen.getByText('內容尚未入庫')).toBeTruthy();
    const buttons = screen.getAllByRole('button');
    expect(buttons[2]?.getAttribute('aria-current')).toBe('page');
    expect(buttons[0]?.getAttribute('aria-current')).toBeNull();
  });

  it('切回台灣市場恢復內容', () => {
    render(
      <MarketTabs>
        <div>台灣市場內容</div>
      </MarketTabs>,
    );
    fireEvent.click(screen.getByRole('button', { name: '其他' }));
    fireEvent.click(screen.getByRole('button', { name: '台灣市場' }));
    expect(screen.getByText('台灣市場內容')).toBeTruthy();
  });
});

describe('M6 台指期 × 加權指數 4 格 data-stat', () => {
  it('載入態為骨架 + role="status"（不預先填數字）', () => {
    fetchMock = jest.fn(() => new Promise(() => {}));
    global.fetch = fetchMock as unknown as typeof fetch;
    render(<FuturesIndexStats />);
    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-label')).toBe('台指期與加權指數資料載入中');
    expect(status.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('4 格 className 逐字（結尾一個空格）', async () => {
    const { container } = render(<FuturesIndexStats />);
    await screen.findByText('48,123');
    expect(container.querySelectorAll('.data-stat')).toHaveLength(4);
    container.querySelectorAll('.data-stat').forEach((card) => {
      expect(card.className).toBe('data-stat rounded-2xl border border-line/80 bg-surface/78 px-4 py-4 ');
    });
  });

  it('台指期／加權真值、期現價差由資料算出（紅漲綠跌）', async () => {
    const { container } = render(<FuturesIndexStats />);
    await screen.findByText('48,123');
    const cards = readStatCards(container);
    expect(cards).toEqual([
      { label: '台指期近月 202610', value: '48,123', tone: 'num mt-1.5 text-2xl font-black leading-none md:text-3xl text-ink' },
      { label: '台指期漲跌', value: '-0.44%', tone: 'num mt-1.5 text-2xl font-black leading-none md:text-3xl text-down' },
      { label: '加權指數', value: '48,024.6', tone: 'num mt-1.5 text-2xl font-black leading-none md:text-3xl text-ink' },
      { label: '期現價差 正價差', value: '98', tone: 'num mt-1.5 text-2xl font-black leading-none md:text-3xl text-up' },
    ]);
  });

  it('期貨上游不可用（ok:false）時顯示 "--"，不偽裝數字', async () => {
    fetchMock = jest.fn(async () => jsonResponse({ ok: false, message: 'taifex_unavailable' }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const { container } = render(<FuturesIndexStats />);
    await screen.findByText('加權指數');
    const cards = readStatCards(container);
    expect(cards[0]?.label).toBe('台指期近月');
    expect(cards[0]?.value).toBe('--');
    expect(cards[1]?.value).toBe('--');
    expect(cards[1]?.tone).toContain('text-muted');
    // 期現價差算不出來 → 不標正／逆價差
    expect(cards[3]?.label).toBe('期現價差');
    expect(cards[3]?.value).toBe('--');
  });
});

describe('M7 加權指數近 10 日迷你圖（無來源：骨架）', () => {
  it('外殼 className 含結尾雙空格、標題逐字', () => {
    render(<IndexMiniChart />);
    const panel = document.querySelector('.data-panel.hud-panel.glass');
    expect(panel?.className).toBe('data-panel hud-panel glass rounded-2xl p-3.5  ');
    expect(panel?.querySelector('p')?.textContent).toBe('加權指數 近 10 日');
  });

  it('圖面為骨架 + role="status"，誠實標示尚未入庫', () => {
    render(<IndexMiniChart />);
    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-label')).toBe('加權指數近 10 日資料尚未入庫');
    expect(status.querySelectorAll('.animate-pulse')).toHaveLength(1);
    expect(status.textContent).toContain('資料尚未入庫');
    // 不嵌入快照 SVG 路徑冒充當日走勢
    expect(document.querySelectorAll('svg')).toHaveLength(0);
  });
});

describe('M8 產業成交額熱力（無來源：骨架）', () => {
  it('section 外殼、標題與副標逐字（日期改標尚未入庫）', () => {
    render(<SectorTurnoverTreemap />);
    const section = document.querySelector('section.mt-4');
    expect(section?.className).toBe('mt-4 overflow-x-clip');
    expect(section?.querySelector('h2')?.textContent).toBe('產業成交額熱力');
    expect(section?.querySelector('p')?.textContent).toBe(
      '面積＝成交額，顏色＝漲跌幅（紅漲綠跌）　資料尚未入庫',
    );
  });

  it('容器比例 62%、骨架 role="status"、頁尾說明逐字', () => {
    render(<SectorTurnoverTreemap />);
    const ratio = document.querySelector('div[style*="padding-top"]');
    expect(ratio?.getAttribute('style')).toBe('padding-top: 62%;');
    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-label')).toBe('產業成交額熱力圖資料尚未入庫');
    expect(status.className).toContain('animate-pulse');
    expect(screen.getByText('公開市場成交統計（價、量、漲跌幅），漲跌幅以交易所參考價為基準，除權息日不失真；僅描述已發生的成交，不構成任何買賣建議。')).toBeTruthy();
  });

  it('不造假：不含 capture 以外的產業成交額數字', () => {
    const { container } = render(<SectorTurnoverTreemap />);
    expect(container.textContent).not.toContain('2695.1億');
    expect(container.querySelectorAll('button[title^="半導體"]')).toHaveLength(0);
  });
});

describe('M9 成交動能（估算）表格 + M9b 口徑', () => {
  it('section aria-label 與標題逐字', () => {
    render(<SectorMomentumTable />);
    const section = document.querySelector('section[aria-label="產業成交動能"]');
    expect(section?.className).toBe('mt-4 overflow-x-clip pb-4 pr-14');
    expect(section?.querySelector('h2')?.textContent).toBe('成交動能（估算），不是法人買賣超');
    expect(section?.querySelector('p')?.textContent).toBe('近 1／5 日產業成交額與漲跌　資料尚未入庫');
  });

  it('表頭 4 欄逐字、tbody 為骨架列 + role="status"', () => {
    render(<SectorMomentumTable />);
    const heads = Array.from(document.querySelectorAll('thead th')).map((th) => th.textContent);
    expect(heads).toEqual(['產業', '1 日', '5 日', '漲跌']);
    const tbody = document.querySelector('tbody');
    expect(tbody?.getAttribute('role')).toBe('status');
    expect(tbody?.getAttribute('aria-label')).toBe('成交動能資料尚未入庫');
    expect(tbody?.querySelectorAll('tr')).toHaveLength(6);
    expect(tbody?.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('M9b 口徑 details 包在 section 內，5 條文案逐字', () => {
    const { container } = render(<SectorMomentumTable />);
    const section = container.querySelector('section[aria-label="產業成交動能"]');
    const details = section?.querySelector('details');
    expect(details?.querySelector('summary')?.textContent).toBe('資料日期與口徑');
    const paragraphs = Array.from(details?.querySelectorAll('p') ?? []).map((p) => p.textContent);
    expect(paragraphs).toHaveLength(5);
    expect(paragraphs[0]).toBe('來源：本站行情管線（盤中）、交易所公開資料（盤後統計）');
    expect(paragraphs[1]).toBe('時點：盤後統計　資料日 尚未入庫');
    expect(paragraphs[2]).toBe('標「估」的欄位是由已公布數字推算，不是交易所原欄。');
    expect(paragraphs[3]).toContain('這不是法人買賣超，也不是資金流向結論。');
    expect(paragraphs[3]).toContain('本表依官方產業成交金額表（非法人買賣超欄）。');
    expect(paragraphs[4]).toBe('以上是已發生的公開統計，不是進出建議。');
  });

  it('不造假：不含 capture 以外的產業成交額數字', () => {
    const { container } = render(<SectorMomentumTable />);
    expect(container.textContent).not.toContain('13017.1億');
    expect(container.textContent).not.toContain('75873.6億');
  });
});

describe('M12 上市／上櫃兩張廣度卡', () => {
  it('載入態為骨架 + role="status"', () => {
    fetchMock = jest.fn(() => new Promise(() => {}));
    global.fetch = fetchMock as unknown as typeof fetch;
    render(<MarketBreadthCards />);
    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-label')).toBe('上市上櫃市場廣度資料載入中');
    expect(status.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('上市卡：真實廣度、比例條與成交金額（badge 出現兩次）', async () => {
    const { container } = render(<MarketBreadthCards />);
    await screen.findByText('上市（加權）');
    const cards = container.querySelectorAll('.data-panel.hud-panel.glass');
    expect(cards).toHaveLength(2);
    expect(cards[0]?.className).toBe('data-panel hud-panel glass rounded-2xl p-5  ');
    expect(screen.getByText('48,024.6')).toBeTruthy();
    expect(screen.getByText('-0.27%').className).toContain('text-down');
    expect(screen.getByText('368').className).toContain('text-up');
    expect(screen.getByText('505').className).toContain('text-down');
    // 平均漲跌無原欄 → '--'
    expect(screen.getByText('--').className).toContain('text-muted');
    // badge 兩張卡各出現兩次
    expect(screen.getAllByText('廣度接近')).toHaveLength(4);
    const bar = cards[0]?.querySelector('div[aria-label]');
    expect(bar?.getAttribute('aria-label')).toBe('上漲 368 家、下跌 505 家');
    expect(bar?.querySelector('.bg-up')?.getAttribute('style')).toBe('width: 42.1535%;');
    expect(screen.getByText(/7,137/)).toBeTruthy();
    expect(screen.getByText(/2026-09-24 盤後/)).toBeTruthy();
  });

  it('上櫃卡：無來源，以實站快照呈現（與跑馬燈同策略）', async () => {
    const { container } = render(<MarketBreadthCards />);
    await screen.findByText('上櫃（櫃買）');
    const cards = container.querySelectorAll('.data-panel.hud-panel.glass');
    expect(cards[1]?.querySelector('.bg-up')?.getAttribute('style')).toBe('width: 49.3431%;');
    expect(screen.getByText('412.99')).toBeTruthy();
    expect(screen.getByText('338')).toBeTruthy();
    expect(screen.getByText('347')).toBeTruthy();
    expect(screen.getByText('+0.26%')).toBeTruthy();
    expect(screen.getByText(/1,937/)).toBeTruthy();
  });

  it('行情管線失敗時上市卡誠實標示，上櫃快照仍在', async () => {
    fetchMock = jest.fn(async () => jsonResponse({ error: 'upstream_error' }, false));
    global.fetch = fetchMock as unknown as typeof fetch;
    render(<MarketBreadthCards />);
    await screen.findByText(/暫時無法取得/);
    expect(screen.getByText('上市（加權）')).toBeTruthy();
    expect(screen.getByText('412.99')).toBeTruthy();
  });
});

describe('台灣市場分頁組裝（M5–M13）', () => {
  it('兩處區塊標題列 + M13 更新頻率說明逐字', async () => {
    render(<TaiwanMarketTab />);
    await screen.findByText('台指期近月 202610');
    const titles = Array.from(document.querySelectorAll('.section-mark')).length;
    expect(titles).toBe(2);
    expect(screen.getByText('台指期 × 加權指數')).toBeTruthy();
    expect(screen.getByText('上市 vs 上櫃市場廣度')).toBeTruthy();
    expect(
      screen.getByText(
        '台股區塊盤中約每分鐘更新；國際市場為延遲報價。期貨若含夜盤報價、現貨已收盤時，期現價差會偏大，僅供參考。連動說明為歷史經驗描述，非因果保證。',
      ),
    ).toBeTruthy();
  });

  it('M10 大盤期權由共用元件提供（stub 驗證有掛上）', async () => {
    render(<TaiwanMarketTab />);
    await screen.findByTestId('futures-options');
    expect(screen.getByTestId('futures-options').getAttribute('aria-label')).toBe('大盤期權');
  });
});

describe('M14 頁尾資料口徑', () => {
  it('外殼與 5 條文案，資料日由行情管線帶入', () => {
    render(<MarketCaveatView dataDate="2026-09-24" />);
    const details = document.querySelector('details');
    expect(details?.className).toBe('mt-6 rounded-2xl border border-line/70 bg-surface px-4 py-3');
    const paragraphs = Array.from(details?.querySelectorAll('p') ?? []).map((p) => p.textContent);
    expect(paragraphs).toHaveLength(5);
    expect(paragraphs[1]).toBe('時點：收盤快照　資料日 2026-09-24');
    expect(paragraphs[3]).toContain('熱力圖面積為成交額、顏色為漲跌幅');
    expect(paragraphs[3]).toContain('產業表是成交動能（估算），不是法人買賣超。');
  });

  it('上游不可用時資料日標「尚未入庫」', () => {
    render(<MarketCaveatView dataDate="尚未入庫" />);
    const paragraphs = Array.from(document.querySelectorAll('details p')).map((p) => p.textContent);
    expect(paragraphs[1]).toBe('時點：收盤快照　資料日 尚未入庫');
  });
});
