/* V1.2 companion: early WATCH is not an alarm; sensitivity is not accuracy. */
(function (root) {
  'use strict';
  const I = typeof module !== 'undefined' && module.exports ? require('./inverse-engine.js') : root.WildfireInverse;
  const VERSION = 'evidence-first-v1.2';
  const POLICY = Object.freeze({ pairedPm: 12.5, pairedCo: .10, singlePm: 25, singleCo: .20,
    durationSec: 60, maxGapSec: 90, freshnessSec: 120, windowSec: 1200,
    minIoU: .25, maxShiftM: 500, minAreaRatio: .5, maxAreaRatio: 2, windOffsetsDeg: Object.freeze([-10, 10]) });
  const iso = t => new Date(t * 1000).toISOString();
  const paired = r => r.valid && r.dp > 25 && r.dc > .2;
  const weak = r => r.valid && r.dp >= POLICY.pairedPm && r.dc >= POLICY.pairedCo;
  const kind = r => !r.valid ? null : weak(r) ? 'PAIRED_RISE' : r.dp > POLICY.singlePm ? 'PM_RISE' : r.dc > POLICY.singleCo ? 'CO_RISE' : null;
  function runAtEnd(rows) {
    let start = null, last = null, category = null;
    for (const r of rows) {
      const next = kind(r);
      if (!next) { start = last = category = null; continue; }
      if (!last || r.t - last.t > POLICY.maxGapSec || next !== category) start = r;
      last = r; category = next;
    }
    return last ? { start, last, category, durationSec: last.t - start.t } : null;
  }
  // Receiver-time replay: later measurements can arrive first. Never treat a future
  // or unreceived row as available. Track the earliest actual arrival cutoff.
  function receivedSignalAt(rows) {
    const events = [...new Set(rows.map(r => r.received))].sort((a, b) => a - b);
    for (const cutoff of events) {
      let start = null, previous = null;
      for (const r of rows) {
        if (r.received > cutoff) continue;
        if (!paired(r)) { start = previous = null; continue; }
        if (!previous || r.t - previous.t > I.EVIDENCE_POLICY.maxGapSec) start = r;
        previous = r;
        if (r.t - start.t >= I.EVIDENCE_POLICY.minDurationSec) return iso(cutoff);
      }
    }
    return null;
  }
  function observe(packet) {
    const p = I.prepare(packet), e = I.evidence(p);
    const entries = e.entries.map(row => {
      const rows = p.series.get(row.id).filter(r => r.t >= p.asOf - POLICY.windowSec);
      const run = runAtEnd(rows), current = row.status !== 'UNKNOWN';
      const watching = current && !['SUSPECT', 'PENDING'].includes(row.status) && run && run.durationSec >= POLICY.durationSec;
      return { id: row.id, signalStatus: row.status, watchReason: watching ? run.category : null,
        watchSince: watching ? iso(run.start.t) : null, observedAt: row.observedAt,
        firstMeasurementSignalAt: row.firstSignalAt, firstReceivedSignalAt: receivedSignalAt(p.series.get(row.id)),
        deltaPm25: row.dp, deltaCo: row.dc, quality: current ? 'CURRENT' : 'UNAVAILABLE' };
    });
    const watchIds = entries.filter(r => r.watchReason).map(r => r.id);
    const pairedIds = entries.filter(r => r.watchReason === 'PAIRED_RISE').map(r => r.id);
    const status = e.alerts.length ? 'SIGNAL' : e.firstSignalAt ? 'SIGNAL_HISTORY' :
      entries.some(r => r.signalStatus === 'PENDING') ? 'PENDING' : pairedIds.length >= 2 ? 'MULTI_STATION_WATCH' :
      watchIds.length ? 'WATCH' : !e.online ? 'DATA_UNAVAILABLE' : 'NO_WATCH';
    return { version: VERSION, asOf: iso(p.asOf), status, entries, watchStationIds: watchIds,
      currentSignalStationIds: e.alerts.map(r => r.id), historicalSignalStationIds: e.incident.evidenceStationIds,
      firstMeasurementSignalAt: e.firstSignalAt,
      firstReceivedSignalAt: entries.map(r => r.firstReceivedSignalAt).filter(Boolean).sort()[0] || null,
      policy: POLICY, mode: 'WATCH_SHADOW_ONLY', fieldValidated: false, probability: null, estimatedIgnitionAt: null };
  }
  function boxes(report, origin) {
    return report.cells.map(c => { const [x, y] = I.xy(origin, c), h = c.sizeM / 2;
      return { x, y, x0: x - h, x1: x + h, y0: y - h, y1: y + h, area: c.sizeM ** 2 }; });
  }
  function compareRegions(reference, trial, origin) {
    if (!reference.cells.length) return { status: 'NOT_APPLICABLE', iou: null, centroidShiftM: null, areaRatio: null, sensitive: false };
    if (!trial.cells.length) return { status: 'REGION_LOST', iou: 0, centroidShiftM: null, areaRatio: 0, sensitive: true };
    const a = boxes(reference, origin), b = boxes(trial, origin);
    const area = xs => xs.reduce((n, r) => n + r.area, 0), aa = area(a), ab = area(b);
    let intersection = 0;
    for (const x of a) for (const y of b) intersection += Math.max(0, Math.min(x.x1, y.x1) - Math.max(x.x0, y.x0)) * Math.max(0, Math.min(x.y1, y.y1) - Math.max(x.y0, y.y0));
    const iou = Math.min(1, intersection / (aa + ab - intersection));
    const centroid = (xs, total) => [xs.reduce((n, r) => n + r.x * r.area, 0) / total, xs.reduce((n, r) => n + r.y * r.area, 0) / total];
    const ca = centroid(a, aa), cb = centroid(b, ab), shift = Math.hypot(ca[0] - cb[0], ca[1] - cb[1]), ratio = ab / aa;
    return { status: 'COMPARED', iou, centroidShiftM: shift, areaRatio: ratio,
      sensitive: iou < POLICY.minIoU || shift > POLICY.maxShiftM || ratio < POLICY.minAreaRatio || ratio > POLICY.maxAreaRatio };
  }
  function trialsFor(packet) {
    const p = I.prepare(packet), recent = p.rows.filter(r => r.t >= p.asOf - POLICY.windowSec);
    const ids = p.stations.filter(s => recent.some(r => r.stationId === s.id && (r.valid || r.windValid))).map(s => s.id);
    const positive = new Set(recent.filter(paired).map(r => r.stationId));
    const quiet = ids.filter(id => !positive.has(id) && recent.some(r => r.stationId === id && r.valid));
    const make = (id, type, observations, extra = {}) => ({ id, type, ...extra, packet: { ...packet, observations } });
    const trials = ids.map(id => make('without-' + id, 'LEAVE_ONE_STATION_OUT', packet.observations.filter(o => o.stationId !== id), { stationId: id }));
    for (const delta of POLICY.windOffsetsDeg) trials.push(make('wind-' + delta, 'WIND_STRESS', packet.observations.map(o =>
      o.windQuality === 'VALID' && Number.isFinite(o.windFromDeg) ? { ...o, windFromDeg: (o.windFromDeg + delta + 360) % 360 } : o), { offsetDeg: delta }));
    if (quiet.length) trials.push(make('quiet-constraints', 'QUIET_CONSTRAINT_STRESS', packet.observations.map(o =>
      quiet.includes(o.stationId) ? { ...o, quality: 'INVALID', pm25: null, co: null } : o), { stationIds: quiet }));
    return trials;
  }
  function summarizeTrials(rows, expected) {
    if (rows.length !== expected || rows.some(r => r.status === 'ERROR')) return 'INCOMPLETE';
    return rows.some(r => r.comparison.sensitive) ? 'SENSITIVE' : 'STABLE_UNDER_TESTS';
  }
  function diagnose(packet, onProgress = () => {}) {
    const p = I.prepare(packet), baseline = I.infer(packet);
    const out = { version: VERSION, baselineVersion: I.VERSION, asOf: iso(p.asOf), status: 'NOT_APPLICABLE',
      baselineStatus: baseline.status, baselineAreaKm2: baseline.cells.length ? baseline.areaKm2 : null,
      trials: [], criticalStationIds: [], testedCount: 0, plannedCount: 0, fieldValidated: false,
      probability: null, confidenceLevel: null, warnings: ['SENSITIVITY_NOT_ACCURACY', 'FIXED_HEURISTICS_NOT_CALIBRATED', 'BASELINE_AREA_NOT_MODIFIED'] };
    if (!baseline.cells.length) return out;
    const plans = trialsFor(packet); out.plannedCount = plans.length;
    for (const trial of plans) {
      const { packet: input, ...info } = trial;
      try {
        const r = I.infer(input);
        out.trials.push({ ...info, status: 'DONE', resultStatus: r.status, areaKm2: r.cells.length ? r.areaKm2 : null,
          comparison: compareRegions(baseline, r, p.origin) });
      } catch (error) { out.trials.push({ ...info, status: 'ERROR', error: String(error.message || error) }); }
      out.testedCount++; onProgress({ completed: out.testedCount, total: plans.length });
    }
    out.status = summarizeTrials(out.trials, plans.length);
    out.criticalStationIds = out.trials.filter(r => r.type === 'LEAVE_ONE_STATION_OUT' && r.comparison?.sensitive).map(r => r.stationId);
    return out;
  }
  const api = { VERSION, POLICY, observe, receivedSignalAt, compareRegions, trialsFor, summarizeTrials, diagnose };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.WildfireAssessment = api;
})(typeof window !== 'undefined' ? window : globalThis);
