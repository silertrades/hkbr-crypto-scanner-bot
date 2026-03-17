// src/indicators.js

export function calcRSI(bars, p = 14) {
  if (!bars || bars.length < p + 1) return null;
  const cls = bars.map(b => b.c);
  let ag = 0, al = 0;
  for (let i = 1; i <= p; i++) {
    const d = cls[i] - cls[i - 1];
    if (d >= 0) ag += d; else al += Math.abs(d);
  }
  ag /= p; al /= p;
  for (let i = p + 1; i < cls.length; i++) {
    const d = cls[i] - cls[i - 1];
    ag = (ag * (p - 1) + (d > 0 ? d : 0)) / p;
    al = (al * (p - 1) + (d < 0 ? Math.abs(d) : 0)) / p;
  }
  return al === 0 ? 100 : Math.round((100 - (100 / (1 + ag / al))) * 10) / 10;
}

export function calcRSISlope(bars, period = 14, lookback = 3) {
  if (!bars || bars.length < period + lookback + 2) return null;
  const rsiNow  = calcRSI(bars);
  const rsiPrev = calcRSI(bars.slice(0, -lookback));
  if (rsiNow === null || rsiPrev === null) return null;
  return Math.round((rsiNow - rsiPrev) * 10) / 10;
}

export function calcBB(bars, p = 20, mult = 2) {
  if (!bars || bars.length < p) return null;
  const cls = bars.slice(-p).map(b => b.c);
  const sma  = cls.reduce((a, b) => a + b, 0) / p;
  const sd   = Math.sqrt(cls.reduce((a, b) => a + Math.pow(b - sma, 2), 0) / p);
  const upper = sma + mult * sd;
  const lower = sma - mult * sd;
  const cur   = bars[bars.length - 1].c;
  const width = (upper - lower) / sma * 100;
  const pos   = (upper - lower) > 0 ? (cur - lower) / (upper - lower) : 0.5;
  return {
    upper, lower, sma,
    width: Math.round(width * 100) / 100,
    pos,
    isRanging:  width < 2.5,
    nearUpper:  pos > 0.88,
    nearLower:  pos < 0.12,
  };
}

export function calcMAs(bars, periods) {
  const cur = bars[bars.length - 1].c;
  const result = { cur };
  periods.forEach(p => {
    if (bars.length < p) { result[p] = null; return; }
    result[p] = bars.slice(-p).reduce((a, b) => a + b.c, 0) / p;
  });
  return result;
}

export function analyzeMAs(bars, periods) {
  if (!bars || bars.length < Math.max(...periods) + 5) return null;
  const mas = calcMAs(bars, periods);
  const cur = mas.cur;
  const [f, m, s] = periods;
  if (!mas[f] || !mas[m] || !mas[s]) return null;

  const bull = mas[f] > mas[m] && mas[m] > mas[s];
  const bear = mas[f] < mas[m] && mas[m] < mas[s];

  const maSlope5 = bars.length >= f + 5
    ? (bars.slice(-f).reduce((a, b) => a + b.c, 0) / f
       - bars.slice(-f - 5, -5).reduce((a, b) => a + b.c, 0) / f) / mas[f] * 100
    : 0;
  const fastMASlopingCorrectly = bull ? maSlope5 > -3 : maSlope5 < 3;

  const n10 = Math.min(10, bars.length - 1);
  const price10barsAgo = bars[bars.length - 1 - n10]?.c || cur;
  const velocity10 = (cur - price10barsAgo) / price10barsAgo * 100;
  const isBreakdown = bull && velocity10 < -18;
  const isBreakout  = bear && velocity10 > 18;

  const distFromFastMA    = Math.abs((cur - mas[f]) / mas[f] * 100);
  const tooFarFromFastMA  = distFromFastMA > 40;

  const lookback        = Math.min(20, bars.length - 1);
  const recentHigh      = Math.max(...bars.slice(-lookback).map(b => b.h));
  const recentLow       = Math.min(...bars.slice(-lookback).map(b => b.l));
  const dropFromHigh    = (recentHigh - cur) / recentHigh * 100;
  const riseFromLow     = (cur - recentLow)  / recentLow  * 100;
  const collapsedFromHigh = bull && dropFromHigh > 45;
  const surgedFromLow     = bear && riseFromLow  > 45;

  const isValid = !isBreakdown && !isBreakout && !tooFarFromFastMA
    && !collapsedFromHigh && !surgedFromLow && fastMASlopingCorrectly;

  let depth = 'none';
  if (bull && isValid) {
    if      (cur < mas[f] && cur > mas[m]) depth = 'shallow';
    else if (cur < mas[m] && cur > mas[s]) depth = 'medium';
    else if (cur < mas[s])                 depth = 'deep';
  } else if (bear && isValid) {
    if      (cur > mas[f] && cur < mas[m]) depth = 'shallow';
    else if (cur > mas[m] && cur < mas[s]) depth = 'medium';
    else if (cur > mas[s])                 depth = 'deep';
  }

  const pbPct = Math.round(Math.abs((cur - mas[f]) / mas[f] * 100) * 100) / 100;

  let invalidReason = null;
  if (isBreakdown)           invalidReason = 'BREAKDOWN: dropped >18% in 10 bars';
  else if (isBreakout)       invalidReason = 'BREAKOUT: surged >18% in 10 bars';
  else if (collapsedFromHigh) invalidReason = 'COLLAPSED: >45% from recent high';
  else if (surgedFromLow)    invalidReason = 'SURGED: >45% from recent low';
  else if (tooFarFromFastMA) invalidReason = 'TOO FAR: >40% from fast MA';
  else if (!fastMASlopingCorrectly) invalidReason = 'MA SLOPE: fast MA rolling over';

  return {
    dir: bull ? 'bull' : bear ? 'bear' : 'mixed',
    aligned: (bull || bear) && isValid,
    bull: bull && isValid,
    bear: bear && isValid,
    depth, pbPct, mas, f, m, s, cur,
    isValid, invalidReason,
    maSlope5:      Math.round(maSlope5      * 100) / 100,
    velocity10:    Math.round(velocity10    * 100) / 100,
    dropFromHigh:  Math.round(dropFromHigh  * 10)  / 10,
    distFromFastMA: Math.round(distFromFastMA * 10) / 10,
  };
}
