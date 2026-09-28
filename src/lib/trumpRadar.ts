/**
 * 川普政策雷達（/trump）純函式層
 * ----------------------------------------------------------------------------
 * 本檔只放「不觸及網路／KV 的純函式與常數」，供 route（src/app/api/skynet/
 * trump-radar/route.ts）與單元測試共用（App Router 的 route 檔僅允許匯出 HTTP
 * 方法與特定設定值，故可測邏輯集中在此，比照 src/lib/godBridge.ts 的作法）。
 *
 * 資料來源與研究結論（研究員已實測，直接照做，不重複調查）：
 *   - 實站（blackstockai.com）的 40/40 則 `link` 全是 Google News RSS
 *     （`https://news.google.com/rss/articles/...?oc=5`），`source` 欄位＝
 *     RSS 的 `<source url="...">Publisher</source>` 原文照抄。
 *   - 實站上游 API 已封鎖（程式打 blackstockai.com/api/* 回 403）→ 本站**自產**，
 *     直接抓 Google News RSS（英文＋繁中）與白宮官方 RSS。
 *
 * 兩項關鍵設計決策（業主明示，違反等於任務失敗）：
 *   1. 主題分類**可複製**（實測與實站一致率約 90%）→ 以關鍵字規則實作，
 *      優先序：晶片管制 → 利率匯率 → 關稅貿易 → 地緣國防 → 其他政策。
 *   2. 情緒分類**一律留白**（不實作）→ 實站的標題情緒標記經檢驗**內部矛盾**
 *      （與「全判中性」基準的一致率反而低於任何關鍵字規則），實作任何情緒分數
 *      都會製造誤導數字 → 回應省略所有情緒欄位，並以 omitted_fields 說明。
 *
 * 不造假原則：缺資料一律留白（空字串／空陣列），絕不以 0 冒充、絕不 Math.random。
 */

/** 五大政策主題（聯集型別；同時作為常數鍵的單一真相來源）。 */
export type ThemeName = '晶片管制' | '利率匯率' | '關稅貿易' | '地緣國防' | '其他政策';

/**
 * 主題優先序（＝分類規則的比對順序）。
 * 研究員實測此順序與實站一致率最高（36/40）；例如
 * `China expands export control on drug precursors`（毒品前驅物）會因命中
 * `export control` 而被歸「晶片管制」，與實站一致（連偽陽性都能複現）。
 */
export const THEME_ORDER: readonly ThemeName[] = [
  '晶片管制',
  '利率匯率',
  '關稅貿易',
  '地緣國防',
  '其他政策',
];

/**
 * 各主題對照的台股族群（照抄實站 themes[].sectors 口徑，逐字不變）。
 * 其他政策無對應族群 → 空陣列。
 */
export const THEME_SECTORS: Record<ThemeName, readonly string[]> = {
  晶片管制: ['半導體', 'IC 設計', '晶圓代工', '半導體設備', '封測'],
  利率匯率: ['金融', '資產股', '高股息', '壽險'],
  關稅貿易: ['塑化', '鋼鐵', '紡織', '工具機', '汽車零組件', '自行車', '橡膠', '航運'],
  地緣國防: ['國防航太', '資安', '重電'],
  其他政策: [],
};

/**
 * 主題關鍵字規則（具名常數 + 中文註解；依 THEME_ORDER 優先序比對）。
 *
 * 比對語意（見 matchesKeyword）：
 *   - 純中文關鍵字 → 子字串包含。
 *   - 純英文關鍵字 → 詞邊界（`\b`）＋可選複數 s，避免 `fed` 誤命中 `federal`、
 *     `chip` 能命中 `chips`、`tariff` 能命中 `tariffs`。
 *
 * 詞表刻意排除「會過度命中」的字：
 *   - 不含 `trade`（單獨）→ 避免把「談 trade 但主題是地緣政治」的標題誤判關稅貿易。
 *   - 不含 `treasury` → 避免把「US Treasury's Bessent…」（實站判地緣國防）誤判利率匯率。
 *   - 不含 `summit` → 實站把「Trump-Xi summit is set to be high in pageantry…」判其他政策。
 */
