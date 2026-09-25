const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const C = require('../core-v1.js');
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync('data/plan-v1.js', 'utf8'), sandbox);
const plan = sandbox.window.WILDFIRE_PLAN;
const close = (a, b, tolerance = 1e-6) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);

test('eight independent roadside anchors with 8 AQ, 3 weather and 2 gateways', () => {
  assert.equal(plan.stations.length, 8);
  assert.equal(new Set(plan.stations.map(s => s.id)).size, 8);
  assert.equal(plan.stations.filter(s => plan.kits[s.kit].weather).length, 3);
  assert.equal(plan.stations.filter(s => plan.kits[s.kit].gateway).length, 2);
  assert.equal(plan.stations.filter(s => s.conditional).length, 2);
  assert.equal(plan.stations.filter(s => s.side === 'E').length, 4);
  assert.equal(plan.stations.filter(s => s.side === 'W').length, 4);
  for (const s of plan.stations) assert.equal(plan.stations.find(g => g.id === s.gateway).side, s.side);
});
test('target exactly converts the user DMS reference', () => {
  close(plan.target.lat, 18 + 48 / 60 + 48.8 / 3600);
  close(plan.target.lon, 98 + 51 / 60 + 44.1 / 3600);
});
test('every station lies within two metres of its actual raw OSM road and matches source candidate', () => {
  const raw = JSON.parse(fs.readFileSync('data/osm-source.json', 'utf8'));
  const shortlist = JSON.parse(fs.readFileSync('data/survey-candidates.json', 'utf8')).candidates;
  const report = [];
  for (const s of plan.stations) {
    const way = raw.elements.find(e => e.type === 'way' && e.id === s.wayId);
    assert.ok(way, `Missing OSM way ${s.wayId}`);
    assert.ok(!['path', 'footway', 'track', 'steps'].includes(way.tags.highway));
    assert.equal(way.tags.highway, s.highway);
    assert.equal(way.tags.surface, s.surface);
    const candidate = shortlist.find(p => p.id === s.sampleId);
    close(candidate.lat, s.lat); close(candidate.lon, s.lon);
    let distance = Infinity;
    for (let i = 1; i < way.geometry.length; i++) {
      const a = C.delta(s, way.geometry[i - 1]), b = C.delta(s, way.geometry[i]);
      const dx = b[0] - a[0], dy = b[1] - a[1], length = dx * dx + dy * dy;
      const t = length ? C.clamp(-(a[0] * dx + a[1] * dy) / length, 0, 1) : 0;
      distance = Math.min(distance, Math.hypot(a[0] + t * dx, a[1] + t * dy));
    }
    assert.ok(distance <= 2, `${s.id} is ${distance}m from its source road`);
    report.push({ id: s.id, osm_way_id: s.wayId, distance_to_raw_centerline_m: distance, source: s.sampleId });
  }
  fs.mkdirSync('artifacts', { recursive: true });
  fs.writeFileSync('artifacts/geospatial-proof.json', JSON.stringify(report, null, 2));
});
test('OSM raw SHA256 matches the published provenance', () => {
  const crypto = require('node:crypto');
  const context = JSON.parse(fs.readFileSync('data/context.json', 'utf8'));
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync('data/osm-source.json')).digest('hex'), context.meta.osm_sha256);
  assert.ok(context.roads.features.length > 0);
  assert.equal(context.meta.solar_survey_status, 'NOT_SURVEYED');
});
test('nominal energy budgets include aging and sum correctly', () => {
  const a = plan.powerAssumptions;
  close(C.power(plan.kits.AQ, a).autonomyHours, 147.456);
  close(C.power(plan.kits.WX, a).autonomyHours, 110.592);
  close(C.power(plan.kits.HUB, a).autonomyHours, 73.728);
  close(plan.stations.reduce((t, s) => t + plan.kits[s.kit].panelWp, 0), 630);
  close(plan.stations.reduce((t, s) => t + C.power(plan.kits[s.kit], a).nominalWh, 0), 3200);
  close(plan.stations.reduce((t, s) => t + C.power(plan.kits[s.kit], a).dailyLoadWh, 0), 456);
  for (const kit of Object.values(plan.kits)) assert.ok(C.power(kit, a).solarPass && C.power(kit, a).batteryPass);
});
test('no sunshine and shade create PV deficit independently of autonomy', () => {
  const a = C.power(plan.kits.HUB, plan.powerAssumptions, 0);
  assert.equal(a.solarWh, 0); assert.equal(a.solarPass, false); assert.equal(a.batteryPass, true);
  assert.equal(C.power(plan.kits.AQ, plan.powerAssumptions, 3, 0).solarPass, false);
  assert.equal(C.power(plan.kits.HUB, plan.powerAssumptions, 3, 1, 2).batteryPass, false);
});
test('invalid power inputs fail explicitly, not as plausible zero output', () => {
  assert.throws(() => C.power({ ...plan.kits.AQ, averageW: 0 }, plan.powerAssumptions));
  assert.throws(() => C.power(plan.kits.AQ, plan.powerAssumptions, NaN));
  assert.throws(() => C.power(plan.kits.AQ, plan.powerAssumptions, 3, -1));
  assert.throws(() => C.power(plan.kits.AQ, { ...plan.powerAssumptions, batteryEfficiency: 2 }));
});
test('stale null nonfinite and invalid readings are unknown', () => {
  const value = { quality: 'VALID', pm: 150, co: 1, baselinePm: 15, baselineCo: 0.1 };
  assert.equal(C.classify(value), 'SUSPECT');
  for (const extra of [{ quality: 'STALE' }, { pm: null }, { co: NaN }, { pm: -1 }, { baselineCo: null }]) assert.equal(C.classify({ ...value, ...extra }), 'UNKNOWN');
});
test('road dust is not PM+CO wildfire confirmation and offline is not all-clear', () => {
  const options = { source: plan.target, scenario: 'dust', windToDeg: 90, windSpeedMps: 2.5 };
  for (const s of plan.stations) assert.equal(C.reading(s, 30, options).status, 'NO_ANOMALY');
  const west = plan.stations.find(s => s.side === 'W');
  const off = C.reading(west, 30, { ...options, scenario: 'offline' });
  assert.equal(off.status, 'UNKNOWN'); assert.equal(off.pm, null); assert.equal(off.co, null);
});
test('smoke sustained at scenario source is suspect but never auto-confirmed', () => {
  const s = plan.stations[2], o = { source: s, scenario: 'smoke', windToDeg: 90, windSpeedMps: 2.5 };
  assert.equal(C.reading(s, 5, o).status, 'NO_ANOMALY');
  assert.equal(C.reading(s, 25, o).status, 'SUSPECT');
  assert.equal(C.reading(s, 25, o).synthetic, true);
});
test('Web Mercator inverse and geographic metre offsets have correct orientation', () => {
  const back = C.unworld(...C.world(plan.target.lat, plan.target.lon));
  close(back.lat, plan.target.lat); close(back.lon, plan.target.lon);
  const east = C.offset(plan.target, 1000, 0), north = C.offset(plan.target, 0, 1000);
  assert.ok(east.lon > plan.target.lon); close(east.lat, plan.target.lat);
  assert.ok(north.lat > plan.target.lat); close(north.lon, plan.target.lon);
});
test('illustrative heading uses wind-to convention and calm wind has no heading', () => {
  const east = C.spread(plan.target, 90, 2, 4, null), north = C.spread(plan.target, 0, 2, 4, null);
  close(east.heading, 90); close(north.heading, 0);
  assert.ok(east.contours[0].points[0].lon > plan.target.lon);
  assert.ok(north.contours[0].points[0].lat > plan.target.lat);
  assert.equal(C.spread(plan.target, 90, 0, 4, null).heading, null);
  assert.equal(east.model, 'ILLUSTRATIVE_ELLIPSE_NOT_CALIBRATED');
});
test('DEM boundaries and missing terrain return unknown rather than zero', () => {
  assert.equal(C.elevation(null, plan.target), null);
  const t = { width: 2, height: 2, bounds: [0, 0, 1, 1], elevations_m: [100, 200, 300, 400] };
  close(C.elevation(t, { lat: 0.5, lon: 0.5 }), 250);
  assert.equal(C.elevation(t, { lat: 2, lon: 2 }), null);
});
test('all exports preserve eight coordinates and proposed status', () => {
  const fc = C.features(plan);
  assert.equal(fc.features.length, 8);
  close(fc.features[0].geometry.coordinates[0], plan.stations[0].lon);
  close(fc.features[0].geometry.coordinates[1], plan.stations[0].lat);
  assert.ok(fc.features.every(f => f.properties.status === 'PROPOSED_FOR_FIELD_SURVEY' && f.properties.solar_status === 'NOT_SURVEYED'));
  assert.equal(C.csv(plan).trim().split(/\r?\n/).length, 9);
  assert.equal((C.kml(plan).match(/<Placemark>/g) || []).length, 8);
  assert.ok(C.kml(plan).includes(plan.stations[0].lon + ',' + plan.stations[0].lat));
});
