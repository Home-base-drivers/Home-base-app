import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeFlightAwareActivity } from '../scripts/refresh-provider-signals.mjs';

test('FlightAware schedules become UTC hourly airport activity counts', () => {
  const now = new Date('2026-09-29T20:05:00.000Z');
  const airport = { id: 'KBWI', name: 'BWI Airport', lat: 39.1774, lon: -76.6684 };
  const arrivals = {
    scheduled_arrivals: [
      { fa_flight_id: 'arr-1', scheduled_in: '2026-09-29T20:22:00.000Z' },
      { fa_flight_id: 'arr-2', scheduled_in: '2026-09-29T20:51:00.000Z' },
      { fa_flight_id: 'arr-next', scheduled_in: '2026-09-29T21:04:00.000Z' },
      { fa_flight_id: 'arr-outside', scheduled_in: '2026-09-30T09:00:00.000Z' }
    ]
  };
  const departures = {
    scheduled_departures: [
      { fa_flight_id: 'dep-1', scheduled_out: '2026-09-29T20:40:00.000Z' },
      { fa_flight_id: 'dep-next', scheduled_out: '2026-09-29T21:25:00.000Z' }
    ]
  };

  assert.deepEqual(
    normalizeFlightAwareActivity(arrivals, departures, airport, now),
    [
      { hour: '2026-09-29T20:00:00.000Z', arrivals: 2, departures: 1, lat: 39.1774, lon: -76.6684, name: 'BWI Airport' },
      { hour: '2026-09-29T21:00:00.000Z', arrivals: 1, departures: 1, lat: 39.1774, lon: -76.6684, name: 'BWI Airport' }
    ]
  );
});

test('FlightAware normalizer accepts epoch-second timestamps and skips unidentified rows', () => {
  const now = new Date('2026-09-29T20:05:00.000Z');
  const airport = { id: 'KBWI', name: 'BWI Airport', lat: 39.1774, lon: -76.6684 };
  const payload = [
    { ident: 'ARR1', estimated_in: Math.floor(Date.parse('2026-09-29T20:25:00.000Z') / 1000) },
    { scheduled_in: '2026-09-29T20:35:00.000Z' }
  ];

  assert.deepEqual(
    normalizeFlightAwareActivity(payload, [], airport, now),
    [
      { hour: '2026-09-29T20:00:00.000Z', arrivals: 1, departures: 0, lat: 39.1774, lon: -76.6684, name: 'BWI Airport' }
    ]
  );
});
