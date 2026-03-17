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
  if (score >= 80) return '#FFD700';
  if (score >= 65) return '#FFA500';
  if (score >= 50) return '#BB99FF';
  return '#8888AA';
}

function dirBadge(dir) {
  const isShort = dir === 'SHORT' || dir === 'BEAR';
  const color   = isShort ? '#FFB347' : '#00FF99';
  const bg      = isShort ? '#2A1500' : '#003320';
  const border  = isShort ? '#FF8C00' : '#00CC77';
  return `<span style="background:${bg};border:1px solid ${border};color:${color};padding:3px 10px;border-radius:3px;font-size:10px;font-weight:700;letter-spacing:2px;">${dir}</span>`;
}

function tdLabel(r) {
  if (r.tdCD >= 13)     return `<span style="color:#FF6B6B;font-weight:700;font-size:12px;">CD13 ✅</span>`;
  if (r.tdCD > 0)       return `<span style="color:#FFB347;font-size:12px;font-weight:700;">C${r.tdCD}/13</span>`;
  if (r.tdPerfect)      return `<span style="color:#FFD700;font-size:12px;font-weight:700;">TD9★</span>`;
  if (r.tdCount)        return `<span style="color:#CCCCEE;font-size:12px;">TD${r.tdCount}</span>`;
  if (r.entryTdCD >= 9) return `<span style="color:#FFB347;font-size:12px;font-weight:700;">C${r.entryTdCD}</span>`;
  if (r.entryTdCount)   return `<span style="color:#CCCCEE;font-size:12px;">TD${r.entryTdCount}</span>`;
  return '<span style="color:#666688;">—</span>';
}

function flagBadges(r) {
  const badges = [];
  if (r.isInception)    badges.push(`<span style="background:#1A0040;border:1px solid #8A55FF;color:#BB99FF;padding:2px 6px;border-radius:3px;font-size:8px;font-weight:700;">⚡ INCEPTION</span>`);
  if (r.entryReady)     badges.push(`<span style="background:#003320;border:1px solid #00CC77;color:#00FF99;padding:2px 6px;border-radius:3px;font-size:8px;font-weight:700;">🎯 ENTRY</span>`);
  if (r.fundingAligned) badges.push(`<span style="background:#2A0020;border:1px solid #FF69B4;color:#FF99CC;padding:2px 6px;border-radius:3px;font-size:8px;">FUND ✓</span>`);
  if (r.atSwing)        badges.push(`<span style="background:#001A30;border:1px solid #00AAFF;color:#66CCFF;padding:2px 6px;border-radius:3px;font-size:8px;">SWING</span>`);
  if (r.isDist)         badges.push(`<span style="background:#2A1000;border:1px solid #FF8C00;color:#FFB347;padding:2px 6px;border-radius:3px;font-size:8px;">DIST ⚠</span>`);
  if (r.isDeepPullback) badges.push(`<span style="background:#001A30;border:1px solid #00AAFF;color:#66CCFF;padding:2px 6px;border-radius:3px;font-size:8px;">DEEP PB</span>`);
  return badges.join(' ');
}

