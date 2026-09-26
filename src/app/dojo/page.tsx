'use client';

/**
 * 模擬練習 `/dojo`（複刻「股市大佬」App 的當沖／模擬交易功能）
 *
 * 純前端頁面，狀態全部存在 localStorage（鍵名 `skynet_sim_account_v1`）：
 *   - 初始狀態＝零持股、零交易、現金 1,000,000（初始值，非假資料）
 *   - 行情一律即時抓 `/api/skynet/twse`，頁面本身不產生任何假報價
 *
 * 費用規則（台股實際規則）：
 *   - 手續費 = 成交金額 × 0.1425%，無條件捨去至整數元
 *   - 證交稅 = 成交金額 × 0.3%，僅賣出收取，無條件捨去至整數元
 *   - 成交金額 = 價格 × 張數 × 1000
 */

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertCircle,
  BookOpen,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Coins,
  Download,
  PieChart,
  RefreshCw,
  RotateCcw,
  Search,
  Target,
  TrendingUp,
  Wallet,
  X,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import styles from './sim.module.css';

/* ────────────────────────────── 型別 ────────────────────────────── */

/** 持股。`avgCost` 為「含手續費」的每股成本。 */
type Position = {
  symbol: string;
  name: string;
  lots: number;
  avgCost: number;
  note: string;
};

/** 交易紀錄。`realizedPnl` 僅在賣出時有值。 */
type TradeRecord = {
  id: string;
  at: string;
  symbol: string;
  name: string;
  side: 'buy' | 'sell';
  orderType: 'market' | 'limit';
  price: number;
  lots: number;
  fee: number;
  tax: number;
  realizedPnl: number | null;
  note: string;
};

/** 每日總資產快照。 */
type EquityPoint = { date: string; equity: number };

/** 模擬帳戶（localStorage 的唯一結構）。 */
type SimAccount = {
  cash: number;
  positions: Position[];
  trades: TradeRecord[];
  equityCurve: EquityPoint[];
  resetAt: string | null;
};

/** `/api/skynet/twse` 回傳的單筆報價（僅取本頁需要的欄位）。 */
type LiveItem = {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
};

type OrderSide = 'buy' | 'sell';
type OrderType = 'market' | 'limit';

/** 送單所需的完整資訊。 */
type OrderInput = {
  symbol: string;
  name: string;
  side: OrderSide;
  orderType: OrderType;
  price: number;
  lots: number;
};

/* ────────────────────────────── 常數 ────────────────────────────── */

/** localStorage 鍵名（版本化，未來結構變更時可換版）。 */
const STORAGE_KEY = 'skynet_sim_account_v1';

/** 初始虛擬資金。 */
const INITIAL_CASH = 1_000_000;

/** 台股一張＝1000 股。 */
const LOT_SIZE = 1000;

/** 手續費率 0.1425%。 */
const FEE_RATE = 0.001425;

/** 證交稅率 0.3%（僅賣出）。 */
const TAX_RATE = 0.003;

/** 盤中輪詢 10 秒、盤後 60 秒。 */
const POLL_MARKET_MS = 10_000;
const POLL_CLOSED_MS = 60_000;

/* ────────────────────────── 格式化工具 ────────────────────────── */

/** 整數金額：1,023,456。 */
function fmtMoney(value: number): string {
  return Number.isFinite(value) ? Math.round(value).toLocaleString('zh-TW') : '--';
}

/** 帶正負號的金額：+23,456。 */
function fmtSigned(value: number): string {
  if (!Number.isFinite(value)) return '--';
  const rounded = Math.round(value);
  return `${rounded > 0 ? '+' : ''}${rounded.toLocaleString('zh-TW')}`;
}

