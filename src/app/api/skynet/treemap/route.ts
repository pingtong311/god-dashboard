/**
 * 族群熱圖資料 API
 * 彙整 MI_INDEX tables[8] (每日收盤行情) 全市場個股，
 * 依產業分群計算市值權重，產出適合方塊圖的資料結構。
 *
 * GET /api/skynet/treemap?date=YYYYMMDD
 */

import { NextRequest, NextResponse } from 'next/server';
import { parseTwseNumber, parseTwseSign, rowsOf } from '@/lib/marketOverview';

const RWD_MI_INDEX_BASE = 'https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX';

function rwdMiIndexUrl(date: string): string {
  return `${RWD_MI_INDEX_BASE}?date=${date}&type=ALL&response=json`;
}

const TWSE_UA_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0',
  Accept: 'application/json',
};

// 產業對應表（簡化版，實際可從 tables[0] 的類股指數名稱推導）
const SECTOR_KEYWORDS: Record<string, string[]> = {
  半導體: ['半導體', '積體電路', 'IC', '晶圓', '封測'],
  電腦週邊: ['電腦', '週邊', '鍵盤', '滑鼠', '機殼', '散熱'],
  光電: ['光電', '面板', 'LED', '雷射', '光學'],
  通信網路: ['通信', '網路', '5G', '基地台', '光纖', '交換器'],
  電子零組件: ['電子', '被動元件', '電阻', '電容', '電感', '連接器', 'PCB'],
  電子通路: ['通路', '經銷', '代理', '通路商'],
  資訊服務: ['資訊', '軟體', '系統整合', '雲端', 'SaaS', 'AI', '大數據'],
  其他電子: ['其他電子'],
  鋼鐵: ['鋼鐵', '鋼捲', '鋼筋', '鋼管', '鍛造'],
  機械: ['機械', '工具機', '自動化', '馬達', '泵', '閥', '軸承'],
  電機機電: ['電機', '馬達', '發電機', '變壓器', '開關', '配電'],
  汽車: ['汽車', '車用', '車體', '車燈', '輪胎', '車電子'],
  化學工業: ['化學', '石化', '塑膠', '合成橡膠', '化纖', '染料', '顏料'],
  生技醫療: ['生技', '醫療', '藥', '疫苗', '醫療器材', '基因', '細胞治療'],
  玻璃陶瓷: ['玻璃', '陶瓷', '纖維', '耐火'],
  造紙印刷: ['造紙', '紙漿', '印刷', '包裝', '瓦楞'],
  鋼鋼鐵: ['鋼鐵'],
  橡膠: ['橡膠', '輪胎', '膠管', '膠帶'],
  汽車工業: ['汽車'],
  電器電纜: ['電纜', '電線', '配線', '開關', '插座'],
  電子零組件業: ['電子零組件'],
  通訊網路業: ['通訊網路'],
  電腦及週邊設備業: ['電腦週邊'],
  光電業: ['光電'],
  資訊服務業: ['資訊服務'],
  其他電子業: ['其他電子'],
  鋼鐵業: ['鋼鐵'],
  機械業: ['機械'],
  電機機械業: ['電機機電'],
  汽車工業業: ['汽車'],
  化學工業業: ['化學工業'],
  生技醫療業: ['生技醫療'],
  玻璃陶瓷業: ['玻璃陶瓷'],
  造紙印刷業: ['造紙印刷'],
  橡膠業: ['橡膠'],
  電器電纜業: ['電器電纜'],
};

// 簡單的產業分類：依股票名稱關鍵字匹配
function classifySector(name: string): string {
  const lowerName = name.toLowerCase();
  for (const [sector, keywords] of Object.entries(SECTOR_KEYWORDS)) {
    if (keywords.some(k => lowerName.includes(k.toLowerCase()))) {
      return sector;
    }
  }
  return '其他';
}

interface TreemapItem {
  symbol: string;
  name: string;
  sector: string;
  marketCap: number;      // 估算市值 = 收盤價 × 發行張數（這裡用成交量當代理）
  price: number;
  change: number;
  changePercent: number;
  volume: number;
}

interface TreemapSector {
  sector: string;
  totalMarketCap: number;
  totalVolume: number;
  count: number;
  items: TreemapItem[];
  changePercent: number;  // 加權平均漲跌幅
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const dateParam = searchParams.get('date') ?? undefined;

  if (dateParam !== undefined && !/^\d{8}$/.test(dateParam)) {
    return NextResponse.json(
      { error: 'invalid_date', message: 'date must be YYYYMMDD' },
      { status: 400 }
    );
  }

