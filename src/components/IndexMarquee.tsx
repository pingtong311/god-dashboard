/**
 * IndexMarquee ——「指數行情」跑馬燈（SPEC 會員四頁 §0-1）。
 *
 * 實站 today.html / tab-market.html 的 <main> 內、頁首下方的橫向跑馬燈：
 *
 *   <nav aria-label="指數行情"
 *        class="silk-row silk-row-fade silk-marquee-host -mx-4 mb-3 min-w-0 px-4 lg:mx-0 lg:px-0">
 *     <div class="silk-marquee-track">
 *       <span class="inline-flex shrink-0 items-baseline gap-1.5 pr-5">
 *         <span class="text-[12px] font-bold text-muted">加權</span>
 *         <span class="num text-[12.5px] font-black tabular-nums text-down">48,024.6</span>
 *         <span class="num text-[12px] font-bold tabular-nums text-down">-0.27%</span>
 *       </span>
 *       …（5 檔，內容貼兩份做無縫循環）
 *     </div>
 *   </nav>
 *
 * 資料：加權／櫃買來自 loadMarketOverview（盤後收盤）；台指期／費半／那斯達克
 * 目前無對接來源，用實站快照常數（見 SNAPSHOT），待 TAIFEX／美股來源接入後替换。
 * 漲跌顏色由正負決定：text-up（紅漲）／text-down（綠跌）。
 *
 * 無縫循環：同一組 5 檔渲染兩次，貼在 silk-marquee-track 上。
 */
import { loadMarketOverview } from '@/lib/marketOverview';

/** 跑馬燈單檔（名稱／現值／漲跌%）。 */
export type MarqueeItem = {
  name: string;
  price: string;
  changePercent: number;
};

/**
 * 實站快照常數（today.html / tab-market.html 逐字）。
 * ⚠ 這些是「盤後快照」值；其中台指期／費半／那斯達克尚無資料來源，
 *   先以快照呈現，避免欄位空缺。
 */
const SNAPSHOT: readonly MarqueeItem[] = [
  { name: '加權', price: '48,024.6', changePercent: -0.27 },
  { name: '櫃買', price: '412.99', changePercent: -0.18 },
  { name: '台指期', price: '48,123', changePercent: -0.44 },
  { name: '費半', price: '12,305.82', changePercent: -1.82 },
  { name: '那斯達克', price: '26,725.8', changePercent: -0.78 },
];

/** 載入跑馬燈 5 檔：有即時／盤後來源者覆寫快照。 */
export async function loadMarqueeItems(): Promise<readonly MarqueeItem[]> {
  try {
    const overview = await loadMarketOverview();
    return SNAPSHOT.map((item) => {
      if (item.name === '加權' && overview.indexClose.symbol.includes('tse')) {
        return {
          name: '加權',
          price: overview.indexClose.price.toLocaleString('zh-Hant'),
          changePercent: overview.indexClose.changePercent,
        };
      }
      return item;
    });
  } catch {
    // 上游不可用時退回快照，不讓跑馬燈整段消失。
    return SNAPSHOT;
  }
}

/** 單檔的 className 依漲跌決定（紅漲綠跌）。 */
function tone(changePercent: number): string {
  return changePercent >= 0 ? 'text-up' : 'text-down';
}

/**
 * 同步呈現元件（測試直接用）；資料由 loadMarqueeItems 載入後傳入。
 * 內容貼兩份做無縫循環，第二份 aria-hidden 避免朗讀重複。
 */
export function IndexMarqueeView({ items }: { items: readonly MarqueeItem[] }) {
  return (
    <nav
      aria-label="指數行情"
      className="silk-row silk-row-fade silk-marquee-host -mx-4 mb-3 min-w-0 px-4 lg:mx-0 lg:px-0"
    >
      <div className="silk-marquee-track">
        {[0, 1].map((dup) => (
          <span key={dup} className="inline-flex" aria-hidden={dup === 1}>
            {items.map((item) => (
              <span
                key={`${dup}-${item.name}`}
                className="inline-flex shrink-0 items-baseline gap-1.5 pr-5"
              >
                <span className="text-[12px] font-bold text-muted">{item.name}</span>
                <span className={`num text-[12.5px] font-black tabular-nums ${tone(item.changePercent)}`}>
                  {item.price}
                </span>
                <span className={`num text-[12px] font-bold tabular-nums ${tone(item.changePercent)}`}>
                  {item.changePercent >= 0 ? '+' : ''}
                  {item.changePercent}%
                </span>
              </span>
            ))}
          </span>
        ))}
      </div>
    </nav>
  );
}

export default async function IndexMarquee({
  items,
}: {
  items?: readonly MarqueeItem[];
}) {
  return <IndexMarqueeView items={items ?? (await loadMarqueeItems())} />;
}