/** 價格：1,000.00。 */
function fmtPrice(value: number): string {
  return Number.isFinite(value) && value > 0
    ? value.toLocaleString('zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '--';
}

/** 百分比：+2.35%。 */
function fmtPercent(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return '--';
  return `${value > 0 ? '+' : ''}${value.toFixed(digits)}%`;
}

/** 圖表 Y 軸刻度：百萬→M、千→K，避免刻度和 tooltip 一樣長而擠壓。 */
function fmtAxis(value: number): string {
  if (!Number.isFinite(value)) return '';
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${Math.round(value / 1_000)}K`;
  return String(Math.round(value));
}

/** 時間：09-17 13:45。 */
function fmtTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 時鐘：13:45:07。 */
function fmtClock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '--';
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** 今日鍵值：YYYY-MM-DD（供資產快照分日使用）。 */
function todayKey(): string {
  const date = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** 檔名日期：YYYYMMDD。 */
function stampKey(): string {
  const date = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

/** 台股慣例：紅漲綠跌。 */
const toneClass = (v: number): string => (v > 0 ? styles.up : v < 0 ? styles.down : styles.flat);

/** 目前是否為台股盤中（週一至週五 09:00–13:30）。 */
function isMarketHoursNow(): boolean {
  const now = new Date();
  const day = now.getDay();
  if (day === 0 || day === 6) return false;
  const minutes = now.getHours() * 60 + now.getMinutes();
  return minutes >= 9 * 60 && minutes <= 13 * 60 + 30;
}

/* ────────────────────────── 費用計算 ────────────────────────── */

/** 成交金額＝價格 × 張數 × 1000。 */
function calcAmount(price: number, lots: number): number {
  return price * lots * LOT_SIZE;
}

/** 手續費＝成交金額 × 0.1425%，無條件捨去。 */
function calcFee(amount: number): number {
  return Math.floor(amount * FEE_RATE);
}

/** 證交稅＝成交金額 × 0.3%，無條件捨去（僅賣出）。 */
function calcTax(amount: number): number {
  return Math.floor(amount * TAX_RATE);
}

/* ─────────────────────── localStorage 讀寫 ─────────────────────── */

/** 建立全新帳戶。 */
function createInitialAccount(): SimAccount {
  return { cash: INITIAL_CASH, positions: [], trades: [], equityCurve: [], resetAt: null };
}

/** 逐欄位防呆，避免舊資料或手動編輯造成崩潰。 */
function isPosition(value: unknown): value is Position {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.symbol === 'string' &&
    typeof record.name === 'string' &&
    typeof record.lots === 'number' &&
    typeof record.avgCost === 'number' &&
    typeof record.note === 'string'
  );
}

function isTrade(value: unknown): value is TradeRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === 'string' &&
    typeof record.at === 'string' &&
    typeof record.symbol === 'string' &&
    typeof record.side === 'string' &&
    typeof record.price === 'number' &&
    typeof record.lots === 'number'
  );
}

function isEquityPoint(value: unknown): value is EquityPoint {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record.date === 'string' && typeof record.equity === 'number';
}

/** 從 localStorage 讀取帳戶；任何例外一律退回全新帳戶。 */
function loadAccount(): SimAccount {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialAccount();
    const parsed = JSON.parse(raw) as Partial<SimAccount>;
    return {
      cash:
        typeof parsed.cash === 'number' && Number.isFinite(parsed.cash) ? parsed.cash : INITIAL_CASH,
      positions: Array.isArray(parsed.positions) ? parsed.positions.filter(isPosition) : [],
      trades: Array.isArray(parsed.trades) ? parsed.trades.filter(isTrade) : [],
      equityCurve: Array.isArray(parsed.equityCurve) ? parsed.equityCurve.filter(isEquityPoint) : [],
      resetAt: typeof parsed.resetAt === 'string' ? parsed.resetAt : null,
    };
  } catch {
    return createInitialAccount();
  }
}

/** 寫入 localStorage；配額不足或無痕模式時靜默失敗。 */
function saveAccount(account: SimAccount): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(account));
  } catch {
    // 忽略寫入失敗（不影響本次操作）
  }
}

/* ────────────────────── 帳戶運算（純函式） ────────────────────── */

/** 取即時價；尚未取得報價時退回成本，避免市值瞬間歸零。 */
function priceOf(symbol: string, fallback: number, prices: Record<string, number>): number {
  const price = prices[symbol];
  return typeof price === 'number' && price > 0 ? price : fallback;
}

/** 持股市值。 */
function calcMarketValue(account: SimAccount, prices: Record<string, number>): number {
  return account.positions.reduce(
    (sum, position) => sum + priceOf(position.symbol, position.avgCost, prices) * position.lots * LOT_SIZE,
    0
  );
}

/** 總資產＝現金 + 持股市值。 */
function calcEquity(account: SimAccount, prices: Record<string, number>): number {
  return account.cash + calcMarketValue(account, prices);
}

/** 寫入／更新當日資產快照。 */
function upsertEquityPoint(curve: EquityPoint[], date: string, equity: number): EquityPoint[] {
  const index = curve.findIndex((point) => point.date === date);
  if (index >= 0) {
    const next = curve.slice();
    next[index] = { date, equity };
    return next;
  }
  return [...curve, { date, equity }];
}

/** 產生交易 id（crypto.randomUUID 不可用時退回時間戳）。 */
function makeId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // 忽略，改用備援
  }
  return `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 送單結果。 */
type ExecuteResult =
  | { ok: true; account: SimAccount; trade: TradeRecord }
  | { ok: false; error: string };

/**
 * 執行一筆委託並回傳新帳戶（純函式，不碰 React 狀態）。
 *
 * 成本採「含手續費」計算：買進時把手續費攤入 `avgCost`，
 * 賣出時以 `avgCost × 張數 × 1000` 為成本基礎。如此一來
 * 「已實現損益 + 未實現損益」會恰等於「總資產 − 初始資金」，帳目自洽。
 */
function executeOrder(account: SimAccount, order: OrderInput, nowIso: string): ExecuteResult {
  const { symbol, name, side, orderType, price, lots } = order;

  if (!Number.isInteger(lots) || lots <= 0) {
    return { ok: false, error: '張數必須是大於 0 的整數。' };
  }
  if (!Number.isFinite(price) || price <= 0) {
    return { ok: false, error: '價格必須大於 0。' };
  }

  const amount = calcAmount(price, lots);
  const fee = calcFee(amount);

  if (side === 'buy') {
    const totalCost = amount + fee;
    if (totalCost > account.cash) {
      return {
        ok: false,
        error: `現金不足：本次需要 ${fmtMoney(totalCost)} 元，可用現金 ${fmtMoney(account.cash)} 元。`,
      };
    }

    const positions = account.positions.slice();
    const index = positions.findIndex((position) => position.symbol === symbol);
    if (index >= 0) {
      const position = positions[index];
      const newLots = position.lots + lots;
      const costTotal = position.avgCost * position.lots * LOT_SIZE + totalCost;
      positions[index] = {
        ...position,
        name: position.name || name,
        lots: newLots,
        avgCost: costTotal / (newLots * LOT_SIZE),
      };
    } else {
      positions.push({
        symbol,
        name,
        lots,
        avgCost: totalCost / (lots * LOT_SIZE),
        note: '',
      });
    }

    const trade: TradeRecord = {
      id: makeId(),
      at: nowIso,
      symbol,
      name,
      side: 'buy',
      orderType,
      price,
      lots,
      fee,
      tax: 0,
      realizedPnl: null,
      note: '',
    };

    return {
      ok: true,
      account: {
        ...account,
        cash: account.cash - totalCost,
        positions,
        trades: [...account.trades, trade],
      },
      trade,
    };
  }

  // ── 賣出 ──
  const index = account.positions.findIndex((position) => position.symbol === symbol);
  if (index < 0) {
    return { ok: false, error: `目前沒有 ${symbol} 的持股。` };
  }
  const position = account.positions[index];
  if (position.lots < lots) {
    return {
      ok: false,
      error: `持股不足：目前持有 ${position.lots} 張，欲賣出 ${lots} 張。`,
    };
  }

  const tax = calcTax(amount);
  const netProceeds = amount - fee - tax;
  const costBasis = position.avgCost * lots * LOT_SIZE;
  const realizedPnl = netProceeds - costBasis;

  const positions = account.positions.slice();
  const remaining = position.lots - lots;
  if (remaining > 0) {
    positions[index] = { ...position, lots: remaining };
  } else {
    positions.splice(index, 1);
  }

  const trade: TradeRecord = {
    id: makeId(),
    at: nowIso,
    symbol,
    name: position.name || name,
    side: 'sell',
    orderType,
    price,
    lots,
    fee,
    tax,
    realizedPnl,
    note: '',
  };

  return {
    ok: true,
    account: {
      ...account,
      cash: account.cash + netProceeds,
      positions,
      trades: [...account.trades, trade],
    },
    trade,
  };
}

/** CSV 欄位轉義。 */
function csvCell(value: string | number): string {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/* ────────────────────────────── 頁面 ────────────────────────────── */

export default function SimPage() {
  const [hydrated, setHydrated] = useState(false);
  const [account, setAccount] = useState<SimAccount>(() => createInitialAccount());

  // 即時報價（僅追蹤目前持股）
  const [livePrices, setLivePrices] = useState<Record<string, number>>({});
  const [updatedAt, setUpdatedAt] = useState('');
  const [refreshToken, setRefreshToken] = useState(0);

  // 交易面板
  const [side, setSide] = useState<OrderSide>('buy');
  const [orderType, setOrderType] = useState<OrderType>('market');
  const [symbolInput, setSymbolInput] = useState('');
  const [quoteName, setQuoteName] = useState('');
  const [quotePrice, setQuotePrice] = useState(0);
  const [priceInput, setPriceInput] = useState('');
  const [lotsInput, setLotsInput] = useState('');
  const [querying, setQuerying] = useState(false);
  const [panelError, setPanelError] = useState('');

  // 對話框與提示
  const [pendingOrder, setPendingOrder] = useState<OrderInput | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetInput, setResetInput] = useState('');
  const [toast, setToast] = useState('');

  // 複盤筆記（每筆紀錄各自展開、各自 debounce）
  const [expandedTrade, setExpandedTrade] = useState<string | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [savedFlash, setSavedFlash] = useState<Record<string, boolean>>({});
  const noteTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── 初始化：載入 localStorage ── */
  useEffect(() => {
    const loaded = loadAccount();
    // 全新帳戶先放一筆起始快照，讓績效曲線有起點（初始值，非假資料）。
    if (loaded.equityCurve.length === 0 && loaded.trades.length === 0 && loaded.positions.length === 0) {
      loaded.equityCurve = [{ date: todayKey(), equity: loaded.cash }];
    }
    setAccount(loaded);
    setHydrated(true);
  }, []);

  /* ── 持久化 ── */
  useEffect(() => {
    if (!hydrated) return;
    saveAccount(account);
  }, [account, hydrated]);

  /* ── 清理計時器 ── */
  useEffect(() => {
    const timers = noteTimers.current;
    return () => {
      Object.values(timers).forEach((timer) => clearTimeout(timer));
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3_000);
  }, []);

  /** 持股代號字串（作為輪詢 effect 的相依鍵）。 */
  const heldSymbols = useMemo(
    () => account.positions.map((position) => position.symbol).join(','),
    [account.positions]
  );

  /* ── 即時報價輪詢（盤中 10 秒、盤後 60 秒） ── */
  useEffect(() => {
    if (!hydrated) return;
    const symbols = heldSymbols ? heldSymbols.split(',') : [];
    if (symbols.length === 0) {
      setLivePrices({});
      return;
    }

    let cancelled = false;
    const intervalMs = isMarketHoursNow() ? POLL_MARKET_MS : POLL_CLOSED_MS;

    const fetchLive = async (): Promise<void> => {
      try {
        const res = await fetch(
          `/api/skynet/twse?tickers=${encodeURIComponent(symbols.join(','))}`,
          { cache: 'no-store' }
        );
        const body = (await res.json()) as { items?: LiveItem[] };
        if (cancelled || !res.ok || !Array.isArray(body.items)) return;
        const map: Record<string, number> = {};
        for (const item of body.items) {
          if (item.price > 0) map[item.symbol] = item.price;
        }
        setLivePrices(map);
        setUpdatedAt(new Date().toISOString());
      } catch {
        // 靜默失敗，保留前一次報價
      }
    };

    void fetchLive();
    const timer = setInterval(() => void fetchLive(), intervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [hydrated, heldSymbols, refreshToken]);

  /* ── 衍生數值 ── */
  const marketValue = useMemo(
    () => calcMarketValue(account, livePrices),
    [account, livePrices]
  );
  const totalAssets = account.cash + marketValue;
  // 總損益＝總資產 − 初始資金，已含所有手續費與證交稅（＝已實現 + 未實現）。
  const totalPnl = totalAssets - INITIAL_CASH;
  const returnPct = INITIAL_CASH > 0 ? (totalPnl / INITIAL_CASH) * 100 : 0;

  const sortedTrades = useMemo(
    () =>
      [...account.trades].sort(
        (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()
      ),
    [account.trades]
  );

  const realizedTotal = useMemo(
    () => account.trades.reduce((sum, trade) => sum + (trade.realizedPnl ?? 0), 0),
    [account.trades]
  );

  const closedTrades = useMemo(
    () => account.trades.filter((trade) => trade.realizedPnl !== null),
    [account.trades]
  );

  const performance = useMemo(() => {
    const wins = closedTrades.filter((trade) => (trade.realizedPnl ?? 0) > 0);
    const losses = closedTrades.filter((trade) => (trade.realizedPnl ?? 0) < 0);
    const winRate = closedTrades.length > 0 ? (wins.length / closedTrades.length) * 100 : null;

    const avgWin =
      wins.length > 0
        ? wins.reduce((sum, trade) => sum + (trade.realizedPnl ?? 0), 0) / wins.length
        : 0;
    const avgLoss =
      losses.length > 0
        ? Math.abs(losses.reduce((sum, trade) => sum + (trade.realizedPnl ?? 0), 0) / losses.length)
        : 0;
    const ratio = closedTrades.length === 0 ? null : avgLoss > 0 ? avgWin / avgLoss : null;

    return { winRate, ratio, closedCount: closedTrades.length };
  }, [closedTrades]);

  const maxDrawdown = useMemo(() => {
    const curve = account.equityCurve;
    if (curve.length < 2) return null;
    let peak = curve[0].equity;
    let drawdown = 0;
    for (const point of curve) {
      if (point.equity > peak) peak = point.equity;
      if (peak > 0) {
        const current = ((peak - point.equity) / peak) * 100;
        if (current > drawdown) drawdown = current;
      }
    }
    return drawdown;
  }, [account.equityCurve]);

  /* ── 交易面板試算 ── */
  // 用 Number() 而非 parseInt()：parseInt('2.5') 會變成 2，會誤收非整數張數。
  const lotsNumber = Number(lotsInput);
  const validLots = Number.isInteger(lotsNumber) && lotsNumber > 0 ? lotsNumber : 0;
  const limitPrice = Number.parseFloat(priceInput);
  const effectivePrice =
    orderType === 'market' ? quotePrice : Number.isFinite(limitPrice) ? limitPrice : 0;

  const previewAmount = calcAmount(effectivePrice, validLots);
  const previewFee = calcFee(previewAmount);
  const previewTax = side === 'sell' ? calcTax(previewAmount) : 0;
  const previewTotal = side === 'buy' ? previewAmount + previewFee : previewAmount - previewFee - previewTax;

  const heldLots = useMemo(() => {
    const position = account.positions.find((item) => item.symbol === symbolInput.trim());
    return position ? position.lots : 0;
  }, [account.positions, symbolInput]);

  /* ── 查詢即時報價 ── */
  const handleQuery = useCallback(async () => {
    const symbol = symbolInput.trim();
    if (!symbol) {
      setPanelError('請先輸入股票代號。');
      return;
    }
    setQuerying(true);
    setPanelError('');
    try {
      const res = await fetch(`/api/skynet/twse?tickers=${encodeURIComponent(symbol)}`, {
        cache: 'no-store',
      });
      const body = (await res.json()) as { items?: LiveItem[] };
      const item = Array.isArray(body.items)
        ? body.items.find((entry) => entry.symbol === symbol) ?? body.items[0]
        : undefined;

      if (!res.ok || !item || !(item.price > 0)) {
        setQuoteName('');
        setQuotePrice(0);
        setPanelError('查無即時報價，請確認股票代號是否正確。');
        return;
      }
      setQuoteName(item.name || symbol);
      setQuotePrice(item.price);
      setPriceInput(item.price.toFixed(2));
      setUpdatedAt(new Date().toISOString());
    } catch {
      setQuoteName('');
      setQuotePrice(0);
      setPanelError('查詢失敗，請稍後再試。');
    } finally {
      setQuerying(false);
    }
  }, [symbolInput]);

  /* ── 送單（先驗證，再開確認對話框） ── */
  const handleSubmit = useCallback(() => {
    const symbol = symbolInput.trim();
    if (!symbol) {
      setPanelError('請先輸入股票代號並查詢。');
      return;
    }
    if (!Number.isInteger(lotsNumber) || lotsNumber <= 0) {
      setPanelError('張數必須是大於 0 的整數。');
      return;
    }
    if (!(effectivePrice > 0)) {
      setPanelError(
        orderType === 'market' ? '市價單請先按「查詢」取得即時報價。' : '限價單請填寫有效的委託價格。'
      );
      return;
    }
    if (side === 'buy') {
      const totalCost = previewAmount + previewFee;
      if (totalCost > account.cash) {
        setPanelError(
          `現金不足：本次需要 ${fmtMoney(totalCost)} 元，可用現金 ${fmtMoney(account.cash)} 元。`
        );
        return;
      }
    } else if (heldLots < lotsNumber) {
      setPanelError(`持股不足：目前持有 ${heldLots} 張，欲賣出 ${lotsNumber} 張。`);
      return;
    }

    setPanelError('');
    setPendingOrder({
      symbol,
      name: quoteName || symbol,
      side,
      orderType,
      price: effectivePrice,
      lots: lotsNumber,
    });
  }, [
    account.cash,
    effectivePrice,
    heldLots,
    lotsNumber,
    orderType,
    previewAmount,
    previewFee,
    quoteName,
    side,
    symbolInput,
  ]);

  /* ── 確認成交 ── */
  const confirmOrder = useCallback(() => {
    if (!pendingOrder) return;
    const result = executeOrder(account, pendingOrder, new Date().toISOString());
    if (!result.ok) {
      setPanelError(result.error);
      setPendingOrder(null);
      return;
    }
    // 成交後更新當日總資產快照（供績效曲線使用）。
    const equity = calcEquity(result.account, livePrices);
    const next: SimAccount = {
      ...result.account,
      equityCurve: upsertEquityPoint(result.account.equityCurve, todayKey(), equity),
    };
    setAccount(next);
    setPendingOrder(null);
    setLotsInput('');
    showToast(
      `${pendingOrder.side === 'buy' ? '買進' : '賣出'}成交：${pendingOrder.symbol} ${pendingOrder.lots} 張 @ ${fmtPrice(pendingOrder.price)}`
    );
  }, [account, livePrices, pendingOrder, showToast]);

  /* ── 重置帳戶 ── */
  const confirmReset = useCallback(() => {
    if (resetInput.trim().toUpperCase() !== 'RESET') return;
    const fresh = createInitialAccount();
    fresh.resetAt = new Date().toISOString();
    fresh.equityCurve = [{ date: todayKey(), equity: INITIAL_CASH }];
    setAccount(fresh);
    setResetOpen(false);
    setResetInput('');
    setPanelError('');
    setExpandedTrade(null);
    setNoteDrafts({});
    showToast('帳戶已重置為 1,000,000 元。');
  }, [resetInput, showToast]);

  /* ── 匯出 CSV ── */
  const exportCsv = useCallback(() => {
    const header = [
      '時間',
      '代號',
      '名稱',
      '買賣',
      '價格',
      '張數',
      '手續費',
      '證交稅',
      '已實現損益',
      '複盤筆記',
    ];
    const rows = sortedTrades.map((trade) => [
      trade.at,
      trade.symbol,
      trade.name,
      trade.side === 'buy' ? '買進' : '賣出',
      trade.price,
      trade.lots,
      trade.fee,
      trade.tax,
      trade.realizedPnl === null ? '' : Math.round(trade.realizedPnl),
      trade.note,
    ]);
    const csv = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');

    try {
      // 開頭加 BOM，讓 Excel 正確辨識 UTF-8。
      const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `模擬交易紀錄_${stampKey()}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      showToast('交易紀錄已匯出。');
    } catch {
      setPanelError('匯出失敗，請稍後再試。');
    }
  }, [showToast, sortedTrades]);

  /* ── 從持股快速帶入交易面板 ── */
  const prefillFromPosition = useCallback(
    (position: Position) => {
      setSide('sell');
      setSymbolInput(position.symbol);
      setQuoteName(position.name);
      const price = livePrices[position.symbol] ?? position.avgCost;
      setQuotePrice(price);
      setPriceInput(price.toFixed(2));
      setPanelError('');
    },
    [livePrices]
  );

  /* ── 複盤筆記：debounce 800ms 自動儲存 ── */
  const handleNoteChange = useCallback(
    (tradeId: string, value: string) => {
      setNoteDrafts((prev) => ({ ...prev, [tradeId]: value }));
      setSavedFlash((prev) => ({ ...prev, [tradeId]: false }));

      const timers = noteTimers.current;
      if (timers[tradeId]) clearTimeout(timers[tradeId]);
      timers[tradeId] = setTimeout(() => {
        setAccount((prev) => ({
          ...prev,
          trades: prev.trades.map((trade) =>
            trade.id === tradeId ? { ...trade, note: value } : trade
          ),
        }));
        setSavedFlash((prev) => ({ ...prev, [tradeId]: true }));
        timers[tradeId] = setTimeout(() => {
          setSavedFlash((prev) => ({ ...prev, [tradeId]: false }));
        }, 2_000);
      }, 800);
    },
    []
  );

  const updatedLabel = updatedAt ? fmtClock(updatedAt) : '--';

  return (
    <div className={styles.simRoot}>
      <div className={styles.shell}>
        {/* 頁首 */}
        <header className={styles.topbar}>
          <div className={styles.brand}>
            <span className={styles.brandMark}>
              <Target size={18} />
            </span>
            <div className={styles.brandText}>
              <strong>模擬練習</strong>
              <span>PAPER TRADING</span>
            </div>
          </div>
          <div className={styles.topbarRight}>
            <span className={styles.updated}>
              <RefreshCw size={12} className={styles.updatedIcon} />
              更新 {updatedLabel}
            </span>
            <button
              type="button"
              className={styles.iconButton}
              onClick={() => setRefreshToken((token) => token + 1)}
              aria-label="重新整理即時報價"
            >
              <RefreshCw size={16} />
            </button>
          </div>
        </header>
        <p className={styles.subtitle}>虛擬資金 1,000,000，零風險練手感</p>

        {/* 1. 帳戶總覽 */}
        <section className={styles.overviewGrid} aria-label="帳戶總覽">
          <article className={styles.metricCard}>
            <span className={styles.metricLabel}>
              <Wallet size={14} />
              總資產
            </span>
            <strong className={styles.metricValue}>{fmtMoney(totalAssets)}</strong>
            <span className={styles.metricSub}>現金 + 持股市值</span>
          </article>

          <article className={styles.metricCard}>
            <span className={styles.metricLabel}>
              <Coins size={14} />
              可用現金
            </span>
            <strong className={styles.metricValue}>{fmtMoney(account.cash)}</strong>
            <span className={styles.metricSub}>可下單額度</span>
          </article>

          <article className={styles.metricCard}>
            <span className={styles.metricLabel}>
              <PieChart size={14} />
              持股市值
            </span>
            <strong className={styles.metricValue}>{fmtMoney(marketValue)}</strong>
            <span className={styles.metricSub}>{account.positions.length} 檔持股</span>
          </article>

          <article className={styles.metricCard}>
            <span className={styles.metricLabel}>
              <TrendingUp size={14} />
              總損益
            </span>
            <strong className={`${styles.metricValue} ${toneClass(totalPnl)}`}>
              {fmtSigned(totalPnl)}
            </strong>
            <span className={`${styles.metricSub} ${toneClass(returnPct)}`}>
              {fmtPercent(returnPct)}
            </span>
          </article>
        </section>

        {/* 2. 持股明細 */}
        <section className={styles.panel} aria-label="持股明細">
          <div className={styles.panelHeader}>
            <span className={styles.panelTitle}>
              <PieChart size={15} />
              持股明細
            </span>
            <em className={styles.panelNote}>盤中 10 秒 / 盤後 60 秒更新</em>
          </div>

          {account.positions.length === 0 ? (
            <div className={styles.empty}>
              <PieChart size={24} />
              <span>尚無持股，從下方交易面板開始第一筆模擬交易</span>
            </div>
          ) : (
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>代號</th>
                    <th>名稱</th>
                    <th className={styles.numCol}>張數</th>
                    <th className={styles.numCol}>成本</th>
                    <th className={styles.numCol}>現價</th>
                    <th className={styles.numCol}>損益</th>
                    <th className={styles.numCol}>報酬率</th>
                    <th>權重</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {account.positions.map((position) => {
                    const price = livePrices[position.symbol] ?? position.avgCost;
                    const value = price * position.lots * LOT_SIZE;
                    const cost = position.avgCost * position.lots * LOT_SIZE;
                    const pnl = value - cost;
                    const pct = cost > 0 ? (pnl / cost) * 100 : 0;
                    const weight = marketValue > 0 ? (value / marketValue) * 100 : 0;
                    const hasQuote = typeof livePrices[position.symbol] === 'number';

                    return (
                      <tr key={position.symbol}>
                        <td className={styles.symbolCell}>{position.symbol}</td>
                        <td>{position.name}</td>
                        <td className={styles.numCol}>{position.lots.toLocaleString('zh-TW')}</td>
                        <td className={styles.numCol}>{fmtPrice(position.avgCost)}</td>
                        <td className={styles.numCol}>
                          {hasQuote ? fmtPrice(price) : '--'}
                        </td>
                        <td className={`${styles.numCol} ${toneClass(pnl)}`}>{fmtSigned(pnl)}</td>
                        <td className={`${styles.numCol} ${toneClass(pct)}`}>{fmtPercent(pct)}</td>
                        <td>
                          <div className={styles.weightCell}>
                            <span className={styles.weightPct}>{weight.toFixed(1)}%</span>
                            <div className={styles.weightTrack}>
                              <div
                                className={styles.weightFill}
                                style={{ width: `${Math.min(100, Math.max(0, weight))}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td>
                          <button
                            type="button"
                            className={styles.miniButton}
                            onClick={() => prefillFromPosition(position)}
                          >
                            交易
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* 3. 交易面板 */}
        <section className={styles.panel} aria-label="交易面板">
          <div className={styles.panelHeader}>
            <span className={styles.panelTitle}>
              <Activity size={15} />
              交易面板
            </span>
            <em className={styles.panelNote}>虛擬下單，不會送出真實委託</em>
          </div>

          <div className={styles.sideToggle} role="group" aria-label="買賣切換">
            <button
              type="button"
              className={`${styles.sideButton} ${side === 'buy' ? styles.sideBuyActive : ''}`}
              aria-pressed={side === 'buy'}
              onClick={() => {
                setSide('buy');
                setPanelError('');
              }}
            >
              買進
            </button>
            <button
              type="button"
              className={`${styles.sideButton} ${side === 'sell' ? styles.sideSellActive : ''}`}
              aria-pressed={side === 'sell'}
              onClick={() => {
                setSide('sell');
                setPanelError('');
              }}
            >
              賣出
            </button>
          </div>

          <div className={styles.fieldGrid}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>股票代號</span>
              <div className={styles.inputRow}>
                <input
                  className={styles.input}
                  value={symbolInput}
                  onChange={(event) => setSymbolInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void handleQuery();
                  }}
                  placeholder="例如 2330"
                  inputMode="numeric"
                />
                <button
                  type="button"
                  className={styles.queryButton}
                  onClick={() => void handleQuery()}
                  disabled={querying}
                >
                  <Search size={14} />
                  {querying ? '查詢中' : '查詢'}
                </button>
              </div>
              {quoteName ? (
                <span className={styles.quoteLine}>
                  {quoteName}　現價 <b className={styles.quotePrice}>{fmtPrice(quotePrice)}</b>
                </span>
              ) : null}
            </label>

            <div className={styles.field}>
              <span className={styles.fieldLabel}>委託類型</span>
              <div className={styles.typeToggle} role="group" aria-label="委託類型">
                <button
                  type="button"
                  className={`${styles.typeButton} ${orderType === 'market' ? styles.typeActive : ''}`}
                  aria-pressed={orderType === 'market'}
                  onClick={() => setOrderType('market')}
                >
                  市價
                </button>
                <button
                  type="button"
                  className={`${styles.typeButton} ${orderType === 'limit' ? styles.typeActive : ''}`}
                  aria-pressed={orderType === 'limit'}
                  onClick={() => setOrderType('limit')}
                >
                  限價
                </button>
              </div>
            </div>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>委託價格</span>
              <input
                className={styles.input}
                type="number"
                step="0.01"
                min="0"
                value={orderType === 'market' ? (quotePrice > 0 ? quotePrice.toFixed(2) : '') : priceInput}
                onChange={(event) => setPriceInput(event.target.value)}
                placeholder={orderType === 'market' ? '以即時價成交' : '輸入限價'}
                disabled={orderType === 'market'}
                readOnly={orderType === 'market'}
              />
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>張數</span>
              <input
                className={styles.input}
                type="number"
                step="1"
                min="1"
                value={lotsInput}
                onChange={(event) => setLotsInput(event.target.value)}
                placeholder="輸入張數"
                inputMode="numeric"
              />
              {side === 'sell' ? (
                <span className={styles.fieldHint}>目前持有 {heldLots} 張</span>
              ) : null}
            </label>
          </div>

          {/* 即時試算 */}
          <div className={styles.preview}>
            <div className={styles.previewRow}>
              <span>成交金額</span>
              <b>{fmtMoney(previewAmount)}</b>
            </div>
            <div className={styles.previewRow}>
              <span>手續費 0.1425%</span>
              <b>{fmtMoney(previewFee)}</b>
            </div>
            <div className={styles.previewRow}>
              <span>證交稅 0.3%{side === 'buy' ? '（買進免收）' : ''}</span>
              <b>{fmtMoney(previewTax)}</b>
            </div>
            <div className={`${styles.previewRow} ${styles.previewTotal}`}>
              <span>{side === 'buy' ? '預估總成本' : '預估淨收入'}</span>
              <b>{fmtMoney(previewTotal)}</b>
            </div>
          </div>

          {panelError ? (
            <p className={styles.errorLine} role="alert">
              <AlertCircle size={14} />
              {panelError}
            </p>
          ) : null}

          <button
            type="button"
            className={`${styles.submitButton} ${side === 'buy' ? styles.submitBuy : styles.submitSell}`}
            onClick={handleSubmit}
          >
            {side === 'buy' ? '買入' : '賣出'}
          </button>
        </section>

        {/* 4. 交易紀錄 */}
        <section className={styles.panel} aria-label="交易紀錄">
          <div className={styles.panelHeader}>
            <span className={styles.panelTitle}>
              <BookOpen size={15} />
              交易紀錄
            </span>
            <em className={`${styles.panelNote} ${toneClass(realizedTotal)}`}>
              累計已實現 {fmtSigned(realizedTotal)}
            </em>
          </div>

          {sortedTrades.length === 0 ? (
            <div className={styles.empty}>
              <BookOpen size={24} />
              <span>尚無交易紀錄</span>
            </div>
          ) : (
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>時間</th>
                    <th>代號</th>
                    <th>買賣</th>
                    <th className={styles.numCol}>價格</th>
                    <th className={styles.numCol}>張數</th>
                    <th className={styles.numCol}>手續費</th>
                    <th className={styles.numCol}>證交稅</th>
                    <th className={styles.numCol}>已實現損益</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {sortedTrades.map((trade) => {
                    const expanded = expandedTrade === trade.id;
                    const draft = noteDrafts[trade.id] ?? trade.note;
                    return (
                      <Fragment key={trade.id}>
                        <tr>
                          <td className={styles.timeCell}>{fmtTime(trade.at)}</td>
                          <td className={styles.symbolCell}>{trade.symbol}</td>
                          <td>
                            <span
                              className={`${styles.sideTag} ${
                                trade.side === 'buy' ? styles.sideTagBuy : styles.sideTagSell
                              }`}
                            >
                              {trade.side === 'buy' ? '買進' : '賣出'}
                            </span>
                          </td>
                          <td className={styles.numCol}>{fmtPrice(trade.price)}</td>
                          <td className={styles.numCol}>{trade.lots.toLocaleString('zh-TW')}</td>
                          <td className={styles.numCol}>{trade.fee.toLocaleString('zh-TW')}</td>
                          <td className={styles.numCol}>{trade.tax.toLocaleString('zh-TW')}</td>
                          <td
                            className={`${styles.numCol} ${
                              trade.realizedPnl === null ? styles.flat : toneClass(trade.realizedPnl)
                            }`}
                          >
                            {trade.realizedPnl === null ? '--' : fmtSigned(trade.realizedPnl)}
                          </td>
                          <td>
                            <button
                              type="button"
                              className={styles.miniButton}
                              onClick={() => setExpandedTrade(expanded ? null : trade.id)}
                              aria-expanded={expanded}
                            >
                              {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                              筆記
                            </button>
                          </td>
                        </tr>
                        {expanded ? (
                          <tr className={styles.noteRow}>
                            <td colSpan={9}>
                              <div className={styles.noteBox}>
                                <div className={styles.noteHeader}>
                                  <span>複盤筆記</span>
                                  {savedFlash[trade.id] ? (
                                    <span className={styles.savedFlash}>
                                      <CheckCircle size={13} />
                                      已儲存
                                    </span>
                                  ) : null}
                                </div>
                                <textarea
                                  className={styles.noteTextarea}
                                  value={draft}
                                  onChange={(event) => handleNoteChange(trade.id, event.target.value)}
                                  placeholder="追高了，下次等回測"
                                  rows={3}
                                />
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* 5. 績效分析 */}
        <section className={styles.panel} aria-label="績效分析">
          <div className={styles.panelHeader}>
            <span className={styles.panelTitle}>
              <Activity size={15} />
              績效分析
            </span>
            <em className={styles.panelNote}>依每日總資產快照計算</em>
          </div>

          <div className={styles.chartWrap}>
            {account.equityCurve.length >= 2 ? (
              <div className={styles.chart}>
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={account.equityCurve} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={24} />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      width={52}
                      domain={['auto', 'auto']}
                      tickFormatter={(value: number) => fmtAxis(value)}
                    />
                    <Tooltip />
                    <Area
                      type="monotone"
                      dataKey="equity"
                      name="總資產"
                      strokeWidth={2}
                      dot={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className={styles.empty}>
                <Activity size={24} />
                <span>資料不足，尚無法計算</span>
              </div>
            )}
          </div>

          <div className={styles.metricsGrid}>
            <div className={styles.metricSmall}>
              <span>最大回撤</span>
              <strong className={maxDrawdown === null ? styles.flat : styles.down}>
                {maxDrawdown === null ? '資料不足，尚無法計算' : `-${maxDrawdown.toFixed(2)}%`}
              </strong>
            </div>
            <div className={styles.metricSmall}>
              <span>勝率</span>
              <strong className={performance.winRate === null ? styles.flat : styles.ink}>
                {performance.winRate === null
                  ? '資料不足，尚無法計算'
                  : `${performance.winRate.toFixed(1)}%`}
              </strong>
              <em>獲利筆數 / 總平倉筆數（{performance.closedCount} 筆）</em>
            </div>
            <div className={styles.metricSmall}>
              <span>盈虧比</span>
              <strong className={performance.ratio === null ? styles.flat : styles.ink}>
                {performance.ratio === null ? '資料不足，尚無法計算' : performance.ratio.toFixed(2)}
              </strong>
              <em>平均獲利 / 平均虧損</em>
            </div>
          </div>
        </section>

        {/* 6. 工具列 */}
        <section className={styles.toolRow}>
          <button type="button" className={styles.ghostButton} onClick={exportCsv}>
            <Download size={15} />
            匯出紀錄
          </button>
          <button
            type="button"
            className={styles.dangerButton}
            onClick={() => {
              setResetOpen(true);
              setResetInput('');
            }}
          >
            <RotateCcw size={15} />
            重置帳戶
          </button>
        </section>
      </div>

      {/* 下單確認 */}
      {pendingOrder ? (
        <div className={styles.backdrop} onClick={() => setPendingOrder(null)}>
          <div
            className={styles.dialog}
            role="dialog"
            aria-modal="true"
            aria-label="下單確認"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className={styles.dialogTitle}>下單確認</h3>
            <dl className={styles.dialogList}>
              <div>
                <dt>股票</dt>
                <dd>
                  {pendingOrder.symbol} {pendingOrder.name}
                </dd>
              </div>
              <div>
                <dt>買賣</dt>
                <dd className={pendingOrder.side === 'buy' ? styles.up : styles.down}>
                  {pendingOrder.side === 'buy' ? '買進' : '賣出'}
                </dd>
              </div>
              <div>
                <dt>委託類型</dt>
                <dd>{pendingOrder.orderType === 'market' ? '市價' : '限價'}</dd>
              </div>
              <div>
                <dt>價格</dt>
                <dd>{fmtPrice(pendingOrder.price)}</dd>
              </div>
              <div>
                <dt>張數</dt>
                <dd>{pendingOrder.lots.toLocaleString('zh-TW')}</dd>
              </div>
              <div>
                <dt>成交金額</dt>
                <dd>{fmtMoney(calcAmount(pendingOrder.price, pendingOrder.lots))}</dd>
              </div>
              <div>
                <dt>手續費 0.1425%</dt>
                <dd>{fmtMoney(calcFee(calcAmount(pendingOrder.price, pendingOrder.lots)))}</dd>
              </div>
              <div>
                <dt>證交稅 0.3%</dt>
                <dd>
                  {fmtMoney(
                    pendingOrder.side === 'sell'
                      ? calcTax(calcAmount(pendingOrder.price, pendingOrder.lots))
                      : 0
                  )}
                </dd>
              </div>
              <div className={styles.dialogTotal}>
                <dt>{pendingOrder.side === 'buy' ? '預估總成本' : '預估淨收入'}</dt>
                <dd>
                  {fmtMoney(
                    pendingOrder.side === 'buy'
                      ? calcAmount(pendingOrder.price, pendingOrder.lots) +
                          calcFee(calcAmount(pendingOrder.price, pendingOrder.lots))
                      : calcAmount(pendingOrder.price, pendingOrder.lots) -
                          calcFee(calcAmount(pendingOrder.price, pendingOrder.lots)) -
                          calcTax(calcAmount(pendingOrder.price, pendingOrder.lots))
                  )}
                </dd>
              </div>
            </dl>
            <div className={styles.dialogActions}>
              <button
                type="button"
                className={styles.ghostButton}
                onClick={() => setPendingOrder(null)}
              >
                取消
              </button>
              <button
                type="button"
                className={`${styles.submitButton} ${
                  pendingOrder.side === 'buy' ? styles.submitBuy : styles.submitSell
                }`}
                onClick={confirmOrder}
              >
                確認成交
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* 重置確認 */}
      {resetOpen ? (
        <div
          className={styles.backdrop}
          onClick={() => {
            setResetOpen(false);
            setResetInput('');
          }}
        >
          <div
            className={styles.dialog}
            role="dialog"
            aria-modal="true"
            aria-label="重置帳戶"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className={styles.dialogTitle}>重置帳戶</h3>
            <p className={styles.dialogText}>
              這會清空所有持股、交易紀錄與複盤筆記，並把現金回復到 1,000,000 元。此操作無法復原。
              請輸入 <b>RESET</b> 以確認。
            </p>
            <input
              className={styles.input}
              value={resetInput}
              onChange={(event) => setResetInput(event.target.value)}
              placeholder="輸入 RESET"
              autoComplete="off"
            />
            <div className={styles.dialogActions}>
              <button
                type="button"
                className={styles.ghostButton}
                onClick={() => {
                  setResetOpen(false);
                  setResetInput('');
                }}
              >
                取消
              </button>
              <button
                type="button"
                className={styles.dangerButton}
                onClick={confirmReset}
                disabled={resetInput.trim().toUpperCase() !== 'RESET'}
              >
                <RotateCcw size={15} />
                確認重置
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* 成交提示 */}
      {toast ? (
        <div className={styles.toast} role="status" aria-live="polite">
          <CheckCircle size={16} />
          <span>{toast}</span>
          <button type="button" className={styles.toastClose} onClick={() => setToast('')} aria-label="關閉提示">
            <X size={14} />
          </button>
        </div>
      ) : null}

      {/*
        底部功能列不在本頁渲染 —— src/app/layout.tsx:51 已全域掛載唯一一份 <AppTabBar />，
        且其 TAB_BAR_PREFIXES 已包含 '/dojo'。/market-center、/review、/chart、/ask 也都是依賴那一份。
        若本頁再渲染一次，畫面上會出現兩條重疊的底部列。
      */}
    </div>
  );
}
