// Home Base subscriptions through Stripe Checkout (web), so no app-store cut.
// The phone asks for a checkout or portal link; Stripe tells the server what was
// paid (signed webhook), and only then does the server change the driver's plan.
// Sales stay closed until BILLING_ENABLED=true (GPT must be funded before selling Plus).
// Before that, owners can still run a full TEST purchase: with a Stripe test key
// (sk_test_...), accounts listed in BILLING_TEST_EMAILS may check out. No real money
// moves, everyone else still sees "Opens soon", and a live key never opens this way.
// Owner/complimentary plans are never changed by Stripe.
// Live setup needs only STRIPE_SECRET_KEY: the server creates (once, idempotently) the
// products and prices (found again by lookup key), the webhook endpoint and the customer
// portal configuration. Without STRIPE_WEBHOOK_SECRET, each webhook is verified by
// fetching the event back from Stripe with the secret key and using Stripe's copy.

const STRIPE = 'https://api.stripe.com/v1';
const ORIGIN = 'https://home-base-drivers.github.io';
const APP_URL = ORIGIN + '/Home-base-app/';
const MINUTES_PACK_SECONDS = 6000; // 100 GPT Live minutes
const GRACE_SECONDS = 3 * 86400; // a late renewal does not cut a driver off mid-shift
export const WEBHOOK_URL = 'https://nixihmurdtfcbffgvpij.supabase.co/functions/v1/billing';
export const LEGAL_URL = APP_URL + 'legal.html';
export const WEBHOOK_EVENTS = ['checkout.session.completed', 'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted'];
export const CATALOG = {
  plus: { product: 'homebase_plus', name: 'Home Base Plus', description: 'GPT answers by text or voice and 120 GPT Live minutes a month.', amount: 1999, lookup: 'homebase_plus_monthly', recurring: true },
  pro: { product: 'homebase_pro', name: 'Home Base Pro', description: 'Everything in Plus and 260 GPT Live minutes a month.', amount: 3999, lookup: 'homebase_pro_monthly', recurring: true },
  minutes: { product: 'homebase_minutes_100', name: 'Home Base 100 GPT Live minutes', description: '100 extra GPT Live minutes for the current month (Plus and Pro).', amount: 1499, lookup: 'homebase_minutes_100', recurring: false }
};
const setupCache = new Map(); // per secret-key mode, per warm instance

export function form(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') form(v, key, out); else out.append(key, String(v));
  }
  return out;
}

const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
// Stripe-Signature: t=<unix>,v1=<hex hmac sha256 of "t.body">. Constant-time compare.
export async function verifyStripeSignature(body, header, secret, now = Math.floor(Date.now() / 1000), tolerance = 300) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(',').map(p => p.split('=')).filter(p => p.length === 2).map(([k, v]) => [k.trim(), v.trim()]));
  const sigs = header.split(',').filter(p => p.trim().startsWith('v1=')).map(p => p.trim().slice(3));
  const t = Number(parts.t);
  if (!Number.isFinite(t) || Math.abs(now - t) > tolerance || !sigs.length) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expected = hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${body}`)));
  return sigs.some(s => s.length === expected.length && [...s].reduce((d, c, i) => d | (c.charCodeAt(0) ^ expected.charCodeAt(i)), 0) === 0);
}

export function localMonth(now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit' }).formatToParts(now).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-01`;
}

