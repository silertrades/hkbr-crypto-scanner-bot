// src/dashboard.js
import { createServer } from 'http';

const fmt  = (n, d = 2) => (n == null || isNaN(n)) ? '—' : Number(n).toFixed(d);
const fmtV = v => !v ? '—' : v >= 1e9 ? (v/1e9).toFixed(1)+'B' : v >= 1e6 ? (v/1e6).toFixed(1)+'M' : v >= 1e3 ? (v/1e3).toFixed(1)+'K' : v.toFixed(0);

let dashboardData = {
  exhaustion: [],
  trend: [],
  lastScan: null,
  nextScan: null,
  status: 'Starting...',
  scanCount: 0,
};

export function updateDashboard(data) {
  dashboardData = { ...dashboardData, ...data };
}

function scoreColor(score) {
  if (score >= 80) return '#F0A500';
  if (score >= 65) return '#FFD700';
  if (score >= 50) return '#8A55FF';
  return '#404468';
}

function dirBadge(dir) {
  const isShort = dir === 'SHORT' || dir === 'BEAR';
  const color   = isShort ? '#F0A500' : '#00E58A';
  const bg      = isShort ? '#110C00' : '#001A0E';
  const border  = isShort ? '#2C1C00' : '#003520';
  return `<span style="background:${bg};border:1px solid ${border};color:${color};padding:2px 8px;border-radius:2px;font-size:9px;font-weight:700;letter-spacing:2px;">${dir}</span>`;
}

function tdLabel(r) {
  if (r.tdCD >= 13)    return `<span style="color:#FF3A54;font-weight:700;">CD13✅</span>`;
  if (r.tdCD > 0)      return `<span style="color:#F0A500;">C${r.tdCD}/13</span>`;
  if (r.tdPerfect)     return `<span style="color:#F0A500;">TD9★</span>`;
  if (r.tdCount)       return `<span style="color:#A8AACC;">TD${r.tdCount}</span>`;
  if (r.entryTdCD >= 9)return `<span style="color:#F0A500;">C${r.entryTdCD}</span>`;
  if (r.entryTdCount)  return `<span style="color:#A8AACC;">TD${r.entryTdCount}</span>`;
  return '<span style="color:#404468;">—</span>';
}

function flagBadges(r) {
  const badges = [];
  if (r.isInception)    badges.push(`<span style="background:#0C0020;border:1px solid #240060;color:#8A55FF;padding:1px 5px;border-radius:2px;font-size:7px;">⚡INCEPTION</span>`);
  if (r.entryReady)     badges.push(`<span style="background:#001A0E;border:1px solid #003520;color:#00E58A;padding:1px 5px;border-radius:2px;font-size:7px;">🎯ENTRY</span>`);
  if (r.fundingAligned) badges.push(`<span style="background:#180010;border:1px solid #400030;color:#FF6EC7;padding:1px 5px;border-radius:2px;font-size:7px;">FUND✓</span>`);
  if (r.atSwing)        badges.push(`<span style="background:#001428;border:1px solid #003050;color:#00C8FF;padding:1px 5px;border-radius:2px;font-size:7px;">SWING</span>`);
  if (r.isDist)         badges.push(`<span style="background:#1A0800;border:1px solid #3A1800;color:#FF8C00;padding:1px 5px;border-radius:2px;font-size:7px;">DIST⚠</span>`);
  if (r.isDeepPullback) badges.push(`<span style="background:#001428;border:1px solid #003050;color:#00C8FF;padding:1px 5px;border-radius:2px;font-size:7px;">DEEP PB</span>`);
  return badges.join(' ');
}

