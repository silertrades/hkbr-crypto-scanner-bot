// src/scoring.js
import { calcRSISlope } from './indicators.js';
import { detectAllPatterns, bestPattern, detectSwings, atSwingLevel } from './patterns.js';
import { calcTD } from './demark.js';

const fmt = (n, d = 2) => (n == null || isNaN(n)) ? '—' : Number(n).toFixed(d);

function logOddsScore(signals) {
  let lo = Math.log(0.40 / 0.60); // base prior = 0.40, not 0.50
  const reasons = [];
  signals.forEach(s => {
    if (!s.logOR) return;
    lo += s.logOR;
    reasons.push(s.reason);
  });
  const prob = 1 / (1 + Math.exp(-lo));
  return { score: Math.round(prob * 100), prob: Math.round(prob * 100) / 100, reasons };
}

export function scoreEx(patterns, td, bb, bars, funding, rsiOB) {
  const signals = [];
  const sellPat = bestPattern(patterns, 'sell');
  const buyPat  = bestPattern(patterns, 'buy');
  const isSell  = td.dir === 'sell'
    || (sellPat && !buyPat)
    || (sellPat && buyPat && sellPat.strength === 'strong' && buyPat.strength !== 'strong');
  const dir = td.dir ? td.dir : (isSell ? 'sell' : 'buy');

  // TD Sequential
  if (td.countdown >= 13 && td.dir === dir)
    signals.push({ logOR: 1.00, reason: `CD13 COMPLETE — highest DeMark exhaustion (×2.7 odds)` });
  else if (td.countdown >= 10 && td.dir === dir)
    signals.push({ logOR: 0.65, reason: `CD${td.countdown}/13 building (×1.9 odds)` });
  else if (td.countdown >= 7 && td.dir === dir)
    signals.push({ logOR: 0.40, reason: `CD${td.countdown}/13 developing (×1.5 odds)` });

  if (td.count === 9 && td.perfect && td.dir === dir)
    signals.push({ logOR: 0.70, reason: `TD9 PERFECT ★ — bar 8/9 extended (×2.0 odds)` });
  else if (td.count === 9 && td.dir === dir)
    signals.push({ logOR: 0.50, reason: `TD9 setup complete (×1.6 odds)` });
  else if (td.count >= 7 && td.dir === dir)
    signals.push({ logOR: 0.30, reason: `TD${td.count} count building (×1.3 odds)` });
  else if (td.count >= 5 && td.dir === dir)
    signals.push({ logOR: 0.15, reason: `TD${td.count} early (×1.2 odds)` });

  // Swing level
  const swings   = detectSwings(bars, 5);
  const curPrice = bars[bars.length - 1].c;
  const atSwing  = atSwingLevel(curPrice, swings, dir, 0.025);

  // Patterns
  const pat = bestPattern(patterns, dir);
  if (pat) {
    const strengthOR   = { strong: 0.55, moderate: 0.30, weak: 0.15 }[pat.strength] || 0.15;
    const contextMult  = atSwing ? 1.0 : 0.35;
    const effectiveOR  = strengthOR * contextMult;
    const contextStr   = atSwing ? 'at prior swing level' : 'in open air (reduced weight)';
    signals.push({ logOR: effectiveOR, reason: `${pat.type} ${contextStr} (×${Math.exp(effectiveOR).toFixed(2)} odds)` });
  } else if (atSwing && (td.count >= 7 || td.countdown >= 7)) {
    signals.push({ logOR: 0.15, reason: 'Price at prior swing level (no pattern, modest weight)' });
  }

  // RSI slope
  const rsiSlope = calcRSISlope(bars);
  if (rsiSlope !== null) {
    if (dir === 'sell' && rsiSlope < -3)
      signals.push({ logOR: 0.30, reason: `RSI decelerating ${rsiSlope} pts — momentum fading (×1.3 odds)` });
    else if (dir === 'buy' && rsiSlope > 3)
      signals.push({ logOR: 0.30, reason: `RSI accelerating +${rsiSlope} pts — momentum building (×1.3 odds)` });
    else if (dir === 'sell' && rsiSlope < 0)
      signals.push({ logOR: 0.10, reason: `RSI slope negative (mild, ×1.1 odds)` });
    else if (dir === 'buy' && rsiSlope > 0)
      signals.push({ logOR: 0.10, reason: `RSI slope positive (mild, ×1.1 odds)` });
  }

  // Funding rate
  if (funding !== null && funding !== undefined) {
    if (dir === 'sell' && funding > 0.10)
      signals.push({ logOR: 0.60, reason: `Funding +${fmt(funding,4)}% — extreme crowd long (×1.8 odds)` });
    else if (dir === 'sell' && funding > 0.03)
      signals.push({ logOR: 0.25, reason: `Funding +${fmt(funding,4)}% — crowd long, short bias (×1.3 odds)` });
    else if (dir === 'buy' && funding < -0.10)
      signals.push({ logOR: 0.60, reason: `Funding ${fmt(funding,4)}% — extreme crowd short (×1.8 odds)` });
    else if (dir === 'buy' && funding < -0.03)
      signals.push({ logOR: 0.25, reason: `Funding ${fmt(funding,4)}% — crowd short, long bias (×1.3 odds)` });
  }

  // Penalties
  if (bb?.isRanging)
    signals.push({ logOR: -0.40, reason: 'BB RANGING — compressed volatility (×0.67 odds)' });
  if (td.dir && pat && td.dir !== pat.dir)
    signals.push({ logOR: -0.30, reason: `TD direction (${td.dir}) conflicts with pattern (${pat.dir})` });

  const { score, prob, reasons } = logOddsScore(signals);
  return { score, prob, dir, reasons, atSwing, patterns };
}

