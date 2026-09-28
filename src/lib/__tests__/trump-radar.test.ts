/**
 * trumpRadar 純函式單元測試
 * ----------------------------------------------------------------------------
 * 覆蓋：
 *   1. RSS（XML）解析邊界：CDATA、HTML 實體（`&amp;` `&#39;` `&#x27;`）、
 *      尾綴 ` - Publisher` 去除、`<source>` 抽取、pubDate → YYYY-MM-DD。
 *   2. 主題分類關鍵字規則：以**實站 capture 的 40 則標題**跑對照，量測一致率
 *      （研究員實測 90%；本實作需複現相近數字）。
 *   3. buildTrumpRadarPayload 組裝：total／themes／trend／items／tw_items，
 *      以及**情緒欄位留白**（無 sentiment／n_pos／score／tone，且有 omitted_fields）。
 */

import {
  buildRadarItems,
  buildThemeSummaries,
  buildTrend,
  buildTrumpRadarPayload,
  classifyTheme,
  decodeXmlEntities,
  parseRssItems,
  stripPublisherSuffix,
  toDateOnly,
  unwrapCdata,
  type ThemeName,
} from '../trumpRadar';

// ---------------------------------------------------------------------------
// 1. XML 解析邊界
// ---------------------------------------------------------------------------

