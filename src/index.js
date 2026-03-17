// src/index.js
import 'dotenv/config';
import { runExhaustionScan, runTrendScan } from './scanner.js';
import { ping } from './binance.js';
import { EXHAUSTION_DEFAULTS, TREND_DEFAULTS, msUntilNextScan, nextScanTimeString } from './config.js';
import { sendTelegram, sendScanSummary, sendSetupAlert } from './telegram.js';
import { startDashboard, updateDashboard } from './dashboard.js';

const PORT = parseInt(process.env.PORT || '3000');

const CONFIG = {
  SCAN_MODE:       process.env.SCAN_MODE || 'both',
  EX_TF:           process.env.EX_TF        || EXHAUSTION_DEFAULTS.tf,
  EX_ENTRY_TF:     process.env.EX_ENTRY_TF  || EXHAUSTION_DEFAULTS.entryTfSetting,
  EX_COINS:        parseInt(process.env.EX_COINS     || EXHAUSTION_DEFAULTS.coins),
  EX_MIN_SCORE:    parseInt(process.env.EX_MIN_SCORE || EXHAUSTION_DEFAULTS.minScore),
  EX_RSI_OB:       parseInt(process.env.EX_RSI_OB    || EXHAUSTION_DEFAULTS.rsiOB),
  EX_DIST_PCT:     parseInt(process.env.EX_DIST_PCT  || EXHAUSTION_DEFAULTS.distPct),
  TR_TF:           process.env.TR_TF        || TREND_DEFAULTS.tf,
  TR_ENTRY_TF:     process.env.TR_ENTRY_TF  || TREND_DEFAULTS.entryTfSetting,
  TR_COINS:        parseInt(process.env.TR_COINS     || TREND_DEFAULTS.coins),
  TR_MIN_SCORE:    parseInt(process.env.TR_MIN_SCORE || TREND_DEFAULTS.minScore),
  TR_RSI_OS:       parseInt(process.env.TR_RSI_OS    || TREND_DEFAULTS.rsiOS),
  TR_MA_PERIODS:   (process.env.TR_MA_PERIODS || '50-100-200').split('-').map(Number),
  ALERT_MIN_SCORE: parseInt(process.env.ALERT_MIN_SCORE || '60'),
};

let scanCount = 0;

