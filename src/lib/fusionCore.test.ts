import { buildFusionStocks, type BattleReport, type LiaoCandidate } from './fusionCore';

const strongBuy: BattleReport = {
  ticker: '2330',
  name: '台積電',
  action: 'BUY',
  confidence: 82,
  price: '100',
  target: '108',
  stopLoss: '96',
};

const strongLiao: LiaoCandidate = {
  symbol: '2330',
  name: '台積電',
  points: 18,
  price: 100,
  open: 99,
  diff: 2.4,
  change_pct: 1.8,
  volume: 20000,
  prev_volume: 12000,
  volume_ratio: 1.67,
  amount: 2,
  stop_loss: 96,
  chief_net: 1200,
  rank_score: 220,
};

describe('buildFusionStocks execution scoring', () => {
  it('keeps single-source BUY in observation instead of executable', () => {
    const stocks = buildFusionStocks({
      reports: [strongBuy],
      positions: [],
      snipers: [],
      liaoCandidates: [],
    });

    expect(stocks[0].decisionLabel).not.toBe('可執行');
    expect(stocks[0].riskLevel).toBe('high');
    expect(stocks[0].qualityWarnings).toContain('single_source_signal');
    expect(stocks[0].calibratedConfidence).toBeLessThan(strongBuy.confidence);
  });

  it('prioritizes cross-source technically confirmed BUY candidates', () => {
    const weakSingleSource: BattleReport = {
      ticker: '2317',
      name: '鴻海',
      action: 'BUY',
      confidence: 90,
      price: '100',
      target: '104',
      stopLoss: '98',
    };

    const stocks = buildFusionStocks({
      reports: [weakSingleSource, strongBuy],
      positions: [],
      snipers: [],
      liaoCandidates: [strongLiao],
    });

    expect(stocks[0].ticker).toBe('2330');
    expect(stocks[0].decisionLabel).toBe('可執行');
    expect(stocks[0].executionScore).toBeGreaterThan(stocks[1].executionScore ?? 0);
    expect(stocks[0].riskLevel).not.toBe('high');
  });

  it('labels non-BUY weak signals as observation instead of defensive action', () => {
    const stocks = buildFusionStocks({
      reports: [],
      positions: [],
      snipers: [],
      liaoCandidates: [{ ...strongLiao, symbol: '2303', name: '聯電' }],
    });

    expect(stocks[0].skynetAction).toBeUndefined();
    expect(stocks[0].riskLevel).toBe('high');
    expect(stocks[0].decisionLabel).toBe('觀察等觸發');
  });

  it('blocks executable BUY when price is far above fair value', () => {
    const expensiveBuy: BattleReport = {
      ...strongBuy,
      fairValue: 70,
      fairValueModelCount: 13,
      fairValueConfidence: 'medium',
    };

    const stocks = buildFusionStocks({
      reports: [expensiveBuy],
      positions: [],
      snipers: [],
      liaoCandidates: [strongLiao],
    });

    expect(stocks[0].decisionLabel).toBe('防守優先');
    expect(stocks[0].riskLevel).toBe('high');
    expect(stocks[0].qualityWarnings).toContain('fair_value_overvalued');
    expect(stocks[0].fairValueSignal).toBe('OVERVALUED');
  });

  it('keeps near-fair holdings from being framed as panic sell by valuation alone', () => {
    const nearFairBuy: BattleReport = {
      ...strongBuy,
      fairValue: 101,
      fairValueModelCount: 17,
      fairValueConfidence: 'high',
    };

    const stocks = buildFusionStocks({
      reports: [nearFairBuy],
      positions: [],
      snipers: [],
      liaoCandidates: [strongLiao],
    });

    expect(stocks[0].fairValueSignal).toBe('NEAR_FAIR');
    expect(stocks[0].fairValueNote).toContain('不支持恐慌砍倉');
    expect(stocks[0].qualityWarnings).not.toContain('fair_value_overvalued');
  });

  it('filters report-text rows out of tradable fusion candidates', () => {
    const stocks = buildFusionStocks({
      reports: [
        {
          ticker: 'REPORT',
          name: '推送晨間報告_LINE',
          action: 'REPORT_TEXT',
          confidence: 0,
          reason: '晨間文字摘要不是可交易股票候選。',
        },
        strongBuy,
      ],
      positions: [],
      snipers: [],
      liaoCandidates: [strongLiao],
    });

    expect(stocks.map((stock) => stock.ticker)).toContain('2330');
    expect(stocks.map((stock) => stock.ticker)).not.toContain('REPORT');
  });

  it('does not let positions create main fusion candidates by default', () => {
    const stocks = buildFusionStocks({
      reports: [],
      positions: [{
        ticker: '2317',
        name: '鴻海',
        shares: 1000,
        avgCost: 100,
        currentPrice: 105,
      }],
      snipers: [],
      liaoCandidates: [],
    });

    expect(stocks).toHaveLength(0);
  });
});
