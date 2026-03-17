// src/patterns.js
// All 14 candlestick patterns + swing detection

export function detectSwings(bars, lookback = 5) {
  const n = bars.length;
  const highs = [], lows = [];
  for (let i = lookback; i < n - lookback; i++) {
    const h = bars[i].h, l = bars[i].l;
    let isH = true, isL = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue;
      if (bars[j]?.h >= h) isH = false;
      if (bars[j]?.l <= l) isL = false;
    }
    if (isH) highs.push({ idx: i, price: h, age: n - 1 - i });
    if (isL) lows.push({ idx: i, price: l, age: n - 1 - i });
  }
  return { highs: highs.slice(-8), lows: lows.slice(-8) };
}

export function atSwingLevel(curPrice, swings, dir, tolerance = 0.025) {
  const levels = dir === 'sell' ? swings.highs : swings.lows;
  return levels.some(s => Math.abs(curPrice - s.price) / s.price <= tolerance);
}

export function detectAllPatterns(bars) {
  if (!bars || bars.length < 5) return [];
  const n = bars.length;
  const [b0, b1, b2] = [bars[n - 1], bars[n - 2], bars[n - 3]];
  const patterns = [];

  const bodyTop = b => Math.max(b.o, b.c);
  const bodyBot = b => Math.min(b.o, b.c);
  const body    = b => Math.abs(b.c - b.o);
  const range   = b => b.h - b.l;
  const isRed   = b => b.c < b.o;
  const isGreen = b => b.c >= b.o;
  const upper   = b => b.h - bodyTop(b);
  const lower   = b => bodyBot(b) - b.l;

  const prev10      = bars.slice(-11, -1).map(b => b.c);
  const upCount     = prev10.filter((p, i) => i > 0 && p > prev10[i - 1]).length;
  const isUptrend   = prev10[prev10.length - 1] > prev10[0] || upCount >= 6;
  const isDowntrend = prev10[prev10.length - 1] < prev10[0] || upCount <= 4;

  // ── SINGLE CANDLE ────────────────────────────────────────────
  if (range(b0) > 0) {
    const uPct = upper(b0) / range(b0) * 100;
    const lPct = lower(b0) / range(b0) * 100;
    const bPct = body(b0)  / range(b0) * 100;

    // 1. Shooting Star
    if (upper(b0) >= body(b0) * 2 && uPct >= 50 && lPct <= 30 && bPct >= 2)
      patterns.push({ type: 'SHOOTING STAR', dir: 'sell', strength: isUptrend ? 'strong' : 'moderate', uPct, lPct, bPct });

    // 2. Hammer
    if (lower(b0) >= body(b0) * 2 && lPct >= 50 && uPct <= 30 && bPct >= 2)
      patterns.push({ type: 'HAMMER', dir: 'buy', strength: isDowntrend ? 'strong' : 'moderate', uPct, lPct, bPct });

    // 3. Pin Bar Short
    if (upper(b0) >= body(b0) * 2.5 && uPct >= 55 && lPct <= 20 && bPct >= 2)
      patterns.push({ type: 'PIN BAR SHORT', dir: 'sell', strength: 'moderate', uPct, lPct, bPct });

    // 4. Pin Bar Long
    if (lower(b0) >= body(b0) * 2.5 && lPct >= 55 && uPct <= 20 && bPct >= 2)
      patterns.push({ type: 'PIN BAR LONG', dir: 'buy', strength: 'moderate', uPct, lPct, bPct });

    // 5. Doji
    if (bPct <= 4 && (uPct >= 35 || lPct >= 35))
      patterns.push({ type: 'DOJI', dir: uPct > lPct ? 'sell' : 'buy', strength: 'moderate', uPct, lPct, bPct });
  }

  // ── TWO CANDLE ───────────────────────────────────────────────
  if (b1 && range(b1) > 0 && range(b0) > 0) {
    // 6. Bearish Engulfing
    if (isGreen(b1) && isRed(b0) && b0.o >= bodyTop(b1) * 0.998 && b0.c <= bodyBot(b1) + body(b1) * 0.3)
      patterns.push({ type: 'BEARISH ENGULF', dir: 'sell', strength: body(b0) > body(b1) ? 'strong' : 'moderate' });

    // 7. Bullish Engulfing
    if (isRed(b1) && isGreen(b0) && b0.o <= bodyBot(b1) * 1.002 && b0.c >= bodyTop(b1) - body(b1) * 0.3)
      patterns.push({ type: 'BULLISH ENGULF', dir: 'buy', strength: body(b0) > body(b1) ? 'strong' : 'moderate' });

    // 8. Dark Cloud Cover
    const prevMid = bodyBot(b1) + body(b1) * 0.5;
    if (isGreen(b1) && isRed(b0) && b0.o > b1.h && b0.c < prevMid && b0.c > bodyBot(b1) && isUptrend)
      patterns.push({ type: 'DARK CLOUD', dir: 'sell', strength: 'strong' });

    // 9. Piercing Line
    const prevMidB = bodyBot(b1) + body(b1) * 0.5;
    if (isRed(b1) && isGreen(b0) && b0.o < b1.l && b0.c > prevMidB && b0.c < bodyTop(b1) && isDowntrend)
      patterns.push({ type: 'PIERCING LINE', dir: 'buy', strength: 'strong' });

    // 10. Tweezer Top
    if (Math.abs(b0.h - b1.h) / b1.h < 0.003 && isRed(b0) && isGreen(b1) && isUptrend)
      patterns.push({ type: 'TWEEZER TOP', dir: 'sell', strength: 'moderate' });

    // 11. Tweezer Bottom
    if (Math.abs(b0.l - b1.l) / b1.l < 0.003 && isGreen(b0) && isRed(b1) && isDowntrend)
      patterns.push({ type: 'TWEEZER BOTTOM', dir: 'buy', strength: 'moderate' });
  }

  // ── THREE CANDLE ─────────────────────────────────────────────
  if (b2 && b1 && range(b2) > 0 && range(b1) > 0 && range(b0) > 0) {
    // 12. Evening Star
    const b2Mid = bodyBot(b2) + body(b2) * 0.5;
    if (isGreen(b2) && body(b2) > range(b2) * 0.5
      && body(b1) < range(b1) * 0.3
      && isRed(b0) && b0.c < b2Mid && body(b0) > range(b0) * 0.4 && isUptrend)
      patterns.push({ type: 'EVENING STAR', dir: 'sell', strength: 'strong' });

    // 13. Morning Star
    const b2MidMs = bodyBot(b2) + body(b2) * 0.5;
    if (isRed(b2) && body(b2) > range(b2) * 0.5
      && body(b1) < range(b1) * 0.3
      && isGreen(b0) && b0.c > b2MidMs && body(b0) > range(b0) * 0.4 && isDowntrend)
      patterns.push({ type: 'MORNING STAR', dir: 'buy', strength: 'strong' });

    // 14. Three Black Crows
    if (isRed(b0) && isRed(b1) && isRed(b2)
      && b0.c < b1.c && b1.c < b2.c
      && body(b0) > range(b0) * 0.5 && body(b1) > range(b1) * 0.5 && body(b2) > range(b2) * 0.5)
      patterns.push({ type: 'THREE CROWS', dir: 'sell', strength: 'strong' });

    // 15. Three White Soldiers
    if (isGreen(b0) && isGreen(b1) && isGreen(b2)
      && b0.c > b1.c && b1.c > b2.c
      && body(b0) > range(b0) * 0.5 && body(b1) > range(b1) * 0.5 && body(b2) > range(b2) * 0.5)
      patterns.push({ type: 'THREE SOLDIERS', dir: 'buy', strength: 'strong' });
  }

  return patterns;
}

export function bestPattern(patterns, dir) {
  const matching = patterns.filter(p => p.dir === dir);
  if (!matching.length) return null;
  const rank = { strong: 3, moderate: 2, weak: 1 };
  return matching.sort((a, b) => (rank[b.strength] || 0) - (rank[a.strength] || 0))[0];
}
