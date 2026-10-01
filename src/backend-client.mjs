import { createClient } from '@supabase/supabase-js';

export const progressKeys = Object.freeze([
  'homeBaseDriverProfile', 'homeBaseCostPrefs', 'homeBaseAlertPrefs',
  'homeBaseProductPrefs', 'homeBaseMapUi', 'homeBaseEarningsView',
  'homeBaseShifts', 'homeBaseForecastSnapshots', 'homeBaseForecastAccuracy'
]);

export class CloudConflictError extends Error {
  constructor() {
    super('Saved progress changed on another device. Reload it before saving.');
    this.name = 'CloudConflictError';
  }
}

function result(response) {
  if (response.error?.code === '40001') throw new CloudConflictError();
  if (response.error) throw response.error;
  return response.data;
}

export function progressSnapshot(storage) {
  const state = {};
  for (const key of progressKeys) {
    const raw = storage.getItem(key);
    if (raw !== null) state[key] = JSON.parse(raw);
  }
  // Never copy all localStorage: it can contain sessions, location, or secrets.
  return state;
}

function finite(value, name, nullable = true) {
  if (value === null || value === undefined) {
    if (nullable) return null;
    throw new TypeError(`${name} is required.`);
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`Invalid ${name}.`);
  return value;
}

export function toEarningsRecord(row, { source = 'csv', market = 'Baltimore' } = {}) {
  if (!['csv', 'manual'].includes(source)) throw new TypeError('Only the backend can write provider earnings.');
  if (!row || typeof row.id !== 'string' || !row.id || row.id.length > 1024) throw new TypeError('A stable record ID is required.');
  if (typeof row.platform !== 'string' || !row.platform || row.platform.length > 60) throw new TypeError('A platform is required.');
  if (!['gross', 'payout'].includes(row.payType)) throw new TypeError('Gross earnings and payouts must be identified separately.');
  if (!['online', 'active', 'unknown'].includes(row.hoursType)) throw new TypeError('The hours type is required.');
  const precise = row.timePrecision === true;
  if (precise && !Number.isFinite(Date.parse(row.startedAt))) throw new TypeError('A precise record needs a valid timestamp.');
  if (row.date != null) {
    const parsed = new Date(row.date + 'T12:00:00Z');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date) || !Number.isFinite(+parsed) || parsed.toISOString().slice(0, 10) !== row.date) {
      throw new TypeError('Invalid earnings date.');
    }
  }
  const trips = finite(row.trips, 'trip count');
  if (trips !== null && !Number.isInteger(trips)) throw new TypeError('Trip count must be a whole number.');
  const hours = finite(row.hours, 'hours');
  if (hours !== null && (hours < 0 || hours > 744)) throw new TypeError('Invalid hours.');
  return {
    record_id: row.id, platform: row.platform, local_date: row.date ?? null,
    // Date-only exports remain date-only. A made-up noon is not a trip time.
    started_at: precise ? new Date(row.startedAt).toISOString() : null,
    time_precision: precise, amount: finite(row.earnings, 'earnings', false),
    currency: row.currency || 'USD', pay_type: row.payType,
    hours, hours_type: row.hoursType, miles: finite(row.miles, 'miles'),
    trip_count: trips, source, source_filename: row.filename ? String(row.filename).slice(0, 255) : null, market
  };
}

export function fromEarningsRecord(row) {
  return {
    id: row.record_id, platform: row.platform, date: row.local_date,
    startedAt: row.started_at, timePrecision: row.time_precision,
    earnings: Number(row.amount), currency: row.currency, payType: row.pay_type,
    hours: row.hours === null ? null : Number(row.hours), hoursType: row.hours_type,
    miles: row.miles === null ? null : Number(row.miles),
    trips: row.trip_count, filename: row.source_filename, source: row.source,
    cloudUpdatedAt: row.updated_at
  };
}

