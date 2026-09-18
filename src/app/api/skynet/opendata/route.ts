/**
 * TWSE Opendata 代理
 * GET /api/skynet/opendata?type=institutional|margin|revenue&tickers=2330,00878
 *
 * type=institutional → 三大法人整體買賣超
 * type=margin        → 融資融券餘額（指定 tickers）
 * type=revenue       → 月營收（指定 tickers）
 */


import { NextRequest, NextResponse } from 'next/server';

const OPENAPI_BASE = 'https://openapi.twse.com.tw/v1';
const TWSE_BASE = 'https://www.twse.com.tw/rwd/zh';

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 SkyNet' },
      
    });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type');
  const tickersParam = searchParams.get('tickers') || '';
  const tickers = tickersParam.split(',').map(t => t.trim()).filter(Boolean);
  const parseNum = (value: unknown) => Number(String(value || '0').replace(/,/g, '').trim()) || 0;
  const formatTwseDate = (date: Date) => {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}${mm}${dd}`;
  };

  async function fetchLatestT86() {
    const now = new Date();
    for (let offset = 0; offset < 10; offset += 1) {
      const date = new Date(now.getTime() - offset * 24 * 60 * 60 * 1000);
      const twseDate = formatTwseDate(date);
      const res = await fetchWithTimeout(
        `${TWSE_BASE}/fund/T86?response=json&date=${twseDate}&selectType=ALLBUT0999`,
        8_000
      );
      if (!res.ok) continue;
      const data = await res.json();
      if (data?.stat === 'OK' && Array.isArray(data.data) && data.data.length > 0) {
        return data as { date?: string; title?: string; fields: string[]; data: string[][] };
      }
    }
    return null;
  }

  try {
    if (type === 'institutional') {
      const data = await fetchLatestT86();
      if (!data) {
        return NextResponse.json({ error: 'opendata_upstream_error' }, { status: 502 });
      }
      const rows = data.data;
      const sum = (index: number) => rows.reduce((total, row) => total + parseNum(row[index]), 0);
      const latest = {
        日期: data.date || data.title || '',
        ForeignBuy: String(sum(2)),
        ForeignSell: String(sum(3)),
        ForeignNet: String(sum(4)),
        TrustBuy: String(sum(8)),
        TrustSell: String(sum(9)),
        TrustNet: String(sum(10)),
        DealerBuy: String(sum(12)),
        DealerSell: String(sum(13)),
        DealerNet: String(sum(14)),
        TotalNet: String(sum(18)),
      };
      return NextResponse.json({ institutional: latest, rows: rows.length, fetchedAt: new Date().toISOString() }, {
        headers: { 'Cache-Control': 'public, max-age=300' },
      });
    }

    if (type === 'margin') {
      // 融資融券餘額
      const res = await fetchWithTimeout(
        `${OPENAPI_BASE}/exchangeReport/MI_MARGN`,
        8_000
      );
      if (!res.ok) {
        return NextResponse.json({ error: 'opendata_upstream_error' }, { status: 502 });
      }
      const raw: Record<string, string>[] = await res.json();
      // 篩選指定 tickers
      const filtered = tickers.length > 0
        ? raw.filter(item => tickers.includes(item['股票代號'] || item['Code'] || ''))
        : raw.slice(0, 50);
      const margins = filtered.map((item) => {
        const marginToday = parseNum(item['融資今日餘額']);
        const marginPrev = parseNum(item['融資前日餘額']);
        const shortToday = parseNum(item['融券今日餘額']);
        const shortPrev = parseNum(item['融券前日餘額']);
        return {
          ...item,
          融資餘額: String(marginToday),
          融資增減: String(marginToday - marginPrev),
          融券餘額: String(shortToday),
          融券增減: String(shortToday - shortPrev),
        };
      });
      return NextResponse.json({ margins, fetchedAt: new Date().toISOString() }, {
        headers: { 'Cache-Control': 'public, max-age=300' },
      });
    }

    if (type === 'revenue') {
      // 月營收
      const res = await fetchWithTimeout(
        `${OPENAPI_BASE}/opendata/t187ap05_L`,
        8_000
      );
      if (!res.ok) {
        return NextResponse.json({ error: 'opendata_upstream_error' }, { status: 502 });
      }
      const raw: Record<string, string>[] = await res.json();
      const filtered = tickers.length > 0
        ? raw.filter(item => tickers.includes(item['公司代號'] || item['Code'] || ''))
        : raw.slice(0, 50);
      const revenues = filtered.map((item) => ({
        ...item,
        當月營收: item['營業收入-當月營收'] || '0',
        '上月比較增減(%)': item['營業收入-上月比較增減(%)'] || '0',
        '去年同月增減(%)': item['營業收入-去年同月增減(%)'] || '0',
        出表日期: item['出表日期'] || item['資料年月'] || '',
      }));
      return NextResponse.json({ revenues, fetchedAt: new Date().toISOString() }, {
        headers: { 'Cache-Control': 'public, max-age=300' },
      });
    }

    return NextResponse.json({ error: 'invalid_type', validTypes: ['institutional', 'margin', 'revenue'] }, { status: 400 });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return NextResponse.json({ error: 'opendata_timeout' }, { status: 504 });
    }
    return NextResponse.json({ error: 'opendata_fetch_error' }, { status: 500 });
  }
}
