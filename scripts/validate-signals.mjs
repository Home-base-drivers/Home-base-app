// Gate for the live data branch: a published snapshot must be well-formed,
// current, reasonably sized and must never contain a provider credential.
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const SECRET_ENV = ['TICKETMASTER_API_KEY', 'UBER_ACCESS_TOKEN', 'UBER_CLIENT_ID', 'UBER_CLIENT_SECRET', 'BOOKING_API_KEY', 'BOOKING_AFFILIATE_ID', 'FLIGHTAWARE_API_KEY'];

export function validateSignals(text, env = process.env, now = Date.now()) {
  if (text.length > 5_000_000) throw Error('Snapshot is too large to publish.');
  for (const name of SECRET_ENV) {
    const value = env[name];
    if (value && value.length >= 6 && text.includes(value)) throw Error(`Snapshot contains the ${name} value. Publication blocked.`);
  }
  const payload = JSON.parse(text);
  const generated = Date.parse(payload.generatedAt || '');
  if (!Number.isFinite(generated) || Math.abs(now - generated) > 20 * 60_000) throw Error('Snapshot generatedAt is missing or not current.');
  if (!Array.isArray(payload.markets) || !payload.markets.length) throw Error('Snapshot has no markets.');
  for (const market of payload.markets) {
    if (!market?.id || !Number.isFinite(market.center?.lat) || !Number.isFinite(market.center?.lon)) throw Error('Snapshot market is malformed.');
    for (const event of [...(market.publicSports?.events || []), ...(market.publicRecords?.events || [])]) {
      if (!Number.isFinite(Number(event.lat)) || !Number.isFinite(Number(event.lon)) || !Number.isFinite(Date.parse(event.eventStart))) throw Error(`Event without a location or start time in ${market.id}.`);
    }
  }
  return { markets: payload.markets.length, bytes: text.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  readFile(process.argv[2] || 'dist/provider-signals.json', 'utf8')
    .then(text => { const r = validateSignals(text); console.log(`Snapshot valid: ${r.markets} markets, ${r.bytes} bytes.`); })
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
