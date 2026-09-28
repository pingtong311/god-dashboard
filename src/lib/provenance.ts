/**
 * 資料來源標記機制（跨頁共用）
 * ============================================================================
 * 業主核心要求：「能自己產生的就用自己產生，不能產生的才用實站數據，而且必須讓
 * 使用者一眼看出資料從哪來。」
 *
 * 本模組提供四種來源分類、逐欄來源標記與覆蓋率（Coverage）型別，供各頁面的資料
 * 面板與 API route 共用。純型別 + 純函式，不含任何 I/O，方便單元測試。
 *
 * 四種來源分類
 * ------------
 *   self-produced    我們自己從官方資料（TWSE / TPEX / TAIFEX / FinMind 免費層…）
 *                    抓取並計算出來的。可稽核、可重算。
 *   site-mirror      實站有、我們沒有 → 借用實站快照。**必須標基準日（snapshot_date）
 *                    與抓取時間（captured_at）**，並在 UI 明示「非即時」。
 *   site-unreliable  ★實站有，但經檢驗不可信 → 我們「刻意不借」。
 *   absent           兩邊都沒有 → 未入庫。前端一律顯示「—」或「資料未入庫」，
 *                    絕不以 0 代替、絕不捏造、絕不使用 Math.random。
 *
 * 為什麼需要 site-unreliable
 * --------------------------
 * 業主的策略是「能自產就用自產、不能就先用實站數據」。但「用實站數據」不該無條件
 * 成立——如果實站那一欄本身是雜訊，借進來就是把雜訊引進我們系統。我們需要一個
 * **可稽核的紀錄**：哪些欄位我們「刻意不借」，以及不借的理由與證據（omitted_reason）。
 *
 * 已確認的 site-unreliable 實例（證據）
 * -------------------------------------
 * 1. `/trump` 的 `sentiment` 欄位：實站的正負面標記**內部矛盾**——基準線「全部判中性」
 *    與實站標記的一致率達 **85.0%**，而最好的關鍵字規則只有 **62.5%**；換言之，
 *    「什麼都不判」竟然比「認真判」還準，代表這一欄幾乎沒有超越雜訊的資訊量。具體：
 *      - `中國習近平本週將赴白宮會晤川普`（零情緒詞）被標 `-1`；
 *      - `民调：多数美国人与加拿大人认为川普的关税政策是错误的`（明顯負面框架）被標 `+1`；
 *      - 兩則幾乎相同的「釋放遭扣押美國人」新聞，一則 `+1`、一則 `0`。
 * 2. `/backtest` 的分點跟單勝率：實站自己的資料顯示 `win_rate: 0.448`（比丟硬幣差）、
 *    `avg_ret_pct: 0.14` 而 `cost_pct: 0.389`（**平均報酬低於交易成本**）。實站自己也
 *    知道這個數字沒有說服力，所以在頁面加了護欄「少於 20 筆的統計基本上沒有意義」。
 *    註：/backtest 頁面仍逐字複刻並顯示這些數字（屬 site-mirror，見該頁檔頭），此處
 *    僅記錄「實站聚合指標本身即可能不可信」這個事實，作為 site-unreliable 分類的依據。
 *
 * 紅漲綠跌：本模組不涉顏色，僅做來源分類。
 */

/**
 * 資料來源分類。
 * - `self-produced`：本站自產（可重算、可稽核）。
 * - `site-mirror`：借用實站快照（必須標基準日，非即時）。
 * - `site-unreliable`：實站有但不可信，本站刻意不借（必須填 omitted_reason）。
 * - `absent`：兩邊都沒有（未入庫）。
 */
export type ProvenanceSource =
  | 'self-produced'
  | 'site-mirror'
  | 'site-unreliable'
  | 'absent';

/** 來源追蹤欄位（統一格式，跨頁共用）。 */
export type Provenance = {
  /** 來源分類。 */
  source: ProvenanceSource;
  /**
   * 來源位址：
   *   - self-produced：實際上遊 URL（如證交所端點）；
   *   - site-mirror：實站 API URL；
   *   - absent / site-unreliable：空字串 ''。
   */
  upstream: string;
  /** 多來源時，列出全部上游 URL（如 TWSE + TPEX）。 */
  upstreams?: string[];
  /** site-mirror 專用：資料基準日 'YYYY-MM-DD'。 */
  snapshot_date?: string;
  /** site-mirror 專用：快照抓取的 ISO 時間。 */
  captured_at?: string;
  /** site-unreliable 專用：不借的理由與證據。 */
  omitted_reason?: string;
};