export function billingHandler(createClient, env, fetchImpl = fetch) {
  let resolved = null;
  const envPrices = () => ({ plus: env('STRIPE_PRICE_PLUS'), pro: env('STRIPE_PRICE_PRO'), minutes: env('STRIPE_PRICE_MINUTES') });
  const prices = () => ({ ...(resolved?.prices || {}), ...Object.fromEntries(Object.entries(envPrices()).filter(([, v]) => v)) });
  const planForPrice = id => Object.entries(prices()).find(([plan, p]) => p && p === id && plan !== 'minutes')?.[0] || null;
  const stripe = async (method, path, body, idempotencyKey) => {
    const headers = { Authorization: 'Bearer ' + env('STRIPE_SECRET_KEY'), 'Content-Type': 'application/x-www-form-urlencoded' };
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
    const res = await fetchImpl(STRIPE + path, { method, headers, body: body ? form(body).toString() : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error('Payment provider error'), { status: res.status, stripeCode: data?.error?.code });
    return data;
  };
  const mode = () => String(env('STRIPE_SECRET_KEY') || '').startsWith('sk_live_') || String(env('STRIPE_SECRET_KEY') || '').startsWith('rk_live_') ? 'live' : 'test';

  // Create-or-find everything Stripe needs. Safe to run repeatedly and concurrently:
  // fixed product ids, unique price lookup keys, endpoint/portal found by URL/metadata.
  async function ensureSetup() {
    const cacheKey = mode() + ':' + String(env('STRIPE_SECRET_KEY') || '').slice(-6);
    if (setupCache.has(cacheKey)) return (resolved = setupCache.get(cacheKey));
    const out = { prices: {}, portal: null, webhook: null, mode: mode() };
    const env0 = envPrices();
    const needLookup = Object.keys(CATALOG).filter(k => !env0[k]);
    if (needLookup.length) {
      const q = needLookup.map(k => 'lookup_keys[]=' + CATALOG[k].lookup).join('&');
      const found = await stripe('GET', '/prices?active=true&limit=10&' + q);
      for (const pr of found.data || []) { const k = needLookup.find(x => CATALOG[x].lookup === pr.lookup_key); if (k) out.prices[k] = pr.id; }
      for (const k of needLookup.filter(x => !out.prices[x])) {
        const c = CATALOG[k];
        try { await stripe('GET', '/products/' + c.product); }
        catch (e) {
          if (e.status !== 404) throw e;
          try { await stripe('POST', '/products', { id: c.product, name: c.name, description: c.description, metadata: { app: 'homebase' } }, 'homebase-product-' + c.product); }
          catch (e2) { if (e2.stripeCode !== 'resource_already_exists') throw e2; }
        }
        const price = await stripe('POST', '/prices', { product: c.product, currency: 'usd', unit_amount: c.amount, lookup_key: c.lookup, transfer_lookup_key: 'true',
          ...(c.recurring ? { recurring: { interval: 'month' } } : {}), metadata: { app: 'homebase' } }, 'homebase-price-' + c.lookup + '-' + c.amount);
        out.prices[k] = price.id;
      }
    }
    const all = { ...out.prices, ...Object.fromEntries(Object.entries(env0).filter(([, v]) => v)) };
    const hooks = await stripe('GET', '/webhook_endpoints?limit=100');
    let hook = (hooks.data || []).find(h => h.url === WEBHOOK_URL);
    if (!hook) hook = await stripe('POST', '/webhook_endpoints', { url: WEBHOOK_URL, enabled_events: WEBHOOK_EVENTS, description: 'Home Base billing', metadata: { app: 'homebase' } }, 'homebase-webhook-v1');
    else if (WEBHOOK_EVENTS.some(e => !(hook.enabled_events || []).includes(e) && !(hook.enabled_events || []).includes('*')) || hook.status === 'disabled')
      hook = await stripe('POST', '/webhook_endpoints/' + hook.id, { enabled_events: WEBHOOK_EVENTS, disabled: 'false' });
    out.webhook = hook.id;
    const portals = await stripe('GET', '/billing_portal/configurations?active=true&limit=100');
    let portal = (portals.data || []).find(c => c.metadata?.app === 'homebase');
    if (!portal) portal = await stripe('POST', '/billing_portal/configurations', {
      business_profile: { headline: 'Manage your Home Base plan', privacy_policy_url: LEGAL_URL + '#privacy', terms_of_service_url: LEGAL_URL + '#terms' },
      default_return_url: APP_URL + '?billing=portal',
      features: { invoice_history: { enabled: 'true' }, payment_method_update: { enabled: 'true' }, customer_update: { enabled: 'true', allowed_updates: { 0: 'email', 1: 'address' } },
        subscription_cancel: { enabled: 'true', mode: 'at_period_end', proration_behavior: 'none' },
        subscription_update: { enabled: 'true', default_allowed_updates: { 0: 'price' }, proration_behavior: 'create_prorations',
          products: { 0: { product: CATALOG.plus.product, prices: { 0: all.plus } }, 1: { product: CATALOG.pro.product, prices: { 0: all.pro } } } } },
      metadata: { app: 'homebase' } }, 'homebase-portal-v1-' + all.plus + all.pro);
    out.portal = portal.id;
    setupCache.set(cacheKey, out);
    return (resolved = out);
  }
  const cors = { 'Access-Control-Allow-Origin': ORIGIN, 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin' };
  const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  const admin = () => createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
  const configured = () => !!env('STRIPE_SECRET_KEY');
  const open = () => configured() && env('BILLING_ENABLED') === 'true';
  const testMode = () => String(env('STRIPE_SECRET_KEY') || '').startsWith('sk_test_');
  const testers = () => String(env('BILLING_TEST_EMAILS') || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  const isTester = user => configured() && testMode() && !!user?.email && testers().includes(String(user.email).toLowerCase());
  const canBuy = user => open() || isTester(user);
  const PROTECTED = ['owner', 'comp'];
  const entitlement = async (db, userId) => (await db.from('ai_entitlements').select('plan,source,current_period_end,extra_voice_seconds,extra_month').eq('user_id', userId).maybeSingle()).data || null;

  async function setPlan(db, userId, plan, periodEnd, extra) {
    const { error } = await db.rpc('set_ai_plan', { p_user: userId, p_plan: plan, p_source: 'stripe', p_period_end: periodEnd,
      p_extra_voice_seconds: extra?.seconds ?? null, p_extra_month: extra?.month ?? null });
    if (error) throw error;
  }
  async function applySubscription(db, sub) {
    let userId = sub.metadata?.user_id || null;
    if (!userId) { const { data } = await db.from('billing_customers').select('user_id').eq('stripe_customer_id', sub.customer).maybeSingle(); userId = data?.user_id || null; }
    if (!userId) return 'unknown customer';
    const kept = PROTECTED.includes((await entitlement(db, userId))?.source);
    const item = sub.items?.data?.[0], priceId = item?.price?.id || null, plan = planForPrice(priceId);
    const end = Number(sub.current_period_end ?? item?.current_period_end) || null;
    const live = ['active', 'trialing', 'past_due'].includes(sub.status) && plan;
    await db.from('billing_customers').upsert({ user_id: userId, stripe_customer_id: sub.customer, subscription_id: sub.id, subscription_status: sub.status,
      price_id: priceId, plan: live ? plan : 'free', current_period_end: end ? new Date(end * 1000).toISOString() : null, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    if (kept) return 'owner plan kept';
    await setPlan(db, userId, live ? plan : 'free', live && end ? new Date((end + GRACE_SECONDS) * 1000).toISOString() : null);
    return live ? 'plan ' + plan : 'plan free';
  }
  async function addMinutes(db, userId) {
    const data = await entitlement(db, userId);
    if (PROTECTED.includes(data?.source)) return 'owner plan kept';
    const month = localMonth(), current = data?.extra_month === month ? Number(data.extra_voice_seconds) || 0 : 0;
    const { error } = await db.rpc('set_ai_plan', { p_user: userId, p_plan: data?.plan || 'free', p_source: 'stripe', p_period_end: data?.current_period_end ?? null,
      p_extra_voice_seconds: current + MINUTES_PACK_SECONDS, p_extra_month: month });
    if (error) throw error;
    return 'minutes added';
  }

  async function webhook(request) {
    const body = await request.text();
    let event;
    if (env('STRIPE_WEBHOOK_SECRET')) {
      if (!await verifyStripeSignature(body, request.headers.get('Stripe-Signature'), env('STRIPE_WEBHOOK_SECRET'))) return reply(400, { error: 'Bad signature' });
      event = JSON.parse(body);
    } else {
      // No signing secret: trust only Stripe's own copy of the event.
      const id = (() => { try { return JSON.parse(body)?.id; } catch { return null; } })();
      if (!configured() || !/^evt_[A-Za-z0-9]+$/.test(String(id || ''))) return reply(400, { error: 'Bad event' });
      try { event = await stripe('GET', '/events/' + id); } catch (e) { if (e.status === 404) return reply(400, { error: 'Unknown event' }); throw e; }
    }
    await ensureSetup();
    const db = admin();
    // Stripe retries; each event changes a plan at most once.
    const { error: seen } = await db.from('billing_events').insert({ id: event.id, type: event.type });
    if (seen?.code === '23505') return reply(200, { received: true, duplicate: true });
    if (seen) throw seen;
    let result = 'ignored';
    const o = event.data?.object || {};
    try {
      if (event.type === 'checkout.session.completed') {
        if (o.mode === 'subscription' && o.subscription) result = await applySubscription(db, { ...(await stripe('GET', '/subscriptions/' + o.subscription)), metadata: { user_id: o.client_reference_id || o.metadata?.user_id } });
        else if (o.mode === 'payment' && o.metadata?.kind === 'minutes' && o.payment_status === 'paid') result = await addMinutes(db, o.client_reference_id || o.metadata?.user_id);
      } else if (['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted'].includes(event.type)) {
        result = await applySubscription(db, o);
      }
    } catch (e) {
      // Let Stripe retry: forget the event so the retry is processed, not skipped.
      await db.from('billing_events').delete().eq('id', event.id);
      throw e;
    }
    await db.from('billing_events').update({ result }).eq('id', event.id);
    return reply(200, { received: true, result });
  }

  // Public, secret-free readiness check; also performs first-time Stripe setup.
  async function health() {
    if (!configured()) return reply(200, { configured: false, mode: null, ready: false, open: false });
    let setup = null, problem = null;
    try { setup = await ensureSetup(); } catch (e) { problem = e?.stripeCode || 'setup_failed'; }
    const ready = !!setup && !!prices().plus && !!prices().pro && !!prices().minutes && !!setup.portal && !!setup.webhook;
    console.log(JSON.stringify({ event: 'homebase_billing_health', mode: mode(), ready, open: open(), problem }));
    return reply(200, { configured: true, mode: mode(), ready, open: open(), problem, prices: setup ? prices() : null, webhook: setup?.webhook || null, portal: setup?.portal || null });
  }

  return async request => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method === 'GET' && new URL(request.url).searchParams.get('health') === '1') { try { return await health(); } catch { return reply(502, { error: 'unavailable' }); } }
    if (request.method !== 'POST') return reply(405, { error: 'POST required' });
    try {
      if (request.headers.get('Stripe-Signature')) return await webhook(request);
      if (request.headers.get('Origin') && request.headers.get('Origin') !== ORIGIN) return reply(403, { error: 'Origin not allowed' });
      const peek = await request.clone().json().catch(() => ({}));
      if (peek.operation === 'health') return await health();
      const token = request.headers.get('Authorization')?.match(/^Bearer (.+)$/)?.[1];
      if (!token) return reply(401, { error: 'Sign in first' });
      const db = admin();
      const { data, error } = await db.auth.getUser(token);
      if (error || !data?.user?.id || data.user.is_anonymous) return reply(401, { error: 'Sign in again' });
      const user = data.user, body = await request.json().catch(() => ({}));
      const { data: customer } = await db.from('billing_customers').select('*').eq('user_id', user.id).maybeSingle();
      if (configured()) { try { await ensureSetup(); } catch (e) { if (body.operation !== 'status') throw e; } }
      if (body.operation === 'status') {
        const { data: plans } = await db.from('ai_plan_limits').select('plan,included_voice_seconds,monthly_price_usd');
        return reply(200, { open: canBuy(user), test: !open() && isTester(user), configured: configured(), plans: plans || [], subscription: customer ? { plan: customer.plan, status: customer.subscription_status, renews: customer.current_period_end } : null });
      }
      if (body.operation === 'portal') {
        if (!configured()) return reply(503, { error: 'Subscriptions are not set up yet.', code: 'billing_closed' });
        if (!customer?.stripe_customer_id) return reply(404, { error: 'No subscription to manage yet.' });
        const portal = await stripe('POST', '/billing_portal/sessions', { customer: customer.stripe_customer_id, return_url: APP_URL + '?billing=portal', configuration: resolved?.portal || undefined });
        return reply(200, { url: portal.url });
      }
      if (body.operation === 'checkout') {
        if (!canBuy(user)) return reply(503, { error: 'Home Base Plus opens soon. The built-in AI stays free.', code: 'billing_closed' });
        const kind = ['plus', 'pro', 'minutes'].includes(body.plan) ? body.plan : null;
        if (PROTECTED.includes((await entitlement(db, user.id))?.source)) return reply(409, { error: 'Your account already has Pro access as an owner. Use a separate account to test purchases.', code: 'owner_plan' });
        if (!kind || !prices()[kind]) return reply(400, { error: 'Choose Plus, Pro or extra minutes.' });
        if (kind === 'minutes' && !['plus', 'pro'].includes(customer?.plan)) return reply(400, { error: 'Extra minutes are for Plus and Pro members.' });
        if (kind !== 'minutes' && ['plus', 'pro'].includes(customer?.plan) && ['active', 'trialing', 'past_due'].includes(customer?.subscription_status))
          return reply(409, { error: 'You already have a subscription. Use Manage subscription to change plans.', code: 'already_subscribed' });
        let customerId = customer?.stripe_customer_id;
        if (!customerId) {
          const c = await stripe('POST', '/customers', { email: user.email, metadata: { user_id: user.id } });
          customerId = c.id;
          await db.from('billing_customers').upsert({ user_id: user.id, stripe_customer_id: customerId, plan: 'free', updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
        }
        const session = await stripe('POST', '/checkout/sessions', {
          mode: kind === 'minutes' ? 'payment' : 'subscription', customer: customerId, client_reference_id: user.id,
          line_items: { 0: { price: prices()[kind], quantity: 1 } },
          success_url: APP_URL + '?billing=success', cancel_url: APP_URL + '?billing=cancel', allow_promotion_codes: 'true', billing_address_collection: 'auto',
          custom_text: { submit: { message: 'Cancel anytime in Manage subscription. Terms and refund policy: ' + LEGAL_URL } },
          metadata: { user_id: user.id, kind },
          ...(kind === 'minutes' ? {} : { subscription_data: { metadata: { user_id: user.id } } })
        });
        return reply(200, { url: session.url });
      }
      return reply(400, { error: 'Unsupported operation' });
    } catch (e) {
      console.error(JSON.stringify({ event: 'homebase_billing_failure', status: e?.status, code: e?.stripeCode || e?.code }));
      return reply(502, { error: 'Payments are temporarily unavailable. Please try again.' });
    }
  };
}
