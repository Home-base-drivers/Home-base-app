import test from 'node:test';
import assert from 'node:assert/strict';
import { haversineKm, normalizeTicketmasterEvent, normalizeUberSurge } from './refresh-provider-signals.mjs';

test('canceled, postponed and unspecified event times cannot become route signals', () => {
  const event={name:'Concert',_embedded:{venues:[{name:'Arena',location:{latitude:'39.29',longitude:'-76.61'}}]},dates:{start:{dateTime:'2026-10-06T20:00:00Z'}}},now=new Date('2026-10-06T12:00:00Z');
  for(const code of ['canceled','postponed'])assert.equal(normalizeTicketmasterEvent({...event,dates:{...event.dates,status:{code}}},now),null);
  for(const flag of ['dateTBD','dateTBA','timeTBA'])assert.equal(normalizeTicketmasterEvent({...event,dates:{start:{...event.dates.start,[flag]:true}}},now),null);
  assert.ok(normalizeTicketmasterEvent(event,now));
});

test('metro distance is measured in kilometers', () => {
  assert.ok(Math.abs(haversineKm({ lat: 39.2904, lon: -76.6122 }, { lat: 39.4015, lon: -76.6019 }) - 12.4) < 1);
});

test('Ticketmaster events require real coordinates and a start time', () => {
  const event = normalizeTicketmasterEvent({
    id: 'event-1', name: 'Verified show', dates: { start: { dateTime: '2026-09-26T23:00:00Z' } },
    _embedded: { venues: [{ name: 'Real venue', location: { latitude: '39.29', longitude: '-76.61' } }] }
  }, new Date('2026-09-25T12:00:00Z'));
  assert.equal(event.name, 'Verified show');
  assert.equal(event.venue, 'Real venue');
  assert.equal(event.lat, 39.29);
  assert.equal(normalizeTicketmasterEvent({ name: 'No coordinate' }, new Date('2026-09-25T12:00:00Z')), null);
});

test('Uber samples retain independently rated low and high price areas', () => {
  const origin = { name: 'Towson', lat: 39.4, lon: -76.6 };
  assert.equal(normalizeUberSurge(origin, { prices: [{ surge_multiplier: 1 }, { surge_multiplier: 1.02 }] }).surgeMultiplier, 1.01);
  assert.equal(normalizeUberSurge(origin, { prices: [{ surge_multiplier: 1.1 }, { surge_multiplier: 1.4 }] }).surgeMultiplier, 1.25);
});