/** 覆蓋率統計（供 API route / 維運稽核）。 */
export type Coverage = {
  /** self-produced 欄位數。 */
  self_produced: number;
  /** site-mirror 欄位數。 */
  site_mirror: number;
  /** site-unreliable 欄位數（刻意不借）。 */
  site_unreliable: number;
  /** absent 欄位數（未入庫）。 */
  absent: number;
  /**
   * 自產率 = self_produced / (self_produced + site_mirror + absent)。
   *
   * ★site_unreliable「刻意不借」不列入分子也不列入分母——「刻意不借」和「借了」是
   *   不同性質，混在一起會讓自產率失真（借了會被稀釋、不借卻被當成缺口）。但
   *   site_unreliable 必須單獨列出（見上方 site_unreliable 欄位），不可省略。
   *
   * 分母為 0 時回 0（不回 NaN，避免前端顯示 NaN）。
   */
  self_produced_ratio: number;
};

/** 逐欄混合時使用（key = 欄位名，value = 該欄位來源）。 */
export type FieldSources = Record<string, ProvenanceSource>;

/** 四種來源分類的中文短標籤（供 UI 使用）。 */
export const SOURCE_LABELS: Record<ProvenanceSource, string> = {
  'self-produced': '本站自產',
  'site-mirror': '實站快照',
  'site-unreliable': '本站不提供',
  absent: '資料未入庫',
};

/**
 * 計算自產率。
 *
 * 只計入 self-produced / site-mirror / absent；**刻意排除 site-unreliable**
 * （「刻意不借」與「借了／沒有」性質不同，見 Coverage.self_produced_ratio 說明）。
 * 分母為 0 時回 0。
 *
 * @param selfProduced self-produced 欄位數
 * @param siteMirror site-mirror 欄位數
 * @param absent absent 欄位數
 * @returns 介於 0~1 的比例；分母為 0 時回 0
 */
export function computeSelfProducedRatio(
  selfProduced: number,
  siteMirror: number,
  absent: number,
): number {
  const denom = selfProduced + siteMirror + absent;
  if (denom <= 0) return 0;
  return selfProduced / denom;
}

/**
 * 由來源清單統計各分類欄位數並算出 self_produced_ratio。
 *
 * @param sources 逐欄來源清單
 * @returns Coverage（含 self_produced_ratio）
 */
export function computeCoverage(sources: readonly ProvenanceSource[]): Coverage {
  let selfProduced = 0;
  let siteMirror = 0;
  let siteUnreliable = 0;
  let absent = 0;

  for (const source of sources) {
    switch (source) {
      case 'self-produced':
        selfProduced += 1;
        break;
      case 'site-mirror':
        siteMirror += 1;
        break;
      case 'site-unreliable':
        siteUnreliable += 1;
        break;
      case 'absent':
        absent += 1;
        break;
    }
  }

  return {
    self_produced: selfProduced,
    site_mirror: siteMirror,
    site_unreliable: siteUnreliable,
    absent: absent,
    self_produced_ratio: computeSelfProducedRatio(selfProduced, siteMirror, absent),
  };
}

/**
 * 由逐欄來源物件（FieldSources）計算 Coverage。
 *
 * @param fields key = 欄位名、value = 該欄位來源
 */
export function computeCoverageFromFields(fields: FieldSources): Coverage {
  return computeCoverage(Object.values(fields));
}

/**
 * 該來源分類是否代表「目前有資料可顯示」。
 * - self-produced / site-mirror → true（有資料）。
 * - site-unreliable / absent → false（刻意不提供 / 未入庫）。
 */
export function hasData(source: ProvenanceSource): boolean {
  return source === 'self-produced' || source === 'site-mirror';
}

/** 已知上游 URL 關鍵字 → 可讀名稱對照表（依序比對，命中即回）。 */
const UPSTREAM_NAMES: readonly { match: RegExp; name: string }[] = [
  { match: /twse\.com\.tw/i, name: '臺灣證券交易所' },
  { match: /tpex\.org\.tw/i, name: '證券櫃檯買賣中心' },
  { match: /taifex\.com\.tw/i, name: '臺灣期貨交易所' },
  { match: /finmind/i, name: 'FinMind' },
  { match: /blackstockai\.com/i, name: '實站（blackstockai.com）' },
];

/**
 * 把上游 URL 轉成一般使用者看得懂的名稱（供 SourceBadge 顯示）。
 *
 * 未命中對照表時，嘗試取其 hostname；仍失敗則原樣回傳。
 * 空字串回「未標示來源」。
 *
 * @param upstream 上游 URL（或任何來源字串）
 * @returns 可讀名稱
 */
export function readableUpstreamName(upstream: string): string {
  const raw = (upstream ?? '').trim();
  if (!raw) return '未標示來源';
  for (const { match, name } of UPSTREAM_NAMES) {
    if (match.test(raw)) return name;
  }
  try {
    return new URL(raw).hostname;
  } catch {
    return raw;
  }
}
