// src/config.js

export function resolveEntryTf(primary, setting) {
  if (setting === 'off') return null;
  if (setting !== 'auto') return setting;
  return { '1w': '1d', '1d': '4h', '4h': '1h', '1h': '15m' }[primary] || null;
}

export function tfToLimit(tf, n = 0) {
  return Math.max(n, { '1w': 52, '1d': 120, '4h': 120, '1h': 100, '15m': 100 }[tf] || 120);
}

export const CATS = {
  MEGA:   ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'],
  LAYER1: ['AVAXUSDT', 'ADAUSDT', 'DOTUSDT', 'ATOMUSDT', 'NEARUSDT', 'APTUSDT', 'SUIUSDT', 'INJUSDT', 'SEIUSDT', 'TONUSDT'],
  LAYER2: ['MATICUSDT', 'ARBUSDT', 'OPUSDT', 'STRKUSDT', 'LINKEAUSDT', 'ZKUSDT'],
  DEFI:   ['UNIUSDT', 'AAVEUSDT', 'MKRUSDT', 'CRVUSDT', 'COMPUSDT', 'LDOUSDT', 'PENUSDT'],
  AI:     ['FETUSDT', 'AGIXUSDT', 'RENDERUSDT', 'TAOUSDT', 'WLDUSDT'],
  MEME:   ['DOGEUSDT', 'SHIBUSDT', 'PEPEUSDT', 'BONKUSDT', 'WIFUSDT'],
};

export const DEFAULT_CAT_STATE = {
  MEGA: true, LAYER1: true, LAYER2: true, DEFI: true, AI: true, MEME: true,
};

export function isInActiveCategory(sym, catState) {
  const state = catState || DEFAULT_CAT_STATE;
  const inactive = Object.entries(state).filter(([, v]) => !v).map(([k]) => k);
  if (!inactive.length) return true;
  const allCatSyms = Object.values(CATS).flat();
  if (!allCatSyms.includes(sym)) return true;
  const active = Object.entries(state).filter(([, v]) => v).map(([k]) => k);
  return active.some(cat => CATS[cat]?.includes(sym));
}

export const EXHAUSTION_DEFAULTS = {
  tf: '1d',
  entryTfSetting: 'auto',
  coins: 100,
  minScore: 40,
  rsiOB: 65,
  distPct: 10,
};

export const TREND_DEFAULTS = {
  tf: '1d',
  entryTfSetting: 'auto',
  coins: 100,
  minScore: 40,
  rsiOS: 40,
  maPeriods: [50, 100, 200],
};

// ─── CANDLE CLOSE SCHEDULER ──────────────────────────────────────────────────
// Binance candles close on UTC boundaries:
//   Daily  → closes at 00:00 UTC every day
//   4H     → closes at 00:00, 04:00, 08:00, 12:00, 16:00, 20:00 UTC
// We wait 5 minutes after close to ensure data is settled.
// Returns milliseconds until the next scheduled scan for a given timeframe.

export function msUntilNextScan(tf) {
  const now = new Date();
  const utcH = now.getUTCHours();
  const utcM = now.getUTCMinutes();
  const utcS = now.getUTCSeconds();
  const utcMs = now.getUTCMilliseconds();

  // Total milliseconds elapsed in the current day
  const msIntoDay = ((utcH * 60 + utcM) * 60 + utcS) * 1000 + utcMs;
  const msPerDay  = 24 * 60 * 60 * 1000;
  const msPerHour =       60 * 60 * 1000;
  const OFFSET_MS = 5 * 60 * 1000; // 5 minute buffer after candle close

  if (tf === '1d') {
    // Next scan = next 00:05 UTC
    const nextScanMs = OFFSET_MS; // 00:05 UTC = 5 min into the day
    const msUntil = nextScanMs > msIntoDay
      ? nextScanMs - msIntoDay
      : msPerDay - msIntoDay + nextScanMs;
    return msUntil;
  }

  if (tf === '4h') {
    // 4H candles close at 0,4,8,12,16,20 UTC — scan at :05 past each
    const closeHours = [0, 4, 8, 12, 16, 20];
    const scanTimes  = closeHours.map(h => h * msPerHour + OFFSET_MS);
    // Find the next scan time after now
    const next = scanTimes.find(t => t > msIntoDay);
    if (next !== undefined) return next - msIntoDay;
    // Wrap to next day
    return msPerDay - msIntoDay + scanTimes[0];
  }

  // Fallback: 1 hour
  return msPerHour;
}

export function nextScanTimeString(tf) {
  const ms = msUntilNextScan(tf);
  const next = new Date(Date.now() + ms);
  return next.toUTCString();
}