describe('RSS（XML）解析', () => {
  it('decodeXmlEntities 解具名與數值實體，無法辨識者原樣保留', () => {
    expect(decodeXmlEntities('A &amp; B')).toBe('A & B');
    expect(decodeXmlEntities('&#39;q&#39;')).toBe("'q'");
    expect(decodeXmlEntities('&#x27;x&#x27;')).toBe("'x'");
    expect(decodeXmlEntities('&lt;tag&gt;')).toBe('<tag>');
    expect(decodeXmlEntities('&quot;hi&quot;')).toBe('"hi"');
    expect(decodeXmlEntities('&unknownentity;')).toBe('&unknownentity;');
    expect(decodeXmlEntities('no entities here')).toBe('no entities here');
  });

  it('unwrapCdata 去 CDATA 外殼，非 CDATA 原樣回傳', () => {
    expect(unwrapCdata('<![CDATA[hello &amp; world]]>')).toBe('hello &amp; world');
    expect(unwrapCdata('plain text')).toBe('plain text');
  });

  it('parseRssItems 抽出 title／link／pubDate／source，處理 CDATA 與實體', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <item>
    <title><![CDATA[Foo &amp; Bar &#39;quoted&#39;]]></title>
    <link>https://example.com/a</link>
    <pubDate>Wed, 23 Sep 2026 12:00:00 GMT</pubDate>
    <source url="https://example.com">Example News</source>
  </item>
  <item>
    <title>Plain headline - Publisher</title>
    <link>https://example.com/b</link>
    <pubDate>Thu, 24 Sep 2026 00:00:00 GMT</pubDate>
    <source url="https://publisher.com">Publisher</source>
  </item>
</channel></rss>`;

    const items = parseRssItems(xml);
    expect(items).toHaveLength(2);
    // CDATA 去殼後仍解實體（容錯：部分 feed 會把已編碼內容再包 CDATA）
    expect(items[0].title).toBe("Foo & Bar 'quoted'");
    expect(items[0].link).toBe('https://example.com/a');
    expect(items[0].source).toBe('Example News');
    expect(items[0].pubDate).toBe('Wed, 23 Sep 2026 12:00:00 GMT');
    expect(items[1].title).toBe('Plain headline - Publisher');
    expect(items[1].source).toBe('Publisher');
  });

  it('parseRssItems 對無 item 的內容回空陣列（不拋錯）', () => {
    expect(parseRssItems('<rss><channel></channel></rss>')).toEqual([]);
    expect(parseRssItems('')).toEqual([]);
  });

  it('stripPublisherSuffix 只去完全吻合的尾綴', () => {
    expect(stripPublisherSuffix('Foo - CNBC', 'CNBC')).toBe('Foo');
    expect(stripPublisherSuffix('A - B - Publisher', 'Publisher')).toBe('A - B');
    expect(stripPublisherSuffix('Foo', 'CNBC')).toBe('Foo');
    expect(stripPublisherSuffix('Foo - CNBC', '')).toBe('Foo - CNBC');
    // 尾綴不符（含 ` - ` 的標題本體）不可亂切
    expect(stripPublisherSuffix('Foo - CNBC', 'Reuters')).toBe('Foo - CNBC');
  });

  it('toDateOnly 轉 UTC 日期；無法解析回空字串', () => {
    expect(toDateOnly('Wed, 23 Sep 2026 12:00:00 GMT')).toBe('2026-09-23');
    expect(toDateOnly('Thu, 24 Sep 2026 00:00:00 GMT')).toBe('2026-09-24');
    expect(toDateOnly('not a date')).toBe('');
    expect(toDateOnly('')).toBe('');
  });

  it('buildRadarItems 去尾綴、分類主題、缺關鍵欄位者略過', () => {
    const raw = parseRssItems(`<rss><channel>
      <item>
        <title>China expands export controls on drug precursors - NBC News</title>
        <link>https://ex/1</link>
        <pubDate>Wed, 23 Sep 2026 12:00:00 GMT</pubDate>
        <source url="https://nbc.com">NBC News</source>
      </item>
      <item>
        <title>No link here</title>
        <link></link>
        <pubDate>Wed, 23 Sep 2026 12:00:00 GMT</pubDate>
        <source url="https://x.com">X</source>
      </item>
    </channel></rss>`);
    const items = buildRadarItems(raw, 'us');
    expect(items).toHaveLength(1); // 第二則缺 link → 略過
    expect(items[0].title).toBe('China expands export controls on drug precursors');
    expect(items[0].title_en).toBe('China expands export controls on drug precursors - NBC News');
    expect(items[0].source).toBe('NBC News');
    expect(items[0].theme).toBe('晶片管制');
    expect(items[0].origin).toBe('us');
    expect(items[0].stock_id).toBe('');
  });
});

// ---------------------------------------------------------------------------
// 2. 主題分類對照實站（40 則）
// ---------------------------------------------------------------------------

/**
 * 實站 capture（blackstockai.com/api/trump-radar?days=45）的 40 則英文標題
 * 與其實站主題標記，作為對照組（研究員量測：關鍵字規則一致率約 90%）。
 */
const CAPTURE_CASES: ReadonlyArray<readonly [string, ThemeName]> = [
  ['Trump faces Xi as strains with allies complicate U.S. pressure on China - CNBC', '地緣國防'],
  ["China's Xi will kick off his state visit to Washington with a rare planeside welcome from Trump - AP News", '地緣國防'],
  ["Trump-Xi meeting comes amid tensions on Iran, Taiwan and trade: What to know - ABC News - Breaking News, Latest News and Videos", '地緣國防'],
  ["Trump's on defense against a more powerful Xi Jinping - Politico", '地緣國防'],
  ["China's Xi set to arrive in Washington for high-stakes Trump summit as AI supremacy battle looms large - Fox News", '地緣國防'],
  ["China's Xi Jinping to meet with Trump at White House this week - NPR", '地緣國防'],
  ['Trump-Xi summit is set to be high in pageantry and low in substance - NBC News', '其他政策'],
  ['ICYMI: Budd Delivers Floor Speech Urging Trump Admin to Hold China Accountable for Targeting the Safety & Security of Americans - budd.senate.gov', '地緣國防'],
  ["As Xi meets Trump, who's winning their trade war? - aljazeera.com", '關稅貿易'],
  ["Trump hosts China's Xi for high-stakes summit ahead of US midterm elections - RFI", '地緣國防'],
  ["Majority of Americans, Canadians agree Trump's tariffs were wrong: Poll - The Hill", '關稅貿易'],
  ["The Latest: China's Xi to kick off visit to Washington with a rare planeside welcome from Trump - WRAL", '地緣國防'],
  ["From cybersecurity to AI to Taiwan, what's at stake in Trump's summit with Xi - NPR", '地緣國防'],
  ['Taiwan is watching closely as Xi and Trump meet and hopes US will keep up its arms sales - ABC News - Breaking News, Latest News and Videos', '地緣國防'],
  ['Dems urge Trump to seek AI deal with China - Politico', '地緣國防'],
  ["Your Morning: Trump to give China's Xi rare planeside welcome for state visit - NewsNation", '地緣國防'],
  ['EXCLUSIVE: Wife of US seismologist held in China says Trump will ask Xi to free him - reuters.com', '地緣國防'],
  ['Wife of American scholar wrongfully detained in China wants Trump to press Xi to release him - CBS News', '地緣國防'],
  ["Trump-Xi: What's at stake when leaders meet in Washington - BBC", '其他政策'],
  ["China hawks grumble over Trump's lavish welcome planned for Xi state visit - South China Morning Post", '地緣國防'],
  ["The Latest: China's Xi to kick off visit to Washington with a rare planeside welcome from Trump - WJTV", '地緣國防'],
  ["A lot's changed since Xi Jinping's last US state visit. Mostly in China's favor. - CNN", '地緣國防'],
  ["China lays out 'red lines' for Trump-Xi meeting as GOP lawmaker criticizes 'lavish welcome' - New York Post", '地緣國防'],
  ['As AI leaders warn of catastrophe, US and China shun slowdown calls - aljazeera.com', '地緣國防'],
  ['Trump to greet Xi at Andrews ahead of historic state visit - thecentersquare.com', '其他政策'],
  ['China sets guidelines for fentanyl-related crimes prior to Trump-Xi summit - reuters.com', '地緣國防'],
  ['Ahead of US, China meeting, Trump and Xi both face crossroads | Opinion - USA Today', '地緣國防'],
  ["China's Xi to visit Washington without CEO delegation, sources say - reuters.com", '地緣國防'],
  ['Ahead of the Xi-Trump Summit, China Has Reasons to Keep Rare Earths Flowing - The China-Global South Project', '地緣國防'],
  ["US Treasury's Bessent, China's He to meet on 'unfinished business' before Trump-Xi summit - Forth.News", '地緣國防'],
  ['Taiwan is watching closely as Xi and Trump meet and hopes US will keep up its arms sales - The Seattle Times', '地緣國防'],
  ['China expands export controls on drug precursors ahead of Trump-Xi meeting - NBC News', '晶片管制'],
  ["Xi-Trump summit: China's state car has already proved a match for the US 'Beast' - South China Morning Post", '地緣國防'],
  ["Xi Jinping appears to be leaving China's CEOs at home for his Washington trip - Yahoo Finance", '地緣國防'],
  ["The Latest: China's Xi to kick off visit to Washington with a rare planeside welcome from Trump - The Winchester Star", '地緣國防'],
  ["Does Trump Want to Rebalance Trade with China? Here's what he needs to do. - Alliance for American Manufacturing", '地緣國防'],
  ["KT McFarland on Trump's foreign policy strategy, China and Iran - Fox Business", '利率匯率'],
  ['Senator Wicker unhappy with President Trump\'s "lavish welcome" of China\'s Xi Jinping to U.S. - Magnolia Tribune', '地緣國防'],
  ["Tesla CEO Elon Musk Confronts China Tariffs at Xi-Trump Dinner - Barron's", '關稅貿易'],
  ["The Latest: China's Xi to kick off visit to Washington with a rare planeside welcome from Trump - Dallas News", '地緣國防'],
];

describe('主題分類對照實站', () => {
  it('關鍵字規則與實站 40 則的一致率 ≥ 90%', () => {
    let correct = 0;
    for (const [title, expected] of CAPTURE_CASES) {
      if (classifyTheme(title) === expected) correct += 1;
    }
    // 研究員實測 90%；本實作需複現相近數字（門檻取 90%）。
    expect(correct / CAPTURE_CASES.length).toBeGreaterThanOrEqual(0.9);
  });

  it('已知案例逐項對齊（含實站的偽陽性複現）', () => {
    expect(classifyTheme('China expands export controls on drug precursors ahead of Trump-Xi meeting - NBC News')).toBe('晶片管制');
    expect(classifyTheme("Tesla CEO Elon Musk Confronts China Tariffs at Xi-Trump Dinner - Barron's")).toBe('關稅貿易');
    expect(classifyTheme("Majority of Americans, Canadians agree Trump's tariffs were wrong: Poll - The Hill")).toBe('關稅貿易');
    expect(classifyTheme("Trump's on defense against a more powerful Xi Jinping - Politico")).toBe('地緣國防');
    expect(classifyTheme('Trump-Xi summit is set to be high in pageantry and low in substance - NBC News')).toBe('其他政策');
    // 反例：單獨出現的 trade 不應誤判關稅貿易
    expect(classifyTheme('Trump-Xi meeting comes amid tensions on Iran, Taiwan and trade')).toBe('地緣國防');
  });

  it('中文關鍵字亦生效', () => {
    expect(classifyTheme('川普對中國課徵關稅')).toBe('關稅貿易');
    expect(classifyTheme('台積電晶片出口管制')).toBe('晶片管制');
    expect(classifyTheme('聯準會利率決策')).toBe('利率匯率');
    expect(classifyTheme('今天的財經焦點')).toBe('其他政策');
  });
});

// ---------------------------------------------------------------------------
// 3. 組裝輸出
// ---------------------------------------------------------------------------

describe('buildTrumpRadarPayload 組裝', () => {
  const enXml = `<rss><channel>
    <item>
      <title>Trump China summit talks - CNBC</title>
      <link>https://ex/en1</link>
      <pubDate>Wed, 23 Sep 2026 12:00:00 GMT</pubDate>
      <source url="https://cnbc.com">CNBC</source>
    </item>
    <item>
      <title>New tariffs announced - Reuters</title>
      <link>https://ex/en2</link>
      <pubDate>Tue, 22 Sep 2026 12:00:00 GMT</pubDate>
      <source url="https://reuters.com">Reuters</source>
    </item>
  </channel></rss>`;

  const whXml = `<rss><channel>
    <item>
      <title>U.S.-China Board of Trade</title>
      <link>https://ex/wh1</link>
      <pubDate>Wed, 23 Sep 2026 01:59:36 +0000</pubDate>
    </item>
  </channel></rss>`;

  const twXml = `<rss><channel>
    <item>
      <title>川普關稅最新發展 - 自由財經</title>
      <link>https://ex/tw1</link>
      <pubDate>Wed, 23 Sep 2026 03:00:00 GMT</pubDate>
      <source url="https://ec.ltn.com.tw">自由財經</source>
    </item>
  </channel></rss>`;

  const nowMs = Date.parse('2026-09-24T00:00:00Z');
  const payload = buildTrumpRadarPayload({ enXml, twXml, whXml, days: 45, nowMs });

  it('total／items／trend 由美國原文（Google News + 白宮）算出', () => {
    expect(payload.ok).toBe(true);
    expect(payload.days).toBe(45);
    // en 2 則 + 白宮 1 則 = 3
    expect(payload.total).toBe(3);
    expect(payload.items).toHaveLength(3);
    // 白宮項目的 source 覆寫為 The White House
    const wh = payload.items.find((i) => i.link === 'https://ex/wh1');
    expect(wh?.source).toBe('The White House');
    expect(wh?.origin).toBe('us');
    // trend 升冪：09-22(1) → 09-23(2)
    expect(payload.trend).toEqual([
      { date: '2026-09-22', n: 1 },
      { date: '2026-09-23', n: 2 },
    ]);
  });

  it('themes 只列出現過的主題，count 由資料算出並附台股族群', () => {
    // 地緣國防：en1（China）+ 白宮（China）= 2；關稅貿易：en2 = 1
    expect(payload.themes).toEqual([
      { theme: '地緣國防', count: 2, sectors: ['國防航太', '資安', '重電'] },
      {
        theme: '關稅貿易',
        count: 1,
        sectors: ['塑化', '鋼鐵', '紡織', '工具機', '汽車零組件', '自行車', '橡膠', '航運'],
      },
    ]);
  });

  it('tw_items 為台媒（origin=tw），個股識別誠實留白', () => {
    expect(payload.tw_items).toHaveLength(1);
    expect(payload.tw_items[0].origin).toBe('tw');
    expect(payload.tw_items[0].source).toBe('自由財經');
    expect(payload.tw_items[0].stock_id).toBe('');
    expect(payload.tw_items[0].identity_status).toBe('na');
  });

  it('情緒欄位一律留白，且有 omitted_fields 說明', () => {
    const record = payload as unknown as Record<string, unknown>;
    for (const key of ['sentiment', 'n_pos', 'n_neg', 'n_neu', 'sentiment_summary', 'net', 'score', 'tone', 'read']) {
      expect(key in record).toBe(false);
    }
    // 每一則報導皆無 sentiment 鍵
    for (const item of payload.items) {
      expect('sentiment' in (item as unknown as Record<string, unknown>)).toBe(false);
    }
    expect(payload.omitted_fields.fields).toContain('sentiment');
    expect(payload.omitted_fields.reason.length).toBeGreaterThan(0);
  });

  it('窗口外與無日期的項目不納入（不造假、不補日期）', () => {
    const oldXml = `<rss><channel>
      <item>
        <title>China old news - X</title>
        <link>https://ex/old</link>
        <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
        <source url="https://x.com">X</source>
      </item>
      <item>
        <title>China no date - X</title>
        <link>https://ex/nodate</link>
        <pubDate>garbage</pubDate>
        <source url="https://x.com">X</source>
      </item>
    </channel></rss>`;
    const p = buildTrumpRadarPayload({ enXml: oldXml, twXml: '', whXml: '', days: 45, nowMs });
    expect(p.total).toBe(0);
    expect(p.items).toEqual([]);
    expect(p.themes).toEqual([]);
    expect(p.trend).toEqual([]);
  });
});

describe('buildThemeSummaries / buildTrend 邊界', () => {
  it('buildThemeSummaries 過濾 0 則主題', () => {
    const s = buildThemeSummaries([{ theme: '地緣國防' }, { theme: '地緣國防' }]);
    expect(s).toEqual([{ theme: '地緣國防', count: 2, sectors: ['國防航太', '資安', '重電'] }]);
  });

  it('buildTrend 略過空日期並升冪', () => {
    expect(
      buildTrend([{ date: '2026-09-23' }, { date: '' }, { date: '2026-09-21' }]),
    ).toEqual([
      { date: '2026-09-21', n: 1 },
      { date: '2026-09-23', n: 1 },
    ]);
  });
});