export const THEME_RULES: ReadonlyArray<{ theme: ThemeName; keywords: readonly string[] }> = [
  {
    theme: '晶片管制',
    keywords: ['chip', 'semiconductor', 'export control', 'wafer', 'nvidia', 'tsmc', 'foundry', '晶片', '半導體', '出口管制', '晶圓'],
  },
  {
    theme: '利率匯率',
    keywords: [
      'federal reserve',
      'interest rate',
      'rate cut',
      'rate hike',
      'rate decision',
      'inflation',
      'yield',
      'dollar',
      'currency',
      '聯準會',
      '利率',
      '通膨',
      '匯率',
      '降息',
      '升息',
    ],
  },
  {
    theme: '關稅貿易',
    keywords: [
      'tariff',
      'trade war',
      'trade deal',
      'trade pact',
      'trade deficit',
      'trade truce',
      'import duty',
      'export duty',
      'customs duty',
      'wto',
      '關稅',
      '貿易戰',
      '貿易協定',
      '貿易逆差',
    ],
  },
  {
    theme: '地緣國防',
    keywords: [
      'china',
      'chinese',
      'taiwan',
      'iran',
      'russia',
      'ukraine',
      'north korea',
      'defense',
      'defence',
      'military',
      'arms',
      'sanction',
      'geopolitical',
      'nato',
      '中國',
      '台灣',
      '台海',
      '地緣',
      '國防',
      '軍售',
      '制裁',
      '習',
    ],
  },
];

/** 情緒欄位留白說明（回應 omitted_fields 用；機器可判）。 */
export const OMITTED_FIELDS = {
  fields: [
    'sentiment',
    'n_pos',
    'n_neg',
    'n_neu',
    'sentiment_summary',
    'net',
    'score',
    'tone',
    'read',
    'themes[].sentiment',
    'themes[].balance',
    'items[].sentiment',
    'tw_items[].sentiment',
  ],
  reason:
    '實站的標題情緒標記經檢驗內部矛盾（與「全判中性」基準的一致率反而低於任何關鍵字規則），本站不複製無效指標，故省略所有情緒欄位；主題分類（可複製，對齊率約 90%）予以保留。',
} as const;

/** 頁面用「情緒留白」對使用者說明文案（白話，非技術術語）。 */
export const SENTIMENT_DISCLOSURE =
  '本站不提供標題正負面情緒分類。經檢驗，實站的標題情緒標記內部矛盾（與「全判中性」基準的一致率反而低於任何關鍵字規則），本站不複製無效指標。';

/** 方法說明（誠實版：不翻譯、不提供情緒）。 */
export const METHOD_TEXT =
  '主資料：美國媒體／白宮等公開 RSS 原文連結（英文原文，未經翻譯）；主題分類＝標題關鍵字規則，依「晶片管制→利率匯率→關稅貿易→地緣國防→其他政策」優先序判定。台媒僅作輔助參考。本站不提供標題正負面情緒分類。';

/** 頁尾誠實註記（對齊實站 note 逐字）。 */
export const NOTE_TEXT =
  '以美國原文報導為主的政策敘事整理，不代表股價方向；請點「讀美國原文」自行核對完整內容。';

// ---------------------------------------------------------------------------
// RSS（XML）解析
// ---------------------------------------------------------------------------

/** 常見 XML 具名實體對照表（涵蓋 RSS 標題常見者）。 */
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  middot: '·',
};

/**
 * 解碼 XML／HTML 實體：具名（`&amp;` `&#39;` `&apos;` …）與數值（`&#39;` `&#x27;`）。
 * 無法辨識者原樣保留（不猜測、不吞掉）。
 */
