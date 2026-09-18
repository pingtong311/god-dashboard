'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  BrainCircuit,
  Loader2,
  RefreshCw,
  Radar,
  ShieldCheck,
} from 'lucide-react';
import type {
  BattleReport,
  ExtremeResponse,
  FusionStock,
  LiaoCandidate,
  Sniper,
} from '@/lib/fusionCore';

type SourceHealth = {
  id: string;
  label: string;
  status: 'online' | 'degraded' | 'offline';
  rows: number;
  latencyMs: number;
};

type IntradaySeriesPoint = {
  generatedAt: string;
  ticker: string;
  rank: number | null;
  fusionScore: number | null;
  phaseLabel: string | null;
  dataQuality: number | null;
  ma21Diff: number | null;
  volumeRatio: number | null;
  changePercent: number | null;
  chiefNet: number | null;
};

type FusionResponse = {
  core?: {
    status?: 'ok' | 'degraded' | 'error';
    healthScore?: number;
    cache?: {
      mode?: 'live' | 'stale-replay';
      ageSeconds?: number;
    };
    sourceHealth?: SourceHealth[];
    warnings?: string[];
  };
  reports?: BattleReport[];
  snipers?: Sniper[];
  liaoCandidates?: LiaoCandidate[];
  fusionStocks?: FusionStock[];
  extreme?: ExtremeResponse | null;
  intradaySeries?: IntradaySeriesPoint[];
};

interface FusionRadarPanelProps {
  ticker: string;
  marketLabel: string;
  strategy?: string;
  period?: string;
}

function cleanTicker(value: string) {
  const ticker = value.trim().toUpperCase();
  return /^[0-9A-Z.\-]{1,8}$/.test(ticker) ? ticker : '';
}

