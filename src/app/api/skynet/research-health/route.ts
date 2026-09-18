import { NextResponse } from 'next/server';
import manifest from '@/data/research-os/manifest.json';
import backtest from '@/data/research-os/backtest-latest.json';
import structureBacktest from '@/data/research-os/structure-backtest-latest.json';
import universe from '@/data/research-os/universe-current.json';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    generatedAt: manifest.generatedAt,
    universe: {
      count: universe.rows.length,
      sourceDate: universe.rows[0]?.sourceDate || null,
      method: universe.method,
    },
    validation: {
      trialId: backtest.trialId,
      method: backtest.method,
      champion: backtest.champion,
      challenger: backtest.challenger,
      promotion: backtest.promotion,
    },
    structureFirstShadow: {
      version: 'STRUCTURE_FIRST_SHADOW_V1',
      hypothesisId: structureBacktest.hypothesisId,
      trialId: structureBacktest.trialId,
      method: structureBacktest.method,
      champion: structureBacktest.champion,
      challenger: structureBacktest.challenger,
      promotion: structureBacktest.promotion,
      deploymentDecision: structureBacktest.deploymentDecision,
    },
    safeguards: {
      publicCalibrationMinimumTotal: 300,
      publicCalibrationMinimumPerBand: 100,
      slowFactors: 'shadow',
      fillRule: 'next_quote_after_alert',
      automaticOrder: false,
      correlatedMomentumVotes: 'deduplicated',
      atrDirectionalWeight: 0,
    },
  }, { headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300' } });
}
