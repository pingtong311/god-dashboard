/**
 * FuturesOptionsPanel ——「大盤期權」區塊（SPEC 會員四頁 §0-2）。
 *
 * 實站 today.html / tab-market.html 共用區塊，結構逐字照抄：
 *
 *   <section class="overflow-x-clip" aria-label="大盤期權">
 *     <div class="mb-2 flex flex-wrap items-end justify-between gap-2">
 *       <div>
 *         <h2 class="text-[14px] font-black text-ink">大盤期權</h2>
 *         <p class="text-[12px] text-muted">盤後結算資料（非盤中即時）　2026-09-24</p>
 *       </div>
 *       <a href="/futures-opt/" class="text-[12px] font-black text-accent">期選盤後</a>
 *     </div>
 *     <div class="data-panel hud-panel glass rounded-2xl p-5  ">   <!-- 結尾兩個空格 -->
 *
 * ⚠ VIX／PCR／買賣明細目前**無對接資料來源**，先以實站快照值呈現
 *   （VIX 21.81／PCR 1.42／CD all 買5 176 賣5 0／CD 202610／CF 202610），
 *   待 TAIFEX 期選盤後資料接入後改為動態注入；日期取最新交易日。
 */
import { loadMarketOverview } from '@/lib/marketOverview';

/** 區塊資料（VIX／PCR／明細列）。 */
export type FuturesOptionsData = {
  /** 資料日期 'YYYY-MM-DD'。 */
  date: string;
  vix: string;
  pcr: string;
  /** 買賣明細列（左標／右值）。 */
  rows: readonly { label: string; value: string }[];
};

/** 實站快照值（today.html 逐字）。 */
const SNAPSHOT: Omit<FuturesOptionsData, 'date'> = {
  vix: '21.81',
  pcr: '1.42',
  rows: [
    { label: 'CD all', value: '買5 176／賣5 0' },
    { label: 'CD 202610', value: '買5 0／賣5 3' },
    { label: 'CF 202610', value: '買5 125／賣5 0' },
  ],
};

/** 載入大盤期權資料：日期取最新交易日，其餘用快照。 */
export async function loadFuturesOptions(): Promise<FuturesOptionsData> {
  try {
    const overview = await loadMarketOverview();
    return { date: overview.date, ...SNAPSHOT };
  } catch {
    return { date: '2026-09-24', ...SNAPSHOT };
  }
}

/** 同步呈現元件（測試直接用）；資料由 loadFuturesOptions 載入後傳入。 */
export function FuturesOptionsPanelView({ data }: { data: FuturesOptionsData }) {
  const { date, vix, pcr, rows } = data;

  return (
    <section className="overflow-x-clip" aria-label="大盤期權">
      <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-[14px] font-black text-ink">大盤期權</h2>
          <p className="text-[12px] text-muted">盤後結算資料（非盤中即時）　{date}</p>
        </div>
        <a href="/futures-opt/" className="text-[12px] font-black text-accent">
          期選盤後
        </a>
      </div>
      <div className="data-panel hud-panel glass rounded-2xl p-5  ">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-xl border border-line bg-surface-2 px-3 py-2">
            <p className="text-[11px] font-bold text-muted">VIX</p>
            <p className="num mt-0.5 text-[14px] font-black text-ink">{vix}</p>
          </div>
          <div className="rounded-xl border border-line bg-surface-2 px-3 py-2">
            <p className="text-[11px] font-bold text-muted">PCR</p>
            <p className="num mt-0.5 text-[14px] font-black text-ink">{pcr}</p>
          </div>
          <div className="rounded-xl border border-line bg-surface-2 px-3 py-2">
            <p className="text-[11px] font-bold text-muted">價平附近</p>
            <p className="mt-0.5 text-[12px] font-bold text-muted">快照無履約價</p>
          </div>
          <div className="rounded-xl border border-line bg-surface-2 px-3 py-2">
            <p className="text-[11px] font-bold text-muted">資料</p>
            <p className="mt-0.5 text-[12px] font-bold text-muted">盤後</p>
          </div>
        </div>
        <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
          這天買賣賣權（Put）的張數明顯比買權（Call）多。
        </p>
        <ul className="mt-2 space-y-1">
          {rows.map((row) => (
            <li key={row.label} className="flex justify-between gap-2 text-[12.5px]">
              <span className="truncate font-bold text-ink">{row.label}</span>
              <span className="num shrink-0 text-muted">{row.value}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] leading-relaxed text-muted">
          盤後結算資料（非盤中即時）。價平＝履約價最接近台指期參考價；PCR＝賣權成交張數÷買權成交張數。以上不是指數漲跌預測。
        </p>
      </div>
    </section>
  );
}

export default async function FuturesOptionsPanel({
  data,
}: {
  data?: FuturesOptionsData;
}) {
  return <FuturesOptionsPanelView data={data ?? (await loadFuturesOptions())} />;
}
