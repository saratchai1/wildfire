/* Pure, dependency-free calculations. Every scenario is illustrative, not operational. */
(function (root) {
  'use strict';
  const R = 6371008.8;
  const radians = value => value * Math.PI / 180;
  const degrees = value => value * 180 / Math.PI;
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  function delta(origin, point) {
    return [(point.lon - origin.lon) * radians(1) * R * Math.cos(radians(origin.lat)), (point.lat - origin.lat) * radians(1) * R];
  }
  function offset(origin, east, north) {
    return { lat: origin.lat + degrees(north / R), lon: origin.lon + degrees(east / (R * Math.cos(radians(origin.lat)))) };
  }
  function world(lat, lon) {
    const phi = radians(clamp(lat, -85.05112878, 85.05112878));
    return [(lon + 180) / 360, (1 - Math.asinh(Math.tan(phi)) / Math.PI) / 2];
  }
  function unworld(x, y) {
    return { lat: degrees(Math.atan(Math.sinh(Math.PI * (1 - 2 * y)))), lon: x * 360 - 180 };
  }
  function power(kit, assumptions, peakSunHours = assumptions.peakSunHours, sunAccess = 1, loadMultiplier = 1) {
    const values = [kit.averageW, kit.panelWp, kit.batteryV, kit.batteryAh, assumptions.solarDerate, assumptions.depthOfDischarge, assumptions.batteryEfficiency, assumptions.endOfLifeCapacity, peakSunHours, sunAccess, loadMultiplier];
    if (values.some(v => !finite(v)) || kit.averageW <= 0 || kit.panelWp <= 0 || kit.batteryV <= 0 || kit.batteryAh <= 0 || loadMultiplier <= 0 || peakSunHours < 0 || sunAccess < 0 || sunAccess > 1 || [assumptions.solarDerate, assumptions.depthOfDischarge, assumptions.batteryEfficiency, assumptions.endOfLifeCapacity].some(v => v <= 0 || v > 1)) throw new Error('Invalid energy inputs');
    const loadW = kit.averageW * loadMultiplier;
    const dailyLoadWh = loadW * 24;
    const solarWh = kit.panelWp * peakSunHours * assumptions.solarDerate * sunAccess;
    const nominalWh = kit.batteryV * kit.batteryAh;
    const usableWh = nominalWh * assumptions.depthOfDischarge * assumptions.batteryEfficiency * assumptions.endOfLifeCapacity;
    const autonomyHours = usableWh / loadW;
    return { loadW, dailyLoadWh, solarWh, nominalWh, usableWh, autonomyHours, surplusWh: solarWh - dailyLoadWh, solarPass: solarWh >= dailyLoadWh, batteryPass: autonomyHours >= assumptions.minimumAutonomyHours };
  }
  function classify(reading) {
    if (!reading || reading.quality !== 'VALID' || !finite(reading.pm) || !finite(reading.co) || !finite(reading.baselinePm) || !finite(reading.baselineCo) || reading.pm < 0 || reading.co < 0) return 'UNKNOWN';
    return reading.pm - reading.baselinePm > 25 && reading.co - reading.baselineCo > 0.2 ? 'SUSPECT' : 'NO_ANOMALY';
  }
  function rawReading(station, minute, options) {
    if (options.scenario === 'offline' && minute >= 12 && station.side === 'W') return { quality: 'STALE', pm: null, co: null, lastMinute: 12, synthetic: true };
    const index = Number(station.id.slice(1));
    const baselinePm = 14 + index % 3;
    const baselineCo = 0.12;
    const age = Math.max(0, minute - 5);
    const [dx, dy] = delta(options.source, station);
    const angle = radians(options.windToDeg);
    const along = dx * Math.sin(angle) + dy * Math.cos(angle);
    const cross = dx * Math.cos(angle) - dy * Math.sin(angle);
    const distance = Math.hypot(dx, dy);
    const local = Math.exp(-(distance ** 2) / (2 * 120 ** 2));
    const plume = options.windSpeedMps > 0 && along >= 0 && along <= options.windSpeedMps * age * 60 ? Math.exp(-(cross ** 2) / (2 * (100 + along * 0.18) ** 2)) * Math.exp(-along / 4200) : 0;
    const smoke = options.scenario === 'smoke' ? Math.max(local, plume) * (1 - Math.exp(-age / 4)) : 0;
    const dust = options.scenario === 'dust' && minute >= 8 && station.side === 'E' ? 75 : 0;
    return { quality: 'VALID', pm: baselinePm + 300 * smoke + dust, co: baselineCo + 1.2 * smoke, baselinePm, baselineCo, synthetic: true, lastMinute: minute };
  }
  function reading(station, minute, options) {
    if (!finite(minute) || minute < 0 || minute > 60 || !['smoke', 'dust', 'offline'].includes(options.scenario) || !finite(options.windToDeg) || !finite(options.windSpeedMps) || options.windSpeedMps < 0) throw new Error('Invalid demo inputs');
    const value = rawReading(station, minute, options);
    const sustained = [0, 1, 2].every(age => minute - age >= 0 && classify(rawReading(station, minute - age, options)) === 'SUSPECT');
    value.status = value.quality !== 'VALID' ? 'UNKNOWN' : sustained ? 'SUSPECT' : 'NO_ANOMALY';
    return value;
  }
  function elevation(terrain, point) {
    if (!terrain) return null;
    const [west, south, east, north] = terrain.bounds;
    if (point.lon < west || point.lon > east || point.lat < south || point.lat > north) return null;
    const x = (point.lon - west) / (east - west) * (terrain.width - 1);
    const y = (north - point.lat) / (north - south) * (terrain.height - 1);
    const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(x0 + 1, terrain.width - 1), y1 = Math.min(y0 + 1, terrain.height - 1);
    const at = (i, j) => terrain.elevations_m[j * terrain.width + i];
    const samples = [at(x0, y0), at(x1, y0), at(x0, y1), at(x1, y1)];
    if (!samples.every(finite)) return null;
    return (samples[0] * (1 - (x - x0)) + samples[1] * (x - x0)) * (1 - (y - y0)) + (samples[2] * (1 - (x - x0)) + samples[3] * (x - x0)) * (y - y0);
  }
  function spread(source, windToDeg, windSpeedMps, baseRos, terrain) {
    // A local-slope-biased ellipse ONLY. No fuel physics, spotting or calibrated arrival time.
    const angle = radians(windToDeg);
    let east = Math.sin(angle) * windSpeedMps, north = Math.cos(angle) * windSpeedMps;
    const zs = [[200, 0], [-200, 0], [0, 200], [0, -200]].map(([x, y]) => elevation(terrain, offset(source, x, y)));
    const hasTerrain = zs.every(finite);
    if (hasTerrain) { east += clamp((zs[0] - zs[1]) / 400 * 4, -1.5, 1.5); north += clamp((zs[2] - zs[3]) / 400 * 4, -1.5, 1.5); }
    const magnitude = Math.hypot(east, north);
    const heading = magnitude > 0.0001 ? Math.atan2(east, north) : 0;
    const ros = baseRos * (1 + magnitude * 0.25);
    const contours = [15, 30, 60].map(minutes => {
      const forward = ros * minutes;
      const back = magnitude > 0.0001 ? forward * 0.3 : forward;
      const a = (forward + back) / 2, b = magnitude > 0.0001 ? a * 0.62 : a, shift = (forward - back) / 2;
      const points = Array.from({ length: 73 }, (_, i) => {
        const t = i / 72 * Math.PI * 2, along = shift + a * Math.cos(t), cross = b * Math.sin(t);
        return offset(source, along * Math.sin(heading) + cross * Math.cos(heading), along * Math.cos(heading) - cross * Math.sin(heading));
      });
      return { minutes, points };
    });
    return { heading: magnitude > 0.0001 ? (degrees(heading) + 360) % 360 : null, hasTerrain, contours, model: 'ILLUSTRATIVE_ELLIPSE_NOT_CALIBRATED' };
  }
  function features(plan) {
    return { type: 'FeatureCollection', features: plan.stations.map(s => ({ type: 'Feature', properties: { id: s.id, label: s.label, kit: s.kit, status: plan.status, coordinate_role: 'ROAD_CENTERLINE_SURVEY_ANCHOR_NOT_FOUNDATION', road_surface: s.surface, osm_way_id: s.wayId, source_candidate: s.sampleId, solar_status: 'NOT_SURVEYED', permission_status: 'NOT_VERIFIED', radio_status: 'NOT_SURVEYED', conditional_service_road: s.conditional, panel_wp: plan.kits[s.kit].panelWp, battery_v: plan.kits[s.kit].batteryV, battery_ah: plan.kits[s.kit].batteryAh }, geometry: { type: 'Point', coordinates: [s.lon, s.lat] } })) };
  }
  function csv(plan) {
    const keys = ['id','lat','lon','kit','surface','wayId','sampleId','conditional'];
    const quote = value => '"' + String(value).replace(/"/g, '""') + '"';
    return '\ufeff' + [...[keys.concat(['status','solar_status','coordinate_role']).join(',')], ...plan.stations.map(s => keys.map(k => quote(s[k])).concat([quote(plan.status), quote('NOT_SURVEYED'), quote('ROAD_CENTERLINE_SURVEY_ANCHOR_NOT_FOUNDATION')]).join(','))].join('\r\n');
  }
  function xml(value) { return String(value).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]); }
  function kml(plan) {
    return '<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Wildfire roadside survey anchors</name>' + plan.stations.map(s => '<Placemark><name>' + xml(s.id + ' · ' + s.label) + '</name><description>' + xml('PROPOSED. Road centerline survey anchor, not foundation. Solar, permissions and radio NOT VERIFIED. OSM way ' + s.wayId + '. ' + s.reason) + '</description><Point><coordinates>' + s.lon + ',' + s.lat + ',0</coordinates></Point></Placemark>').join('') + '</Document></kml>';
  }
  const api = { clamp, finite, delta, offset, world, unworld, power, classify, reading, elevation, spread, features, csv, kml };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.WildfireCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
