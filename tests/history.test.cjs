const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const C = require('../core.js');
const H = require('../history.js');
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(require.resolve('../data/plan.js'), 'utf8'), sandbox);
const plan = sandbox.window.WILDFIRE_PLAN;
const station = id => plan.stations.find(s => s.id === id);
const options = (scenario = 'smoke') => ({ scenario, source: station('R03'), windToDeg: 90, windSpeedMps: 2.5 });
test('history window and endpoint are exact without future readings', () => {
  const rows = H.series(C, station('R03'), 25, options());
  assert.equal(rows.length, 11);
  assert.equal(rows[0].minute, 15);
  assert.equal(rows.at(-1).minute, 25);
  assert.equal(H.series(C, station('R03'), 0, options()).length, 1);
  const fractional = H.series(C, station('R03'), 2.5, options());
  assert.equal(fractional.at(-1).minute, 2.5);
  assert.ok(fractional.every(s => s.minute <= 2.5));
});
test('stale readings remain null rather than zero or interpolated values', () => {
  const rows = H.series(C, station('R05'), 15, options('offline'));
  assert.ok(rows.filter(s => s.minute < 12).every(s => Number.isFinite(s.pm)));
  assert.ok(rows.filter(s => s.minute >= 12).every(s => s.pm === null && s.co === null));
  assert.ok(H.series(C, station('R05'), 25, options('offline')).every(s => s.pm === null));
});
test('smoke events require actual synthetic sustained evidence, not just the scene name', () => {
  assert.ok(!H.events(C, plan.stations, 5, options()).some(e => e.kind === 'SUSPECT'));
  const events = H.events(C, plan.stations, 25, options());
  assert.ok(events.some(e => e.kind === 'SUSPECT'));
  assert.ok(events.every(e => e.minute <= 25));
  assert.ok(events.every((e, i) => i === 0 || events[i - 1].minute >= e.minute));
});
test('dust and offline never become confirmed fires or suspect smoke events', () => {
  for (const scenario of ['dust', 'offline']) {
    const events = H.events(C, plan.stations, 25, options(scenario));
    assert.ok(events.every(e => !['SUSPECT', 'CONFIRMED'].includes(e.kind)));
  }
  assert.equal(H.events(C, plan.stations, 0, options('offline')).length, 1);
});
test('history intervals reject invalid values', () => {
  for (const minute of [-1, 61, NaN, Infinity]) {
    assert.throws(() => H.series(C, station('R03'), minute, options()));
    assert.throws(() => H.events(C, plan.stations, minute, options()));
  }
  assert.throws(() => H.series(C, station('R03'), 25, options(), 0));
});