  // 決定查詢日期：預設今天（台北時區）
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date()).replace(/-/g, '');

  const queryDate = dateParam ?? today;

  try {
    // 抓取 MI_INDEX tables[8] (每日收盤行情) - 含全市場 35227 列
    const res = await fetch(rwdMiIndexUrl(queryDate), {
      headers: TWSE_UA_HEADERS,
      cache: 'no-store',
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: 'upstream_error', message: 'MI_INDEX unavailable' },
        { status: 502 }
      );
    }

    const json = (await res.json()) as { stat?: string; tables?: unknown[] };
    if (json?.stat !== 'OK' || !json.tables) {
      return NextResponse.json(
        { error: 'upstream_error', message: 'MI_INDEX stat not OK' },
        { status: 502 }
      );
    }

    const tables = json.tables as unknown[];
    const rows = rowsOf(tables[8] as string[][]); // tables[8] = 每日收盤行情

    // 解析每一檔股票
    const items: TreemapItem[] = [];
    for (const row of rows) {
      const symbol = String(row?.[0] ?? '').trim();
      // 只處理 4 碼普通股
      if (!/^\d{4}$/.test(symbol)) continue;

      const name = String(row?.[1] ?? '').trim();
      const price = parseTwseNumber(row[8]);     // 收盤價
      const sign = parseTwseSign(row[9]);        // 漲跌符號
      const rawChange = parseTwseNumber(row[10]); // 漲跌點數（無號）
      const volume = parseTwseNumber(row[3]);    // 成交量（張）

      if (!Number.isFinite(price) || price <= 0) continue;
      if (!Number.isFinite(rawChange)) continue;

      const change = rawChange * sign;
      const prevClose = price - change;
      const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;
      if (!Number.isFinite(changePercent)) continue;

      const sector = classifySector(name);

      items.push({
        symbol,
        name,
        sector,
        marketCap: price * (volume || 1), // 簡易估算：價格 × 成交量
        price,
        change,
        changePercent,
        volume: volume || 0,
      });
    }

    // 依產業分群聚合
    const sectorMap = new Map<string, TreemapSector>();
    for (const item of items) {
      let sectorData = sectorMap.get(item.sector);
      if (!sectorData) {
        sectorData = {
          sector: item.sector,
          totalMarketCap: 0,
          totalVolume: 0,
          count: 0,
          items: [],
          changePercent: 0,
        };
        sectorMap.set(item.sector, sectorData);
      }
      sectorData.totalMarketCap += item.marketCap;
      sectorData.totalVolume += item.volume;
      sectorData.count += 1;
      sectorData.items.push(item);
    }

    // 計算各產業加權平均漲跌幅（以市值加權）
    const sectors: TreemapSector[] = [];
    for (const sectorData of sectorMap.values()) {
      let weightedChangeSum = 0;
      for (const item of sectorData.items) {
        weightedChangeSum += item.changePercent * item.marketCap;
      }
      sectorData.changePercent = sectorData.totalMarketCap > 0
        ? weightedChangeSum / sectorData.totalMarketCap
        : 0;
      // 只保留前 20 檔最代表性的個股（避免資料過大）
      sectorData.items.sort((a, b) => b.marketCap - a.marketCap);
      sectorData.items = sectorData.items.slice(0, 20);
      sectors.push(sectorData);
    }

    // 依總市值排序
    sectors.sort((a, b) => b.totalMarketCap - a.totalMarketCap);

    // 分市場別：上市/上櫃/ETF/其他（簡易判斷）
    const marketGroups = {
      上市: sectors.filter(s => !s.sector.includes('ETF') && !s.sector.includes('櫃')),
      上櫃: sectors.filter(s => s.sector.includes('櫃')),
      ETF: sectors.filter(s => s.sector.includes('ETF') || s.sector.includes('基金')),
      其他: sectors.filter(s => !['上市', '上櫃', 'ETF'].some(m =>
        sectorMap.get(s.sector)?.items.some(i => i.symbol.startsWith(m)) ?? false
      )),
    };

    return NextResponse.json(
      {
        ok: true,
        date: queryDate,
        sectors,
        marketGroups,
        totalStocks: items.length,
        fetchedAt: new Date().toISOString(),
      },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );

  } catch (error) {
    console.error('Treemap API error:', error);
    return NextResponse.json(
      { error: 'internal_error', message: 'treemap generation failed' },
      { status: 500 }
    );
  }
}