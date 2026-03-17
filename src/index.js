
// src/index.js
import 'dotenv/config';
import { runExhaustionScan, runTrendScan } from './scanner.js';
import { ping } from './binance.js';
import { EXHAUSTION_DEFAULTS, TREND_DEFAULTS } from './config.js';
import { sendTelegram, sendScanSummary, sendSetupAlert } from './telegram.js';
import { startDashboard, updateDashboard } from './dashboard.js';

const PORT = parseInt(process.env.PORT || '3000');

const CONFIG = {
  SCAN_INTERVAL_MS:  parseInt(process.env.SCAN_INTERVAL_MS  || '3600000'),
  SCAN_MODE:         process.env.SCAN_MODE || 'both',
  EX_TF:             process.env.EX_TF        || EXHAUSTION_DEFAULTS.tf,
  EX_ENTRY_TF:       process.env.EX_ENTRY_TF  || EXHAUSTION_DEFAULTS.entryTfSetting,
  EX_COINS:          parseInt(process.env.EX_COINS     || EXHAUSTION_DEFAULTS.coins),
  EX_MIN_SCORE:      parseInt(process.env.EX_MIN_SCORE || EXHAUSTION_DEFAULTS.minScore),
  EX_RSI_OB:         parseInt(process.env.EX_RSI_OB    || EXHAUSTION_DEFAULTS.rsiOB),
  EX_DIST_PCT:       parseInt(process.env.EX_DIST_PCT  || EXHAUSTION_DEFAULTS.distPct),
  TR_TF:             process.env.TR_TF        || TREND_DEFAULTS.tf,
  TR_ENTRY_TF:       process.env.TR_ENTRY_TF  || TREND_DEFAULTS.entryTfSetting,
  TR_COINS:          parseInt(process.env.TR_COINS     || TREND_DEFAULTS.coins),
  TR_MIN_SCORE:      parseInt(process.env.TR_MIN_SCORE || TREND_DEFAULTS.minScore),
  TR_RSI_OS:         parseInt(process.env.TR_RSI_OS    || TREND_DEFAULTS.rsiOS),
  TR_MA_PERIODS:     (process.env.TR_MA_PERIODS || '50-100-200').split('-').map(Number),
  ALERT_MIN_SCORE:   parseInt(process.env.ALERT_MIN_SCORE || '60'),
};

const fmt = (n, d = 2) => (n == null || isNaN(n)) ? '—' : Number(n).toFixed(d);
let scanCount = 0;

async function runCycle() {
  scanCount++;
  const timestamp  = new Date().toLocaleString();
  const nextScanAt = new Date(Date.now() + CONFIG.SCAN_INTERVAL_MS).toLocaleString();

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  HKBR SCANNER — Scan #${scanCount} — ${timestamp}`);
  console.log(`${'═'.repeat(60)}`);

  updateDashboard({ status: `Scanning... (#${scanCount})`, nextScan: nextScanAt, scanCount });

  let exResults = [];
  let trResults = [];

  // ── EXHAUSTION SCAN ────────────────────────────────────────────
  if (CONFIG.SCAN_MODE === 'both' || CONFIG.SCAN_MODE === 'exhaustion') {
    console.log(`\n◈ EXHAUSTION SCAN (TF:${CONFIG.EX_TF})`);
    updateDashboard({ status: `Running exhaustion scan...` });
    try {
      exResults = await runExhaustionScan({
        tf:             CONFIG.EX_TF,
        entryTfSetting: CONFIG.EX_ENTRY_TF,
        coins:          CONFIG.EX_COINS,
        minScore:       CONFIG.EX_MIN_SCORE,
        rsiOB:          CONFIG.EX_RSI_OB,
        distPct:        CONFIG.EX_DIST_PCT,
      });

      const shorts    = exResults.filter(r => r.dir === 'SHORT').length;
      const longs     = exResults.filter(r => r.dir === 'LONG').length;
      const inception = exResults.filter(r => r.isInception).length;
      console.log(`  Found ${exResults.length} setups (${shorts} SHORT · ${longs} LONG · ${inception} INCEPTION)`);

      // Telegram alerts for top setups
      const topSetups = exResults.filter(r => r.score >= CONFIG.ALERT_MIN_SCORE);
      for (const setup of topSetups) {
        await sendSetupAlert(setup, 'exhaustion');
      }
      await sendScanSummary('EXHAUSTION', exResults, CONFIG.ALERT_MIN_SCORE);

    } catch (e) {
      console.error('  [EX] Scan failed:', e.message);
      await sendTelegram(`⚠️ Exhaustion scan error: ${e.message}`);
    }
  }

  // ── TREND SCAN ─────────────────────────────────────────────────
  if (CONFIG.SCAN_MODE === 'both' || CONFIG.SCAN_MODE === 'trend') {
    console.log(`\n◈ TREND ENTRY SCAN (TF:${CONFIG.TR_TF})`);
    updateDashboard({ status: `Running trend scan...` });
    try {
      trResults = await runTrendScan({
        tf:             CONFIG.TR_TF,
        entryTfSetting: CONFIG.TR_ENTRY_TF,
        coins:          CONFIG.TR_COINS,
        minScore:       CONFIG.TR_MIN_SCORE,
        rsiOS:          CONFIG.TR_RSI_OS,
        maPeriods:      CONFIG.TR_MA_PERIODS,
      });

      const bulls = trResults.filter(r => r.dir === 'BULL').length;
      const bears = trResults.filter(r => r.dir === 'BEAR').length;
      console.log(`  Found ${trResults.length} entries (${bulls} BULL · ${bears} BEAR)`);

      const topSetups = trResults.filter(r => r.score >= CONFIG.ALERT_MIN_SCORE);
      for (const setup of topSetups) {
        await sendSetupAlert(setup, 'trend');
      }
      await sendScanSummary('TREND', trResults, CONFIG.ALERT_MIN_SCORE);

    } catch (e) {
      console.error('  [TR] Scan failed:', e.message);
      await sendTelegram(`⚠️ Trend scan error: ${e.message}`);
    }
  }

  // ── UPDATE DASHBOARD ───────────────────────────────────────────
  updateDashboard({
    exhaustion: exResults,
    trend:      trResults,
    lastScan:   timestamp,
    nextScan:   nextScanAt,
    status:     `Idle — last scan #${scanCount} at ${timestamp}`,
    scanCount,
  });

  console.log(`\n  ✓ Cycle #${scanCount} complete · Next scan at ${nextScanAt}`);
  console.log(`${'═'.repeat(60)}\n`);
}

async function main() {
  console.log('HKBR Crypto Scanner Bot starting...');

  // Start dashboard server first so Railway health checks pass immediately
  startDashboard(PORT);

  // Verify Binance connectivity
  try {
    const ok = await ping();
    if (!ok) throw new Error('Ping failed');
    console.log('✓ Binance FAPI connected');
  } catch (e) {
    console.error('✗ Cannot reach Binance:', e.message);
  }

  // Notify Telegram on startup
  await sendTelegram(`🚀 <b>HKBR Scanner Bot started!</b>\nRunning first scan now...\nDashboard is live on Railway.`);

  // Run immediately then on interval
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
