// src/index.js
import 'dotenv/config';
import { runExhaustionScan, runTrendScan } from './scanner.js';
import { ping } from './binance.js';
import { EXHAUSTION_DEFAULTS, TREND_DEFAULTS } from './config.js';
import { sendTelegram, sendScanSummary, sendSetupAlert } from './telegram.js';

const CONFIG = {
  SCAN_INTERVAL_MS: parseInt(process.env.SCAN_INTERVAL_MS || '3600000'),
  SCAN_MODE: process.env.SCAN_MODE || 'both',
  EX_TF:        process.env.EX_TF        || EXHAUSTION_DEFAULTS.tf,
  EX_ENTRY_TF:  process.env.EX_ENTRY_TF  || EXHAUSTION_DEFAULTS.entryTfSetting,
  EX_COINS:     parseInt(process.env.EX_COINS     || EXHAUSTION_DEFAULTS.coins),
  EX_MIN_SCORE: parseInt(process.env.EX_MIN_SCORE || EXHAUSTION_DEFAULTS.minScore),
  EX_RSI_OB:    parseInt(process.env.EX_RSI_OB    || EXHAUSTION_DEFAULTS.rsiOB),
  EX_DIST_PCT:  parseInt(process.env.EX_DIST_PCT  || EXHAUSTION_DEFAULTS.distPct),
  TR_TF:        process.env.TR_TF        || TREND_DEFAULTS.tf,
  TR_ENTRY_TF:  process.env.TR_ENTRY_TF  || TREND_DEFAULTS.entryTfSetting,
  TR_COINS:     parseInt(process.env.TR_COINS     || TREND_DEFAULTS.coins),
  TR_MIN_SCORE: parseInt(process.env.TR_MIN_SCORE || TREND_DEFAULTS.minScore),
  TR_RSI_OS:    parseInt(process.env.TR_RSI_OS    || TREND_DEFAULTS.rsiOS),
  TR_MA_PERIODS: (process.env.TR_MA_PERIODS || '50-100-200').split('-').map(Number),
  ALERT_MIN_SCORE: parseInt(process.env.ALERT_MIN_SCORE || '60'),
};

const fmt  = (n, d = 2) => (n == null || isNaN(n)) ? '—' : Number(n).toFixed(d);
const fmtV = v => !v ? '—' : v >= 1e9 ? (v/1e9).toFixed(1)+'B' : v >= 1e6 ? (v/1e6).toFixed(1)+'M' : v >= 1e3 ? (v/1e3).toFixed(1)+'K' : v.toFixed(0);

async function runCycle() {
  const timestamp = new Date().toISOString();
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  HKBR SCANNER — ${timestamp}`);
  console.log(`${'═'.repeat(60)}`);

  const allResults = { exhaustion: [], trend: [] };

  // ── EXHAUSTION SCAN ──────────────────────────────────────────
  if (CONFIG.SCAN_MODE === 'both' || CONFIG.SCAN_MODE === 'exhaustion') {
    console.log(`\n◈ EXHAUSTION SCAN (TF:${CONFIG.EX_TF})`);
    try {
      const results = await runExhaustionScan({
        tf: CONFIG.EX_TF,
        entryTfSetting: CONFIG.EX_ENTRY_TF,
        coins: CONFIG.EX_COINS,
        minScore: CONFIG.EX_MIN_SCORE,
        rsiOB: CONFIG.EX_RSI_OB,
        distPct: CONFIG.EX_DIST_PCT,
      });
      allResults.exhaustion = results;

      const shorts    = results.filter(r => r.dir === 'SHORT').length;
      const longs     = results.filter(r => r.dir === 'LONG').length;
      const inception = results.filter(r => r.isInception).length;
      const entryRdy  = results.filter(r => r.entryReady).length;

      console.log(`  Found ${results.length} setups (${shorts} SHORT · ${longs} LONG · ${inception} INCEPTION · ${entryRdy} ENTRY READY)`);
      results.forEach((r, i) => {
        const td = r.tdCD >= 13 ? 'CD13' : r.tdCD > 0 ? `C${r.tdCD}/13` : r.tdPerfect ? 'TD9★' : `TD${r.tdCount}`;
        console.log(`  ${i+1}. [${r.score}] ${r.label} ${r.dir} ${td} RSI:${r.entryRsi ?? r.rsi ?? '—'}`);
      });

      // Send Telegram alerts for high-score setups
      const topSetups = results.filter(r => r.score >= CONFIG.ALERT_MIN_SCORE);
      for (const setup of topSetups) {
        await sendSetupAlert(setup, 'exhaustion');
      }
      await sendScanSummary('EXHAUSTION', results, CONFIG.ALERT_MIN_SCORE);

    } catch (e) {
      console.error('  [EX] Scan failed:', e.message);
      await sendTelegram(`⚠️ Exhaustion scan error: ${e.message}`);
    }
  }

  // ── TREND SCAN ───────────────────────────────────────────────
  if (CONFIG.SCAN_MODE === 'both' || CONFIG.SCAN_MODE === 'trend') {
    console.log(`\n◈ TREND ENTRY SCAN (TF:${CONFIG.TR_TF})`);
    try {
      const results = await runTrendScan({
        tf: CONFIG.TR_TF,
        entryTfSetting: CONFIG.TR_ENTRY_TF,
        coins: CONFIG.TR_COINS,
        minScore: CONFIG.TR_MIN_SCORE,
        rsiOS: CONFIG.TR_RSI_OS,
        maPeriods: CONFIG.TR_MA_PERIODS,
      });
      allResults.trend = results;

      const bulls = results.filter(r => r.dir === 'BULL').length;
      const bears = results.filter(r => r.dir === 'BEAR').length;

      console.log(`  Found ${results.length} entries (${bulls} BULL · ${bears} BEAR)`);
      results.forEach((r, i) => {
        console.log(`  ${i+1}. [${r.score}] ${r.label} ${r.dir} PB:${fmt(r.pullbackPct,2)}% RSI:${r.entryRsi ?? '—'}`);
      });

      // Send Telegram alerts for high-score trend entries
      const topSetups = results.filter(r => r.score >= CONFIG.ALERT_MIN_SCORE);
      for (const setup of topSetups) {
        await sendSetupAlert(setup, 'trend');
      }
      await sendScanSummary('TREND', results, CONFIG.ALERT_MIN_SCORE);

    } catch (e) {
      console.error('  [TR] Scan failed:', e.message);
      await sendTelegram(`⚠️ Trend scan error: ${e.message}`);
    }
  }

  console.log(`\n  Next scan in ${CONFIG.SCAN_INTERVAL_MS / 60000} minutes`);
  console.log(`${'═'.repeat(60)}\n`);
}

async function main() {
  console.log('HKBR Crypto Scanner Bot starting...');

  try {
    const ok = await ping();
    if (!ok) throw new Error('Ping failed');
    console.log('✓ Binance FAPI connected');
  } catch (e) {
    console.error('✗ Cannot reach Binance:', e.message);
  }

  await sendTelegram('🚀 HKBR Scanner Bot started! Running first scan now...');
  await runCycle();

  setInterval(async () => {
    try { await runCycle(); }
    catch (e) { console.error('Cycle error:', e); }
  }, CONFIG.SCAN_INTERVAL_MS);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
