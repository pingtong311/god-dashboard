import { NextRequest } from 'next/server';
import { buildQuickChartConfig, Candle } from '@/lib/macd-chart';

const TICKER_RE = /^\d{4,6}[A-Z]?$/i;

async function fetchYahoo(ticker: string, market: string, signal: AbortSignal): Promise<Candle[]> {
  const suffix = /^(otc|two)$/i.test(market) || /[A-Z]$/i.test(ticker) ? '.TWO' : '.TW';
  const symbol = ticker + suffix;
  for (const host of ['query1.finance.yahoo.com', 'query2.finance.yahoo.com']) {
    const url = `https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?range=2y&interval=1d&events=history`;
    try {
      const response = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 SkyNet evidence chart' }, signal });
      if (!response.ok) continue;
      const result = (await response.json())?.chart?.result?.[0];
      const quote = result?.indicators?.quote?.[0];
      const rows = (result?.timestamp || []).map((timestamp: number, index: number) => ({
        date: new Date(timestamp * 1000).toISOString().slice(0, 10),
        open: Number(quote?.open?.[index]),
        high: Number(quote?.high?.[index]),
        low: Number(quote?.low?.[index]),
        close: Number(quote?.close?.[index]),
        volume: Number(quote?.volume?.[index] || 0),
      })).filter((row: Candle) => [row.open, row.high, row.low, row.close].every((value) => Number.isFinite(value)) && row.close > 0);
      if (rows.length >= 80) return rows;
    } catch {}
  }
  return [];
}

export async function GET(request: NextRequest) {
  const ticker = String(request.nextUrl.searchParams.get('ticker') || '').trim().toUpperCase();
  const market = String(request.nextUrl.searchParams.get('market') || 'twse').trim().toLowerCase();
  if (!TICKER_RE.test(ticker)) return Response.json({ error: 'invalid_ticker' }, { status: 400 });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const candles = await fetchYahoo(ticker, market, controller.signal);
    if (candles.length < 80) return Response.json({ error: 'insufficient_market_data', rows: candles.length }, { status: 503 });
    const numberParam = (name: string) => {
      const value = Number(request.nextUrl.searchParams.get(name));
      return Number.isFinite(value) && value > 0 ? value : undefined;
    };
    const chart = buildQuickChartConfig(candles, ticker, {
      current: numberParam('current'),
      trigger: numberParam('trigger'),
      stop: numberParam('stop'),
      upperLimit: numberParam('upperLimit'),
    });
    if (request.nextUrl.searchParams.get('format') === 'meta') {
      return Response.json({
        ticker,
        source: 'Yahoo Finance chart API',
        priority: ['SUPPORT_RESISTANCE_ZONE', 'LONG_MA_REGIME', 'VOLUME_CONFIRMATION', 'ATR_RISK_ONLY', 'ONE_MOMENTUM_DIAGNOSTIC'],
        rows: candles.length,
        state: chart.state,
        structureVersion: chart.structureVersion,
        locationState: chart.locationState,
        regimeState: chart.regimeState,
        regimeQuality: chart.structure.regime.quality,
        volumeState: chart.volumeState,
        volumeRatio: chart.structure.volume.ratio,
        atr14: chart.structure.risk.atr,
        rsi14: chart.rsi14,
        technicalShadowScore: chart.priorityScore,
        scorePolicy: 'location 45 + regime 30 + volume 25; momentum 0; ATR direction 0',
        narrative: chart.narrative,
        quoteDate: chart.quoteDate,
        close: chart.close,
      });
    }
    const imageResponse = await fetch('https://quickchart.io/chart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'image/png' },
      // LINE Flex image components accept images up to 1024x1024. QuickChart's
      // default pixel ratio is 2, so pin it to 1 to keep the actual PNG within
      // the documented limit while retaining a readable 20:13 chart.
      body: JSON.stringify({ version: '4', width: 1024, height: 1024, devicePixelRatio: 1, backgroundColor: '#ffffff', format: 'png', chart: chart.config }),
      signal: controller.signal,
    });
    if (!imageResponse.ok) return Response.json({ error: 'chart_render_failed', status: imageResponse.status, detail: (await imageResponse.text()).slice(0, 240) }, { status: 502 });
    return new Response(await imageResponse.arrayBuffer(), {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=300, s-maxage=600, stale-while-revalidate=1800',
        'X-SkyNet-Data-Source': 'Yahoo-Finance-Chart-API',
        'X-SkyNet-Technical-Priority': 'LOCATION-REGIME-VOLUME-shadow',
        'X-SkyNet-Technical-Status': chart.narrative.status,
        'X-SkyNet-Structure-Version': chart.structureVersion,
        'X-SkyNet-Regime-State': chart.regimeState,
        'X-SkyNet-Quote-Date': chart.quoteDate,
      },
    });
  } catch (error) {
    return Response.json({ error: 'candidate_chart_failed', detail: String(error instanceof Error ? error.message : error).slice(0, 120) }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
