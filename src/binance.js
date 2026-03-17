// src/binance.js
// Binance FAPI wrapper — bars returned oldest→newest (index 0 = oldest)

const BASE = 'https://fapi.binance.com';

export async function ping() {
  const r = await fetch(`${BASE}/fapi/v1/ping`, { signal: AbortSignal.timeout(5000) });
  return r.ok;
}

export async function getTickers(n = 100) {
  const r = await fetch(`${BASE}/fapi/v1/ticker/24hr`, { signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`getTickers HTTP ${r.status}`);
  const data = await r.json();
  return data
    .filter(t => t.symbol.endsWith('USDT') && !t.symbol.includes('_'))
    .sort((a, b) => +b.quoteVolume - +a.quoteVolume)
    .slice(0, n)
    .map(t => ({
      symbol: t.symbol,
      price: +t.lastPrice,
      change: +t.priceChangePercent,
      volume: +t.quoteVolume,
    }));
}

export async function getKlines(symbol, interval, limit = 120) {
  const url = `${BASE}/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) return null;
  const data = await r.json();
  // Binance returns oldest→newest already — no reversal needed
  return data.map(k => ({
    o: +k[1],
    h: +k[2],
    l: +k[3],
    c: +k[4],
    v: +k[5],
  }));
}

export async function getFunding(symbol) {
  try {
    const r = await fetch(`${BASE}/fapi/v1/premiumIndex?symbol=${symbol}`, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    const d = await r.json();
    return { rate: +d.lastFundingRate * 100, nextFunding: d.nextFundingTime };
  } catch { return null; }
}

export async function getOIHist(symbol, period = '1h') {
  try {
    const url = `${BASE}/futures/data/openInterestHist?symbol=${symbol}&period=${period}&limit=3`;
    const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    const d = await r.json();
    if (!d || d.length < 2) return null;
    const cur  = +d[d.length - 1].sumOpenInterestValue;
    const prev = +d[0].sumOpenInterestValue;
    return { oiUsdt: cur, oiChange: ((cur - prev) / prev) * 100 };
  } catch { return null; }
}