function exhaustionRows(results) {
  if (!results.length) return `<tr><td colspan="9" style="text-align:center;padding:30px;color:#252848;letter-spacing:3px;font-size:10px;">NO SETUPS FOUND</td></tr>`;
  return results.map((r, i) => {
    const sc = scoreColor(r.score);
    const chgColor = r.change >= 0 ? '#00E58A' : '#FF3A54';
    const fund = r.fundingRate != null ? (r.fundingRate > 0 ? '+' : '') + fmt(r.fundingRate, 4) + '%' : '—';
    const reasons = (r.reasons || []).slice(0, 2).map(x => `<div style="color:#404468;font-size:8px;margin-top:2px;">→ ${x}</div>`).join('');
    return `<tr style="border-bottom:1px solid #151730;${r.isInception ? 'border-left:3px solid #8A55FF;' : r.dir === 'SHORT' ? 'border-left:3px solid #F0A500;' : 'border-left:3px solid #00E58A;'}">
      <td style="padding:8px 10px;color:#404468;font-size:9px;">${i + 1}</td>
      <td style="padding:8px 10px;">
        <div style="font-size:13px;font-weight:700;color:#E0E2FF;">${r.label}<span style="color:#252848;font-size:9px;">/USDT</span></div>
        <div style="font-size:8px;color:#404468;margin-top:2px;">${r.tf?.toUpperCase()} · #${r.rank}</div>
      </td>
      <td style="padding:8px 10px;">${dirBadge(r.dir)}</td>
      <td style="padding:8px 10px;">
        <div style="display:flex;align-items:center;gap:6px;">
          <div style="width:50px;height:3px;background:#151730;border-radius:2px;overflow:hidden;">
            <div style="width:${r.score}%;height:100%;background:${sc};border-radius:2px;"></div>
          </div>
          <span style="font-size:14px;font-weight:700;color:${sc};">${r.score}</span>
        </div>
      </td>
      <td style="padding:8px 10px;">${tdLabel(r)}</td>
      <td style="padding:8px 10px;font-size:12px;color:${chgColor};">${r.change >= 0 ? '+' : ''}${fmt(r.change, 2)}%</td>
      <td style="padding:8px 10px;font-size:11px;color:${r.fundingRate > 0.03 ? '#F0A500' : r.fundingRate < -0.03 ? '#00E58A' : '#A8AACC'}">${fund}</td>
      <td style="padding:8px 10px;">${flagBadges(r)}</td>
      <td style="padding:8px 10px;">
        <div style="font-size:9px;color:#404468;">${reasons}</div>
      </td>
    </tr>`;
  }).join('');
}

function trendRows(results) {
  if (!results.length) return `<tr><td colspan="9" style="text-align:center;padding:30px;color:#252848;letter-spacing:3px;font-size:10px;">NO TREND ENTRIES FOUND</td></tr>`;
  return results.map((r, i) => {
    const sc = scoreColor(r.score);
    const chgColor = r.change >= 0 ? '#00E58A' : '#FF3A54';
    const fund = r.fundingRate != null ? (r.fundingRate > 0 ? '+' : '') + fmt(r.fundingRate, 4) + '%' : '—';
    const pbColor = r.pullbackDepth === 'medium' ? '#00C8FF' : '#A8AACC';
    const reasons = (r.reasons || []).slice(0, 2).map(x => `<div style="color:#404468;font-size:8px;margin-top:2px;">→ ${x}</div>`).join('');
    return `<tr style="border-bottom:1px solid #151730;${r.dir === 'BULL' ? 'border-left:3px solid #00E5C8;' : 'border-left:3px solid #FF3A54;'}">
      <td style="padding:8px 10px;color:#404468;font-size:9px;">${i + 1}</td>
      <td style="padding:8px 10px;">
        <div style="font-size:13px;font-weight:700;color:#E0E2FF;">${r.label}<span style="color:#252848;font-size:9px;">/USDT</span></div>
        <div style="font-size:8px;color:#404468;margin-top:2px;">TREND:${r.tf?.toUpperCase()} · ENTRY:${r.entryTf?.toUpperCase()}</div>
      </td>
      <td style="padding:8px 10px;">${dirBadge(r.dir)}</td>
      <td style="padding:8px 10px;">
        <div style="display:flex;align-items:center;gap:6px;">
          <div style="width:50px;height:3px;background:#151730;border-radius:2px;overflow:hidden;">
            <div style="width:${r.score}%;height:100%;background:${sc};border-radius:2px;"></div>
          </div>
          <span style="font-size:14px;font-weight:700;color:${sc};">${r.score}</span>
        </div>
      </td>
      <td style="padding:8px 10px;">
        <div style="font-size:12px;font-weight:700;color:${pbColor};">${fmt(r.pullbackPct, 2)}%</div>
        <div style="font-size:8px;color:#404468;">${r.pullbackDepth}</div>
      </td>
      <td style="padding:8px 10px;">${tdLabel(r)}</td>
      <td style="padding:8px 10px;font-size:12px;color:${chgColor};">${r.change >= 0 ? '+' : ''}${fmt(r.change, 2)}%</td>
      <td style="padding:8px 10px;font-size:11px;color:${r.fundingRate > 0.03 ? '#F0A500' : r.fundingRate < -0.03 ? '#00E58A' : '#A8AACC'}">${fund}</td>
      <td style="padding:8px 10px;">${flagBadges(r)}</td>
    </tr>`;
  }).join('');
}