export function createHomeBaseBackend(client) {
  async function user() {
    const data = result(await client.auth.getUser());
    if (!data?.user?.id || data.user.is_anonymous) throw new Error('Sign in to your Home Base account first.');
    return data.user;
  }
  return Object.freeze({
    async sendSignInLink(email, redirectTo) {
      return result(await client.auth.signInWithOtp({ email,
        options: { emailRedirectTo: redirectTo, shouldCreateUser: true } }));
    },
    async signIn(email, password) {
      return result(await client.auth.signInWithPassword({ email, password }));
    },
    async signUp(email, password, redirectTo) {
      return result(await client.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } }));
    },
    async signOut() { result(await client.auth.signOut({ scope: 'global' })); },
    getUser: user,
    async ensureProfile() {
      const me = await user();
      result(await client.from('profiles').upsert({ id: me.id }, { onConflict: 'id', ignoreDuplicates: true }));
      return result(await client.from('profiles').select('*').eq('id', me.id).single());
    },
    async setBenchmarkConsent(consent) {
      if (typeof consent !== 'boolean') throw new TypeError('Choose whether to share benchmark data.');
      const me = await user();
      return result(await client.from('profiles').update({ benchmark_consent: consent }).eq('id', me.id).select('benchmark_consent').single());
    },
    async getProgress() {
      const me = await user();
      return result(await client.from('user_state').select('state,version,market,updated_at').eq('user_id', me.id).maybeSingle())
        || { state: {}, version: 0, market: 'Baltimore' };
    },
    async saveProgress(state, expectedVersion, market = 'Baltimore') {
      await user();
      if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) throw new TypeError('Load saved progress before saving.');
      if (!state || typeof state !== 'object' || Array.isArray(state) || Object.keys(state).some(k => !progressKeys.includes(k))) {
        throw new TypeError('Unsupported saved progress.');
      }
      return result(await client.rpc('save_home_base_state', {
        p_state: state, p_expected_version: expectedVersion, p_market: market
      }));
    },
    async saveEarnings(rows, options) {
      await user();
      if (!Array.isArray(rows)) throw new TypeError('Choose earnings records to save.');
      // Validate the complete import before sending the first chunk.
      const records = rows.map(row => toEarningsRecord(row, options));
      if (new Set(records.map(r => r.record_id)).size !== records.length) throw new TypeError('Duplicate record IDs within this import.');
      const totals = { saved: 0, unchanged: 0, protected: 0, total: 0 };
      for (let i = 0; i < records.length; i += 500) {
        const batch = result(await client.rpc('upsert_home_base_earnings', { p_records: records.slice(i, i + 500) }));
        for (const key of Object.keys(totals)) totals[key] += batch[key];
      }
      // Chunks committed before a network failure are safe to retry with the same IDs.
      return totals;
    },
    async listEarnings({ offset = 0, limit = 500 } = {}) {
      const me = await user();
      if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw new TypeError('Invalid earnings page.');
      const rows = result(await client.from('earnings_records').select('*').eq('user_id', me.id)
        .order('record_id').range(offset, offset + limit - 1));
      return rows.map(fromEarningsRecord);
    },
    async connections() {
      const me = await user();
      const rows = result(await client.from('account_connections').select('platform,provider,status,last_synced_at,last_error_code')
        .eq('user_id', me.id));
      return ['Uber', 'Lyft', 'Empower'].map(platform => rows.find(r => r.platform === platform)
        || { platform, status: 'not_configured', last_synced_at: null });
    },
    async clearCloudData() {
      await user();
      result(await client.rpc('delete_my_home_base_data'));
      // This clears Home Base records; it does not delete the Auth identity.
    }
  });
}

export function connectHomeBase(config) {
  if (!config || !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(config.supabaseUrl || '')
    || !/^sb_publishable_/.test(config.supabasePublishableKey || '')) {
    throw new Error('Home Base cloud accounts have not been configured.');
  }
  const client = createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'home-base-auth' }
  });
  return createHomeBaseBackend(client);
}