export function decodeXmlEntities(input: string): string {
  if (!input || input.indexOf('&') === -1) return input;
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, entity: string) => {
    if (entity.charAt(0) === '#') {
      const isHex = entity.charAt(1) === 'x' || entity.charAt(1) === 'X';
      const codeStr = isHex ? entity.slice(2) : entity.slice(1);
      const code = Number.parseInt(codeStr, isHex ? 16 : 10);
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return match;
      try {
        return String.fromCodePoint(code);
      } catch {
        return match;
      }
    }
    const named = NAMED_ENTITIES[entity.toLowerCase()];
    return named ?? match;
  });
}

/** 若內容被 CDATA 包裹則去殼（`<![CDATA[...]]>`），否則原樣回傳。 */
export function unwrapCdata(raw: string): string {
  const trimmed = raw.trim();
  const match = trimmed.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  return match ? match[1] : raw;
}

/**
 * 從單一 `<item>` 區塊抽出某標籤文字（處理屬性、CDATA、HTML 實體）。
 * 找不到回空字串。
 */
export function extractTag(block: string, tag: string): string {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i');
  const match = block.match(re);
  if (!match) return '';
  return decodeXmlEntities(unwrapCdata(match[1])).trim();
}

/** RSS 單一項目（原始欄位；source 為 `<source>` 文字，缺則空字串）。 */
export type RssItem = {
  /** 標題原文（Google News 形如 `Headline - Publisher`）。 */
  title: string;
  link: string;
  pubDate: string;
  /** `<source>` 標籤文字（Publisher）；白宮 feed 無此標籤 → 空字串。 */
  source: string;
};

/**
 * 極簡 RSS 解析器：以非貪婪正則抽出所有 `<item>…</item>` 區塊後逐項取欄位。
 * 不引入外部 XML 函式庫（Workers 冷啟動 CPU 成本考量）。
 * 非 `<item>` 結構（如 Atom `<entry>`）不支援——本專案上游皆為 RSS 2.0。
 */
export function parseRssItems(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const re = /<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml)) !== null) {
    const block = match[1];
    items.push({
      title: extractTag(block, 'title'),
      link: extractTag(block, 'link'),
      pubDate: extractTag(block, 'pubDate'),
      source: extractTag(block, 'source'),
    });
  }
  return items;
}

/**
 * 去掉 Google News 標題尾綴 ` - Publisher`（僅在確知 publisher 且完全吻合時才去）。
 * 例：`Foo bar - CNBC` + publisher `CNBC` → `Foo bar`。
 * publisher 為空或尾綴不符 → 原樣回傳（不亂切，避免誤傷含 ` - ` 的標題本體）。
 */
export function stripPublisherSuffix(title: string, publisher: string): string {
  const t = title.trim();
  const p = publisher.trim();
  if (p.length === 0) return t;
  const suffix = ` - ${p}`;
  if (t.endsWith(suffix)) return t.slice(0, t.length - suffix.length).trim();
  return t;
}

