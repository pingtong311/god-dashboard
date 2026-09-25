/**
 * 「全部工具」（/hub/）頁的工具目錄 —— 全站導覽的**權威資料來源**。
 *
 * 來源：實站 `https://blackstockai.com/hub/`（ captured/login-capture/html/hub.html）
 * 逐字抓取 `<main>` 內 6 個 `<section>`、共 44 張工具卡。
 *
 * ⚠ 這份清單是「博主自己寫的白話標題與副標」，**不是**我們自己的命名。
 *   標題、副標、href、順序、分組都必須與實站一致——頂部下拉選單
 *   （Navigation.tsx 的 MEMBER_MENUS）與本頁共用同一份來源，避免漂移。
 *
 * ⚠ 副標「查一個券商分點過去的出手紀錄（不等于單一主力）」實站原文即用
 *   簡體「于」（非「於」），照抄不修改。
 *
 * 每張卡片的 DOM 結構（hub.html 逐字）：
 *   <div class="relative">
 *     <a draggable="false" href="/today/"
 *        class="flex min-h-[5.4rem] select-none flex-col rounded-2xl border
 *               border-line bg-surface px-3 py-2.5 pr-9 transition active:scale-[0.98]">
 *       <span class="text-[13px] font-black leading-snug text-ink">今日戰情</span>
 *       <span class="mt-1 line-clamp-2 text-[12px] leading-snug text-muted">…</span>
 *     </a>
 *     <button type="button" aria-label="加入捷徑" aria-pressed="false" …>★</button>
 *   </div>
 */

/** 單一工具卡（標題＋白話副標＋站內路由，皆含尾斜線）。 */
export type HubTool = {
  readonly title: string;
  readonly desc: string;
  readonly href: string;
};

/** 工具分組（6 組：今天 / 股票 / 選股 / 我的 / 教學 / 更多）。 */
export type HubSection = {
  readonly heading: string;
  readonly tools: readonly HubTool[];
};

/**
 * 六個分組與其工具卡。順序、分組、文案、href 全部照抄實站 /hub/。
 */
export const HUB_SECTIONS: readonly HubSection[] = [
  {
    heading: '今天',
    tools: [
      { title: '今日戰情', desc: '今天大盤發生什麼事，一頁看完', href: '/today/' },
      { title: '盤中戰情', desc: '開盤時間看自選現價與急拉急跌事件', href: '/live/' },
      { title: '台股日報', desc: '每晚幫你整理今天的盤，睡前看這篇就夠', href: '/reports/' },
      { title: '族群熱圖', desc: '錢今天流去哪個族群', href: '/sector/' },
      { title: '事件雷達', desc: '急漲急跌、漲跌停、處置股一次看', href: '/radar/' },
      { title: '大盤與國際', desc: '台指期、外資動向與美股表現', href: '/market/' },
      { title: '市場行事曆', desc: '月營收、ETF 與企業大事的日曆', href: '/market-center/' },
      { title: '美國政策題材', desc: '關稅與政策原文整理，來源與時間分開看', href: '/trump/' },
      { title: '期選盤後', desc: 'VIX、夜盤法人與大額未平倉', href: '/futures-opt/' },
    ],
  },
  {
    heading: '股票',
    tools: [
      { title: '個股盯盤', desc: '查一檔股票：K線、逐筆、大單、籌碼、持有情境', href: '/stock/' },
      { title: '技術分析', desc: '輸入代號：支撐壓力、回檔價位、均線與白話解讀', href: '/signal/' },
      { title: '分點排行', desc: '今天哪些券商分點在大買大賣', href: '/ranking/' },
      { title: '分點名冊', desc: '查一個券商分點過去的出手紀錄（不等于單一主力）', href: '/brokers/' },
      { title: '分點驗證', desc: '看這個分點過去買了之後隔天怎麼樣', href: '/backtest/' },
      { title: '研究中心', desc: '條件掃描、歷史驗證、多檔比較都在這', href: '/research/' },
    ],
  },
  {
    heading: '選股',
    tools: [
      { title: '量價觀察', desc: '盤後成交量、集中度與量比條件命中列表，不是推薦', href: '/picks/' },
      { title: '隔日沖分點股', desc: '被隔日沖分點大買的股票（隔天常有賣壓）', href: '/fade/' },
      { title: 'K線型態掃描', desc: '全市場掃 W 底、假突破等常見型態', href: '/patterns/' },
      { title: '波段條件', desc: '符合歷史條件的列表，不是保證會漲的名單', href: '/swing/' },
      { title: '自訂條件選股', desc: '自己組條件挑股票，可以存起來每天看', href: '/tools/' },
      { title: '估值河流', desc: '這檔現在算貴還是便宜', href: '/valuation/' },
      { title: '資券借券', desc: '融資融券、借券與官股行庫動向', href: '/leverage/' },
      { title: '除權息', desc: '除權息日程與歷史填息', href: '/dividend/' },
      { title: '處置股名單', desc: '被處置、分盤、停券與暫停先賣後買', href: '/risk/' },
      { title: '融資維持率', desc: '盤後個股與大盤維持率', href: '/margin-maint/' },
      { title: '主動式ETF', desc: '主動式 ETF 持股與異動', href: '/etf-active/' },
      { title: '鉅額交易', desc: '盤後鉅額成交金額', href: '/block-trades/' },
      { title: '可轉債', desc: '可轉債溢價排行', href: '/cb/' },
    ],
  },
  {
    heading: '我的',
    tools: [
      { title: '自選股', desc: '你追蹤的股票都在這', href: '/watchlist/' },
      { title: '到價提醒', desc: '到價、爆量、法人轉向就通知你', href: '/alerts/' },
      { title: '我的持股', desc: '記下成本，看配置與大致損益', href: '/portfolio/' },
      { title: '戰情室警報', desc: '管理推播：想收什麼、不想收什麼', href: '/notify/' },
      { title: '大佬席位', desc: '帳戶、回饋、邀請碼與專屬設定', href: '/member/' },
      { title: 'App 安裝', desc: 'iPhone、Android 與加入主畫面', href: '/app/' },
      { title: '品牌合作', desc: '合作品牌的服務與活動，清楚標示廣告', href: '/partners/' },
      { title: '社群聊天', desc: '會員討論、即時聊天與戰績榜', href: '/community/' },
    ],
  },
  {
    heading: '教學',
    tools: [
      { title: '問大佬AI', desc: '丟代號或問題，AI 用數據講白話並附資料依據', href: '/ask/' },
      { title: '練功房', desc: '用歷史某天某檔練習進出，不是今日明牌', href: '/dojo/' },
      { title: '猜下一根', desc: '用歷史K線練盤感；結果用來理解機率，不是預測明天', href: '/guess/' },
      { title: '文章', desc: '每天更新的盤後解讀與教學長文，不是學堂名詞卡', href: '/learn/' },
      { title: '台股學堂', desc: '專有名詞白話解釋', href: '/school/' },
      { title: '新手導覽', desc: '第一次用，從這裡開始', href: '/guide/' },
      { title: '使用手冊', desc: '每個功能怎麼用的完整說明', href: '/manual/' },
    ],
  },
  {
    heading: '更多',
    tools: [{ title: '法遵與風險', desc: '免責聲明、隱私與條款', href: '/legal/' }],
  },
];

/** 全部工具卡（扁平，44 項），供測試與導覽對齊檢查使用。 */
export const HUB_TOOLS: readonly HubTool[] = HUB_SECTIONS.flatMap((section) => section.tools);

/** 捷徑上限（實站「我的捷徑（0/8）」）。 */
export const HUB_SHORTCUT_LIMIT = 8;