function exhaustionRows(results) {
  if (!results.length) return `<tr><td colspan="9" style="text-align:center;padding:40px;color:#555577;letter-spacing:3px;font-size:11px;">NO SETUPS FOUND — SCAN IN PROGRESS OR BELOW MIN SCORE</td></tr>`;
  return results.map((r, i) => {
    const sc = scoreColor(r.score);
    const chgColor = r.change >= 0 ? '#00FF99' : '#FF6B6B';
    const fund = r.fundingRate != null ? (r.fundingRate > 0 ? '+' : '') + fmt(r.fundingRate, 4) + '%' : '—';
    const fundColor = r.fundingRate > 0.03 ? '#FFB347' : r.fundingRate < -0.03 ? '#00FF99' : '#AAAACC';
    const rowBg = r.isInception ? 'background:#0D0020;' : r.dir === 'SHORT' ? 'background:#150800;' : 'background:#001510;';
    const reasons = (r.reasons || []).slice(0, 2).map(x =>
      `<div style="color:#8888AA;font-size:8px;margin-top:3px;line-height:1.4;">→ ${x}</div>`
    ).join('');
    return `<tr style="border-bottom:1px solid #1A1A35;${rowBg}${r.isInception ? 'border-left:3px solid #8A55FF;' : r.dir === 'SHORT' ? 'border-left:3px solid #FF8C00;' : 'border-left:3px solid #00CC77;'}">
      <td style="padding:10px 12px;color:#666688;font-size:10px;">${i + 1}</td>
      <td style="padding:10px 12px;">
        <div style="font-size:15px;font-weight:800;color:#FFFFFF;letter-spacing:1px;">${r.label}<span style="color:#444466;font-size:10px;">/USDT</span></div>
        <div style="font-size:9px;color:#666688;margin-top:3px;">${(r.tf || '').toUpperCase()} · Rank #${r.rank}</div>
      </td>
      <td style="padding:10px 12px;">${dirBadge(r.dir)}</td>
      <td style="padding:10px 12px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="width:60px;height:4px;background:#1A1A35;border-radius:2px;overflow:hidden;">
            <div style="width:${r.score}%;height:100%;background:${sc};border-radius:2px;"></div>
          </div>
          <span style="font-size:16px;font-weight:800;color:${sc};">${r.score}</span>
        </div>
      </td>
      <td style="padding:10px 12px;">${tdLabel(r)}</td>
      <td style="padding:10px 12px;font-size:13px;font-weight:700;color:${chgColor};">${r.change >= 0 ? '+' : ''}${fmt(r.change, 2)}%</td>
      <td style="padding:10px 12px;font-size:12px;font-weight:700;color:${fundColor};">${fund}</td>
      <td style="padding:10px 12px;">${flagBadges(r)}</td>
      <td style="padding:10px 12px;min-width:200px;">${reasons}</td>
    </tr>`;
  }).join('');
}

function trendRows(results) {
  if (!results.length) return `<tr><td colspan="9" style="text-align:center;padding:40px;color:#555577;letter-spacing:3px;font-size:11px;">NO TREND ENTRIES FOUND — SCAN IN PROGRESS OR BELOW MIN SCORE</td></tr>`;
  return results.map((r, i) => {
    const sc = scoreColor(r.score);
    const chgColor = r.change >= 0 ? '#00FF99' : '#FF6B6B';
    const fund = r.fundingRate != null ? (r.fundingRate > 0 ? '+' : '') + fmt(r.fundingRate, 4) + '%' : '—';
    const fundColor = r.fundingRate > 0.03 ? '#FFB347' : r.fundingRate < -0.03 ? '#00FF99' : '#AAAACC';
    const pbColor = r.pullbackDepth === 'medium' ? '#66CCFF' : '#AAAACC';
    const rowBg = r.dir === 'BULL' ? 'background:#001510;' : 'background:#150008;';
    const reasons = (r.reasons || []).slice(0, 2).map(x =>
      `<div style="color:#8888AA;font-size:8px;margin-top:3px;line-height:1.4;">→ ${x}</div>`
    ).join('');
    return `<tr style="border-bottom:1px solid #1A1A35;${rowBg}${r.dir === 'BULL' ? 'border-left:3px solid #00E5C8;' : 'border-left:3px solid #FF6B6B;'}">
      <td style="padding:10px 12px;color:#666688;font-size:10px;">${i + 1}</td>
      <td style="padding:10px 12px;">
        <div style="font-size:15px;font-weight:800;color:#FFFFFF;letter-spacing:1px;">${r.label}<span style="color:#444466;font-size:10px;">/USDT</span></div>
        <div style="font-size:9px;color:#666688;margin-top:3px;">TREND: ${(r.tf || '').toUpperCase()} · ENTRY: ${(r.entryTf || '').toUpperCase()}</div>
      </td>
      <td style="padding:10px 12px;">${dirBadge(r.dir)}</td>
      <td style="padding:10px 12px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="width:60px;height:4px;background:#1A1A35;border-radius:2px;overflow:hidden;">
            <div style="width:${r.score}%;height:100%;background:${sc};border-radius:2px;"></div>
          </div>
          <span style="font-size:16px;font-weight:800;color:${sc};">${r.score}</span>
        </div>
      </td>
      <td style="padding:10px 12px;">
        <div style="font-size:14px;font-weight:700;color:${pbColor};">${fmt(r.pullbackPct, 2)}%</div>
        <div style="font-size:9px;color:#666688;margin-top:2px;">${r.pullbackDepth || '—'}</div>
      </td>
      <td style="padding:10px 12px;">${tdLabel(r)}</td>
      <td style="padding:10px 12px;font-size:13px;font-weight:700;color:${chgColor};">${r.change >= 0 ? '+' : ''}${fmt(r.change, 2)}%</td>
      <td style="padding:10px 12px;font-size:12px;font-weight:700;color:${fundColor};">${fund}</td>
      <td style="padding:10px 12px;">${flagBadges(r)}${reasons}</td>
    </tr>`;
  }).join('');
}

