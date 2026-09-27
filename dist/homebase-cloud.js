(function () {
  'use strict';

  const LIVE_POLL_MS = 120000;
  const LIVE_MAX_AGE_MS = 12 * 60000;
  const STALE_MAX_AGE_MS = 25 * 60000;
  const HISTORY_LIMIT = 18;
  const CLOUD_KEYS = [
    'homeBaseDriverProfile', 'homeBaseProductPrefs', 'homeBaseEarningsProfile',
    'homeBaseCostPrefs', 'homeBaseAlertPrefs', 'homeBaseShifts',
    'homeBaseForecastAccuracy', 'homeBaseTripRows', 'homeBaseCommunityOptIn'
  ];
  const config = window.HOME_BASE_CONFIG || {};
  const cloudReady = Boolean(config.supabaseUrl && config.supabasePublishableKey && window.supabase?.createClient);
  const cloud = cloudReady ? window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  }) : null;
  let session = null;
  let latestProviderGeneratedAt = '';
  let currentMarket = 'Baltimore';

  const liveStyle = document.createElement('style');
  liveStyle.textContent = '.homebase-demand-area{transition:fill .8s ease,fill-opacity .8s ease}.cloud-offline{color:#93a8b4}';
  document.head.appendChild(liveStyle);

  function safeParse(value, fallback = null) {
    try { return JSON.parse(value); } catch { return fallback; }
  }
  function localValue(key) { return safeParse(localStorage.getItem(key)); }
  function snapshot() {
    return CLOUD_KEYS.reduce((result, key) => {
      const value = localStorage.getItem(key);
      if (value !== null) result[key] = safeParse(value, value);
      return result;
    }, {});
  }
  function restoreMissing(state) {
    if (!state || typeof state !== 'object') return;
    CLOUD_KEYS.forEach(key => {
      if (localStorage.getItem(key) === null && state[key] !== undefined) {
        localStorage.setItem(key, typeof state[key] === 'string' ? state[key] : JSON.stringify(state[key]));
      }
    });
  }
  function marketName() {
    const profile = localValue('homeBaseDriverProfile') || {};
    const heading = document.getElementById('marketHeading')?.textContent?.split('—')[0]?.trim();
    return profile.market || heading || currentMarket;
  }
  function moneyValue(value) {
    const formatter = new Intl.NumberFormat(undefined, { style: 'currency', currency: currentMoney?.code || 'USD', maximumFractionDigits: 0 });
    return Number.isFinite(value) ? formatter.format(value) : 'Not enough data';
  }
  function setStatus(node, text, error = false) {
    if (!node) return;
    node.textContent = text;
    node.style.color = error ? '#ff9aa4' : '#77d8ff';
  }

  async function syncSnapshot(reason = 'manual') {
    if (!cloud || !session?.user) return false;
    const profile = localValue('homeBaseDriverProfile') || {};
    const state = snapshot();
    const { error } = await cloud.from('user_state').upsert({
      user_id: session.user.id,
      state,
      market: marketName(),
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });
    if (error) throw error;
    await cloud.from('profiles').upsert({
      id: session.user.id,
      display_name: profile.name || null,
      home_market: profile.market || marketName(),
      last_active_at: new Date().toISOString()
    }, { onConflict: 'id' });
    await cloud.from('progress_events').insert({ user_id: session.user.id, event_type: 'cloud_sync', metadata: { reason } });
    return true;
  }

  async function restoreCloudState() {
    if (!cloud || !session?.user) return;
    const { data, error } = await cloud.from('user_state').select('state').eq('user_id', session.user.id).maybeSingle();
    if (error) throw error;
    restoreMissing(data?.state);
    await syncSnapshot('sign_in');
  }

  async function recordProgress(eventType, metadata = {}) {
    if (!cloud || !session?.user) return;
    await cloud.from('progress_events').insert({ user_id: session.user.id, event_type: eventType, metadata });
  }

  if (typeof hbTrack === 'function') {
    const localTrack = hbTrack;
    hbTrack = function (eventType, metadata) {
      localTrack(eventType, metadata);
      recordProgress(eventType, metadata || {}).catch(() => {});
    };
  }

  function accountSection() {
    const signedIn = Boolean(session?.user);
    const stateLabel = cloudReady ? (signedIn ? 'CLOUD ACTIVE' : 'SIGN IN AVAILABLE') : 'SETUP REQUIRED';
    return '<section class="workspace-section" id="cloudAccountSection">' +
      '<div class="section-head"><h3>HOME BASE ACCOUNT</h3><span class="section-tag">' + stateLabel + '</span></div>' +
      (signedIn
        ? '<p class="workspace-note">Signed in as <b>' + safeText(session.user.email || 'Home Base user') + '</b>. Profile, progress, shifts, preferences and uploaded trip summaries can follow you across devices.</p>' +
          '<div class="inline-actions"><button class="primary-action" id="cloudSyncNow">SYNC NOW</button><button class="secondary-action" id="cloudSignOut">SIGN OUT</button></div>' +
          '<button class="danger-action" id="cloudDeleteData" style="width:100%;margin-top:8px">DELETE MY CLOUD APP DATA</button>'
        : cloudReady
          ? '<p class="workspace-note">Use an email magic link. No password is stored by Home Base.</p><label class="field field-wide">Email<input id="cloudEmail" type="email" autocomplete="email" placeholder="driver@example.com"></label><button class="primary-action" id="cloudSignIn" style="width:100%;margin-top:9px">EMAIL ME A SIGN-IN LINK</button>'
          : '<p class="workspace-note">The secure database integration is installed, but the owners still need to configure the Supabase project URL and publishable key. Local mode remains available.</p>') +
      '<div class="status-line" id="cloudAccountStatus"></div></section>';
  }

  function injectAccount() {
    const root = document.getElementById('workspaceContent');
    if (!root || document.getElementById('cloudAccountSection')) return;
    root.insertAdjacentHTML('afterbegin', accountSection());
    const status = document.getElementById('cloudAccountStatus');
    document.getElementById('cloudSignIn')?.addEventListener('click', async () => {
      const email = document.getElementById('cloudEmail')?.value?.trim();
      if (!email) return setStatus(status, 'Enter your email address.', true);
      setStatus(status, 'Sending secure sign-in link…');
      const { error } = await cloud.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
      setStatus(status, error ? error.message : 'Check your email and open the Home Base sign-in link.', Boolean(error));
    });
    document.getElementById('cloudSyncNow')?.addEventListener('click', async () => {
      try { setStatus(status, 'Synchronizing…'); await syncSnapshot('manual'); setStatus(status, 'Cloud progress is up to date.'); }
      catch (error) { setStatus(status, error.message || 'Cloud sync failed.', true); }
    });
    document.getElementById('cloudSignOut')?.addEventListener('click', async () => { await cloud.auth.signOut(); });
    document.getElementById('cloudDeleteData')?.addEventListener('click', async () => {
      if (!confirm('Delete your Home Base profile, trip uploads, progress and saved cloud state? Your authentication login will remain so you can sign back in.')) return;
      setStatus(status, 'Deleting cloud app data…');
      const { error } = await cloud.rpc('delete_my_home_base_data');
      setStatus(status, error ? error.message : 'Your cloud app data was deleted.', Boolean(error));
    });
  }

  function findColumn(headers, choices) {
    const normalized = headers.map(value => String(value || '').trim().toLowerCase());
    return normalized.findIndex(value => choices.some(choice => value === choice || value.includes(choice)));
  }
  function amount(value) {
    const parsed = Number(String(value || '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }
  function hours(value) {
    const text = String(value || '').trim();
    if (!text) return null;
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(text)) {
      const parts = text.split(':').map(Number);
      return parts[0] + parts[1] / 60 + (parts[2] || 0) / 3600;
    }
    const valueNumber = amount(text);
    return Number.isFinite(valueNumber) ? valueNumber : null;
  }
  function parseTripUpload(text, filename) {
    const rows = csvRows(text);
    if (rows.length < 2) return [];
    const headers = rows[0];
    const indexes = {
      gross: findColumn(headers, ['gross earnings', 'total earnings', 'earnings', 'gross pay', 'payout', 'fare', 'amount']),
      duration: findColumn(headers, ['online hours', 'online time', 'active hours', 'active time', 'engaged hours', 'hours', 'duration']),
      platform: findColumn(headers, ['platform', 'app', 'provider', 'service', 'source']),
      started: findColumn(headers, ['start time', 'started at', 'trip date', 'date', 'pickup time']),
      miles: findColumn(headers, ['distance miles', 'miles', 'distance', 'trip mileage'])
    };
    if (indexes.gross < 0) return [];
    const defaultPlatform = Object.keys(earningsProfile?.platforms || {})[0] || 'Unknown';
    return rows.slice(1).map((row, rowIndex) => {
      const gross = amount(row[indexes.gross]);
      if (!Number.isFinite(gross)) return null;
      const workedHours = indexes.duration >= 0 ? hours(row[indexes.duration]) : null;
      const rawDate = indexes.started >= 0 ? row[indexes.started] : '';
      const parsedDate = rawDate && Number.isFinite(Date.parse(rawDate)) ? new Date(rawDate) : null;
      return {
        source_row: rowIndex + 2,
        platform: String(indexes.platform >= 0 ? row[indexes.platform] || defaultPlatform : defaultPlatform).slice(0, 60),
        started_at: parsedDate ? parsedDate.toISOString() : null,
        duration_minutes: Number.isFinite(workedHours) ? Math.round(workedHours * 60) : null,
        gross_earnings: gross,
        distance_miles: indexes.miles >= 0 ? amount(row[indexes.miles]) : null,
        market: marketName(),
        source_filename: filename
      };
    }).filter(Boolean);
  }

  function localTripRows() { return localValue('homeBaseTripRows') || []; }
  function saveLocalTrips(rows) {
    const combined = [...localTripRows(), ...rows].slice(-5000);
    localStorage.setItem('homeBaseTripRows', JSON.stringify(combined));
    return combined;
  }
  function bestTimeRecommendation(rows) {
    const buckets = new Map();
    rows.forEach(row => {
      if (!row.started_at || !row.duration_minutes) return;
      const date = new Date(row.started_at);
      if (!Number.isFinite(date.getTime())) return;
      const key = `${date.getDay()}-${date.getHours()}`;
      const item = buckets.get(key) || { gross: 0, hours: 0, count: 0, day: date.getDay(), hour: date.getHours() };
      item.gross += Number(row.gross_earnings) || 0;
      item.hours += Number(row.duration_minutes) / 60;
      item.count += 1;
      buckets.set(key, item);
    });
    return [...buckets.values()].filter(item => item.count >= 2 && item.hours > 0).sort((a, b) => b.gross / b.hours - a.gross / a.hours)[0] || null;
  }
  async function communityBenchmark() {
    if (!cloud || !session?.user) return null;
    const now = new Date();
    const { data, error } = await cloud.rpc('get_market_hourly_benchmark', { p_market: marketName(), p_day: now.getDay(), p_hour: now.getHours() });
    if (error) throw error;
    return Array.isArray(data) ? data[0] || null : data;
  }
  function recommendations(rows, benchmark) {
    const tips = [];
    const ownRate = earningsProfile?.totalHours ? earningsProfile.totalGross / earningsProfile.totalHours : null;
    const best = bestTimeRecommendation(rows);
    if (best) tips.push(`Your strongest recorded block is ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][best.day]} around ${new Date(2000,0,1,best.hour).toLocaleTimeString([], { hour: 'numeric' })} at ${moneyValue(best.gross / best.hours)}/hr.`);
    if (benchmark?.gross_per_hour && ownRate) {
      const gap = ownRate - Number(benchmark.gross_per_hour);
      tips.push(gap >= 0 ? `You are ${moneyValue(gap)}/hr above the local Home Base benchmark.` : `The local Home Base benchmark is ${moneyValue(Math.abs(gap))}/hr above your uploaded average; compare its strongest hours before changing platforms.`);
    }
    const platforms = Object.entries(earningsProfile?.platforms || {}).filter(([, value]) => value.rate).sort((a, b) => b[1].rate - a[1].rate);
    if (platforms[0]) tips.push(`${platforms[0][0]} is your strongest uploaded platform at ${moneyValue(platforms[0][1].rate)}/hr.`);
    if (!tips.length) tips.push('Upload trip data with date/time and online-hours columns to unlock local profit recommendations.');
    return tips.slice(0, 3);
  }

  async function injectEarningsCloud() {
    const root = document.getElementById('workspaceContent');
    if (!root || document.getElementById('communityRateSection')) return;
    const ownRate = earningsProfile?.totalHours ? earningsProfile.totalGross / earningsProfile.totalHours : null;
    const optIn = localStorage.getItem('homeBaseCommunityOptIn') === 'true';
    let benchmark = null;
    try { benchmark = await communityBenchmark(); } catch { /* local mode still works */ }
    const rows = localTripRows();
    root.insertAdjacentHTML('beforeend', '<section class="workspace-section" id="communityRateSection"><div class="section-head"><h3>HOME BASE DRIVER RATE</h3><span class="section-tag">UPLOADED TRIPS</span></div><div class="earnings-grid"><div class="earnings-metric"><span>YOUR HOME BASE RATE</span><b>' + moneyValue(ownRate) + (ownRate ? '/hr' : '') + '</b></div><div class="earnings-metric"><span>LOCAL MEMBER BENCHMARK</span><b>' + (benchmark?.gross_per_hour ? moneyValue(Number(benchmark.gross_per_hour)) + '/hr' : 'Building sample') + '</b></div></div><p class="workspace-note">The community rate is separate from platform forecasts. It uses consenting Home Base uploads for the same market, day and hour, and appears only after at least 5 users and 20 trips protect anonymity.</p><div class="product-pref"><div><b>Contribute anonymized trip rows</b><span>When signed in, include time, market, platform, gross, mileage and duration in the protected community benchmark.</span></div><button class="switch" id="communityOptIn" role="switch" aria-label="Contribute trip rows" aria-checked="' + optIn + '"></button></div><div class="callout"><b>PROFIT COACH</b><br>' + recommendations(rows, benchmark).map(safeText).join('<br>') + '</div><div class="status-line" id="communityStatus"></div></section>');
    const toggle = document.getElementById('communityOptIn');
    toggle?.addEventListener('click', () => {
      const enabled = toggle.getAttribute('aria-checked') !== 'true';
      toggle.setAttribute('aria-checked', String(enabled));
      localStorage.setItem('homeBaseCommunityOptIn', String(enabled));
      syncSnapshot('community_preference').catch(() => {});
    });
    const input = document.getElementById('earningsCsv');
    input?.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      const parsed = parseTripUpload(await file.text(), file.name);
      saveLocalTrips(parsed);
      const status = document.getElementById('communityStatus');
      if (!session?.user || localStorage.getItem('homeBaseCommunityOptIn') !== 'true') {
        setStatus(status, `Saved ${parsed.length} trip row${parsed.length === 1 ? '' : 's'} on this device. Sign in and opt in to add them to the protected local benchmark.`);
        return;
      }
      try {
        const { data: upload, error: uploadError } = await cloud.from('trip_uploads').insert({ user_id: session.user.id, filename: file.name, row_count: parsed.length, market: marketName() }).select('id').single();
        if (uploadError) throw uploadError;
        for (let i = 0; i < parsed.length; i += 200) {
          const batch = parsed.slice(i, i + 200).map(row => ({ ...row, user_id: session.user.id, upload_id: upload.id }));
          const { error } = await cloud.from('trip_rows').insert(batch);
          if (error) throw error;
        }
        await syncSnapshot('trip_upload');
        setStatus(status, `Saved ${parsed.length} protected trip rows. Community benchmarks will update when the anonymity threshold is met.`);
      } catch (error) { setStatus(status, error.message || 'Trip sync failed.', true); }
    });
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
      badge.textContent = usable ? `DEMAND · ${minutes}M OLD · 2M CHECK` : degraded ? `DEMAND · STALE ${minutes}M` : `DEMAND · MODEL ONLY`;
      badge.style.borderColor = usable ? 'rgba(69,207,255,.55)' : degraded ? 'rgba(255,190,64,.62)' : 'rgba(150,166,177,.4)';
      badge.title = usable ? 'Provider samples refresh every five minutes; this app checks for a new snapshot every two minutes.' : 'Live provider samples are unavailable or too old. The map is showing labeled public-data estimates only.';
      if (generatedAge > STALE_MAX_AGE_MS) badge.textContent = 'DEMAND · FEED EXPIRED';
    } catch {
      badge.textContent = 'DEMAND · MODEL ONLY';
      badge.title = 'No current authorized provider snapshot is available.';
    }
  }

  function injectReadinessAudit() {
    const root = document.getElementById('workspaceContent');
    if (!root || document.getElementById('readinessAudit')) return;
    const providerActive = providerUberPoints.length > 0;
    const items = [
      ['Accounts + cloud synchronization', cloudReady ? 'READY' : 'CONFIG NEEDED'],
      ['Licensed live-data integrations', providerActive ? 'LIVE SAMPLE' : 'CREDENTIALS / APPROVAL'],
      ['Server-based push notifications', 'BACKEND NEEDED'],
      ['Subscription + billing system', 'BUSINESS SETUP'],
      ['Privacy, terms + data deletion', 'ACTIVE'],
      ['Secure backend / API proxy', 'ACTIVE FOR PROVIDERS'],
      ['Native iOS + Android releases', 'PWA ONLY'],
      ['Guided onboarding', 'ACTIVE'],
      ['Forecast accuracy tracking', 'ACTIVE'],
      ['Automatic mileage + shift tracking', 'ACTIVE'],
      ['Analytics + crash monitoring', cloudReady ? 'LOCAL + CLOUD' : 'LOCAL'],
      ['Professional customer support', 'SERVICE NEEDED'],
      ['Accessibility certification', 'FEATURES ACTIVE / AUDIT NEEDED'],
      ['Multi-market administration', 'PREFERENCES ACTIVE / ADMIN NEEDED'],
      ['Visual product system', 'ACTIVE']
    ];
    root.insertAdjacentHTML('beforeend', '<section class="workspace-section" id="readinessAudit"><div class="section-head"><h3>15-POINT PRODUCT AUDIT</h3><span class="section-tag">VERIFIED STATUS</span></div><div class="integration-list">' + items.map(item => '<div class="integration-row"><div><b>' + safeText(item[0]) + '</b></div><em class="integration-state">' + safeText(item[1]) + '</em></div>').join('') + '</div></section>');
  }

  document.getElementById('navProfile')?.addEventListener('click', () => setTimeout(injectAccount, 0));
  document.getElementById('navEarn')?.addEventListener('click', () => setTimeout(injectEarningsCloud, 0));
  document.getElementById('navSupport')?.addEventListener('click', () => setTimeout(injectReadinessAudit, 0));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refreshLiveDemand(); });
  ensureFreshnessBadge();
  setInterval(refreshLiveDemand, LIVE_POLL_MS);
  setTimeout(refreshLiveDemand, 2500);

  if (cloud) {
    cloud.auth.getSession().then(({ data }) => { session = data.session; if (session) restoreCloudState().catch(() => {}); });
    cloud.auth.onAuthStateChange((_event, nextSession) => {
      session = nextSession;
      if (session) restoreCloudState().catch(() => {});
      if (document.getElementById('cloudAccountSection')) {
        document.getElementById('cloudAccountSection').remove();
        injectAccount();
      }
    });
  }

  window.HomeBaseCloud = { sync: syncSnapshot, refreshDemand: refreshLiveDemand, get session() { return session; }, configured: cloudReady };
})();