function formatNumber(value?: number | null, digits = 2) {
  if (value == null || Number.isNaN(value)) return '--';
  return value.toLocaleString('zh-TW', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function safeFixed(value: unknown, digits: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '--';
}

function formatSourceLabel(label: string) {
  const trimmed = label.replace(/^n8n\s*/i, '').trim();
  return trimmed || '資料來源';
}

function formatRiskLevel(level?: FusionStock['riskLevel']) {
  if (level === 'low') return '低';
  if (level === 'medium') return '中';
  if (level === 'high') return '高';
  return '--';
}

export default function FusionRadarPanel({
  ticker,
  marketLabel,
  strategy = 'buy_red_tail',
  period = '日',
}: FusionRadarPanelProps) {
  const [data, setData] = useState<FusionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [focusTicker, setFocusTicker] = useState(() => cleanTicker(ticker || ''));
  const normalizedTicker = useMemo(() => cleanTicker(ticker || ''), [ticker]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ strategy, period });
      if (normalizedTicker) params.set('ticker', normalizedTicker);
      const response = await fetch(`/api/skynet/fusion?${params.toString()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`fusion_${response.status}`);
      const json = (await response.json()) as FusionResponse;
      setData(json);
      setLastUpdated(new Date().toLocaleTimeString('zh-TW', { hour12: false }));
    } catch {
      setError('fusion_unavailable');
    } finally {
      setLoading(false);
    }
  }, [normalizedTicker, period, strategy]);

  useEffect(() => {
    setFocusTicker(normalizedTicker);
    void refresh();
  }, [normalizedTicker, refresh]);

  const core = data?.core;
  const fusionStocks = data?.fusionStocks || [];
  const sourceHealth = core?.sourceHealth || [];
  const selected = (focusTicker ? fusionStocks.find((item) => item.ticker === focusTicker) : null)
    || (normalizedTicker ? fusionStocks.find((item) => item.ticker === normalizedTicker) : null)
    || fusionStocks[0]
    || null;
  const topFusion = fusionStocks[0] || null;
  const resonanceCount = fusionStocks.filter((stock) => stock.source.length >= 2).length;
  const executableCount = fusionStocks.filter((stock) => stock.decisionLabel === '可執行').length;
  const pendingSnipers = data?.snipers?.filter((sniper) => sniper.status === '待觸發').length || 0;
  const recentSeries = (data?.intradaySeries || []).slice(-4).reverse();

  const metrics = [
    { label: '天網候選', value: fusionStocks.length },
    { label: '可執行', value: executableCount },
    { label: '雙重共振', value: resonanceCount },
    { label: '待觸發', value: pendingSnipers },
    { label: '健康度', value: core?.healthScore != null ? `${core.healthScore}%` : '--' },
    { label: '快取', value: core?.cache?.mode === 'stale-replay' ? `${core.cache.ageSeconds || 0}s` : 'LIVE' },
  ];

  return (
    <section className="workspace-card fusion-radar-panel">
      <div className="panel-subhead">
        <div>
          <p>融合雷達</p>
          <h3>SkyNet 飆股候選雷達</h3>
        </div>
        <div className="fusion-head-actions">
          <span className={`fusion-status ${core?.status === 'ok' ? 'good' : core?.status === 'degraded' ? 'warn' : 'muted'}`}>
            <BrainCircuit size={13} />
            {core?.status === 'ok' ? 'Fusion Core Online' : core?.status === 'degraded' ? 'Fusion Core Degraded' : 'Fusion Core Loading'}
          </span>
          {lastUpdated && <span className="fusion-updated">{lastUpdated}</span>}
          <button type="button" className="workspace-copy-btn" onClick={() => { void refresh(); }} disabled={loading}>
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          </button>
          <Link href="/liangjia-warroom" className="fusion-link-btn">
            開完整工作台
          </Link>
        </div>
      </div>

      <p className="fusion-summary">
        {marketLabel === '台股'
          ? '只保留天網候選、狙擊觸發、真實量價與可執行風控；自選、持倉與戰報流水不進排行。'
          : '目前候選雷達主攻台股飆股篩選，其他市場只保留查詢用途。'}
      </p>

      {loading && <div className="warroom-panel-loading">載入融合資料中...</div>}

      {error && !loading && (
        <div className="warroom-panel-error">
          <AlertTriangle size={14} />
          <span>Fusion Core 資料源異常，請稍後重試</span>
        </div>
      )}

      {!loading && !error && !data && (
        <div className="warroom-panel-empty">尚無融合資料</div>
      )}

      {!loading && !error && data && (
        <>
          <div className="fusion-metrics">
            {metrics.map((metric) => (
              <div key={metric.label} className="fusion-metric">
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
              </div>
            ))}
          </div>

          <div className="fusion-content-grid">
            <div className="fusion-column">
              <div className="fusion-table-wrap">
                <table className="fusion-table">
                  <thead>
                    <tr>
                      <th>Rank</th>
                      <th>標的</th>
                      <th>來源</th>
                      <th>決策</th>
                      <th>執行</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fusionStocks.slice(0, 6).map((stock, index) => (
                      <tr
                        key={stock.ticker}
                        className={stock.ticker === selected?.ticker ? 'active' : ''}
                        onClick={() => setFocusTicker(stock.ticker)}
                      >
                        <td>#{index + 1}</td>
                        <td>
                          <strong>{stock.ticker}</strong>
                          <span>{stock.name}</span>
                        </td>
                        <td>{stock.source.join(' / ')}</td>
                        <td>
                          <span className={`fusion-decision ${stock.skynetAction === 'BUY' ? 'buy' : stock.skynetAction === 'SELL' ? 'sell' : 'watch'}`}>
                            {stock.skynetAction || 'WATCH'}
                          </span>
                        </td>
                        <td>
                          <strong>{stock.executionScore ?? '--'}</strong>
                          <span>{stock.decisionLabel || '觀察等觸發'}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {selected && (
                <div className="fusion-dossier">
                  <div className="panel-subhead">
                    <div>
                      <p>焦點資料卡</p>
                      <h3>{selected.ticker} / {selected.name}</h3>
                    </div>
                    <span>{selected.source.length} signals</span>
                  </div>
                  <div className="fusion-dossier-grid">
                    <div>
                      <span>融合分數</span>
                      <strong>{formatNumber(selected.fusionScore, 1)}</strong>
                    </div>
                    <div>
                      <span>可執行度</span>
                      <strong>{selected.executionScore ?? '--'}/100</strong>
                    </div>
                    <div>
                      <span>校準信心</span>
                      <strong>{selected.calibratedConfidence ?? selected.confidence ?? '--'}%</strong>
                    </div>
                    <div>
                      <span>天網建議</span>
                      <strong>{selected.skynetAction || '--'}</strong>
                    </div>
                    <div>
                      <span>廖兄點數</span>
                      <strong>{selected.liaoPoints ?? '--'}</strong>
                    </div>
                    <div>
                      <span>量比</span>
                      <strong>{selected.volumeRatio != null ? `${safeFixed(selected.volumeRatio, 2)}x` : '--'}</strong>
                    </div>
                    <div>
                      <span>資料品質</span>
                      <strong>{selected.dataQuality != null ? `${selected.dataQuality}/100` : '--'}</strong>
                    </div>
                    <div>
                      <span>風險等級</span>
                      <strong className={`fusion-risk fusion-risk-${selected.riskLevel || 'unknown'}`}>{formatRiskLevel(selected.riskLevel)}</strong>
                    </div>
                    <div>
                      <span>風報比</span>
                      <strong>{selected.riskReward != null ? `${safeFixed(selected.riskReward, 2)}x` : '--'}</strong>
                    </div>
                    <div>
                      <span>防守 / 觸發</span>
                      <strong>{selected.triggerPrice || formatNumber(Number(selected.stopLoss), 2)}</strong>
                    </div>
                  </div>
                  <p className="fusion-decision-note">{selected.decisionNote || '等待更多資料確認。'}</p>
                  <div className="fusion-tags">
                    {selected.signalTags?.slice(0, 5).map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                    {selected.qualityWarnings?.slice(0, 3).map((warning) => (
                      <span key={warning} className="fusion-warning-tag">{warning}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="fusion-column">
              <div className="fusion-source-card">
                <div className="panel-subhead">
                  <div>
                    <p>來源健康</p>
                    <h3>候選資料供應鏈</h3>
                  </div>
                  <span>{sourceHealth.length}</span>
                </div>
                {sourceHealth.length === 0 ? (
                  <p className="panel-empty">等待資料來源回報。</p>
                ) : (
                  <div className="fusion-source-list">
                    {sourceHealth.map((item) => (
                      <div key={item.id} className={`fusion-source-row ${item.status}`}>
                        <span>
                          <b>{formatSourceLabel(item.label)}</b>
                          <em>{item.latencyMs ? `${item.latencyMs}ms` : 'local'}</em>
                        </span>
                        <strong>{item.rows}</strong>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="fusion-series-card">
                <div className="panel-subhead">
                  <div>
                    <p>盤中序列</p>
                    <h3>{selected?.ticker || normalizedTicker} 的最近觀測</h3>
                  </div>
                  <span>{recentSeries.length}</span>
                </div>
                {recentSeries.length === 0 ? (
                  <p className="panel-empty">等待 SQLite 或快照建立盤中觀測。</p>
                ) : (
                  <div className="fusion-series-list">
                    {recentSeries.map((point) => (
                      <div key={`${point.ticker}-${point.generatedAt}`}>
                        <span>{new Date(point.generatedAt).toLocaleTimeString('zh-TW', { hour12: false, hour: '2-digit', minute: '2-digit' })}</span>
                        <strong>{point.fusionScore != null ? safeFixed(point.fusionScore, 1) : '--'}</strong>
                        <em>{point.rank != null ? `#${point.rank}` : '--'}</em>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="fusion-capsule">
                <div className="fusion-capsule-head">
                  <Radar size={16} />
                  <span>決策提醒</span>
                </div>
                <p>
                  {core?.warnings?.length
                    ? core.warnings[0]
                    : topFusion
                      ? `目前最高分候選是 ${topFusion.ticker}，先看觸發價、防守價與資料品質。`
                      : '暫無可用融合候選，請先刷新或切回台股查驗。'}
                </p>
                <div className="fusion-capsule-actions">
                  <Link href="/liangjia-warroom">打開融合完整版</Link>
                  <button type="button" onClick={() => { void refresh(); }}>重新抓取</button>
                </div>
              </div>
            </div>
          </div>

          <div className="fusion-footnote">
            <ShieldCheck size={14} />
            <span>此模組只把可交易候選、觸發/防守、量價與資料品質放進主排行；持倉、自選與 REPORT_TEXT 已降級為非候選資料。</span>
          </div>
        </>
      )}
    </section>
  );
}
