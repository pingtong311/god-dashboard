import { NextResponse } from 'next/server';

type ReportChart = {
  ticker: string;
  url: string;
  metaUrl: string;
};

type ReportEvidence = {
  technical: boolean;
  expert: boolean;
  realtime: boolean;
  knowledgeBase: boolean;
  warning: boolean;
  explanationLines: string[];
  labels: string[];
};

type ReportRow = {
  date: string;
  time: string;
  code: string;
  name: string;
  status: string;
  channel: string;
  summary: string;
  message: string;
  charts: ReportChart[];
  evidence: ReportEvidence;
};

const SHEET_ID = '1yva49DMaSG7lX3Eohx7WznZWnjoavUMoi8h7V_AzVxw';
const REPORT_GID = '1053155676';
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${REPORT_GID}`;

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  row.push(cell.replace(/\r$/, ''));
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function normalizeDate(value: string): { date: string; time: string; sortKey: string } {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  const match = normalized.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})\s*(\d{1,2}:\d{2}(?::\d{2})?)?/);
  if (!match) return { date: '未標日期', time: '', sortKey: normalized };
  const date = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  const time = match[4] || '';
  return { date, time, sortKey: `${date} ${time}` };
}

function detectChannel(name: string, summary: string): string {
  const text = `${name} ${summary}`.toUpperCase();
  if (text.includes('TG') || text.includes('TELEGRAM')) return 'TG';
  if (text.includes('LINE')) return 'LINE';
  return 'WEB';
}

function cleanMessage(value: string): string {
  return String(value || '')
    .replace(/<br\s*\/?s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();
}

function extractTickers(message: string): string[] {
  const seen = new Set<string>();
  const patterns = [
    /(?:代號|股票|標的|ticker|code)[:：\s]*(\d{4,6}[A-Z]?)/gi,
    /[（(](\d{4,6}[A-Z]?)[）)]/gi,
    /\b(\d{4,6}[A-Z]?)\.(?:TW|TWO)\b/gi,
    /(?:^|[\n\s、，：:])(?:\d+\.?\s*)?(\d{4,6}[A-Z]?)[\s　]+[\u4e00-\u9fff]{2,8}/gi,
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(message)) && seen.size < 6) {
      const ticker = String(match[1] || '').toUpperCase();
      if (/^(2024|2025|2026)/.test(ticker)) continue;
      seen.add(ticker);
    }
  }
  return Array.from(seen);
}

function buildCharts(message: string): ReportChart[] {
  return extractTickers(message).map((ticker) => ({
    ticker,
    url: `/api/skynet/candidate-chart?ticker=${encodeURIComponent(ticker)}&market=twse`,
    metaUrl: `/api/skynet/candidate-chart?ticker=${encodeURIComponent(ticker)}&market=twse&format=meta`,
  }));
}

function detectEvidence(message: string, summary: string, name: string): ReportEvidence {
  const text = `${name}\n${summary}\n${message}`;
  const technical = /技術|VWAP|RSI|MACD|布林|均線|MA\d+|量能|爆量|K線|突破|支撐|壓力|ATR|停損|觸發價/.test(text);
  const expert = /專家|朱家泓|老王|股癌|楊雲翔|權證小哥|籌碼K|技術派|法人|主力/.test(text);
  const realtime = /即時|盤中|報價|TWSE|Yahoo Finance|MIS|quote|延遲|現價|漲幅|成交量|VWAP/.test(text);
  const knowledgeBase = /知識庫|SOP|戰法|規則|風控|模型|Alpha|決策|地雷|狙擊|校準|結構優先/.test(text);
  const warning = /讀取失敗|資料不足|OPENAI_API_KEY_MISSING|DEGRADED|限流|備援|錯誤|失敗/.test(text);
  const explanationLines = message
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => /技術|VWAP|RSI|MACD|布林|均線|量能|突破|支撐|壓力|風控|觸發|停損|法人|籌碼|Alpha|知識庫|模型|即時|報價/.test(line))
    .slice(0, 8);
  const labels = [
    technical ? '技術分析' : '',
    expert ? '專家/知識規則' : '',
    realtime ? '即時/盤中資料' : '',
    knowledgeBase ? '知識庫/模型規則' : '',
    warning ? '資料警示' : '',
  ].filter(Boolean);
  return { technical, expert, realtime, knowledgeBase, warning, explanationLines, labels };
}

function dedupeRows(rows: Array<ReportRow & { sortKey: string }>): Array<ReportRow & { sortKey: string }> {
  const seen = new Set<string>();
  const result: Array<ReportRow & { sortKey: string }> = [];
  for (const row of rows) {
    const normalizedMessage = row.message.replace(/\s+/g, ' ').trim();
    const key = `${row.date}|${row.name}|${row.summary}|${normalizedMessage}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(row);
  }
  return result;
}

export async function GET() {
  try {
    const response = await fetch(`${CSV_URL}&_ts=${Date.now()}`, {
      headers: { Accept: 'text/csv' },
      cache: 'no-store',
    });
    if (!response.ok) {
      return NextResponse.json({ error: 'sheet_fetch_failed', status: response.status }, { status: 502 });
    }
    const rows = parseCsv(await response.text());
    const headers = rows.shift() || [];
    const indexOf = (name: string) => headers.indexOf(name);
    const rawMapped = rows.map((row) => {
      const rawDate = row[indexOf('日期')] || '';
      const { date, time, sortKey } = normalizeDate(rawDate);
      const name = row[indexOf('名稱')] || '';
      const summary = row[indexOf('新聞摘要')] || '';
      const message = cleanMessage(row[indexOf('分析理由')] || '');
      return {
        date,
        time,
        code: row[indexOf('代號')] || '',
        name,
        status: row[indexOf('AI建議(Buy/Sell)')] || '',
        channel: detectChannel(name, summary),
        summary,
        message,
        charts: buildCharts(message),
        evidence: detectEvidence(message, summary, name),
        sortKey,
      } as ReportRow & { sortKey: string };
    })
      .filter((row) => row.code === 'REPORT' || row.summary.includes('快照') || row.name.includes('戰報') || row.name.includes('雷達'))
      .filter((row) => row.message)
      .sort((a, b) => String(b.sortKey).localeCompare(String(a.sortKey)));

    const mapped = dedupeRows(rawMapped)
      .slice(0, 260)
      .map(({ date, time, code, name, status, channel, summary, message, charts, evidence }) => ({ date, time, code, name, status, channel, summary, message, charts, evidence }));

    const days = Array.from(new Set(mapped.map((row) => row.date))).sort((a, b) => b.localeCompare(a));
    const auditSummary = {
      total: mapped.length,
      technical: mapped.filter((row) => row.evidence.technical).length,
      expert: mapped.filter((row) => row.evidence.expert || row.evidence.knowledgeBase).length,
      realtime: mapped.filter((row) => row.evidence.realtime).length,
      warnings: mapped.filter((row) => row.evidence.warning).length,
      chartCards: mapped.reduce((sum, row) => sum + row.charts.length, 0),
      duplicateFiltered: rawMapped.length - mapped.length,
      deliveryMode: 'CONTROL_CENTER_ONLY',
    };
    return NextResponse.json({ updatedAt: new Date().toISOString(), days, reports: mapped, auditSummary }, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (error) {
    return NextResponse.json({ error: 'daily_reports_error', detail: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