function renderHTML() {
  const d = dashboardData;
  const exShorts    = d.exhaustion.filter(r => r.dir === 'SHORT').length;
  const exLongs     = d.exhaustion.filter(r => r.dir === 'LONG').length;
  const exInception = d.exhaustion.filter(r => r.isInception).length;
  const exEntry     = d.exhaustion.filter(r => r.entryReady).length;
  const trBulls     = d.trend.filter(r => r.dir === 'BULL').length;
  const trBears     = d.trend.filter(r => r.dir === 'BEAR').length;
  const trDeep      = d.trend.filter(r => r.isDeepPullback).length;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="refresh" content="60">
<title>HKBR CRYPTO SCANNER</title>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;700;800&display=swap" rel="stylesheet">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:#07071A; color:#CCCCEE; font-family:'JetBrains Mono',monospace; font-size:12px; padding-bottom:50px; }
  .hdr { background:#0D0D24; border-bottom:2px solid #2A2A50; padding:14px 24px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; position:sticky; top:0; z-index:100; }
  .logo-text { font-size:18px; font-weight:800; color:#FFFFFF; letter-spacing:3px; }
  .logo-sub { font-size:8px; letter-spacing:3px; color:#555577; text-transform:uppercase; margin-top:3px; }
  .dot { width:8px; height:8px; border-radius:50%; background:#00FF99; display:inline-block; margin-right:6px; animation:blink 2s infinite; }
  @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.2} }
  .status-txt { font-size:10px; color:#AAAACC; letter-spacing:1px; }
  .meta-txt { font-size:9px; color:#555577; margin-top:3px; }
  .stats-bar { background:#0D0D24; border-bottom:1px solid #1A1A35; padding:12px 24px; display:flex; gap:28px; flex-wrap:wrap; align-items:center; }
  .stat { display:flex; flex-direction:column; gap:3px; }
  .stat-val { font-size:20px; font-weight:800; color:#FFFFFF; }
  .stat-lbl { font-size:8px; letter-spacing:2px; color:#555577; text-transform:uppercase; }
  .divider { width:1px; background:#1A1A35; height:40px; }
  .section { padding:0 24px; margin-top:24px; }
  .section-hdr { font-size:11px; letter-spacing:4px; color:#FFFFFF; text-transform:uppercase; padding:12px 0 10px; border-bottom:2px solid #1A1A35; margin-bottom:0; display:flex; align-items:center; gap:10px; }
  .section-hdr .count { font-size:9px; color:#555577; letter-spacing:2px; }
  .tbl-wrap { overflow-x:auto; }
  table { width:100%; border-collapse:collapse; min-width:900px; }
  thead tr { background:#0D0D24; border-bottom:2px solid #2A2A50; }
  th { padding:9px 12px; text-align:left; font-size:8px; letter-spacing:2px; color:#666688; text-transform:uppercase; white-space:nowrap; }
  tbody tr:hover { background:#0F0F28 !important; }
  td { vertical-align:middle; }
  .footer { position:fixed; bottom:0; left:0; right:0; background:#0D0D24; border-top:1px solid #1A1A35; padding:8px 24px; font-size:9px; color:#333355; display:flex; justify-content:space-between; align-items:center; }
  ::-webkit-scrollbar { width:5px; height:5px; }
  ::-webkit-scrollbar-track { background:#07071A; }
  ::-webkit-scrollbar-thumb { background:#2A2A50; border-radius:3px; }
</style>
</head>
<body>

<div class="hdr">
  <div>
    <div class="logo-text">⚡ HKBR CRYPTO SCANNER</div>
    <div class="logo-sub">DeMark · Bayesian Confluence · 14 Patterns · Live Bot</div>
  </div>
  <div style="text-align:right;">
    <div class="status-txt"><span class="dot"></span>${d.status}</div>
    <div class="meta-txt">Last scan: ${d.lastScan || '—'}</div>
    <div class="meta-txt">Next scan: ${d.nextScan || '—'}</div>
    <div class="meta-txt">Auto-refreshes every 60s</div>
  </div>
</div>

<div class="stats-bar">
  <div class="stat"><div class="stat-val">${d.exhaustion.length}</div><div class="stat-lbl">Ex Setups</div></div>
  <div class="stat"><div class="stat-val" style="color:#FFB347;">${exShorts}</div><div class="stat-lbl">Short</div></div>
  <div class="stat"><div class="stat-val" style="color:#00FF99;">${exLongs}</div><div class="stat-lbl">Long</div></div>
  <div class="stat"><div class="stat-val" style="color:#BB99FF;">${exInception}</div><div class="stat-lbl">Inception</div></div>
  <div class="stat"><div class="stat-val" style="color:#00FF99;">${exEntry}</div><div class="stat-lbl">Entry Ready</div></div>
  <div class="divider"></div>
  <div class="stat"><div class="stat-val">${d.trend.length}</div><div class="stat-lbl">Trend Entries</div></div>
  <div class="stat"><div class="stat-val" style="color:#00E5C8;">${trBulls}</div><div class="stat-lbl">Bull PB</div></div>
  <div class="stat"><div class="stat-val" style="color:#FF6B6B;">${trBears}</div><div class="stat-lbl">Bear Bounce</div></div>
  <div class="stat"><div class="stat-val" style="color:#66CCFF;">${trDeep}</div><div class="stat-lbl">Deep PB</div></div>
  <div class="divider"></div>
  <div class="stat"><div class="stat-val" style="color:#FFD700;">${d.scanCount}</div><div class="stat-lbl">Total Scans</div></div>
</div>

<div class="section">
  <div class="section-hdr">◈ EXHAUSTION · REVERSAL <span class="count">${d.exhaustion.length} RESULTS</span></div>
  <div class="tbl-wrap">
    <table>
      <thead><tr>
        <th>#</th>
        <th>SYMBOL</th>
        <th>DIRECTION</th>
        <th>SCORE</th>
        <th>DEMARK TD</th>
        <th>24H CHANGE</th>
        <th>FUNDING</th>
        <th>FLAGS</th>
        <th>SIGNALS</th>
      </tr></thead>
      <tbody>${exhaustionRows(d.exhaustion)}</tbody>
    </table>
  </div>
</div>

<div class="section">
  <div class="section-hdr">◈ TREND ENTRY · CONTINUATION <span class="count">${d.trend.length} RESULTS</span></div>
  <div class="tbl-wrap">
    <table>
      <thead><tr>
        <th>#</th>
        <th>SYMBOL</th>
        <th>DIRECTION</th>
        <th>SCORE</th>
        <th>PULLBACK</th>
        <th>DEMARK TD</th>
        <th>24H CHANGE</th>
        <th>FUNDING</th>
        <th>FLAGS · SIGNALS</th>
      </tr></thead>
      <tbody>${trendRows(d.trend)}</tbody>
    </table>
  </div>
</div>

<div class="footer">
  <span>HKBR CRYPTO SCANNER BOT · Binance FAPI · No auth required</span>
  <span>Scan #${d.scanCount} · ${d.lastScan || 'Awaiting first scan...'}</span>
</div>

</body>
</html>`;
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
