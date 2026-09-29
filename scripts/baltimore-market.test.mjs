import test from 'node:test';
import assert from 'node:assert/strict';
import market from '../dist/baltimore-market.js';

test('Baltimore market includes its city, counties, airport and Annapolis edge', () => {
  for (const [name, lat, lon] of [
    ['Baltimore', 39.2904, -76.6122],
    ['Towson', 39.4015, -76.6019],
    ['Columbia', 39.2037, -76.8610],
    ['BWI Airport', 39.1774, -76.6684],
    ['Annapolis', 38.9784, -76.4922],
    ['Bel Air', 39.5359, -76.3483]
  ]) assert.equal(market.isBaltimorePoint(lat, lon), true, name);
});

test('Washington-zone communities never become Baltimore sources or stops', () => {
  for (const [name, lat, lon] of [
    ['Bowie', 38.9810, -76.7300],
    ['Laurel', 39.0993, -76.8483],
    ['Aspen Hill', 39.0796, -77.0730],
    ['Washington DC', 38.9072, -77.0369],
    ['Alexandria', 38.8048, -77.0469]
  ]) assert.equal(market.isBaltimorePoint(lat, lon), false, name);
});
