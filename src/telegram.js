// src/telegram.js
const fmt = (n, d = 2) => (n == null || isNaN(n)) ? '—' : Number(n).toFixed(d);

async function sendTelegram(message) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.log('[Telegram] No credentials set — skipping alert');
    return;
  }
  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
    if (!response.ok) {
      console.error('[Telegram] Failed:', await response.text());
    }
  } catch (e) {
    console.error('[Telegram] Error:', e.message);
  }
}

async function sendSetupAlert(setup, type) {
  const isEx = type === 'exhaustion';
  const stars = setup.score >= 80 ? '★★★' : setup.score >= 65 ? '★★' : '★';
  const dirEmoji = setup.dir === 'SHORT' || setup.dir === 'BEAR' ? '🔴' : '🟢';
  const td = setup.tdCD >= 13 ? 'CD13 ✅' : setup.tdCD > 0 ? `C${setup.tdCD}/13` : setup.tdPerfect ? 'TD9★' : setup.tdCount ? `TD${setup.tdCount}` : '—';

  let msg = '';

  if (isEx) {
    msg = [
      `${dirEmoji} <b>${setup.label}/USDT — ${setup.dir}</b> ${stars}`,
      ``,
      `📊 <b>Score:</b> ${setup.score}/100`,
      `⏱ <b>Timeframe:</b> ${setup.tf.toUpperCase()}`,
      `📈 <b>DeMark:</b> ${td}`,
      `💰 <b>Price:</b> $${fmt(setup.price, 4)}`,
      `📉 <b>24h Change:</b> ${setup.change >= 0 ? '+' : ''}${fmt(setup.change, 2)}%`,
      `🔄 <b>Funding:</b> ${setup.fundingRate != null ? (setup.fundingRate > 0 ? '+' : '') + fmt(setup.fundingRate, 4) + '%' : '—'}`,
      setup.isInception ? `⚡ <b>INCEPTION SIGNAL</b>` : null,
      setup.entryReady  ? `🎯 <b>ENTRY READY</b>` : null,
      setup.atSwing     ? `📍 <b>At prior swing level</b>` : null,
      ``,
      `<b>Why:</b>`,
      ...setup.reasons.slice(0, 3).map(r => `  • ${r}`),
    ].filter(l => l !== null).join('\n');
  } else {
    msg = [
      `${dirEmoji} <b>${setup.label}/USDT — ${setup.dir} TREND ENTRY</b> ${stars}`,
      ``,
      `📊 <b>Score:</b> ${setup.score}/100`,
      `⏱ <b>Trend TF:</b> ${setup.tf.toUpperCase()} / <b>Entry TF:</b> ${(setup.entryTf || '').toUpperCase()}`,
      `📉 <b>Pullback:</b> ${fmt(setup.pullbackPct, 2)}% (${setup.pullbackDepth})`,
      `📈 <b>Entry TD:</b> ${setup.entryTdCD >= 9 ? 'C' + setup.entryTdCD : 'TD' + (setup.entryTdCount || '—')}`,
      `💰 <b>Price:</b> $${fmt(setup.price, 4)}`,
      `🔄 <b>Funding:</b> ${setup.fundingRate != null ? (setup.fundingRate > 0 ? '+' : '') + fmt(setup.fundingRate, 4) + '%' : '—'}`,
      setup.isDeepPullback ? `🎯 <b>Deep pullback — optimal entry zone</b>` : null,
      ``,
      `<b>Why:</b>`,
      ...setup.reasons.slice(0, 3).map(r => `  • ${r}`),
    ].filter(l => l !== null).join('\n');
  }

  await sendTelegram(msg);
}

async function sendScanSummary(scanType, results, minScore) {
  if (!results.length) return;
  const top = results.filter(r => r.score >= minScore);
  if (!top.length) return;

  const lines = [
    `📋 <b>${scanType} SCAN COMPLETE</b>`,
    `Found <b>${results.length}</b> setups · <b>${top.length}</b> above score ${minScore}`,
    ``,
    ...top.slice(0, 5).map((r, i) => {
      const dir = r.dir === 'SHORT' || r.dir === 'BEAR' ? '🔴' : '🟢';
      const td = r.tdCD >= 13 ? 'CD13' : r.tdCD > 0 ? `C${r.tdCD}` : `TD${r.tdCount || '—'}`;
      return `${i + 1}. ${dir} <b>${r.label}</b> [${r.score}] ${r.dir} ${td}`;
    }),
    top.length > 5 ? `... and ${top.length - 5} more` : null,
    ``,
    `🕐 ${new Date().toUTCString()}`,
  ].filter(l => l !== null).join('\n');

  await sendTelegram(lines);
}

export { sendTelegram, sendSetupAlert, sendScanSummary };
