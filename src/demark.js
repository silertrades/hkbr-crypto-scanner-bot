// src/demark.js
// DeMark TD Sequential — dual-direction, TDST cancellation, countdown from bar 8

export function calcTD(bars) {
  const empty = {
    count: 0, dir: null, perfect: false, countdown: 0,
    setupComplete: false,
    sellCount: 0, buyCount: 0,
    sellCD: 0, buyCD: 0,
    sellCDActive: false, buyCDActive: false,
    sellPerfect: false, buyPerfect: false,
  };
  if (!bars || bars.length < 5) return empty;
  const n = bars.length;

  let s_sc = 0, s_idxs = [], s_cd = 0, s_cdActive = false, s_tdstH = null, s_cdStart = -1;
  let b_sc = 0, b_idxs = [], b_cd = 0, b_cdActive = false, b_tdstL = null, b_cdStart = -1;

  for (let i = 4; i < n; i++) {
    const c  = bars[i].c;
    const c4 = bars[i - 4].c;

    // SELL setup: close > close[4] increments; close < close[4] resets; equal = continue
    if (c > c4)      { s_sc++; s_idxs.push(i); }
    else if (c < c4) { s_sc = 0; s_idxs = []; }

    // BUY setup: close < close[4] increments; close > close[4] resets; equal = continue
    if (c < c4)      { b_sc++; b_idxs.push(i); }
    else if (c > c4) { b_sc = 0; b_idxs = []; }

    // SELL setup completion → start countdown
    if (s_sc === 9 && !s_cdActive) {
      s_cdActive = true; s_cd = 0;
      s_cdStart  = i - 1; // eligible from bar 8, not bar 9
      s_tdstH    = Math.max(...s_idxs.slice(-9).map(k => bars[k].h));
    }

    // BUY setup completion → start countdown
    if (b_sc === 9 && !b_cdActive) {
      b_cdActive = true; b_cd = 0;
      b_cdStart  = i - 1;
      b_tdstL    = Math.min(...b_idxs.slice(-9).map(k => bars[k].l));
    }

    // SELL countdown: close <= low[i-2]; cancel if close > tdstH
    if (s_cdActive && s_cd < 13 && i >= s_cdStart && i >= 2) {
      if (s_tdstH && c > s_tdstH) {
        s_cdActive = false; s_cd = 0; s_tdstH = null;
      } else if (c <= bars[i - 2].l) {
        s_cd = Math.min(s_cd + 1, 13);
      }
    }

    // BUY countdown: close >= high[i-2]; cancel if close < tdstL
    if (b_cdActive && b_cd < 13 && i >= b_cdStart && i >= 2) {
      if (b_tdstL && c < b_tdstL) {
        b_cdActive = false; b_cd = 0; b_tdstL = null;
      } else if (c >= bars[i - 2].h) {
        b_cd = Math.min(b_cd + 1, 13);
      }
    }
  }

  // Perfection check
  function perf(idxs, dir) {
    if (idxs.length < 9) return false;
    const L = idxs.slice(-9);
    const [i6, i7, i8, i9] = [L[5], L[6], L[7], L[8]];
    if (dir === 'sell') {
      const [h6, h7, h8, h9] = [bars[i6].h, bars[i7].h, bars[i8].h, bars[i9].h];
      return (h8 >= h6 && h8 >= h7) || (h9 >= h6 && h9 >= h7);
    } else {
      const [l6, l7, l8, l9] = [bars[i6].l, bars[i7].l, bars[i8].l, bars[i9].l];
      return (l8 <= l6 && l8 <= l7) || (l9 <= l6 && l9 <= l7);
    }
  }

  const sellPerf = perf(s_idxs, 'sell');
  const buyPerf  = perf(b_idxs, 'buy');

  const s_disp = Math.min(s_sc, 9);
  const b_disp = Math.min(b_sc, 9);
  const s_sig  = s_cd >= 13 ? 100 : s_cdActive ? 50 + s_cd : s_disp;
  const b_sig  = b_cd >= 13 ? 100 : b_cdActive ? 50 + b_cd : b_disp;

  let count, dir, perfect, countdown;
  if (s_sig >= b_sig && s_sig > 0) {
    count = s_cd >= 13 ? 9 : s_disp;
    dir = 'sell'; countdown = s_cd; perfect = sellPerf;
  } else if (b_sig > 0) {
    count = b_cd >= 13 ? 9 : b_disp;
    dir = 'buy'; countdown = b_cd; perfect = buyPerf;
  } else {
    count = 0; dir = null; countdown = 0; perfect = false;
  }

  return {
    count, dir, perfect, countdown,
    setupComplete: s_sc >= 9 || b_sc >= 9,
    sellCount: s_disp, buyCount: b_disp,
    sellCD: s_cd, buyCD: b_cd,
    sellCDActive: s_cdActive, buyCDActive: b_cdActive,
    sellPerfect: sellPerf, buyPerfect: buyPerf,
  };
}
