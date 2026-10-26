import { isAllowedOrigin } from './cors.mjs';
// Records that a driver is using the app in a market (market ids only: no user,
// device or location) and, when that market's live data has not been refreshed
// recently, starts the live-signals refresh for the active markets. Feeds that cost
// money or quota (Ticketmaster, Uber, FlightAware, Booking) are then called only
// where drivers are working.
export const MARKETS = ['baltimore', 'north-jersey', 'new-york', 'london', 'washington-dc', 'miami'];
export const REPO = 'Home-base-drivers/Home-base-app';
export const WORKFLOW = 'live-signals.yml';
export const MARKET_MINUTES = 30;   // at most one on-demand refresh per market per 30 min
export const GLOBAL_MINUTES = 10;   // and one overall per 10 min
export const ACTIVE_MINUTES = 120;  // a market stays "active" for 2 h after a driver's last ping

export function marketActivityHandler(createClient, env, request = fetch) {
  return async req => {
    const origin = isAllowedOrigin(req.headers.get('Origin')) ? req.headers.get('Origin') : 'https://homebasedrivers.com';
    const cors = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
      'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin' };
    const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
    if (req.headers.get('Origin') && !isAllowedOrigin(req.headers.get('Origin'))) return reply(403, { error: 'Origin not allowed' });
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (req.method !== 'POST') return reply(405, { error: 'POST required' });
    let body;
    try { body = await req.json(); } catch { return reply(400, { error: 'JSON body required' }); }
    const markets = [...new Set((Array.isArray(body?.markets) ? body.markets : [body?.market]).filter(m => MARKETS.includes(m)))].slice(0, MARKETS.length);
    if (!markets.length) return reply(400, { error: 'Unknown market' });
    const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
    const touched = await admin.rpc('touch_markets', { p_markets: markets });
    if (touched.error) return reply(503, { error: 'Activity not recorded' });
    const token = env('GITHUB_DISPATCH_TOKEN');
    if (!token) return reply(200, { recorded: markets, refresh: 'scheduled' });
    const claim = await admin.rpc('claim_market_refresh', { p_market: markets[0], p_market_minutes: MARKET_MINUTES, p_global_minutes: GLOBAL_MINUTES });
    if (claim.error) return reply(200, { recorded: markets, refresh: 'scheduled' });
    if (claim.data !== true) return reply(200, { recorded: markets, refresh: 'recent' });
    const active = await admin.rpc('active_markets', { p_minutes: ACTIVE_MINUTES });
    const list = [...new Set([...markets, ...((active.data || []).filter(m => MARKETS.includes(m)))])];
    try {
      const r = await request(`https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'home-base-market-activity', 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: 'main', inputs: { markets: list.join(',') } })
      });
      return reply(200, { recorded: markets, refresh: r.status === 204 ? 'started' : 'scheduled' });
    } catch {
      return reply(200, { recorded: markets, refresh: 'scheduled' });
    }
  };
}
