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
 *                    典型情境＝「能力問題」：東西可信，但**本站算不出來**（例：分點淨買
 *                    是付費資料，/backtest 只能借實站快照）→ 借 + 標「本站無法重算」。
 *   site-unreliable  ★實站有該欄位，但「欄位內容本身」經檢驗不可信 → 我們刻意不借，
 *                    該欄位在我們的輸出中「不存在」（附 omitted_reason 說明不借理由與證據）。
 *   absent           兩邊都沒有 → 未入庫。前端一律顯示「—」或「資料未入庫」，
 *                    絕不以 0 代替、絕不捏造、絕不使用 Math.random。
 *
 * ★三者的界線（最易混淆處，務必分清）
 * -----------------------------------
 *   情境                 實站欄位內容可信嗎？  本站有沒有？      正確分類
 *   -------------------- --------------------- ---------------- ----------------------------------
 *   可信度問題（雜訊）   ✗ 不可信              —                site-unreliable（刻意不借、不輸出）
 *   能力問題（算不出）   ✓ 可信                沒有（借實站）   site-mirror（借 + 標「本站無法重算」）
 *   兩邊都沒有           —                     沒有             absent
 *
 *   ★「我們算不出來」≠ site-unreliable，而是 site-mirror + 「本站無法重算」標示。
 *   ★「兩邊都沒有」≠ site-unreliable，而是 absent。
 *
 * 為什麼需要 site-unreliable
 * --------------------------
 * 業主的策略是「能自產就用自產、不能就先用實站數據」。但「用實站數據」不該無條件
 * 成立——如果實站那一欄本身是雜訊，借進來就是把雜訊引進我們系統。我們需要一個
 * **可稽核的紀錄**：哪些欄位我們「刻意不借」，以及不借的理由與證據（omitted_reason）。
 *
 * 已確認的 site-unreliable 實例（證據）
 * -------------------------------------
 * `/trump` 的 `sentiment` 欄位：實站的正負面標記**內部矛盾**——基準線「全部判中性」
 * 與實站標記的一致率達 **85.0%**，而最好的關鍵字規則只有 **62.5%**；換言之，
 * 「什麼都不判」竟然比「認真判」還準，代表這一欄幾乎沒有超越雜訊的資訊量。具體：
 *   - `中國習近平本週將赴白宮會晤川普`（零情緒詞）被標 `-1`；
 *   - `民调：多数美国人与加拿大人认为川普的关税政策是错误的`（明顯負面框架）被標 `+1`；
 *   - 兩則幾乎相同的「釋放遭扣押美國人」新聞，一則 `+1`、一則 `0`。
 * 故 /trump **不輸出** `sentiment` / `n_pos` / `score` / `tone` 等欄位，並附 omitted_fields。
 *
 * 對照：**不是** site-unreliable 的例子（避免誤用）
 * -----------------------------------------------
 * `/backtest` 的分點跟單勝率 `win_rate: 0.448`（29 筆 13 勝 16 敗，是**客觀可信**的事實；
 * 另 `avg_ret_pct: 0.14` 而 `cost_pct: 0.389`）。這個數字**可信**，只是本站**算不出來**
 * （分點淨買是 FinMind Sponsor-only 付費資料，見 src/app/api/skynet/channel/route.ts）
 * → 屬「能力問題」，正確分類是 **site-mirror**（借用 + 標「本站無法重算」），
 * **不是** site-unreliable。詳見 src/app/backtest/mirror/backtest-2330-2026-09-24.ts 檔頭。
 *
 * 紅漲綠跌：本模組不涉顏色，僅做來源分類。
 */

/**
 * 資料來源分類。
 * - `self-produced`：本站自產（可重算、可稽核）。
 * - `site-mirror`：借用實站快照（必須標基準日，非即時）；典型＝本站算不出來（能力問題），
 *   並以 note 標「本站無法重算」。
 * - `site-unreliable`：實站「欄位內容本身」不可信，本站刻意不借、不輸出（必須填
 *   omitted_reason）。★不等於「算不出來」（那是 site-mirror）、不等於「兩邊都沒有」（那是 absent）。
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
  /** site-unreliable 專用：刻意不借的理由與證據（欄位內容為何不可信）。 */
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
  'site-unreliable': '本站刻意不提供',
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
