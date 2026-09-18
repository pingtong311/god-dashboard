/**
 * MOPS 公開資訊觀測站代理
 * GET /api/skynet/mops?tickers=2330,00878
 *
 * 取得指定股票的最新重大訊息公告（最多 10 則）
 * 降級：MOPS 無法存取時回傳 { announcements: [], error: 'mops_unavailable' }
 */


import { NextRequest, NextResponse } from 'next/server';

export interface MOPSAnnouncement {
  ticker: string;
  companyName: string;
  title: string;
  announcedAt: string;
  url: string;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tickersParam = searchParams.get('tickers') || '';
  const tickers = tickersParam.split(',').map(t => t.trim()).filter(Boolean);

  if (tickers.length === 0) {
    return NextResponse.json({ announcements: [], error: 'missing_tickers' }, { status: 400 });
  }

  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const dateStr = `${yyyy}${mm}${dd}`;
  // 30 天前
  const past = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
  const pastStr = `${past.getFullYear()}${String(past.getMonth() + 1).padStart(2, '0')}${String(past.getDate()).padStart(2, '0')}`;

  const allAnnouncements: MOPSAnnouncement[] = [];

  for (const ticker of tickers.slice(0, 5)) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch('https://mops.twse.com.tw/mops/web/ajax_t05st01', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 SkyNet',
          'Referer': 'https://mops.twse.com.tw/',
        },
        body: new URLSearchParams({
          encodeURIComponent: '1',
          step: '1',
          firstin: '1',
          off: '1',
          co_id: ticker,
          b_date: pastStr,
          e_date: dateStr,
        }).toString(),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) continue;

      const html = await res.text();
      // 解析 HTML 表格中的公告標題和時間
      const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      const stripTags = (s: string) => s.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();

      let rowMatch;
      while ((rowMatch = rowRegex.exec(html)) !== null) {
        const row = rowMatch[1];
        const cells: string[] = [];
        let tdMatch;
        const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
        while ((tdMatch = tdRe.exec(row)) !== null) {
          cells.push(stripTags(tdMatch[1]));
        }
        if (cells.length >= 3) {
          const dateCell = cells[0];
          const titleCell = cells[2] || cells[1];
          if (dateCell && /\d{4}/.test(dateCell) && titleCell && titleCell.length > 3) {
            allAnnouncements.push({
              ticker,
              companyName: cells[1] || ticker,
              title: titleCell,
              announcedAt: dateCell,
              url: `https://mops.twse.com.tw/mops/web/t05st01?co_id=${ticker}`,
            });
          }
        }
      }
    } catch {
      clearTimeout(timer);
      // 單一 ticker 失敗不影響其他
    }
  }

  if (allAnnouncements.length === 0 && tickers.length > 0) {
    return NextResponse.json(
      { announcements: [], error: 'mops_unavailable', fetchedAt: new Date().toISOString() },
      { headers: { 'Cache-Control': 'public, max-age=600' } }
    );
  }

  // 依時間排序，取最新 10 則
  const sorted = allAnnouncements
    .sort((a, b) => b.announcedAt.localeCompare(a.announcedAt))
    .slice(0, 10);

  return NextResponse.json(
    { announcements: sorted, fetchedAt: new Date().toISOString() },
    { headers: { 'Cache-Control': 'public, max-age=600' } }
  );
}