// ─── SCAN CYCLE ──────────────────────────────────────────────────────────────
async function runCycle(triggerTf) {
  scanCount++;
  const timestamp = new Date().toUTCString();
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  HKBR SCANNER — Scan #${scanCount} — ${timestamp}`);
  console.log(`  Triggered by: ${triggerTf.toUpperCase()} candle close`);
  console.log(`${'═'.repeat(60)}`);

  updateDashboard({ status: `Scanning ${triggerTf.toUpperCase()} close (#${scanCount})...`, scanCount });

  let exResults = [];
  let trResults = [];

  // ── EXHAUSTION SCAN ────────────────────────────────────────────
  if (CONFIG.SCAN_MODE === 'both' || CONFIG.SCAN_MODE === 'exhaustion') {
    // For exhaustion: use the triggered TF
    const exTf = triggerTf;
    console.log(`\n◈ EXHAUSTION SCAN (TF:${exTf})`);
    updateDashboard({ status: `Running ${exTf.toUpperCase()} exhaustion scan...` });
    try {
      exResults = await runExhaustionScan({
        tf:             exTf,
        entryTfSetting: CONFIG.EX_ENTRY_TF,
        coins:          CONFIG.EX_COINS,
        minScore:       CONFIG.EX_MIN_SCORE,
        rsiOB:          CONFIG.EX_RSI_OB,
        distPct:        CONFIG.EX_DIST_PCT,
      });
      const shorts    = exResults.filter(r => r.dir === 'SHORT').length;
      const longs     = exResults.filter(r => r.dir === 'LONG').length;
      const inception = exResults.filter(r => r.isInception).length;
      const entryRdy  = exResults.filter(r => r.entryReady).length;
      console.log(`  Found ${exResults.length} setups (${shorts} SHORT · ${longs} LONG · ${inception} INCEPTION · ${entryRdy} ENTRY READY)`);

      const topSetups = exResults.filter(r => r.score >= CONFIG.ALERT_MIN_SCORE);
      for (const setup of topSetups) {
        await sendSetupAlert(setup, 'exhaustion');
      }
      await sendScanSummary('EXHAUSTION', exResults, CONFIG.ALERT_MIN_SCORE);
    } catch (e) {
      console.error('  [EX] Scan failed:', e.message);
      console.error('  [EX] Stack:', e.stack);
      await sendTelegram(`⚠️ Exhaustion scan error: ${e.message}`);
    }
  }

  // ── TREND SCAN ─────────────────────────────────────────────────
  if (CONFIG.SCAN_MODE === 'both' || CONFIG.SCAN_MODE === 'trend') {
    // For trend: use the triggered TF
    const trTf = triggerTf;
    console.log(`\n◈ TREND ENTRY SCAN (TF:${trTf})`);
    updateDashboard({ status: `Running ${trTf.toUpperCase()} trend scan...` });
    try {
      trResults = await runTrendScan({
        tf:             trTf,
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
      console.error('  [TR] Stack:', e.stack);
      await sendTelegram(`⚠️ Trend scan error: ${e.message}`);
    }
  }

  // ── UPDATE DASHBOARD ───────────────────────────────────────────
  const nextDaily = nextScanTimeString('1d');
  const next4H    = nextScanTimeString('4h');
  updateDashboard({
    exhaustion: exResults,
    trend:      trResults,
    lastScan:   `${timestamp} (${triggerTf.toUpperCase()} close)`,
    nextScan:   `Daily: ${nextDaily} · 4H: ${next4H}`,
    status:     `Idle — waiting for next candle close`,
    scanCount,
  });

  console.log(`\n  ✓ Cycle #${scanCount} complete`);
  console.log(`  Next daily scan: ${nextDaily}`);
  console.log(`  Next 4H scan:    ${next4H}`);
  console.log(`${'═'.repeat(60)}\n`);
}

// ─── CANDLE CLOSE SCHEDULER ──────────────────────────────────────────────────
// Schedules the next scan for a given timeframe, then reschedules itself.
function scheduleNext(tf) {
  const ms = msUntilNextScan(tf);
  const nextTime = nextScanTimeString(tf);
  const mins = Math.round(ms / 60000);
  console.log(`[SCHEDULER] Next ${tf.toUpperCase()} scan in ${mins} min (${nextTime})`);

  setTimeout(async () => {
    try {
      await runCycle(tf);
    } catch (e) {
      console.error(`[SCHEDULER] ${tf} cycle error:`, e.message);
      await sendTelegram(`⚠️ ${tf} cycle error: ${e.message}`);
    }
    // Schedule the next one after this one completes
    scheduleNext(tf);
  }, ms);
}

// ─── MAIN ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('HKBR Crypto Scanner Bot starting...');
  console.log('Candle-close aligned scheduler active');
  console.log('Daily scans: 00:05 UTC');
  console.log('4H scans:    00:05, 04:05, 08:05, 12:05, 16:05, 20:05 UTC');

  // Start dashboard immediately so Railway health checks pass
  startDashboard(PORT);

  // Verify Binance connectivity
  try {
    const ok = await ping();
    if (!ok) throw new Error('Ping failed');
    console.log('✓ Binance FAPI connected');
  } catch (e) {
    console.error('✗ Cannot reach Binance:', e.message);
  }

  // Send startup message with next scan times
  const nextDaily = nextScanTimeString('1d');
  const next4H    = nextScanTimeString('4h');
  await sendTelegram(
    `🚀 <b>HKBR Scanner Bot started!</b>\n\n` +
    `📅 Candle-close aligned scanning active\n` +
    `⏰ Next daily scan: ${nextDaily}\n` +
    `⏰ Next 4H scan: ${next4H}\n\n` +
    `Running initial scan now...`
  );

  // Run one immediate scan on startup so dashboard isn't empty
  await runCycle('1d');

  // Schedule ongoing candle-close aligned scans
  scheduleNext('1d');
  scheduleNext('4h');
}

main().catch(e => {
  console.error('Fatal error:', e.stack);
  process.exit(1);
});