/** 把 RFC 822 pubDate 轉 `YYYY-MM-DD`（UTC）；無法解析回空字串（不猜測）。 */
export function toDateOnly(pubDate: string): string {
  const raw = pubDate.trim();
  if (raw.length === 0) return '';
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return '';
  return new Date(ms).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// 主題分類
// ---------------------------------------------------------------------------

/** 單一關鍵字比對（中文→子字串；英文→詞邊界＋可選複數）。 */
function matchesKeyword(title: string, keyword: string): boolean {
  if (keyword.length === 0) return false;
  // 含中日韓字元 → 子字串包含（中文無詞邊界概念）
  if (/[\u3400-\u9fff]/.test(keyword)) return title.includes(keyword);
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const plural = keyword.endsWith('s') ? '' : 's?';
  return new RegExp(`\\b${escaped}${plural}\\b`, 'i').test(title);
}

/**
 * 依 THEME_RULES 優先序對標題分類；全部未命中 → 其他政策。
 * 分類對象為英文標題（Google News 的 title 本體），與研究員量測口徑一致。
 */
export function classifyTheme(title: string): ThemeName {
  for (const rule of THEME_RULES) {
    for (const keyword of rule.keywords) {
      if (matchesKeyword(title, keyword)) return rule.theme;
    }
  }
  return '其他政策';
}

// ---------------------------------------------------------------------------
// 組裝輸出（對齊實站 schema；情緒欄位留白）
// ---------------------------------------------------------------------------

/** 單則報導（對齊實站 items[]；**無 sentiment**）。 */
export type RadarItem = {
  date: string;
  /** 台股代號（本站未做個股識別 → 恆為空字串）。 */
  stock_id: string;
  /** 顯示用標題（英文原文，已去 ` - Publisher` 尾綴；未經翻譯）。 */
  title: string;
  /** RSS 原始標題（英文原文，含 ` - Publisher` 尾綴；供核對）。 */
  title_en: string;
  link: string;
  source: string;
  theme: ThemeName;
  origin: 'us' | 'tw';
};

/** 台媒轉述單則（對齊實站 tw_items[]；本站未做個股識別，身分欄位誠實留白）。 */
export type TwRadarItem = RadarItem & {
  stock_name: string;
  label: string;
  /** 個股識別狀態：本站未對照 → 'na'（實站為 'ok'）。 */
  identity_status: string;
};

/** 主題聲量摘要（對齊實站 themes[]；**無 sentiment／balance**）。 */
export type ThemeSummary = {
  theme: ThemeName;
  count: number;
  sectors: string[];
};

/** 報導熱度單點（對齊實站 trend[]）。 */
export type TrendPoint = { date: string; n: number };

/** 來源追蹤（自產標記；upstream 列出實際抓取的上游端點）。 */
export type RadarProvenance = { source: 'self-produced'; upstream: string[] };

/** /api/skynet/trump-radar 回應形狀（對齊實站，扣除情緒欄位）。 */
export type TrumpRadarPayload = {
  ok: true;
  days: number;
  total: number;
  themes: ThemeSummary[];
  trend: TrendPoint[];
  items: RadarItem[];
  tw_items: TwRadarItem[];
  hot_stocks: never[];
  method: string;
  note: string;
  omitted_fields: { fields: string[]; reason: string };
};

/** 對外回應形狀＝payload ＋ 來源追蹤與產出時間（route 於回應前補上）。 */
export type TrumpRadarResponse = TrumpRadarPayload & {
  provenance: RadarProvenance;
  fetchedAt: string;
};

/** 上游全掛且無快取時的誠實失敗回應（200 + ok:false，不 5xx）。 */
export type TrumpRadarFailure = { ok: false; error: string; days: number };

/**
 * 由原始 RSS 項目組出標準化報導列。
 * @param raw 解析後的 RSS 項目
 * @param origin 來源標記（'us' 美國原文 / 'tw' 台媒）
 * @param sourceOverride 覆寫 source（白宮 feed 無 `<source>` → 固定 'The White House'）
 */
export function buildRadarItems(
  raw: RssItem[],
  origin: 'us' | 'tw',
  sourceOverride?: string,
): RadarItem[] {
  const out: RadarItem[] = [];
  for (const item of raw) {
    const link = item.link.trim();
    const rawTitle = item.title.trim();
    if (link.length === 0 || rawTitle.length === 0) continue; // 缺關鍵欄位 → 略過（不造假）
    const sourceTag = item.source.trim();
    const publisher = (sourceOverride ?? sourceTag).trim();
    const cleanTitle = stripPublisherSuffix(rawTitle, sourceTag);
    out.push({
      date: toDateOnly(item.pubDate),
      stock_id: '',
      title: cleanTitle,
      title_en: rawTitle,
      link,
      source: publisher,
      theme: classifyTheme(cleanTitle),
      origin,
    });
  }
  return out;
}

/** 依主題彙總聲量（只列出現過的 >=1 則主題；count 由資料算出）。 */
export function buildThemeSummaries(items: Array<{ theme: ThemeName }>): ThemeSummary[] {
  const counts = new Map<ThemeName, number>();
  for (const item of items) {
    counts.set(item.theme, (counts.get(item.theme) ?? 0) + 1);
  }
  const summaries: ThemeSummary[] = [];
  for (const theme of THEME_ORDER) {
    const count = counts.get(theme) ?? 0;
    if (count > 0) summaries.push({ theme, count, sectors: [...THEME_SECTORS[theme]] });
  }
  // count desc；同分依 THEME_ORDER 穩定排序
  summaries.sort(
    (a, b) => b.count - a.count || THEME_ORDER.indexOf(a.theme) - THEME_ORDER.indexOf(b.theme),
  );
  return summaries;
}

/** 依日期彙總報導則數（升冪；無效日期略過）。 */
export function buildTrend(items: Array<{ date: string }>): TrendPoint[] {
  const map = new Map<string, number>();
  for (const item of items) {
    if (item.date.length === 0) continue;
    map.set(item.date, (map.get(item.date) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([date, n]) => ({ date, n }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** 美國原文報導上限（頁面效能與 payload 大小考量）。 */
export const MAX_US_ITEMS = 60;
/** 台媒轉述上限（輔助性質，只取最近若干則）。 */
export const MAX_TW_ITEMS = 20;

/** 日期是否落在最近 `days` 天窗口內（含今天；容忍時區差 +1 天）。 */
function withinWindow(date: string, days: number, nowMs: number): boolean {
  if (date.length === 0) return false;
  const ms = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(ms)) return false;
  const cutoff = nowMs - days * 24 * 60 * 60 * 1000;
  const upper = nowMs + 24 * 60 * 60 * 1000;
  return ms >= cutoff && ms <= upper;
}

/**
 * 由三份上游 XML（英文 Google News／繁中 Google News／白宮官方）組出最終 payload。
 * 純函式（不觸網）→ 可離線單元測試。
 *
 * @param params.enXml 英文 Google News RSS 原文
 * @param params.twXml 繁中 Google News RSS 原文
 * @param params.whXml 白宮官方 RSS 原文
 * @param params.days 觀察窗天數
 * @param params.nowMs 現在時間（毫秒；預設 Date.now()，測試可注入）
 */
export function buildTrumpRadarPayload(params: {
  enXml: string;
  twXml: string;
  whXml: string;
  days: number;
  nowMs?: number;
}): TrumpRadarPayload {
  const { enXml, twXml, whXml, days } = params;
  const nowMs = params.nowMs ?? Date.now();

  const enItems = buildRadarItems(parseRssItems(enXml), 'us');
  const whItems = buildRadarItems(parseRssItems(whXml), 'us', 'The White House');
  const twItems = buildRadarItems(parseRssItems(twXml), 'tw');

  // 只保留窗口內、且有有效日期的美國原文（不造假、不補日期）。
  const usItems = [...enItems, ...whItems]
    .filter((item) => withinWindow(item.date, days, nowMs))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, MAX_US_ITEMS);

  const twList: TwRadarItem[] = twItems
    .filter((item) => withinWindow(item.date, days, nowMs))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, MAX_TW_ITEMS)
    .map((item) => ({
      ...item,
      stock_name: '',
      label: '',
      identity_status: 'na',
    }));

  return {
    ok: true,
    days,
    total: usItems.length,
    themes: buildThemeSummaries(usItems),
    trend: buildTrend(usItems),
    items: usItems,
    tw_items: twList,
    hot_stocks: [],
    method: METHOD_TEXT,
    note: NOTE_TEXT,
    omitted_fields: { fields: [...OMITTED_FIELDS.fields], reason: OMITTED_FIELDS.reason },
  };
}
