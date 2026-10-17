// Home Base subscriptions through Stripe Checkout (web), so no app-store cut.
// The phone asks for a checkout or portal link; Stripe tells the server what was
// paid (signed webhook), and only then does the server change the driver's plan.
// Sales stay closed until BILLING_ENABLED=true (GPT must be funded before selling Plus).

const STRIPE = 'https://api.stripe.com/v1';
const ORIGIN = 'https://home-base-drivers.github.io';
const APP_URL = ORIGIN + '/Home-base-app/';
const MINUTES_PACK_SECONDS = 6000; // 100 GPT Live minutes
const GRACE_SECONDS = 3 * 86400; // a late renewal does not cut a driver off mid-shift

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
  const prices = () => ({ plus: env('STRIPE_PRICE_PLUS'), pro: env('STRIPE_PRICE_PRO'), minutes: env('STRIPE_PRICE_MINUTES') });
  const planForPrice = id => Object.entries(prices()).find(([plan, p]) => p && p === id && plan !== 'minutes')?.[0] || null;
  const stripe = async (method, path, body) => {
    const res = await fetchImpl(STRIPE + path, { method, headers: { Authorization: 'Bearer ' + env('STRIPE_SECRET_KEY'), 'Content-Type': 'application/x-www-form-urlencoded' }, body: body ? form(body).toString() : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error('Payment provider error'), { status: res.status, stripeCode: data?.error?.code });
    return data;
  };
  const cors = { 'Access-Control-Allow-Origin': ORIGIN, 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin' };
  const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  const admin = () => createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
  const configured = () => !!(env('STRIPE_SECRET_KEY') && env('STRIPE_PRICE_PLUS') && env('STRIPE_PRICE_PRO'));
  const open = () => configured() && env('BILLING_ENABLED') === 'true';

  async function setPlan(db, userId, plan, periodEnd, extra) {
    const { error } = await db.rpc('set_ai_plan', { p_user: userId, p_plan: plan, p_source: 'stripe', p_period_end: periodEnd,
      p_extra_voice_seconds: extra?.seconds ?? null, p_extra_month: extra?.month ?? null });
    if (error) throw error;
  }
  async function applySubscription(db, sub) {
    let userId = sub.metadata?.user_id || null;
    if (!userId) { const { data } = await db.from('billing_customers').select('user_id').eq('stripe_customer_id', sub.customer).maybeSingle(); userId = data?.user_id || null; }
    if (!userId) return 'unknown customer';
    const item = sub.items?.data?.[0], priceId = item?.price?.id || null, plan = planForPrice(priceId);
    const end = Number(sub.current_period_end ?? item?.current_period_end) || null;
    const live = ['active', 'trialing', 'past_due'].includes(sub.status) && plan;
    await db.from('billing_customers').upsert({ user_id: userId, stripe_customer_id: sub.customer, subscription_id: sub.id, subscription_status: sub.status,
      price_id: priceId, plan: live ? plan : 'free', current_period_end: end ? new Date(end * 1000).toISOString() : null, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    await setPlan(db, userId, live ? plan : 'free', live && end ? new Date((end + GRACE_SECONDS) * 1000).toISOString() : null);
    return live ? 'plan ' + plan : 'plan free';
  }
  async function addMinutes(db, userId) {
    const { data } = await db.from('ai_entitlements').select('plan,current_period_end,extra_voice_seconds,extra_month').eq('user_id', userId).maybeSingle();
    const month = localMonth(), current = data?.extra_month === month ? Number(data.extra_voice_seconds) || 0 : 0;
    const { error } = await db.rpc('set_ai_plan', { p_user: userId, p_plan: data?.plan || 'free', p_source: 'stripe', p_period_end: data?.current_period_end ?? null,
      p_extra_voice_seconds: current + MINUTES_PACK_SECONDS, p_extra_month: month });
    if (error) throw error;
    return 'minutes added';
  }

  async function webhook(request) {
    const body = await request.text();
    if (!await verifyStripeSignature(body, request.headers.get('Stripe-Signature'), env('STRIPE_WEBHOOK_SECRET'))) return reply(400, { error: 'Bad signature' });
    const event = JSON.parse(body), db = admin();
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

  return async request => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return reply(405, { error: 'POST required' });
    try {
      if (request.headers.get('Stripe-Signature')) return await webhook(request);
      if (request.headers.get('Origin') && request.headers.get('Origin') !== ORIGIN) return reply(403, { error: 'Origin not allowed' });
      const token = request.headers.get('Authorization')?.match(/^Bearer (.+)$/)?.[1];
      if (!token) return reply(401, { error: 'Sign in first' });
      const db = admin();
      const { data, error } = await db.auth.getUser(token);
      if (error || !data?.user?.id || data.user.is_anonymous) return reply(401, { error: 'Sign in again' });
      const user = data.user, body = await request.json().catch(() => ({}));
      const { data: customer } = await db.from('billing_customers').select('*').eq('user_id', user.id).maybeSingle();
      if (body.operation === 'status') {
        const { data: plans } = await db.from('ai_plan_limits').select('plan,included_voice_seconds,monthly_price_usd');
        return reply(200, { open: open(), configured: configured(), plans: plans || [], subscription: customer ? { plan: customer.plan, status: customer.subscription_status, renews: customer.current_period_end } : null });
      }
      if (body.operation === 'portal') {
        if (!configured()) return reply(503, { error: 'Subscriptions are not set up yet.', code: 'billing_closed' });
        if (!customer?.stripe_customer_id) return reply(404, { error: 'No subscription to manage yet.' });
        const portal = await stripe('POST', '/billing_portal/sessions', { customer: customer.stripe_customer_id, return_url: APP_URL + '?billing=portal' });
        return reply(200, { url: portal.url });
      }
      if (body.operation === 'checkout') {
        if (!open()) return reply(503, { error: 'Home Base Plus opens soon. The built-in AI stays free.', code: 'billing_closed' });
        const kind = ['plus', 'pro', 'minutes'].includes(body.plan) ? body.plan : null;
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
          success_url: APP_URL + '?billing=success', cancel_url: APP_URL + '?billing=cancel', allow_promotion_codes: 'true',
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