function renderHTML() {
  const d = dashboardData;
  const exShorts    = d.exhaustion.filter(r => r.dir === 'SHORT').length;
  const exLongs     = d.exhaustion.filter(r => r.dir === 'LONG').length;
  const exInception = d.exhaustion.filter(r => r.isInception).length;
  const trBulls     = d.trend.filter(r => r.dir === 'BULL').length;
  const trBears     = d.trend.filter(r => r.dir === 'BEAR').length;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="refresh" content="60">
<title>HKBR CRYPTO SCANNER</title>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;700;800&display=swap" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{background:#05060E;color:#A8AACC;font-family:'JetBrains Mono',monospace;font-size:11px;padding-bottom:40px;}
  body::after{content:'';position:fixed;inset:0;background:repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,0.02) 3px,rgba(0,0,0,0.02) 4px);pointer-events:none;z-index:999;}
  .hdr{background:#09091A;border-bottom:1px solid #1A1C38;padding:12px 20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;position:sticky;top:0;z-index:100;}
  .logo-text{font-size:15px;font-weight:800;color:#E0E2FF;letter-spacing:3px;}
  .logo-sub{font-size:7px;letter-spacing:3px;color:#252848;text-transform:uppercase;margin-top:2px;}
  .status{font-size:8px;letter-spacing:2px;color:#404468;}
  .dot{width:6px;height:6px;border-radius:50%;background:#00E58A;display:inline-block;margin-right:6px;animation:blink 2s infinite;}
  @keyframes blink{0%,100%{opacity:1}50%{opacity:0.2}}
  .stats-bar{background:#09091A;border-bottom:1px solid #151730;padding:8px 20px;display:flex;gap:24px;flex-wrap:wrap;}
  .stat{display:flex;flex-direction:column;gap:2px;}
  .stat-val{font-size:16px;font-weight:700;color:#E0E2FF;}
  .stat-lbl{font-size:7px;letter-spacing:2px;color:#252848;text-transform:uppercase;}
  .section{padding:0 20px;margin-top:20px;}
  .section-hdr{font-size:9px;letter-spacing:4px;color:#A8AACC;text-transform:uppercase;padding:10px 0 8px;border-bottom:1px solid #151730;margin-bottom:0;}
  .section-hdr span{font-size:7px;color:#252848;margin-left:8px;}
  table{width:100%;border-collapse:collapse;min-width:800px;}
  .tbl-wrap{overflow-x:auto;}
  thead tr{background:#09091A;border-bottom:2px solid #1A1C38;}
  th{padding:7px 10px;text-align:left;font-size:7px;letter-spacing:2px;color:#252848;text-transform:uppercase;white-space:nowrap;}
  tbody tr:hover{background:#09091A;}
  td{vertical-align:middle;}
  .footer{position:fixed;bottom:0;left:0;right:0;background:#040510;border-top:1px solid #151730;padding:6px 20px;font-size:8px;color:#1A1C38;display:flex;justify-content:space-between;}
  ::-webkit-scrollbar{width:4px;height:4px;}
  ::-webkit-scrollbar-track{background:#05060E;}
  ::-webkit-scrollbar-thumb{background:#1A1C38;border-radius:2px;}
</style>
</head>
<body>

<div class="hdr">
  <div>
    <div class="logo-text">⚡ HKBR CRYPTO SCANNER</div>
    <div class="logo-sub">DeMark · Bayesian Confluence · 14 Patterns · Live Bot</div>
  </div>
  <div style="text-align:right;">
    <div class="status"><span class="dot"></span>${d.status}</div>
    <div style="font-size:7px;color:#252848;margin-top:3px;">Last scan: ${d.lastScan || '—'}</div>
    <div style="font-size:7px;color:#252848;margin-top:1px;">Next scan: ${d.nextScan || '—'}</div>
    <div style="font-size:7px;color:#252848;margin-top:1px;">Page auto-refreshes every 60s</div>
  </div>
</div>

<div class="stats-bar">
  <div class="stat"><div class="stat-val">${d.exhaustion.length}</div><div class="stat-lbl">Ex Setups</div></div>
  <div class="stat"><div class="stat-val" style="color:#F0A500;">${exShorts}</div><div class="stat-lbl">Short</div></div>
  <div class="stat"><div class="stat-val" style="color:#00E58A;">${exLongs}</div><div class="stat-lbl">Long</div></div>
  <div class="stat"><div class="stat-val" style="color:#8A55FF;">${exInception}</div><div class="stat-lbl">Inception</div></div>
  <div class="stat" style="border-left:1px solid #151730;padding-left:24px;">
    <div class="stat-val">${d.trend.length}</div><div class="stat-lbl">Trend Entries</div>
  </div>
  <div class="stat"><div class="stat-val" style="color:#00E5C8;">${trBulls}</div><div class="stat-lbl">Bull PB</div></div>
  <div class="stat"><div class="stat-val" style="color:#FF3A54;">${trBears}</div><div class="stat-lbl">Bear Bounce</div></div>
  <div class="stat" style="border-left:1px solid #151730;padding-left:24px;">
    <div class="stat-val" style="color:#00E58A;">${d.scanCount}</div><div class="stat-lbl">Total Scans</div>
  </div>
</div>

<div class="section">
  <div class="section-hdr">◈ EXHAUSTION · REVERSAL <span>${d.exhaustion.length} results</span></div>
  <div class="tbl-wrap">
    <table>
      <thead><tr>
        <th>#</th><th>SYMBOL</th><th>DIR</th><th>SCORE</th>
        <th>TD</th><th>24H CHG</th><th>FUNDING</th><th>FLAGS</th><th>SIGNALS</th>
      </tr></thead>
      <tbody>${exhaustionRows(d.exhaustion)}</tbody>
    </table>
  </div>
</div>

<div class="section">
  <div class="section-hdr">◈ TREND ENTRY · CONTINUATION <span>${d.trend.length} results</span></div>
  <div class="tbl-wrap">
    <table>
      <thead><tr>
        <th>#</th><th>SYMBOL</th><th>DIR</th><th>SCORE</th>
        <th>PULLBACK</th><th>TD</th><th>24H CHG</th><th>FUNDING</th><th>FLAGS</th>
      </tr></thead>
      <tbody>${trendRows(d.trend)}</tbody>
    </table>
  </div>
</div>

<div class="footer">
  <span>HKBR CRYPTO SCANNER BOT · Binance FAPI · No auth required</span>
  <span>Scan #${d.scanCount} · ${d.lastScan || 'Awaiting first scan...'}</span>
</div>

</body></html>`;
}

export function startDashboard(port = 3000) {
  const server = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', lastScan: dashboardData.lastScan, scanCount: dashboardData.scanCount }));
      return;
    }
    if (req.url === '/api/data') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(dashboardData));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(renderHTML());
  });

  server.listen(port, () => {
    console.log(`✓ Dashboard running on port ${port}`);
  });

  return server;
}
