// src/scanner.js
import * as binance from './binance.js';
import { calcRSI, calcRSISlope, calcBB, analyzeMAs } from './indicators.js';
import { calcTD } from './demark.js';
import { detectAllPatterns, bestPattern } from './patterns.js';
import { scoreEx, scoreTrend, calcInception, calcEntryOpt } from './scoring.js';
import { resolveEntryTf, tfToLimit, isInActiveCategory } from './config.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function runExhaustionScan(opts = {}) {
  const {
    tf = '1d', entryTfSetting = 'auto', coins = 100,
    minScore = 40, rsiOB = 65, distPct = 10, catState = null,
  } = opts;

  const entryTf = resolveEntryTf(tf, entryTfSetting);
  console.log(`[EX] TF:${tf} EntryTF:${entryTf || 'OFF'} Top${coins} MinScore:${minScore}`);

  const tickers = (await binance.getTickers(coins))
    .filter(t => isInActiveCategory(t.symbol, catState));

  const found = [];

  for (let i = 0; i < tickers.length; i++) {
    const tk = tickers[i];
    try {
      const bars = await binance.getKlines(tk.symbol, tf, tfToLimit(tf, 70));
      if (!bars || bars.length < 10) continue;

      const td       = calcTD(bars);
      const bb       = calcBB(bars);
      const patterns = detectAllPatterns(bars);

      const hasSignal = td.count >= 2 || patterns.length > 0;
      if (!hasSignal) continue;

      const [funding, oiData] = await Promise.all([
        binance.getFunding(tk.symbol),
        binance.getOIHist(tk.symbol),
      ]);
      const fundingRate = funding?.rate ?? null;

      const { score, prob, dir: sigDir, reasons, atSwing } =
        scoreEx(patterns, td, bb, bars, fundingRate, rsiOB);
      if (score < minScore) continue;

      let entryData = null, incData = null;
      if (entryTf) {
        const curBar = bars[bars.length - 1];
        const [ed, eb] = await Promise.all([
          calcEntryOpt(binance.getKlines, tk.symbol, curBar.h, curBar.l, entryTf, rsiOB, sigDir),
          binance.getKlines(tk.symbol, entryTf, 100),
        ]);
        entryData = ed;
        if (eb) incData = calcInception(td, bars, eb, rsiOB);
      }

      const sym    = tk.symbol.replace('USDT', '');
      const curBar = bars[bars.length - 1];
      const mainPat = bestPattern(patterns, sigDir) || patterns[0];

      found.push({
        sym: tk.symbol, label: sym, rank: i + 1,
        price: tk.price, change: tk.change, volume: tk.volume,
        dir: sigDir === 'sell' ? 'SHORT' : 'LONG',
        patternType: mainPat?.type || 'TD ONLY',
        allPatterns: patterns, atSwing, prob,
        o: curBar.o, h: curBar.h, l: curBar.l, c: curBar.c,
        score, reasons, tf, entryTf,
        tdCount: td.count, tdDir: td.dir, tdPerfect: td.perfect, tdCD: td.countdown,
        sellCount: td.sellCount || 0, buyCount: td.buyCount || 0,
        sellCD: td.sellCD || 0, buyCD: td.buyCD || 0,
        sellCDActive: td.sellCDActive || false, buyCDActive: td.buyCDActive || false,
        sellPerfect: td.sellPerfect || false, buyPerfect: td.buyPerfect || false,
        bb, rsi: calcRSI(bars), rsiSlope: calcRSISlope(bars), fundingRate,
        oiUsdt: oiData?.oiUsdt || null, oiChange: oiData?.oiChange || null,
        isRanging: bb?.isRanging || false,
        isDist: tk.change >= distPct,
        fundingAligned: fundingRate != null
          && ((sigDir === 'sell' && fundingRate > 0.03)
           || (sigDir === 'buy'  && fundingRate < -0.03)),
        isLowFloat: false, fdv: null, floatPct: null,
        entryScore: entryData?.entryScore || 0,
        entryRsi: entryData?.entryRsi || null,
        entryTdCount: entryData?.entryTdCount || 0,
        entryReady: entryData?.entryReady || false,
        inceptionScore: incData?.inceptionScore || 0,
        inceptionReady: incData?.inceptionReady || false,
        primaryBias: incData?.primaryBias || null,
        primaryCD: td.countdown,
        entryTdCD: incData?.entryTdCD || 0,
        iReasons: incData?.iReasons || [],
        isInception: incData?.inceptionReady || false,
      });

      console.log(`[EX] ✓ ${tk.symbol} Score:${score} Dir:${sigDir} TD:${td.count}${td.countdown > 0 ? ' CD:' + td.countdown : ''}`);
    } catch (e) {
      console.error(`[EX] ${tk.symbol} error:`, e.message);
    }
    await sleep(60);
  }

  found.sort((a, b) => b.score - a.score);
  console.log(`[EX] Done — ${found.length} setups found`);
  return found;
}