export function calcInception(primaryTD, primaryBars, entryBars, rsiOB) {
  if (!entryBars || entryBars.length < 15) return null;
  if (primaryTD.countdown < 9 && primaryTD.count < 8) return null;

  const bias      = primaryTD.dir;
  const eTD       = calcTD(entryBars);
  const eRSISlope = calcRSISlope(entryBars);
  const ePatterns = detectAllPatterns(entryBars);
  const ePat      = bestPattern(ePatterns, bias);

  let retracePct = 0;
  if (primaryBars && primaryBars.length >= primaryTD.count + 5) {
    if (bias === 'sell') {
      const entryLow  = Math.min(...entryBars.slice(-10).map(b => b.l));
      const entryHigh = Math.max(...entryBars.slice(-20).map(b => b.h));
      const totalMove = entryHigh - entryLow;
      const retrace   = entryHigh - entryBars[entryBars.length - 1].c;
      retracePct = totalMove > 0 ? retrace / totalMove * 100 : 0;
    } else {
      const entryHigh = Math.max(...entryBars.slice(-10).map(b => b.h));
      const entryLow  = Math.min(...entryBars.slice(-20).map(b => b.l));
      const totalMove = entryHigh - entryLow;
      const retrace   = entryBars[entryBars.length - 1].c - entryLow;
      retracePct = totalMove > 0 ? retrace / totalMove * 100 : 0;
    }
  }

  const hasRetrace  = retracePct >= 38.2;
  const tdOk  = eTD.dir === bias && (eTD.count >= 7 || eTD.countdown >= 9);
  const patOk = !!ePat;
  const rsiOk = eRSISlope !== null
    && ((bias === 'sell' && eRSISlope < -2) || (bias === 'buy' && eRSISlope > 2));

  const confirming = [tdOk, patOk, rsiOk].filter(Boolean).length;
  if (!hasRetrace && confirming < 2) return null;

  let sc = 0, reasons = [];
  if (primaryTD.countdown >= 13)    { sc += 40; reasons.push('Primary CD13 (+40)'); }
  else if (primaryTD.countdown >= 9){ sc += 28; reasons.push(`Primary CD${primaryTD.countdown}/13 (+28)`); }
  else if (primaryTD.count === 9)   { sc += 22; reasons.push('Primary TD9 (+22)'); }
  else                              { sc += 14; reasons.push(`Primary TD${primaryTD.count} (+14)`); }

  if (hasRetrace) {
    const fibLevel = retracePct >= 61.8 ? '61.8%' : retracePct >= 50 ? '50%' : '38.2%';
    sc += 20; reasons.push(`${fibLevel} retracement confirmed (+20)`);
  } else {
    sc -= 20; reasons.push('Insufficient retracement (-20)');
  }

  if (tdOk)  { const p = eTD.countdown >= 13 ? 28 : eTD.countdown >= 9 ? 20 : eTD.count >= 9 ? 16 : 10; sc += p; reasons.push(`Entry TD exhaustion (+${p})`); }
  if (patOk) { sc += 15; reasons.push(`${ePat.type} at pullback (+15)`); }
  if (rsiOk) { sc += 12; reasons.push(`Entry RSI slope reversing (+12)`); }

  const rdy = sc >= 55 && hasRetrace && tdOk && (patOk || rsiOk);
  return {
    inceptionScore: Math.min(100, sc), inceptionReady: rdy,
    primaryBias: bias, primaryCD: primaryTD.countdown, primaryCount: primaryTD.count,
    entryTdCount: eTD.count, entryTdCD: eTD.countdown, entryTdDir: eTD.dir,
    retracePct: Math.round(retracePct * 10) / 10, hasRetrace,
    tdOk, patOk, rsiOk, iReasons: reasons,
  };
}

