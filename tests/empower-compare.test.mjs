import test from 'node:test';
import assert from 'node:assert/strict';
import e from '../dist/homebase-earnings.js';
test('Empower Monthly Flex fee follows the Baltimore tiers', () => {
  assert.equal(e.empowerFlexFee(0), 0); assert.equal(e.empowerFlexFee(250), 49.99); assert.equal(e.empowerFlexFee(251), 99.99);
  assert.equal(e.empowerFlexFee(1400), 199.99); assert.equal(e.empowerFlexFee(3500), 399.99); assert.equal(e.empowerFlexFee(9000), 449.99);
});
test('comparison nets the subscription and finds the break-even rate', () => {
  const c = e.compareEmpower({ hours: 80, uberRate: 28, empowerRate: 36 });
  assert.equal(c.fee, 349.99); assert.equal(c.better, 'Empower'); assert.ok(Math.abs(c.empowerNet - 2530.01) < .01);
  const even = e.compareEmpower({ hours: 80, uberRate: 28, empowerRate: c.breakEven });
  assert.ok(Math.abs(even.difference) < .01);
  assert.equal(e.compareEmpower({ hours: 40, uberRate: 30, empowerRate: 30 }).better, 'Uber', 'same hourly rate loses the fee');
});
