import test from 'node:test';
import assert from 'node:assert/strict';
import ai from '../dist/homebase-internal-ai.js';

const now = Date.parse('2026-10-27T16:00:00Z'); // noon Eastern
const hourly = Array.from({ length: 14 }, (_, i) => ({ time: now + i * 3600000, probability: i >= 6 ? 70 : 10, precipitationMm: 0, snowfallCm: 0, temperatureF: 58 + (i < 4 ? i : 4) }));
const weather = { temp: '61°', unit: '°F', code: 2, available: true, hourly, alerts: [{ event: 'Wind Advisory', onset: new Date(now - 3600000).toISOString(), ends: new Date(now + 5 * 3600000).toISOString(), safety: false }] };

test('built-in AI answers weather questions from the app weather feed instead of a canned reply', () => {
  for (const q of ["What's the weather?", 'is it going to rain tonight', 'how cold is it', 'forecast for later', '¿va a llover?']) {
    const r = ai.answer(q, { now, weather, tz: 'America/New_York' });
    assert.equal(r.handled, true, q);
    assert.equal(r.intent, 'weather', q);
  }
  const r = ai.answer("What's the weather?", { now, weather, tz: 'America/New_York' });
  assert.match(r.answer, /61°F, partly cloudy/);
  assert.match(r.answer, /Rain likely from about 6 PM \(up to 70%\)/);
  assert.match(r.answer, /58–62°F/);
  assert.match(r.answer, /Wind Advisory until 5 PM/);
  assert.doesNotMatch(r.answer, /can't answer/);
});

test('weather that has not loaded says so plainly', () => {
  const r = ai.answer('weather?', { now, weather: null });
  assert.equal(r.handled, true);
  assert.match(r.answer, /still loading/);
});

test('weather words do not steal other questions', () => {
  assert.equal(ai.answer('where is the hot spot', { now }).intent, 'where');
  assert.equal(ai.answer('$14 for 9 miles in the rain', { now }).intent, 'offer');
  assert.match(ai.answer('brief me', { now, weather, tz: 'America/New_York' }).answer, /\*\*Weather:\*\* 61°F/);
});
