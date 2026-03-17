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

export function isInActiveCategory(sym, catState = DEFAULT_CAT_STATE) {
  const inactive = Object.entries(catState).filter(([, v]) => !v).map(([k]) => k);
  if (!inactive.length) return true;
  const allCatSyms = Object.values(CATS).flat();
  if (!allCatSyms.includes(sym)) return true;
  const active = Object.entries(catState).filter(([, v]) => v).map(([k]) => k);
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
