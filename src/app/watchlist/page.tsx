'use client';

/**
 * 我的關注（/watchlist）
 *
 * 複刻博主 App 的自選股功能：分群管理、即時行情、籌碼異動標記、批次操作。
 *
 * 資料來源（全部真實，無任何寫死假資料）：
 * - 行情：GET /api/skynet/twse?tickers=a,b,c（一次批次抓取，不逐檔打）
 * - 法人買超：GET /api/skynet/t86?tickers=a,b,c → 個股層級三大法人買賣超（單位：張）
 *             （證交所 T86 公開資料；totalNet > 0 即標記為法人買超）
 * - 前一日成交量：GET /api/skynet/kline?type=daily&ticker=X（取日 K 最後兩根推算）
 *
 * 狀態一律存 localStorage（鍵：skynet_watchlist_v1）。
 *
 * 未實作的籌碼標記（無公開資料源，依規格不捏造）：
 * - 分點集中：目前沒有公開的分點進出資料源 → 不顯示此標記；CSS 樣式（.chipBranch）
 *   與本註解保留，待資料源接上後可直接啟用。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, TouchEvent as ReactTouchEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bell,
  CheckSquare,
  Download,
  GripVertical,
  Plus,
  RefreshCw,
  Settings2,
  Square,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import styles from './watchlist.module.css';

// ── 型別 ────────────────────────────────────────────────

/** 分群。 */
type WatchGroup = { id: string; name: string };

/** 關注標的。 */
type WatchItem = {
  symbol: string;
  name: string;
  /** 所屬分群。 */
  groupId: string;
  /** 群內排序。 */
  order: number;
  /** 漲跌提醒門檻（%），null = 未設定。 */
  alertPct: 3 | 5 | 10 | null;
  /** 法人買超提醒。 */
  alertInstitutional: boolean;
  /** 分點集中提醒（資料源未接，暫不生效）。 */
  alertBranch: boolean;
  addedAt: string;
};

/** 完整狀態（存 localStorage）。 */
type WatchState = { groups: WatchGroup[]; items: WatchItem[] };

/** /api/skynet/twse 的單筆報價。 */
type QuoteItem = {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
  volume: number;
  timestamp: string;
  tradeDate?: string;
  source?: string;
};

/** /api/skynet/t86 的單筆三大法人買賣超（單位：張）。 */
type T86Item = {
  symbol: string;
  name: string;
  foreignNet: number;
  trustNet: number;
  dealerNet: number;
  totalNet: number;
};

// ── 常數 ────────────────────────────────────────────────

/** localStorage 鍵名。 */
const STORAGE_KEY = 'skynet_watchlist_v1';

/** UI 聚合檢視代號（不是真實分群）。 */
const ALL_GROUP = 'all';

/** 預設分群（真實初始資料）。 */
const DEFAULT_GROUPS: WatchGroup[] = [
  { id: 'core', name: '核心關注' },
  { id: 'observe', name: '觀察清單' },
];

/** 漲跌提醒門檻選項。 */
const ALERT_OPTIONS: { value: 3 | 5 | 10 | null; label: string }[] = [
  { value: 3, label: '±3%' },
  { value: 5, label: '±5%' },
  { value: 10, label: '±10%' },
  { value: null, label: '不提醒' },
];

// ── 純工具函式 ──────────────────────────────────────────

/** 去掉 otc: 前綴，取得顯示／比對用代號。 */
function stripPrefix(symbol: string): string {
  return symbol.replace(/^otc:/i, '');
}

/** 台股慣例：紅漲綠跌。 */
function toneClass(value: number): string {
  if (value > 0) return styles.up;
  if (value < 0) return styles.down;
  return styles.flat;
}