export async function runTrendScan(opts = {}) {
  const {
    tf = '1d', entryTfSetting = 'auto', coins = 100,
    minScore = 40, rsiOS = 40, maPeriods = [50, 100, 200], catState = null,
  } = opts;

  const entryTf  = resolveEntryTf(tf, entryTfSetting) || '1h';
  const maLimit  = Math.max(...maPeriods) + 20;
  const entryBarLimit = { '1d': 150, '4h': 120, '1h': 100, '15m': 100 }[entryTf] || 100;

  console.log(`[TR] TF:${tf} EntryTF:${entryTf} MAs:${maPeriods.join('/')} Top${coins}`);

  const tickers = (await binance.getTickers(coins))
    .filter(t => isInActiveCategory(t.symbol, catState));

  const found = [];

  for (let i = 0; i < tickers.length; i++) {
    const tk = tickers[i];
    try {
      const [trendBars, entryBars] = await Promise.all([
        binance.getKlines(tk.symbol, tf, maLimit),
        binance.getKlines(tk.symbol, entryTf, entryBarLimit),
      ]);
      if (!trendBars) continue;

      const maInfo = analyzeMAs(trendBars, maPeriods);
      if (!maInfo || !maInfo.aligned) continue;
      if (maInfo.depth === 'none' || maInfo.depth === 'deep') continue;

      const eTD  = entryBars ? calcTD(entryBars) : { count: 0, dir: null, countdown: 0 };
      const eRSI = entryBars ? calcRSI(entryBars) : null;

      const [funding, oiData] = await Promise.all([
        binance.getFunding(tk.symbol),
        binance.getOIHist(tk.symbol),
      ]);
      const fundingRate = funding?.rate ?? null;

      const rsiOK = eRSI != null
        && ((maInfo.bull && eRSI <= rsiOS + 10) || (!maInfo.bull && eRSI >= 90 - rsiOS));
      if (!rsiOK && maInfo.depth === 'shallow') continue;

      const { score, prob, dir: trDir, reasons } =
        scoreTrend(maInfo, eTD, entryBars, fundingRate, rsiOS);
      if (score < minScore) continue;

      const cur    = trendBars[trendBars.length - 1];
      const sym    = tk.symbol.replace('USDT', '');
      const entryPat = entryBars
        ? bestPattern(detectAllPatterns(entryBars), maInfo.bull ? 'buy' : 'sell')?.type || null
        : null;

      found.push({
        sym: tk.symbol, label: sym, rank: i + 1,
        price: tk.price, change: tk.change,
        dir: maInfo.bull ? 'BULL' : 'BEAR',
        tf, entryTf, score, reasons, maInfo, maPeriods,
        pullbackPct: maInfo.pbPct, pullbackDepth: maInfo.depth,
        entryTdCount: eTD.count, entryTdDir: eTD.dir, entryTdCD: eTD.countdown,
        entryRsi: eRSI, rsiSlope: entryBars ? calcRSISlope(entryBars) : null,
        entryPat, fundingRate,
        oiUsdt: oiData?.oiUsdt || null, oiChange: oiData?.oiChange || null,
        fdv: null, floatPct: null,
        fundingAligned: fundingRate != null
          && ((maInfo.bull && fundingRate < -0.01) || (!maInfo.bull && fundingRate > 0.01)),
        isPerfectStack: maInfo.aligned, isDeepPullback: maInfo.depth === 'medium',
        o: cur.o, h: cur.h, l: cur.l, c: cur.c,
      });

      console.log(`[TR] ✓ ${tk.symbol} Score:${score} Dir:${maInfo.bull ? 'BULL' : 'BEAR'} Depth:${maInfo.depth}`);
    } catch (e) {
      console.error(`[TR] ${tk.symbol} error:`, e.message);
    }
    await sleep(60);
  }

  found.sort((a, b) => b.score - a.score);
  console.log(`[TR] Done — ${found.length} entries found`);
  return found;
}
