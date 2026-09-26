/* V2A finite-mixture generalized Bayes. Conditional model weights, NOT field probabilities. */
(function (root) {
  'use strict';
  const I = typeof module !== 'undefined' && module.exports ? require('./inverse-engine.js') : root.WildfireInverse;
  const VERSION = 'bayes-grid-v2a.1';
  const SETTINGS = Object.freeze({ radiusM: 4000, coarseM: 200, fineM: 100, refineParents: 100,
    massTarget: .9, channelCorrelation: .4, maxEffectivePerStation: 10,
    modelPmStd: 15, modelCoStd: .09, correlationSec: 120 });
  const WINDS = Object.freeze([[0, 1, .16], [-15, 1, .16], [15, 1, .16], [0, .8, .12], [0, 1.2, .22]]);
  const EMISSION_SCALES = Object.freeze([80, 250, 800]);
  const PROFILES = Object.freeze([[1,1,.4,'CONSTANT'],[1,0,.15,'STOPPING'],[0,1,.15,'STARTING_LATE'],[.3,1,.15,'GROWING'],[1,.3,.15,'DECLINING']]);
  const RATIOS = Object.freeze([.004, .0065, .009]);
  const finite = Number.isFinite, iso = t => new Date(t * 1000).toISOString();
  function strict(obj, fields, name) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj) || Object.keys(obj).some(k => !fields.includes(k))) throw Error('BAYES_CONTRACT_INVALID: ' + name);
  }
  function sensorModels(options, stations) {
    strict(options, ['sensorModels'], 'options');
    const defaults = { pmStd: 8, coStd: .06, baselinePmStd: 5, baselineCoStd: .04, responseLagSec: 0 };
    const result = new Map(stations.map(s => [s.id, { stationId: s.id, ...defaults, basis: 'ASSUMED_DEFAULT' }]));
    if (options.sensorModels === undefined) return result;
    if (!Array.isArray(options.sensorModels) || options.sensorModels.length > stations.length) throw Error('SENSOR_MODELS_INVALID');
    const seen = new Set();
    for (const s of options.sensorModels) {
      strict(s, ['stationId', ...Object.keys(defaults)], 'sensor model');
      if (!result.has(s.stationId) || seen.has(s.stationId)) throw Error('SENSOR_MODEL_STATION_INVALID');
      seen.add(s.stationId);
      for (const [k, high] of [['pmStd', 500], ['coStd', 10], ['baselinePmStd', 500], ['baselineCoStd', 10], ['responseLagSec', 120]]) {
        if (s[k] !== undefined && (!finite(s[k]) || s[k] < 0 || s[k] > high || (['pmStd', 'coStd'].includes(k) && s[k] === 0))) throw Error('SENSOR_MODEL_VALUE_INVALID: ' + k);
      }
      result.set(s.stationId, { ...result.get(s.stationId), ...s, basis: 'USER_SUPPLIED_UNVERIFIED' });
    }
    return result;
  }
  function logAdd(a, b) {
    if (a === -Infinity) return b;
    if (b === -Infinity) return a;
    const hi = Math.max(a, b); return hi + Math.log1p(Math.exp(Math.min(a, b) - hi));
  }
  function normalize(logWeights) {
    const max = Math.max(...logWeights);
    if (!finite(max)) throw Error('POSTERIOR_NOT_FINITE');
    const w = logWeights.map(x => Math.exp(x - max)), sum = w.reduce((a, b) => a + b, 0);
    return w.map(x => x / sum);
  }
  function windAt(p, x, y, t, member) {
    let u = 0, v = 0, total = 0;
    for (const s of p.stations) {
      const rows = p.series.get(s.id); let r;
      for (let j = rows.length - 1; j >= 0; j--) if (rows[j].t <= t) { r = rows[j]; break; }
      if (!r?.windValid || t - r.t > 120) continue;
      const w = 1 / (250 ** 2 + (x - r.x) ** 2 + (y - r.y) ** 2);
      u += w * r.u; v += w * r.v; total += w;
    }
    if (!total) return null;
    u /= total; v /= total;
    const a = member[0] * Math.PI / 180, scale = member[1];
    return { u: scale * (u * Math.cos(a) + v * Math.sin(a)), v: scale * (v * Math.cos(a) - u * Math.sin(a)), speed: Math.hypot(u, v) * scale };
  }
  function trajectory(p, row, member, lag) {
    let x = row.x, y = row.y; const points = [];
    for (let age = 0; age <= 1800; age += 60) {
      const t = row.t - lag - age, w = windAt(p, x, y, t, member);
      if (!w || w.speed < .3) break;
      const sigma = 80 + age * member[2];
      points.push({ x, y, t, sigma2: sigma ** 2, weight: (80 / sigma) ** 2 * Math.exp(-age / 3600) });
      x -= 60 * w.u; y -= 60 * w.v;
    }
    return points;
  }
  function weightedSamples(p, models) {
    const samples = I.selectSamples(p);
    for (const s of p.stations) {
      const rows = samples.filter(r => r.stationId === s.id), m = models.get(s.id);
      const sigmaP = Math.hypot(m.pmStd, m.baselinePmStd, SETTINGS.modelPmStd);
      const sigmaC = Math.hypot(m.coStd, m.baselineCoStd, SETTINGS.modelCoStd);
      const span = rows.length > 1 ? rows.at(-1).t - rows[0].t : 0;
      const effective = Math.min(SETTINGS.maxEffectivePerStation, Math.max(1, span / SETTINGS.correlationSec));
      for (const r of rows) { r.w = r.fitWeight * effective; r.sp = sigmaP; r.sc = sigmaC; r.lag = m.responseLagSec; }
    }
    return samples;
  }
  // Sufficient statistics of the correlated, uncertainty-weighted two-channel likelihood.
  function quadratic(k1, k2, rows, ratio) {
    let aa = 0, ab = 0, bb = 0, ay = 0, by = 0, yy = 0;
    const rho = SETTINGS.channelCorrelation, inv = 1 / (1 - rho * rho);
    for (let j = 0; j < rows.length; j++) {
      const r = rows[j], w = r.w * inv, yp = r.dp / r.sp, yc = r.dc / r.sc;
      const kp = 1 / r.sp, kc = ratio / r.sc;
      const a = kp * kp + kc * kc - 2 * rho * kp * kc;
      const b = yp * kp + yc * kc - rho * (yp * kc + yc * kp);
      aa += w * a * k1[j] ** 2; ab += w * a * k1[j] * k2[j]; bb += w * a * k2[j] ** 2;
      ay += w * b * k1[j]; by += w * b * k2[j]; yy += w * (yp * yp + yc * yc - 2 * rho * yp * yc);
    }
    return { aa, ab, bb, ay, by, yy };
  }
  function logPhi(x) {
    if (x < -10) { const z=-x; return -.5*z*z-Math.log(z)-.5*Math.log(2*Math.PI)+Math.log(1-1/(z*z)+3/(z**4)); }
    const z=Math.abs(x)/Math.sqrt(2),t=1/(1+.3275911*z);
    const erf=1-(((((1.061405429*t-1.453152027)*t+1.421413741)*t-.284496736)*t+.254829592)*t)*Math.exp(-z*z);
    return Math.log(Math.max(Number.MIN_VALUE,.5*(1+(x<0?-erf:erf))));
  }
  function mixture(q) {
    let logEvidence=-Infinity,best=null;
    for (const [a,b,prior,kind] of PROFILES) {
      const precision=q.aa*a*a+2*q.ab*a*b+q.bb*b*b,linear=q.ay*a+q.by*b;
      for (const sigma of EMISSION_SCALES) {
        // Exact one-dimensional half-normal amplitude marginal, conditional on each shape/scale.
        const h=precision+1/(sigma*sigma),z=linear/Math.sqrt(h);
        const ll=-.5*q.yy+.5*linear*linear/h-.5*Math.log(sigma*sigma*h)+Math.log(2)+logPhi(z);
        logEvidence=logAdd(logEvidence,ll+Math.log(prior/EMISSION_SCALES.length));
      }
      const gain=Math.max(0,linear/Math.max(precision,1e-20));
      const residual=Math.max(0,q.yy-2*gain*linear+gain*gain*precision);
      if(!best||residual<best.residual)best={logLikelihood:-.5*residual,residual,early:gain*a,late:gain*b,kind};
    }
    return {logEvidence,best};
  }
  function evaluator(p, samples) {
    const oldest = Math.max(p.asOf - 1800, Math.min(...p.rows.map(r => r.t)));
    const starts = []; for (let t = Math.floor((p.asOf - 120) / 120) * 120; t >= oldest; t -= 120) starts.push(t);
    if (!starts.length) return null;
    const traces = WINDS.map(m => samples.map(r => trajectory(p, r, m, r.lag)));
    if (traces.some(ts => ts.filter(t => t.length >= 2).length < samples.length * .6)) return null;
    const effectiveN = samples.reduce((n, s) => n + s.w, 0);
    function score(c) {
      let logEvidence = -Infinity, best = null;
      for (let m = 0; m < WINDS.length; m++) {
        // Integrate releases at their actual historical times, not at packet arrival time.
        const values = traces[m].map(tr => tr.map(v => {
          const d2 = (c.x - v.x) ** 2 + (c.y - v.y) ** 2;
          return d2 < 18 * v.sigma2 ? v.weight * Math.exp(-d2 / (2 * v.sigma2)) : 0;
        }));
        for (const start of starts) {
          const split = (start + p.asOf) / 2;
          const a = new Float64Array(samples.length), b = new Float64Array(samples.length);
          for (let j = 0; j < samples.length; j++) for (let k = 0; k < traces[m][j].length; k++) {
            const t = traces[m][j][k].t; if (t < start) break;
            if (t < split) a[j] += values[j][k]; else b[j] += values[j][k];
          }
          for (const ratio of RATIOS) {
            const fit = mixture(quadratic(a, b, samples, ratio));
            logEvidence = logAdd(logEvidence, fit.logEvidence - Math.log(WINDS.length * starts.length * RATIOS.length));
            if (!best || fit.best.logLikelihood > best.logLikelihood) best = { ...fit.best, start, split, ratio, windMember: m };
          }
        }
      }
      return { ...c, logEvidence, best };
    }
    return { score, effectiveN, traces, starts };
  }
  function spatialGrid() {
    const cells = [];
    for (let x = -4000; x <= 4000; x += 200) for (let y = -4000; y <= 4000; y += 200) {
      if (x * x + y * y <= 4000 ** 2) cells.push({ x, y, size: 200 });
    }
    return cells;
  }
  function posterior(cells) {
    const weights = normalize(cells.map(c => c.logEvidence + Math.log(c.size ** 2)));
    return cells.map((c, i) => ({ ...c, weight: weights[i] }));
  }
  function regions(cells, origin) {
    const remaining = new Set(cells.map((_, i) => i)), out = [];
    while (remaining.size) {
      const queue = [remaining.values().next().value], group = []; remaining.delete(queue[0]);
      while (queue.length) {
        const i = queue.pop(), a = cells[i]; group.push(a);
        for (const j of remaining) { const b = cells[j], touch = (a.size + b.size) / 2 + .01;
          if (Math.abs(a.x - b.x) <= touch && Math.abs(a.y - b.y) <= touch) { remaining.delete(j); queue.push(j); }
        }
      }
      out.push({ areaKm2: group.reduce((s, c) => s + c.size ** 2 / 1e6, 0), cellCount: group.length,
        modelMass: group.reduce((s, c) => s + c.weight, 0), outsideStudy: group.some(c => Math.hypot(c.x, c.y) > 2000),
        bounds: [I.geo(origin, Math.min(...group.map(c => c.x - c.size / 2)), Math.min(...group.map(c => c.y - c.size / 2))),
          I.geo(origin, Math.max(...group.map(c => c.x + c.size / 2)), Math.max(...group.map(c => c.y + c.size / 2)))] });
    }
    return out.sort((a, b) => b.modelMass - a.modelMass).map((z, i) => ({ id: 'ZONE-' + (i + 1), ...z }));
  }
  function infer(packet, options = {}) {
    const p = I.prepare(packet), models = sensorModels(options, p.stations), e = I.evidence(p);
    const support = e.entries.filter(r => r.recentSignal), samples = weightedSamples(p, models);
    const base = { modelVersion: VERSION, asOf: iso(p.asOf), fieldValidated: false, probability: null, confidenceLevel: null,
      mode: 'GENERALIZED_BAYES_FINITE_MIXTURE_UNCALIBRATED', estimatedIgnitionAt: null, releaseWindow: null,
      firstSignalAt: e.firstSignalAt, incident: e.incident, evidence: e.entries, online: e.online,
      anomalousStations: support.map(s => s.id), currentAnomalousStations: e.alerts.map(s => s.id),
      sampleCount: samples.length, solverPositiveCount: samples.filter(r => r.dp > 25 && r.dc > .2).length,
      solverSupportStationIds: [...new Set(samples.filter(r => r.dp > 25 && r.dc > .2).map(r => r.stationId))],
      discardedRecords: p.rejected, futureRecordsExcluded: p.future, cells: [], zones: [],
      assessmentDataStatus: e.incident.dataGapStationIds.length ? 'HISTORICAL_EVIDENCE_DATA_GAP' : e.alerts.length ? 'CURRENT_AND_RECENT_EVIDENCE' : 'HISTORICAL_EVIDENCE',
      supportDataThrough: e.incident.lastConfirmedAt, sensorModels: [...models.values()], searchRadiusM: 4000,
      resolutionM: 200, refinementM: 100, singleSourceAssumption: true,
      warnings: ['EXPERIMENTAL_CHALLENGER', 'NOT_A_FIRE_CONFIRMATION', 'CONDITIONAL_MODEL_MASS_NOT_CALIBRATED_COVERAGE', 'NO_TERRAIN_OR_CANOPY_DISPERSION_SOLVER', 'SENSOR_MODELS_NOT_FIELD_CALIBRATED'],
      updatePolicy: 'REBUILD_FROM_FIXED_PRIOR_AND_DEDUPLICATED_ROLLING_WINDOW', uniqueObservationCount: p.rows.length };
    if (!e.online) return { ...base, status: 'INSUFFICIENT_DATA' };
    if (!support.length) return { ...base, status: e.firstSignalAt ? 'SIGNAL_HISTORY' : e.entries.some(r => r.status === 'PENDING') ? 'PENDING' : e.entries.some(r => r.status === 'PARTICULATE_ONLY') ? 'PARTICULATE_ONLY' : 'NO_SIGNAL' };
    if (samples.length < 6 || support.some(s => !base.solverSupportStationIds.includes(s.id))) return { ...base, status: 'INSUFFICIENT_DATA' };
    const fit = evaluator(p, samples); if (!fit) return { ...base, status: 'WIND_UNAVAILABLE' };
    const corridors = support.map(s => ({ stationId: s.id, points: trajectory(p, p.series.get(s.id).filter(r => r.valid).at(-1), WINDS[0], models.get(s.id).responseLagSec).map(t => I.geo(p.origin, t.x, t.y)) }));
    if (support.length < 2) return { ...base, status: 'DIRECTIONAL_ONLY', directionalCorridors: corridors };
    let all = posterior(spatialGrid().map(fit.score));
    // Replace parents, never discard unrefined tail. Spatial prior always uses cell area.
    const sorted = [...all].sort((a, b) => b.weight - a.weight); let mass = 0;
    const parents = new Set(); for (const c of sorted) { if (mass >= .95 || parents.size >= SETTINGS.refineParents) break; parents.add(c); mass += c.weight; }
    const partition = all.filter(c => !parents.has(c));
    for (const c of parents) for (const dx of [-50, 50]) for (const dy of [-50, 50]) partition.push(fit.score({ x: c.x + dx, y: c.y + dy, size: 100 }));
    all = posterior(partition);
    const ranked = [...all].sort((a, b) => b.weight / (b.size ** 2) - a.weight / (a.size ** 2));
    const selected = []; let selectedMass = 0;
    for (const c of ranked) { selected.push(c); selectedMass += c.weight; if (selectedMass >= SETTINGS.massTarget) break; }
    const best = all.reduce((a, b) => b.best.logLikelihood > a.best.logLikelihood ? b : a);
    const fitLoss = best.best.residual / Math.max(1, 2 * fit.effectiveN);
    const zs = regions(selected, p.origin), area = zs.reduce((n, z) => n + z.areaKm2, 0);
    const externalMass = all.filter(c => Math.hypot(c.x, c.y) > 2000).reduce((n, c) => n + c.weight, 0);
    const boundaryMass = all.filter(c => Math.hypot(c.x, c.y) > 3750).reduce((n, c) => n + c.weight, 0);
    const bad = fitLoss > 1; // Conservative heuristic rejection, not a calibrated hypothesis test.
    const status = bad ? 'MODEL_MISMATCH' : externalMass > .2 ? 'EXTERNAL_POSSIBLE' : support.length < 3 || area > 2 || zs.length > 1 ? 'AMBIGUOUS' : 'CANDIDATE_AREAS';
    return { ...base, status, fitLoss, areaKm2: bad ? null : area, externalPossible: externalMass > .2, searchBoundaryReached: boundaryMass > .05,
      directionalCorridors: corridors, zones: bad ? [] : zs,
      cells: bad ? [] : selected.map(c => ({ ...I.geo(p.origin, c.x, c.y), sizeM: c.size, fitLoss: -Math.log(Math.max(c.weight / (c.size ** 2), 1e-300)), modelWeight: c.weight, fitClass: c.weight >= ranked[0].weight / 4 ? 'BETTER_FIT' : 'ALTERNATIVE_FIT' })),
      posterior: { interpretation: 'CONDITIONAL_GENERALIZED_MODEL_WEIGHTS_NOT_FIELD_PROBABILITY', massTarget: SETTINGS.massTarget, selectedMass,
        totalMass: all.reduce((n, c) => n + c.weight, 0), cellCount: all.length, priorAreaM2: all.reduce((n, c) => n + c.size ** 2, 0),
        externalMass, boundaryMass, effectiveSampleSize: fit.effectiveN, windMembers: WINDS.length,
        cells: all.map(c => ({ ...I.geo(p.origin, c.x, c.y), sizeM: c.size, weight: c.weight })) },
      emissionSummary: bad ? null : { interpretation: 'BEST_NUISANCE_HYPOTHESIS_NOT_MEASURED_EMISSION',
        effectiveStart: iso(best.best.start), splitAt: iso(best.best.split), earlyRelative: best.best.early, lateRelative: best.best.late,
        type: best.best.kind, pmCoRatio: best.best.ratio, leftCensored: best.best.start <= fit.starts.at(-1) },
      warnings: [...base.warnings, ...(bad ? ['MODEL_MISMATCH_NO_LOCATION_CLAIM'] : []), ...(support.length < 3 ? ['FEW_INDEPENDENT_STATIONS'] : [])] };
  }
  const api = { VERSION, SETTINGS, infer, sensorModels, normalize, logAdd, spatialGrid, posterior, mixture, logPhi, weightedSamples };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.WildfireBayes = api;
})(typeof window !== 'undefined' ? window : globalThis);