const fmtPrice = (value: number): string =>
  Number.isFinite(value) && value > 0
    ? value.toLocaleString('zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '--';

const fmtChange = (value: number): string =>
  Number.isFinite(value) ? `${value > 0 ? '+' : ''}${value.toFixed(2)}` : '--';

const fmtPercent = (value: number): string =>
  Number.isFinite(value) ? `${value > 0 ? '+' : ''}${value.toFixed(2)}%` : '--';

const fmtVolume = (value: number): string =>
  Number.isFinite(value) && value > 0 ? Math.round(value).toLocaleString('zh-TW') : '--';

/** 以台北時區取得今天（'YYYYMMDD'）。 */
function todayYmdTaipei(): string {
  const formatted = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  return formatted.replace(/-/g, '');
}

/** 是否為台股交易時段（台北時區、週一～週五 09:00–13:30）。 */
function isTwMarketOpen(now: Date = new Date()): boolean {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Taipei',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  const weekday = pick('weekday');
  if (weekday === 'Sat' || weekday === 'Sun') return false;
  const minutes = Number(pick('hour')) * 60 + Number(pick('minute'));
  return minutes >= 9 * 60 && minutes <= 13 * 60 + 30;
}

/** 產生唯一的群組 id。 */
function newGroupId(): string {
  return `g_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** 從 localStorage 載入狀態（SSR／私密模式／壞資料一律退回預設）。 */
function loadState(): WatchState {
  const fallback: WatchState = { groups: DEFAULT_GROUPS, items: [] };
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<WatchState>;
    const groups = Array.isArray(parsed.groups) && parsed.groups.length > 0 ? parsed.groups : DEFAULT_GROUPS;
    const items = Array.isArray(parsed.items) ? parsed.items : [];
    return { groups, items };
  } catch {
    return fallback;
  }
}

/** 寫回 localStorage（失敗不影響 UI）。 */
function persistState(state: WatchState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 忽略：私密模式或配額不足
  }
}

/** CSV 單格轉義。 */
function csvCell(value: string | number): string {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// ── 主元件 ──────────────────────────────────────────────

export default function WatchlistPage() {
  const router = useRouter();

  const [hydrated, setHydrated] = useState(false);
  const [state, setState] = useState<WatchState>({ groups: DEFAULT_GROUPS, items: [] });
  const [activeGroup, setActiveGroup] = useState<string>(ALL_GROUP);

  const [quotes, setQuotes] = useState<Record<string, QuoteItem>>({});
  const [t86Map, setT86Map] = useState<Record<string, T86Item>>({});
  const [prevVolume, setPrevVolume] = useState<Record<string, number>>({});

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState('');

  const [editMode, setEditMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dragging, setDragging] = useState<string | null>(null);
  const [swiped, setSwiped] = useState<string | null>(null);

  const [showAlertModal, setShowAlertModal] = useState(false);
  const [draftAlertPct, setDraftAlertPct] = useState<3 | 5 | 10 | null>(null);
  const [draftInstAlert, setDraftInstAlert] = useState(false);

  const [showNewGroup, setShowNewGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');

  const [quickAdd, setQuickAdd] = useState('');

  const [pullDistance, setPullDistance] = useState(0);
  const [pullRefreshing, setPullRefreshing] = useState(false);

  const listRef = useRef<HTMLUListElement | null>(null);
  const pullStartY = useRef<number | null>(null);
  const touchStartX = useRef<number | null>(null);
  const prevVolumeSig = useRef('');

  // ── localStorage 載入（僅客戶端，避免 hydration mismatch）──
  useEffect(() => {
    setState(loadState());
    setHydrated(true);
  }, []);

  // ── 狀態變更即持久化 ──
  useEffect(() => {
    if (hydrated) persistState(state);
  }, [hydrated, state]);

  // ── 行情抓取（批次）──
  const loadQuotes = useCallback(
    async (quiet = false): Promise<void> => {
      if (quiet) setRefreshing(true);
      else setLoading(true);

      const symbols = state.items.map((item) => item.symbol);
      // T86 端點以「無前綴」代號比對（上櫃為 otc:6488 → 6488）。
      const bareSymbols = symbols.map(stripPrefix);
      if (symbols.length === 0) {
        setQuotes({});
        setT86Map({});
        setUpdatedAt(new Date().toISOString());
        setLoading(false);
        setRefreshing(false);
        return;
      }

      const [quoteResult, t86Result] = await Promise.allSettled([
        fetch(`/api/skynet/twse?tickers=${encodeURIComponent(symbols.join(','))}`, {
          cache: 'no-store',
        }).then(async (res) => {
          const body = (await res.json()) as { items?: QuoteItem[] };
          return Array.isArray(body?.items) ? body.items : [];
        }),
        fetch(`/api/skynet/t86?tickers=${encodeURIComponent(bareSymbols.join(','))}`, {
          cache: 'no-store',
        }).then(async (res) => {
          if (!res.ok) return [] as T86Item[];
          const body = (await res.json()) as { items?: T86Item[] };
          return Array.isArray(body?.items) ? body.items : [];
        }),
      ]);

      if (quoteResult.status === 'fulfilled') {
        const map: Record<string, QuoteItem> = {};
        for (const item of quoteResult.value) map[stripPrefix(item.symbol)] = item;
        setQuotes(map);
      }
      // T86 取不到（非 200／網路失敗）就得到空 map → 不顯示任何法人標記；
      // 絕不退回「market-overview 前 5 名」的舊邏輯。
      const t86Items = t86Result.status === 'fulfilled' ? t86Result.value : [];
      const nextT86: Record<string, T86Item> = {};
      for (const item of t86Items) nextT86[item.symbol] = item;
      setT86Map(nextT86);

      setUpdatedAt(new Date().toISOString());
      setLoading(false);
      setRefreshing(false);
    },
    [state.items]
  );

  // 首次載入 + 輪詢（盤中 10 秒、盤後 60 秒）。
  useEffect(() => {
    if (!hydrated) return;
    void loadQuotes();
  }, [hydrated, loadQuotes]);

  useEffect(() => {
    if (!hydrated) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const delay = isTwMarketOpen() ? 10_000 : 60_000;
      timer = setTimeout(() => {
        void loadQuotes(true);
        schedule();
      }, delay);
    };
    schedule();
    return () => clearTimeout(timer);
  }, [hydrated, loadQuotes]);

  // ── 前一日成交量（用日 K 推算，單位統一為「張」）──
  useEffect(() => {
    if (!hydrated) return;
    const symbols = state.items.map((item) => item.symbol);
    if (symbols.length === 0) {
      setPrevVolume({});
      prevVolumeSig.current = '';
      return;
    }

    const tradeDate = Object.values(quotes)[0]?.tradeDate ?? '';
    const signature = `${tradeDate}|${[...symbols].sort().join(',')}`;
    if (signature === prevVolumeSig.current) return;
    prevVolumeSig.current = signature;

    let cancelled = false;
    (async () => {
      const collected: Record<string, number> = {};
      const CHUNK = 4;
      for (let index = 0; index < symbols.length; index += CHUNK) {
        const slice = symbols.slice(index, index + CHUNK);
        const settled = await Promise.allSettled(
          slice.map(async (symbol) => {
            const res = await fetch(
              `/api/skynet/kline?type=daily&ticker=${encodeURIComponent(stripPrefix(symbol))}`,
              { cache: 'no-store' }
            );
            if (!res.ok) return null;
            const body = (await res.json()) as { candles?: { date?: string; volume?: number }[] };
            const candles = (body.candles ?? []).filter((candle) => Number.isFinite(candle.volume));
            if (candles.length < 2) return null;
            const last = candles[candles.length - 1];
            const prev = candles[candles.length - 2];
            // 最後一根若已是當日（Fugle 已更新），前一日就是倒數第二根；否則最後一根即前一日。
            const lastIsToday = Boolean(tradeDate) && last.date === tradeDate;
            const target = lastIsToday ? prev : last;
            // Fugle 日 K volume 單位為「股」，TWSE MIS 的 volume 為「張」→ 除以 1000 統一為張。
            const lots = Math.round((target.volume ?? 0) / 1000);
            if (!Number.isFinite(lots) || lots <= 0) return null;
            return { symbol, lots };
          })
        );
        if (cancelled) return;
        for (const entry of settled) {
          if (entry.status === 'fulfilled' && entry.value) collected[entry.value.symbol] = entry.value.lots;
        }
      }
      if (!cancelled) setPrevVolume(collected);
    })();

    return () => {
      cancelled = true;
    };
  }, [hydrated, state.items, quotes]);

  // ── 衍生資料 ──

  const visibleItems = useMemo(() => {
    const items =
      activeGroup === ALL_GROUP ? state.items : state.items.filter((item) => item.groupId === activeGroup);
    return [...items].sort((a, b) => a.order - b.order);
  }, [state.items, activeGroup]);

  const countFor = useCallback(
    (groupId: string): number =>
      groupId === ALL_GROUP
        ? state.items.length
        : state.items.filter((item) => item.groupId === groupId).length,
    [state.items]
  );

  // 若目前分群被移除（理論上不會，因為只新增不刪群），退回全部。
  useEffect(() => {
    if (activeGroup !== ALL_GROUP && !state.groups.some((group) => group.id === activeGroup)) {
      setActiveGroup(ALL_GROUP);
    }
  }, [activeGroup, state.groups]);

  // ── 狀態操作 ──

  const addSymbol = useCallback(
    (rawSymbol: string, rawName = '') => {
      const symbol = rawSymbol.trim().toUpperCase();
      if (!/^(OTC:)?\d{4,6}[A-Z]?$/.test(symbol)) return false;
      if (state.items.some((item) => item.symbol === symbol)) return true;
      const groupId = activeGroup === ALL_GROUP ? state.groups[0]?.id ?? 'core' : activeGroup;
      const order = state.items.filter((item) => item.groupId === groupId).length;
      const item: WatchItem = {
        symbol,
        name: rawName || stripPrefix(symbol),
        groupId,
        order,
        alertPct: null,
        alertInstitutional: false,
        alertBranch: false,
        addedAt: new Date().toISOString(),
      };
      setState((prev) => ({ ...prev, items: [...prev.items, item] }));
      return true;
    },
    [activeGroup, state.groups, state.items]
  );

  const removeItems = useCallback((symbols: string[]) => {
    const target = new Set(symbols);
    setState((prev) => ({ ...prev, items: prev.items.filter((item) => !target.has(item.symbol)) }));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const symbol of symbols) next.delete(symbol);
      return next;
    });
    setSwiped(null);
  }, []);

  const moveItem = useCallback((symbol: string, groupId: string) => {
    setState((prev) => {
      const order = prev.items.filter((item) => item.groupId === groupId && item.symbol !== symbol).length;
      return {
        ...prev,
        items: prev.items.map((item) => (item.symbol === symbol ? { ...item, groupId, order } : item)),
      };
    });
  }, []);

  const toggleSelect = useCallback((symbol: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) next.delete(symbol);
      else next.add(symbol);
      return next;
    });
  }, []);

  const allVisibleSelected = visibleItems.length > 0 && visibleItems.every((item) => selected.has(item.symbol));

  const toggleSelectAll = useCallback(() => {
    setSelected((prev) => {
      if (visibleItems.every((item) => prev.has(item.symbol))) {
        const next = new Set(prev);
        for (const item of visibleItems) next.delete(item.symbol);
        return next;
      }
      const next = new Set(prev);
      for (const item of visibleItems) next.add(item.symbol);
      return next;
    });
  }, [visibleItems]);

  const createGroup = useCallback(() => {
    const name = newGroupName.trim();
    if (!name) return;
    const group: WatchGroup = { id: newGroupId(), name };
    setState((prev) => ({ ...prev, groups: [...prev.groups, group] }));
    setActiveGroup(group.id);
    setNewGroupName('');
    setShowNewGroup(false);
  }, [newGroupName]);

  // ── 拖曳排序（HTML5 drag & drop）──

  const handleDrop = useCallback(
    (targetSymbol: string) => {
      const sourceSymbol = dragging;
      setDragging(null);
      if (!sourceSymbol || sourceSymbol === targetSymbol) return;
      setState((prev) => {
        const inView = prev.items
          .filter((item) => activeGroup === ALL_GROUP || item.groupId === activeGroup)
          .sort((a, b) => a.order - b.order);
        const fromIndex = inView.findIndex((item) => item.symbol === sourceSymbol);
        const toIndex = inView.findIndex((item) => item.symbol === targetSymbol);
        if (fromIndex < 0 || toIndex < 0) return prev;
        const reordered = [...inView];
        const [moved] = reordered.splice(fromIndex, 1);
        reordered.splice(toIndex, 0, moved);
        const orderMap = new Map(reordered.map((item, index) => [item.symbol, index]));
        return {
          ...prev,
          items: prev.items.map((item) =>
            orderMap.has(item.symbol) ? { ...item, order: orderMap.get(item.symbol) as number } : item
          ),
        };
      });
    },
    [dragging, activeGroup]
  );

  // ── 左滑刪除（touch）──

  const handleTouchStart = useCallback((event: ReactTouchEvent<HTMLLIElement>) => {
    touchStartX.current = event.touches[0]?.clientX ?? null;
  }, []);

  const handleTouchMove = useCallback(
    (symbol: string, event: ReactTouchEvent<HTMLLIElement>) => {
      if (touchStartX.current === null) return;
      const deltaX = (event.touches[0]?.clientX ?? 0) - touchStartX.current;
      if (deltaX < -60) setSwiped(symbol);
      else if (deltaX > 20) setSwiped(null);
    },
    []
  );

  const handleTouchEnd = useCallback(() => {
    touchStartX.current = null;
  }, []);

  // ── 下拉重新整理 ──

  const handleListTouchStart = useCallback((event: ReactTouchEvent<HTMLUListElement>) => {
    if ((listRef.current?.scrollTop ?? 0) <= 0) {
      pullStartY.current = event.touches[0]?.clientY ?? null;
    } else {
      pullStartY.current = null;
    }
  }, []);

  const handleListTouchMove = useCallback((event: ReactTouchEvent<HTMLUListElement>) => {
    if (pullStartY.current === null) return;
    const deltaY = (event.touches[0]?.clientY ?? 0) - pullStartY.current;
    if (deltaY > 0) setPullDistance(Math.min(deltaY, 90));
  }, []);

  const handleListTouchEnd = useCallback(async () => {
    if (pullDistance > 60) {
      setPullRefreshing(true);
      await loadQuotes(true);
      setPullRefreshing(false);
    }
    setPullDistance(0);
    pullStartY.current = null;
  }, [pullDistance, loadQuotes]);

  // ── 批次操作 ──

  const targetSymbols = useCallback(
    (): string[] => (selected.size > 0 ? Array.from(selected) : state.items.map((item) => item.symbol)),
    [selected, state.items]
  );

  const applyAlertSettings = useCallback(() => {
    const target = new Set(targetSymbols());
    setState((prev) => ({
      ...prev,
      items: prev.items.map((item) =>
        target.has(item.symbol)
          ? { ...item, alertPct: draftAlertPct, alertInstitutional: draftInstAlert }
          : item
      ),
    }));
    setShowAlertModal(false);
  }, [targetSymbols, draftAlertPct, draftInstAlert]);

  const exportCsv = useCallback(() => {
    const symbols = targetSymbols();
    const target = new Set(symbols);
    const rows: string[][] = [['代號', '名稱', '群組', '現價', '漲跌', '漲跌幅(%)', '成交量(張)']];
    for (const item of state.items) {
      if (!target.has(item.symbol)) continue;
      const quote = quotes[stripPrefix(item.symbol)];
      const groupName = state.groups.find((group) => group.id === item.groupId)?.name ?? '';
      rows.push([
        stripPrefix(item.symbol),
        item.name,
        groupName,
        quote ? fmtPrice(quote.price) : '',
        quote ? fmtChange(quote.change) : '',
        quote ? quote.changePercent.toFixed(2) : '',
        quote ? String(Math.round(quote.volume)) : '',
      ]);
    }
    const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\n')}`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `我的關注_${todayYmdTaipei()}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, [targetSymbols, state.items, state.groups, quotes]);

  const openAlertModal = useCallback(() => {
    // 以選取中的標的為準；若無選取則代表「全部」，預設值取目前狀態。
    const symbols = targetSymbols();
    const first = state.items.find((item) => symbols.includes(item.symbol));
    setDraftAlertPct(first?.alertPct ?? null);
    setDraftInstAlert(first?.alertInstitutional ?? false);
    setShowAlertModal(true);
  }, [targetSymbols, state.items]);

  const handleQuickAdd = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (addSymbol(quickAdd)) setQuickAdd('');
    },
    [addSymbol, quickAdd]
  );

  const handleRowClick = useCallback(
    (symbol: string) => {
      if (editMode) return;
      router.push(`/s/${encodeURIComponent(stripPrefix(symbol))}`);
    },
    [editMode, router]
  );

  const updatedLabel = updatedAt
    ? new Date(updatedAt).toLocaleTimeString('zh-TW', { hour12: false })
    : '--';

  // ── 渲染 ──

  return (
    <div className={styles.root}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.brand}>
            <span className={styles.brandIcon}>
              <Star size={18} />
            </span>
            <div>
              <h1 className={styles.title}>我的關注</h1>
              <p className={styles.subtitle}>追蹤你的核心持股與觀察標的</p>
            </div>
          </div>

          <div className={styles.headerActions}>
            <span className={styles.headerMeta}>更新 {updatedLabel}</span>
            <button
              className={styles.iconButton}
              onClick={() => void loadQuotes(true)}
              disabled={refreshing}
              aria-label="重新整理行情"
            >
              <RefreshCw size={17} className={refreshing ? styles.spin : ''} />
            </button>
            <button
              className={`${styles.editButton} ${editMode ? styles.editButtonActive : ''}`}
              onClick={() => {
                setEditMode((prev) => !prev);
                setSelected(new Set());
                setSwiped(null);
              }}
              aria-pressed={editMode}
            >
              {editMode ? '完成' : '編輯'}
            </button>
          </div>
        </header>

        {/* 分群標籤列 */}
        <div className={styles.groupBar} role="tablist" aria-label="關注分群">
          <button
            role="tab"
            aria-selected={activeGroup === ALL_GROUP}
            className={`${styles.groupTab} ${activeGroup === ALL_GROUP ? styles.groupTabActive : ''}`}
            onClick={() => setActiveGroup(ALL_GROUP)}
          >
            <span className={styles.groupTabLabel}>全部</span>
            <span className={styles.groupTabCount}>{countFor(ALL_GROUP)} 檔</span>
          </button>

          {state.groups.map((group) => (
            <button
              key={group.id}
              role="tab"
              aria-selected={activeGroup === group.id}
              className={`${styles.groupTab} ${activeGroup === group.id ? styles.groupTabActive : ''}`}
              onClick={() => setActiveGroup(group.id)}
            >
              <span className={styles.groupTabLabel}>{group.name}</span>
              <span className={styles.groupTabCount}>{countFor(group.id)} 檔</span>
            </button>
          ))}

          {showNewGroup ? (
            <form
              className={styles.newGroupForm}
              onSubmit={(event) => {
                event.preventDefault();
                createGroup();
              }}
            >
              <input
                className={styles.newGroupInput}
                value={newGroupName}
                onChange={(event) => setNewGroupName(event.target.value)}
                placeholder="群組名稱"
                aria-label="新群組名稱"
                autoFocus
              />
              <button className={styles.newGroupConfirm} type="submit">
                建立
              </button>
              <button
                className={styles.newGroupCancel}
                type="button"
                onClick={() => {
                  setShowNewGroup(false);
                  setNewGroupName('');
                }}
                aria-label="取消新增群組"
              >
                <X size={14} />
              </button>
            </form>
          ) : (
            <button className={styles.addGroupButton} onClick={() => setShowNewGroup(true)}>
              <Plus size={14} />
              新增群組
            </button>
          )}
        </div>

        {/* 批次操作列（僅編輯模式） */}
        {editMode ? (
          <div className={styles.batchBar}>
            <button className={styles.batchButton} onClick={toggleSelectAll}>
              {allVisibleSelected ? <CheckSquare size={15} /> : <Square size={15} />}
              {allVisibleSelected ? '取消全選' : '全選'}
            </button>
            <button
              className={`${styles.batchButton} ${styles.batchButtonDanger}`}
              onClick={() => removeItems(Array.from(selected))}
              disabled={selected.size === 0}
            >
              <Trash2 size={15} />
              刪除選取
            </button>
            <button className={styles.batchButton} onClick={exportCsv}>
              <Download size={15} />
              匯出 CSV
            </button>
            <button className={styles.batchButton} onClick={openAlertModal}>
              <Bell size={15} />
              設定提醒
            </button>
            {selected.size > 0 ? <span className={styles.batchCount}>已選 {selected.size} 檔</span> : null}
          </div>
        ) : null}

        {/* 下拉重新整理指示器 */}
        <div className={styles.pullWrap} style={{ height: pullDistance }}>
          {pullDistance > 0 || pullRefreshing ? (
            <div className={styles.pullIndicator}>
              <RefreshCw size={16} className={pullRefreshing ? styles.spin : ''} />
              <span className={styles.pullText}>
                {pullRefreshing ? '重新整理中…' : pullDistance > 60 ? '放開以重新整理' : '下拉重新整理'}
              </span>
            </div>
          ) : null}
        </div>

        {/* 列表 */}
        {loading && !hydrated ? (
          <div className={styles.empty}>
            <RefreshCw size={26} className={styles.spin} />
            <p className={styles.emptyTitle}>載入中…</p>
          </div>
        ) : visibleItems.length === 0 ? (
          <div className={styles.empty}>
            <Star size={40} className={styles.emptyIcon} />
            <p className={styles.emptyTitle}>還沒有關注任何標的</p>
            <p className={styles.emptyDesc}>在個股頁點擊 ☆ 即可加入，或從下方快速加入</p>
            <form className={styles.quickAddForm} onSubmit={handleQuickAdd}>
              <input
                className={styles.quickAddInput}
                value={quickAdd}
                onChange={(event) => setQuickAdd(event.target.value)}
                placeholder="輸入股票代號（例如 2330）"
                aria-label="快速加入代號"
                autoComplete="off"
              />
              <button className={styles.quickAddButton} type="submit">
                <Plus size={15} />
                加入
              </button>
            </form>
          </div>
        ) : (
          <ul
            className={styles.list}
            ref={listRef}
            onTouchStart={handleListTouchStart}
            onTouchMove={handleListTouchMove}
            onTouchEnd={() => void handleListTouchEnd()}
          >
            {visibleItems.map((item) => {
              const quote = quotes[stripPrefix(item.symbol)];
              const tone = quote ? toneClass(quote.change) : styles.flat;
              const isSelected = selected.has(item.symbol);
              const t86 = t86Map[stripPrefix(item.symbol)];
              // 法人買超＝該檔當日三大法人合計淨買超 > 0（不再限前 5 名）。
              const instHit = Boolean(t86) && t86.totalNet > 0;
              const prevLots = prevVolume[item.symbol];
              const spikeHit =
                Boolean(quote) && prevLots !== undefined && quote.volume > 0 && quote.volume > prevLots * 2;
              const alertHit =
                item.alertPct !== null && Boolean(quote) && Math.abs(quote.changePercent) >= item.alertPct;
              const isSwiped = swiped === item.symbol;

              return (
                <li
                  key={item.symbol}
                  className={`${styles.row} ${isSelected ? styles.rowSelected : ''} ${
                    alertHit ? styles.rowAlert : ''
                  } ${dragging === item.symbol ? styles.rowDragging : ''}`}
                  draggable={editMode}
                  onDragStart={() => setDragging(item.symbol)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => handleDrop(item.symbol)}
                  onTouchStart={handleTouchStart}
                  onTouchMove={(event) => handleTouchMove(item.symbol, event)}
                  onTouchEnd={handleTouchEnd}
                >
                  <div
                    className={styles.rowMain}
                    style={isSwiped ? { transform: 'translateX(-76px)' } : undefined}
                    onClick={() => handleRowClick(item.symbol)}
                    role={editMode ? undefined : 'button'}
                    tabIndex={editMode ? -1 : 0}
                    onKeyDown={(event) => {
                      if (!editMode && (event.key === 'Enter' || event.key === ' ')) {
                        event.preventDefault();
                        handleRowClick(item.symbol);
                      }
                    }}
                  >
                    {editMode ? (
                      <span className={styles.dragHandle} aria-hidden="true">
                        <GripVertical size={16} />
                      </span>
                    ) : null}

                    {editMode ? (
                      <button
                        className={styles.checkbox}
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleSelect(item.symbol);
                        }}
                        aria-label={isSelected ? '取消選取' : '選取'}
                        aria-pressed={isSelected}
                      >
                        {isSelected ? <CheckSquare size={18} /> : <Square size={18} />}
                      </button>
                    ) : null}

                    <div className={styles.colMain}>
                      <span className={styles.symbolCode}>{stripPrefix(item.symbol)}</span>
                      <span className={styles.stockName}>{quote?.name || item.name}</span>
                    </div>

                    <div className={styles.colPrice}>
                      <b className={`${styles.priceValue} ${tone}`}>{quote ? fmtPrice(quote.price) : '--'}</b>
                      <span className={`${styles.changeValue} ${tone}`}>
                        {quote ? `${fmtChange(quote.change)} ${fmtPercent(quote.changePercent)}` : '--'}
                      </span>
                    </div>

                    <div className={styles.colVolume}>
                      <b className={styles.volumeValue}>{quote ? fmtVolume(quote.volume) : '--'}</b>
                      <span className={styles.volumeLabel}>張</span>
                    </div>

                    <div className={styles.chips}>
                      {instHit && t86 ? (
                        <span
                          className={`${styles.chip} ${styles.chipInst}`}
                          title={`三大法人淨買超 ${t86.totalNet.toLocaleString('zh-TW')} 張`}
                        >
                          法人買超
                        </span>
                      ) : null}
                      {spikeHit ? (
                        <span className={`${styles.chip} ${styles.chipSpike}`} title="當日成交量超過前一交易日 2 倍">
                          大量異常
                        </span>
                      ) : null}
                      {alertHit && item.alertPct !== null ? (
                        <span className={styles.alertBadge}>已達提醒 ±{item.alertPct}%</span>
                      ) : null}
                    </div>

                    {editMode ? (
                      <div className={styles.rowActions}>
                        <select
                          className={styles.moveSelect}
                          value={item.groupId}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) => moveItem(item.symbol, event.target.value)}
                          aria-label="移至群組"
                        >
                          {state.groups.map((group) => (
                            <option key={group.id} value={group.id}>
                              {group.name}
                            </option>
                          ))}
                        </select>
                        <button
                          className={styles.deleteButton}
                          onClick={(event) => {
                            event.stopPropagation();
                            removeItems([item.symbol]);
                          }}
                          aria-label="刪除"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ) : null}
                  </div>

                  {isSwiped ? (
                    <button
                      className={styles.swipeDelete}
                      onClick={() => removeItems([item.symbol])}
                    >
                      刪除
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        {!editMode && state.items.length > 0 ? (
          <form className={styles.quickAddForm} onSubmit={handleQuickAdd}>
            <input
              className={styles.quickAddInput}
              value={quickAdd}
              onChange={(event) => setQuickAdd(event.target.value)}
              placeholder="輸入股票代號（例如 2330）"
              aria-label="快速加入代號"
              autoComplete="off"
            />
            <button className={styles.quickAddButton} type="submit">
              <Plus size={15} />
              加入
            </button>
          </form>
        ) : null}
      </div>

      {/* 提醒設定 Modal */}
      {showAlertModal ? (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-label="提醒設定">
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <span className={styles.modalTitle}>
                <Settings2 size={16} />
                提醒設定
              </span>
              <button className={styles.modalClose} onClick={() => setShowAlertModal(false)} aria-label="關閉">
                <X size={16} />
              </button>
            </div>

            <div className={styles.modalBody}>
              <p className={styles.modalHint}>
                將套用至 {selected.size > 0 ? `已選取的 ${selected.size} 檔` : `全部 ${state.items.length} 檔`}
              </p>

              <div className={styles.modalSection}>
                <h3 className={styles.modalSectionTitle}>漲跌提醒</h3>
                <div className={styles.alertOptions}>
                  {ALERT_OPTIONS.map((option) => (
                    <button
                      key={option.label}
                      type="button"
                      className={`${styles.alertOption} ${
                        draftAlertPct === option.value ? styles.alertOptionActive : ''
                      }`}
                      onClick={() => setDraftAlertPct(option.value)}
                      aria-pressed={draftAlertPct === option.value}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.modalSection}>
                <h3 className={styles.modalSectionTitle}>籌碼提醒</h3>

                <div className={styles.switchRow}>
                  <span className={styles.switchLabel}>法人買超提醒</span>
                  <button
                    type="button"
                    className={`${styles.switch} ${draftInstAlert ? styles.switchOn : ''}`}
                    onClick={() => setDraftInstAlert((prev) => !prev)}
                    role="switch"
                    aria-checked={draftInstAlert}
                    aria-label="法人買超提醒"
                  >
                    <span className={styles.switchKnob} />
                  </button>
                </div>

                <div className={`${styles.switchRow} ${styles.switchDisabled}`}>
                  <span className={styles.switchLabel}>
                    分點集中提醒
                    <em className={styles.switchHint}>資料源未接，暫不生效</em>
                  </span>
                  <button
                    type="button"
                    className={styles.switch}
                    disabled
                    role="switch"
                    aria-checked={false}
                    aria-label="分點集中提醒（資料源未接，暫不生效）"
                  >
                    <span className={styles.switchKnob} />
                  </button>
                </div>
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button className={styles.ghostButton} onClick={() => setShowAlertModal(false)}>
                取消
              </button>
              <button className={styles.primaryButton} onClick={applyAlertSettings}>
                套用
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/*
        底部功能列不在本頁渲染 —— src/app/layout.tsx:51 已全域掛載唯一一份 <AppTabBar />，
        且其 TAB_BAR_PREFIXES 已包含 '/watchlist'。/diary、/review、/chart、/ai 也都是依賴那一份。
        若本頁再渲染一次，畫面上會出現兩條重疊的底部列。
      */}
    </div>
  );
}
