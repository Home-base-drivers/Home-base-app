(function () {
  'use strict';

  const LIVE_POLL_MS = 120000;
  const LIVE_MAX_AGE_MS = 12 * 60000;
  const STALE_MAX_AGE_MS = 25 * 60000;
  const HISTORY_LIMIT = 18;
  let latestProviderGeneratedAt = '';
  let currentMarket = 'Baltimore';

  const style = document.createElement('style');
  style.textContent = '.homebase-demand-area{transition:fill .8s ease,fill-opacity .8s ease}';
  document.head.appendChild(style);

  function safeParse(value, fallback = null) {
    try { return JSON.parse(value); } catch { return fallback; }
  }
  function marketName() {
    const profile = safeParse(localStorage.getItem('homeBaseDriverProfile'), {}) || {};
    const heading = document.getElementById('marketHeading')?.textContent?.split('—')[0]?.trim();
    return profile.market || heading || currentMarket;
  }
  function formatMoney(value) {
    const formatter = new Intl.NumberFormat(undefined, { style: 'currency', currency: currentMoney?.code || 'USD', maximumFractionDigits: 0 });
    return Number.isFinite(value) ? formatter.format(value) : 'Not enough data';
  }
  function setStatus(node, text, error = false) {
    if (!node) return;
    node.textContent = text;
    node.style.color = error ? '#ff9aa4' : '#77d8ff';
  }
  function historyKey(market) { return `homeBaseDemandHistory:${String(market || 'local').toLowerCase()}`; }
  function storeDemandSnapshot(market, generatedAt, samples) {
    const key = historyKey(market);
    const history = safeParse(localStorage.getItem(key), []) || [];
    if (history.some(item => item.generatedAt === generatedAt)) return history;
    history.push({ generatedAt, samples: samples.map(item => ({ name: item.name, lat: item.lat, lon: item.lon, surgeMultiplier: item.surgeMultiplier })) });
    const recent = history.slice(-HISTORY_LIMIT);
    localStorage.setItem(key, JSON.stringify(recent));
    return recent;
  }
  function providerTrend(history, sample) {
    const previous = history.length > 1 ? history[history.length - 2].samples.find(item => item.name === sample.name) : null;
    if (!previous) return 'new';
    const delta = Number(sample.surgeMultiplier) - Number(previous.surgeMultiplier);
    return delta > .08 ? 'rising' : delta < -.08 ? 'falling' : 'steady';
  }
  function ensureFreshnessBadge() {
    let badge = document.getElementById('demandFreshness');
    if (badge) return badge;
    badge = document.createElement('div');
    badge.id = 'demandFreshness';
    badge.setAttribute('role', 'status');
    badge.style.cssText = 'position:absolute;z-index:890;right:10px;top:10px;border:1px solid rgba(69,207,255,.45);border-radius:999px;padding:6px 9px;background:rgba(2,14,24,.86);backdrop-filter:blur(10px);color:#9edfff;font-size:.58rem;font-weight:850;letter-spacing:.05em;box-shadow:0 8px 22px rgba(0,0,0,.3)';
    badge.textContent = 'DEMAND · CHECKING';
    document.querySelector('.map-stage')?.appendChild(badge);
    return badge;
  }
  async function refreshLiveDemand() {
    const badge = ensureFreshnessBadge();
    if (!currentLocation) { badge.textContent = 'DEMAND · GPS NEEDED'; return; }
    try {
      const response = await fetch(`./provider-signals.json?ts=${Date.now()}`, { cache: 'no-store', headers: { Accept: 'application/json' } });
      if (!response.ok) throw Error('feed unavailable');
      const payload = await response.json();
      const match = (payload.markets || []).find(item => distanceKm(currentLocation, [item.center.lat, item.center.lon]) <= Number(item.radiusKm || 0));
      if (!match || !payload.generatedAt) throw Error('no current market feed');
      currentMarket = match.name || marketName();
      const generatedAge = Date.now() - Date.parse(payload.generatedAt);
      const uberAge = Date.now() - Date.parse(match.uber?.fetchedAt || 0);
      const usable = match.uber?.status === 'active' && uberAge <= LIVE_MAX_AGE_MS;
      const degraded = ['active', 'stale'].includes(match.uber?.status) && uberAge <= STALE_MAX_AGE_MS;
      const samples = (usable || degraded ? match.uber?.samples || [] : []).filter(item => Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lon)) && Number.isFinite(Number(item.surgeMultiplier)));
      const history = storeDemandSnapshot(currentMarket, payload.generatedAt, samples);
      providerUberPoints = samples.map(item => ({
        name: `Uber pricing sample · ${item.name}`,
        cat: 'neighborhood', lat: Number(item.lat), lon: Number(item.lon), heatOnly: true,
        tags: { providerSignal: true, uberSurgeMultiplier: Number(item.surgeMultiplier), providerTrend: providerTrend(history, item), providerSampledAt: item.sampledAt, source: 'Uber price estimate proxy' }
      }));
      if (payload.generatedAt !== latestProviderGeneratedAt) {
        latestProviderGeneratedAt = payload.generatedAt;
        activeDemandSources = [...activeDemandSources.filter(item => !(item.tags && item.tags.providerSignal)), ...providerUberPoints];
        bindDemandSources(activeDemandSources);
        renderDemandGrid(activeDemandSources, 0, selectedForecastTime);
      }
      const minutes = Math.max(0, Math.floor(uberAge / 60000));
      badge.textContent = usable ? `DEMAND · ${minutes}M OLD · 2M CHECK` : degraded ? `DEMAND · STALE ${minutes}M` : 'DEMAND · MODEL ONLY';
      badge.style.borderColor = usable ? 'rgba(69,207,255,.55)' : degraded ? 'rgba(255,190,64,.62)' : 'rgba(150,166,177,.4)';
      badge.title = usable ? 'Provider samples target a five-minute refresh; this app checks every two minutes.' : 'Live provider samples are unavailable or too old. Public-data estimates are labeled as model-only.';
      if (generatedAge > STALE_MAX_AGE_MS) badge.textContent = 'DEMAND · FEED EXPIRED';
    } catch {
      badge.textContent = 'DEMAND · MODEL ONLY';
      badge.title = 'No current authorized provider snapshot is available.';
    }
  }

  function columnIndex(headers, choices) {
    const normalized = headers.map(value => String(value || '').trim().toLowerCase());
    return normalized.findIndex(value => choices.some(choice => value === choice || value.includes(choice)));
  }
  function numberValue(value) {
    const parsed = Number(String(value || '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }
  function parseLocalTrips(text, filename) {
    const rows = csvRows(text);
    if (rows.length < 2) return [];
    const headers = rows[0];
    const grossIndex = columnIndex(headers, ['gross earnings', 'total earnings', 'earnings', 'gross pay', 'payout', 'fare', 'amount']);
    const durationIndex = columnIndex(headers, ['online hours', 'online time', 'active hours', 'active time', 'engaged hours', 'hours', 'duration']);
    const platformIndex = columnIndex(headers, ['platform', 'app', 'provider', 'service', 'source']);
    const startIndex = columnIndex(headers, ['start time', 'started at', 'trip date', 'date', 'pickup time']);
    const milesIndex = columnIndex(headers, ['distance miles', 'miles', 'distance', 'trip mileage']);
    if (grossIndex < 0) return [];
    return rows.slice(1).map((row, rowIndex) => {
      const gross = numberValue(row[grossIndex]);
      if (!Number.isFinite(gross)) return null;
      const worked = durationIndex >= 0 ? durationHours(row[durationIndex]) : 0;
      const rawDate = startIndex >= 0 ? row[startIndex] : '';
      const parsedDate = rawDate && Number.isFinite(Date.parse(rawDate)) ? new Date(rawDate) : null;
      return {
        sourceRow: rowIndex + 2,
        filename,
        market: marketName(),
        platform: String(platformIndex >= 0 ? row[platformIndex] || 'Unknown' : 'Unknown').slice(0, 60),
        startedAt: parsedDate ? parsedDate.toISOString() : null,
        durationMinutes: worked > 0 ? Math.round(worked * 60) : null,
        grossEarnings: gross,
        distanceMiles: milesIndex >= 0 ? numberValue(row[milesIndex]) : null
      };
    }).filter(Boolean);
  }
  function savedTrips() { return safeParse(localStorage.getItem('homeBaseTripRows'), []) || []; }
  function completedShifts() { return safeParse(localStorage.getItem('homeBaseShifts'), []) || []; }
  function loggedTripRows() {
    return completedShifts().map(row => ({
      startedAt: row.startedAt || (row.date ? `${row.date}T12:00:00` : null),
      durationMinutes: Number(row.hours) > 0 ? Number(row.hours) * 60 : null,
      grossEarnings: Number(row.gross) || 0,
      distanceMiles: Number(row.miles) || null,
      platform: row.platform || 'Other'
    }));
  }
  function saveTrips(rows) {
    const combined = [...savedTrips(), ...rows].slice(-5000);
    localStorage.setItem('homeBaseTripRows', JSON.stringify(combined));
    return combined;
  }
  function bestBlock(rows) {
    const buckets = new Map();
    rows.forEach(row => {
      if (!row.startedAt || !row.durationMinutes) return;
      const date = new Date(row.startedAt);
      const key = `${date.getDay()}-${date.getHours()}`;
      const item = buckets.get(key) || { day: date.getDay(), hour: date.getHours(), gross: 0, hours: 0, count: 0 };
      item.gross += Number(row.grossEarnings) || 0;
      item.hours += Number(row.durationMinutes) / 60;
      item.count += 1;
      buckets.set(key, item);
    });
    return [...buckets.values()].filter(item => item.count >= 2 && item.hours > 0).sort((a, b) => b.gross / b.hours - a.gross / a.hours)[0] || null;
  }
  function profitTips(rows) {
    const tips = [];
    const best = bestBlock(rows);
    if (best) tips.push(`Your strongest recorded block is ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][best.day]} around ${new Date(2000,0,1,best.hour).toLocaleTimeString([], { hour: 'numeric' })} at ${formatMoney(best.gross / best.hours)}/hr.`);
    const platformTotals = {};
    rows.forEach(row => {
      if (!row.platform || !row.durationMinutes) return;
      const item = platformTotals[row.platform] || (platformTotals[row.platform] = { gross: 0, hours: 0 });
      item.gross += Number(row.grossEarnings) || 0;
      item.hours += Number(row.durationMinutes) / 60;
    });
    const platforms = Object.entries(platformTotals).filter(([, value]) => value.hours).map(([name, value]) => [name, value.gross / value.hours]).sort((a, b) => b[1] - a[1]);
    if (platforms[0]) tips.push(`${platforms[0][0]} is your strongest tracked platform at ${formatMoney(platforms[0][1])}/hr.`);
    const rowsWithMileage = rows.filter(row => Number.isFinite(row.distanceMiles) && row.durationMinutes);
    if (rowsWithMileage.length >= 3) {
      const gross = rowsWithMileage.reduce((sum, row) => sum + row.grossEarnings, 0);
      const miles = rowsWithMileage.reduce((sum, row) => sum + row.distanceMiles, 0);
      if (miles > 0) tips.push(`Your recorded gross is ${formatMoney(gross / miles)} per mile; compare distant route suggestions against this baseline.`);
    }
    if (!tips.length) tips.push('Import an earnings CSV to unlock your strongest time blocks, platform comparisons and gross-per-mile coaching. Manual entry is a last resort.');
    return tips.slice(0, 3);
  }
  function injectLocalRate() {
    const root = document.getElementById('workspaceContent');
    if (!root || document.getElementById('localRateSection')) return;
    const shifts = completedShifts(), imported = safeParse(localStorage.getItem('homeBaseEarningsProfile'), {}) || {}, hours = Number(imported.totalHours) || shifts.reduce((sum, row) => sum + (Number(row.hours) || 0), 0), gross = Number(imported.totalGross) || shifts.reduce((sum, row) => sum + (Number(row.gross) || 0), 0), ownRate = hours ? gross / hours : null, historyCount = Number(imported.rows) || shifts.length, loggedRows = loggedTripRows();
    root.insertAdjacentHTML('beforeend', '<section class="workspace-section" id="localRateSection"><div class="section-head"><h3>HOME BASE DRIVER RATE</h3><span class="section-tag">ON THIS DEVICE</span></div><div class="earnings-grid"><div class="earnings-metric"><span>YOUR IMPORTED / TRACKED GROSS / HR</span><b>' + formatMoney(ownRate) + (ownRate ? '/hr' : '') + '</b></div><div class="earnings-metric"><span>IMPORTED ROWS / SHIFTS</span><b>' + historyCount.toLocaleString() + '</b></div></div><p class="workspace-note">Calculated from imported earnings or Home Base shift entries, separately from modeled platform forecasts. Your data stays in this browser and is not uploaded.</p><div class="callout"><b>PROFIT COACH</b><br>' + profitTips([...savedTrips(), ...loggedRows]).map(safeText).join('<br>') + '</div><div class="status-line" id="localRateStatus"></div></section>');
  }
  function injectReadinessAudit() {
    const root = document.getElementById('workspaceContent');
    if (!root || document.getElementById('readinessAudit')) return;
    const providerActive = providerUberPoints.length > 0;
    const items = [
      ['Accounts + cloud synchronization', 'APPROVAL / BACKEND NEEDED'],
      ['Licensed live-data integrations', providerActive ? 'LIVE SAMPLE' : 'CREDENTIALS / APPROVAL'],
      ['Server-based push notifications', 'BACKEND NEEDED'],
      ['Subscription + billing system', 'BUSINESS SETUP'],
      ['Privacy, terms + data deletion', 'ACTIVE LOCALLY'],
      ['Secure backend / API proxy', 'ACTIVE FOR PROVIDERS'],
      ['Native iOS + Android releases', 'PWA ONLY'],
      ['Guided onboarding', 'ACTIVE'],
      ['Forecast accuracy tracking', 'ACTIVE'],
      ['Automatic mileage + shift tracking', 'ACTIVE'],
      ['Analytics + crash monitoring', 'ACTIVE LOCALLY'],
      ['Professional customer support', 'SERVICE NEEDED'],
      ['Accessibility certification', 'FEATURES ACTIVE / AUDIT NEEDED'],
      ['Multi-market administration', 'PREFERENCES ACTIVE / ADMIN NEEDED'],
      ['Visual product system', 'ACTIVE']
    ];
    root.insertAdjacentHTML('beforeend', '<section class="workspace-section" id="readinessAudit"><div class="section-head"><h3>15-POINT PRODUCT AUDIT</h3><span class="section-tag">VERIFIED STATUS</span></div><div class="integration-list">' + items.map(item => '<div class="integration-row"><div><b>' + safeText(item[0]) + '</b></div><em class="integration-state">' + safeText(item[1]) + '</em></div>').join('') + '</div></section>');
  }

  document.getElementById('navEarn')?.addEventListener('click', () => setTimeout(injectLocalRate, 0));
  document.getElementById('navSupport')?.addEventListener('click', () => setTimeout(injectReadinessAudit, 0));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refreshLiveDemand(); });
  ensureFreshnessBadge();
  setInterval(refreshLiveDemand, LIVE_POLL_MS);
  setTimeout(refreshLiveDemand, 2500);
  window.HomeBaseLive = { refreshDemand: refreshLiveDemand, refreshEarnings: injectLocalRate };
})();
