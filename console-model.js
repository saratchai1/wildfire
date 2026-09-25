/* Shared synthetic incident/explainer model. No operational sensors or dispatch. */
(function (root) {
  'use strict';
  const C = typeof module !== 'undefined' && module.exports ? require('./core.js') : root.WildfireCore;
  const S = typeof module !== 'undefined' && module.exports ? require('./siting.js') : root.RoadsideSiting;
  const APP_VERSION = 'operator-explainer-v3';
  const directions = Object.freeze(['เหนือ', 'ตะวันออกเฉียงเหนือ', 'ตะวันออก', 'ตะวันออกเฉียงใต้', 'ใต้', 'ตะวันตกเฉียงใต้', 'ตะวันตก', 'ตะวันตกเฉียงเหนือ'].map((name, i) => Object.freeze({ name, bearing: i * 45 })));
  const finite = n => typeof n === 'number' && Number.isFinite(n);
  function initial(plan) { return { view: 'dashboard', scenario: 'smoke', source: { ...plan.target }, sourceName: 'หมุดกลางภูเขา', windToDeg: 135, windSpeedMps: 2, smokeDelayMin: 0, availability: 'all', minute: 10, playing: false, selected: 'R03', acknowledgedAt: null }; }
  function validate(plan, state) {
    if (!['dashboard', 'principles'].includes(state.view) || !['smoke', 'normal', 'dust', 'offline'].includes(state.scenario) || !['all', 'east', 'west', 'north', 'none'].includes(state.availability)) throw Error('Invalid scenario choice');
    if (!state.source || !finite(state.source.lat) || !finite(state.source.lon) || Math.abs(state.source.lat) > 85 || Math.abs(state.source.lon) > 180 || Math.hypot(...C.delta(plan.target, state.source)) > plan.studyRadiusM + 0.1) throw Error('เลือกจุดเริ่มภายในวงพื้นที่ศึกษา 2 กม.');
    for (const [key, low, high] of [['windToDeg', 0, 359], ['windSpeedMps', 0, 8], ['smokeDelayMin', 0, 15], ['minute', 0, 60]]) if (!finite(state[key]) || state[key] < low || state[key] > high) throw Error('Invalid ' + key);
    if (!plan.stations.some(s => s.id === state.selected) || typeof state.playing !== 'boolean') throw Error('Invalid station or playback');
    if (state.acknowledgedAt !== null && (!finite(state.acknowledgedAt) || state.acknowledgedAt < 0 || state.acknowledgedAt > state.minute)) throw Error('Invalid acknowledgement time');
    return state;
  }
  function enabled(station, state) { return state.availability === 'all' || state.availability === 'east' && station.side === 'E' || state.availability === 'west' && station.side === 'W' || state.availability === 'north' && station.side === 'N'; }
  function prediction(plan, state) {
    validate(plan, state);
    const options = { ...S.defaults, windToDeg: state.windToDeg, windSpeedMps: state.windSpeedMps, horizonMin: 60 - state.smokeDelayMin };
    const stations = plan.stations.map(s => ({ ...s, enabled: enabled(s, state) }));
    const geometry = S.screen(stations, state.source, options);
    const rows = stations.map(s => {
      const crossing = s.enabled ? S.legacyFirst([s], state.source, options) : null;
      const row = geometry.rows.find(r => r.id === s.id);
      const total = crossing ? state.smokeDelayMin + crossing.conditionalAlertMin : null;
      return { id: s.id, label: s.screenLabel, enabled: s.enabled, geometryStatus: row.status,
        travelMin: finite(row.travelMin) ? row.travelMin : null,
        smokeArrivalMin: finite(row.travelMin) ? state.smokeDelayMin + row.travelMin : null,
        thresholdMin: crossing ? state.smokeDelayMin + crossing.thresholdCrossingMin : null,
        alertMin: total !== null && total <= 60 ? total : null, beyondHorizon: total !== null && total > 60,
        model: 'LEGACY_SYNTHETIC_KERNEL_NOT_VALIDATED' };
    });
    const alarms = rows.filter(r => r.alertMin !== null).sort((a, b) => a.alertMin - b.alertMin || a.id.localeCompare(b.id));
    const arrivals = rows.filter(r => r.smokeArrivalMin !== null && r.smokeArrivalMin <= 60 && r.enabled).sort((a, b) => a.smokeArrivalMin - b.smokeArrivalMin || a.id.localeCompare(b.id));
    return { rows, firstAlert: alarms[0] || null, firstArrival: arrivals[0] || null, geometryStatus: geometry.status,
      deviceDelayMin: (options.sampleSec + options.persistenceSec + options.uplinkSec) / 60, horizonMin: 60,
      fieldLatencyVerified: false, fieldDetectionProbability: null, source: { ...state.source } };
  }
  function sample(plan, station, state, minute, estimate) {
    if (!finite(minute) || minute < 0 || minute > 60) throw Error('Invalid sample minute');
    if (!enabled(station, state) || state.scenario === 'offline' && station.side === 'W' && minute >= 12) return { id: station.id, label: station.screenLabel, status: 'UNKNOWN', quality: 'STALE', pm: null, co: null, temperature: null, humidity: null, windToDeg: null, windSpeedMps: null, synthetic: true };
    let r = { pm: 15, co: 0.15, status: 'NO_ANOMALY' };
    if (state.scenario === 'smoke') r = S.legacyReading(station, state.source, Math.max(0, minute - state.smokeDelayMin), state.windToDeg, state.windSpeedMps);
    if (state.scenario === 'dust' && minute >= 8 && station.side === 'E') r.pm += 80;
    const status = state.scenario === 'smoke' && estimate.alertMin !== null && minute >= estimate.alertMin ? 'SUSPECT' : r.status === 'SUSPECT' ? 'PENDING' : 'NO_ANOMALY';
    const n = Number(station.id.slice(1));
    return { ...r, id: station.id, label: station.screenLabel, status, quality: 'VALID', temperature: 29 + (n % 3) * 0.4 + Math.sin(minute / 12) * 0.2, humidity: 44 + n % 4, windToDeg: state.windSpeedMps === 0 ? null : state.windToDeg, windSpeedMps: state.windSpeedMps, synthetic: true };
  }
  function snapshot(plan, state, estimate = prediction(plan, state)) {
    validate(plan, state);
    const rows = plan.stations.map(s => sample(plan, s, state, state.minute, estimate.rows.find(r => r.id === s.id)));
    return { rows, alerts: rows.filter(r => r.status === 'SUSPECT'), pending: rows.filter(r => r.status === 'PENDING'), unknown: rows.filter(r => r.status === 'UNKNOWN'), online: rows.filter(r => r.quality === 'VALID').length };
  }
  function history(plan, station, state, estimate) {
    const start = Math.max(0, state.minute - 10), out = [];
    for (let t = start; t < state.minute - 1e-9; t += 0.5) out.push({ minute: t, ...sample(plan, station, state, t, estimate) });
    out.push({ minute: state.minute, ...sample(plan, station, state, state.minute, estimate) });
    return out;
  }
  function events(plan, state, estimate = prediction(plan, state)) {
    const out = [{ minute: 0, kind: 'START', title: 'เริ่มฉากจำลอง', detail: 'สถานีริมทาง ' + plan.stations.length + ' จุด · ไม่มีการรับข้อมูลจริง' }];
    if (state.scenario === 'smoke') {
      out.push({ minute: state.smokeDelayMin, kind: 'SMOKE', title: 'เริ่มมีควันในฉาก', detail: state.sourceName + ' · ตำแหน่งกำหนดไว้ ไม่ใช่ค้นพบต้นเพลิง' });
      for (const row of estimate.rows) if (row.alertMin !== null) out.push({ minute: row.alertMin, kind: 'SUSPECT', title: row.label + ' เข้าเกณฑ์ให้ตรวจสอบ', detail: 'PM + CO และเวลาอุปกรณ์ครบตามสูตรจำลอง' });
    }
    if (state.scenario === 'dust') out.push({ minute: 8, kind: 'DUST', title: 'PM ฝั่งตะวันออกเพิ่ม', detail: 'CO ไม่เพิ่มในฉากนี้ จึงไม่เข้าเกณฑ์ควันคู่' });
    if (state.scenario === 'offline') out.push({ minute: 12, kind: 'STALE', title: 'ข้อมูลฝั่งตะวันตกขาด', detail: 'สถานีสีเทาไม่ใช่หลักฐานว่าพื้นที่ปลอดภัย' });
    if (state.acknowledgedAt !== null) out.push({ minute: state.acknowledgedAt, kind: 'ACK', title: 'รับทราบเหตุจำลองแล้ว', detail: 'เฉพาะหน้านี้ ไม่ส่งคำสั่งหรือแจ้งเตือนภายนอก' });
    return out.filter(e => e.minute <= state.minute).sort((a, b) => b.minute - a.minute);
  }
  function change(plan, state, patch) {
    const next = { ...state, ...patch, playing: false, minute: 0, acknowledgedAt: null };
    if (patch.source) next.source = { ...patch.source };
    return validate(plan, next);
  }
  function seek(plan, state, minute) { return validate(plan, { ...state, minute, playing: false, acknowledgedAt: minute < state.minute ? null : state.acknowledgedAt }); }
  function acknowledge(plan, state) { return snapshot(plan, state).alerts.length && state.acknowledgedAt === null ? { ...state, acknowledgedAt: state.minute } : state; }
  function comparison(plan, state) { return directions.map(d => ({ ...d, ...prediction(plan, { ...state, windToDeg: d.bearing }) })); }
  const api = { APP_VERSION, directions, initial, validate, enabled, prediction, sample, snapshot, history, events, change, seek, acknowledge, comparison };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.WildfireConsoleModel = api;
})(typeof window !== 'undefined' ? window : globalThis);