export function scoreTrend(maInfo, eTD, entryBars, funding, rsiOS) {
  if (!maInfo || !maInfo.aligned)  return { score: 0, prob: 0.5, reasons: ['MA stack not aligned'] };
  if (maInfo.depth === 'none')     return { score: 0, prob: 0.5, reasons: ['No pullback yet'] };
  if (maInfo.depth === 'deep')     return { score: 5, prob: 0.5, reasons: ['Below all MAs — structure broken'] };

  const isBull = maInfo.bull;
  const dir    = isBull ? 'buy' : 'sell';
  const signals = [];

  if (maInfo.depth === 'medium')
    signals.push({ logOR: 0.50, reason: 'Deep pullback to mid MA — optimal entry zone (×1.6 odds)' });
  else if (maInfo.depth === 'shallow')
    signals.push({ logOR: 0.25, reason: 'Pullback to fast MA — acceptable entry zone (×1.3 odds)' });

  if (eTD.countdown >= 13 && eTD.dir === dir)
    signals.push({ logOR: 0.90, reason: `Entry TF CD13 — pullback fully exhausted (×2.5 odds)` });
  else if (eTD.countdown >= 9 && eTD.dir === dir)
    signals.push({ logOR: 0.60, reason: `Entry TF CD${eTD.countdown}/13 (×1.8 odds)` });
  else if (eTD.count === 9 && eTD.dir === dir)
    signals.push({ logOR: 0.50, reason: `Entry TF TD9 — pullback setup complete (×1.6 odds)` });
  else if (eTD.count >= 7 && eTD.dir === dir)
    signals.push({ logOR: 0.30, reason: `Entry TF TD${eTD.count} — building exhaustion (×1.3 odds)` });
  else if (eTD.count >= 4 && eTD.dir === dir)
    signals.push({ logOR: 0.15, reason: `Entry TF TD${eTD.count} — early count (×1.2 odds)` });

  const rsiSlope = calcRSISlope(entryBars);
  if (rsiSlope !== null) {
    if (isBull && rsiSlope > 3)
      signals.push({ logOR: 0.30, reason: `Entry RSI turning up +${rsiSlope} pts (×1.3)` });
    else if (!isBull && rsiSlope < -3)
      signals.push({ logOR: 0.30, reason: `Entry RSI turning down ${rsiSlope} pts (×1.3)` });
  }

  const entryPatterns = entryBars ? detectAllPatterns(entryBars) : [];
  const entryPat = bestPattern(entryPatterns, dir);
  if (entryPat) {
    const swings    = detectSwings(entryBars, 5);
    const curPrice  = entryBars[entryBars.length - 1].c;
    const atSwing   = atSwingLevel(curPrice, swings, dir, 0.025);
    const strengthOR = { strong: 0.50, moderate: 0.25, weak: 0.10 }[entryPat.strength] || 0.10;
    const effectiveOR = atSwing ? strengthOR : strengthOR * 0.4;
    signals.push({ logOR: effectiveOR, reason: `${entryPat.type} on entry TF${atSwing ? ' at MA level' : ''} (×${Math.exp(effectiveOR).toFixed(2)})` });
  }

  if (funding !== null && funding !== undefined) {
    if (isBull && funding < -0.03)
      signals.push({ logOR: 0.40, reason: `Funding negative — crowd wrongly short in uptrend (×1.5 odds)` });
    else if (!isBull && funding > 0.03)
      signals.push({ logOR: 0.40, reason: `Funding positive — crowd wrongly long in downtrend (×1.5 odds)` });
    else if (isBull && funding > 0.05)
      signals.push({ logOR: -0.20, reason: 'Funding elevated — crowd crowded long, reduced edge' });
  }

  if (!eTD.dir || eTD.count < 3)
    signals.push({ logOR: -0.25, reason: 'No entry TF TD count — timing not confirmed (×0.78 odds)' });

  const { score, prob, reasons } = logOddsScore(signals);
  return { score, prob, dir, reasons, entryPatterns };
}

export async function calcEntryOpt(getKlinesFn, sym, hi, lo, entryTf, rsiOB, patDir) {
  if (!entryTf) return null;
  try {
    const bars = await getKlinesFn(sym, entryTf, 60);
    if (!bars) return null;
    const { calcRSI } = await import('./indicators.js');
    const rsi  = calcRSI(bars);
    const td   = calcTD(bars);
    const cur  = bars[bars.length - 1].c;
    const isSell = patDir === 'sell';
    const rsiOS  = 100 - rsiOB;
    let eScore = 0, eReasons = [];

    if (rsi != null) {
      if (isSell && rsi >= rsiOB) { const p = Math.min(40, Math.round((rsi - rsiOB) * 4 + 20)); eScore += p; eReasons.push(`Entry RSI ${rsi} OB (+${p})`); }
      if (!isSell && rsi <= rsiOS){ const p = Math.min(40, Math.round((rsiOS - rsi) * 4 + 20)); eScore += p; eReasons.push(`Entry RSI ${rsi} OS (+${p})`); }
    }
    if (td.dir === patDir && td.count >= 3) {
      const p = td.count >= 7 ? 25 : td.count >= 5 ? 18 : 10;
      eScore += p; eReasons.push(`Entry TD${patDir} ${td.count} (+${p})`);
    }
    const ok = isSell ? cur < hi : cur > lo;
    if (ok) { eScore += 20; eReasons.push('Price within range (+20)'); }

    const rdy = ok && eScore >= 55
      && ((isSell  && rsi != null && (rsi >= rsiOB || (td.dir === 'sell' && td.count >= 5)))
       || (!isSell && rsi != null && (rsi <= rsiOS  || (td.dir === 'buy'  && td.count >= 5))));

    return { entryTf, entryScore: Math.min(100, eScore), entryRsi: rsi, entryTdCount: td.count, entryTdDir: td.dir, entryReady: !!rdy, eReasons };
  } catch { return null; }
}
