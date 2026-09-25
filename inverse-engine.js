/* Observation-only inverse screening. No simulator, source coordinate or ignition time input. */
(function (root) {
  'use strict';
  const VERSION = 'inverse-footprint-v1';
  const finite = Number.isFinite;
  const rad = Math.PI / 180, R = 6371008.8;
  const xy = (o, p) => [(p.lon - o.lon) * rad * R * Math.cos(o.lat * rad), (p.lat - o.lat) * rad * R];
  const geo = (o, x, y) => ({ lat: o.lat + y / R / rad, lon: o.lon + x / (R * Math.cos(o.lat * rad)) / rad });
  const iso = t => new Date(t * 1000).toISOString();
  function keys(obj, allowed, name) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj) || Object.keys(obj).some(k => !allowed.includes(k))) throw Error('CONTRACT_INVALID: ' + name);
  }
  function stamp(s) { if (typeof s !== 'string' || !/T.*(?:Z|[+-]\d\d:\d\d)$/.test(s) || !finite(Date.parse(s))) throw Error('TIMESTAMP_INVALID'); return Date.parse(s) / 1000; }
  function coord(p) { if (!p || !finite(p.lat) || !finite(p.lon) || Math.abs(p.lat) > 85 || Math.abs(p.lon) > 180) throw Error('COORDINATE_INVALID'); }
  function prepare(input) {
    keys(input, ['schemaVersion', 'asOf', 'domain', 'stations', 'observations'], 'packet (truth/source/scenario forbidden)');
    if (input.schemaVersion !== 1) throw Error('SCHEMA_UNSUPPORTED');
    keys(input.domain, ['center', 'radiusM'], 'domain'); keys(input.domain.center, ['lat', 'lon'], 'center'); coord(input.domain.center);
    if (input.domain.radiusM !== 2000) throw Error('DOMAIN_REQUIRES_2000M');
    if (!Array.isArray(input.stations) || !input.stations.length || input.stations.length > 50 || !Array.isArray(input.observations) || input.observations.length > 8000) throw Error('PACKET_SIZE_INVALID');
    const asOf = stamp(input.asOf), origin = input.domain.center, ids = new Set();
    const stations = input.stations.map(s => {
      keys(s, ['id', 'lat', 'lon', 'elevationM', 'inletHeightM'], 'station'); coord(s);
      if (typeof s.id !== 'string' || !/^[A-Za-z0-9_-]{1,32}$/.test(s.id) || ids.has(s.id) || Math.hypot(...xy(origin, s)) > 5000) throw Error('STATION_INVALID');
      ids.add(s.id); return { ...s, x: xy(origin, s)[0], y: xy(origin, s)[1] };
    });
    const byId = new Map(stations.map(s => [s.id, s])), unique = new Map(); let rejected = 0, future = 0;
    for (const o of input.observations) {
      keys(o, ['stationId', 'observedAt', 'receivedAt', 'pm25', 'co', 'baselinePm25', 'baselineCo', 'windFromDeg', 'windSpeedMps', 'temperatureC', 'relativeHumidityPct', 'quality', 'windQuality'], 'observation');
      if (!byId.has(o.stationId)) throw Error('STATION_UNKNOWN');
      const t = stamp(o.observedAt), received = stamp(o.receivedAt);
      if (received < t) throw Error('CLOCK_ORDER_INVALID');
      if (t > asOf || received > asOf) { future++; continue; }
      if (t < asOf - 3600) continue;
      if (!['VALID', 'STALE', 'INVALID'].includes(o.quality) || !['VALID', 'STALE', 'INVALID'].includes(o.windQuality)) throw Error('QUALITY_INVALID');
      const valid = o.quality === 'VALID' && [o.pm25, o.co, o.baselinePm25, o.baselineCo].every(v => finite(v) && v >= 0) && o.pm25 <= 10000 && o.co <= 1000;
      const windValid = o.windQuality === 'VALID' && finite(o.windFromDeg) && o.windFromDeg >= 0 && o.windFromDeg < 360 && finite(o.windSpeedMps) && o.windSpeedMps >= 0 && o.windSpeedMps <= 50;
      if (!valid) rejected++;
      const s = byId.get(o.stationId), a = windValid ? (o.windFromDeg + 180) * rad : 0;
      const row = { ...o, t, received, valid, windValid, x: s.x, y: s.y, u: windValid ? o.windSpeedMps * Math.sin(a) : null, v: windValid ? o.windSpeedMps * Math.cos(a) : null, dp: valid ? o.pm25 - o.baselinePm25 : null, dc: valid ? o.co - o.baselineCo : null };
      const k = s.id + '/' + t, prev = unique.get(k);
      if (prev && ['pm25','co','baselinePm25','baselineCo','windFromDeg','windSpeedMps','temperatureC','relativeHumidityPct','quality','windQuality'].some(k => prev[k] !== row[k])) throw Error('CONFLICTING_DUPLICATE');
      if (!prev || received < prev.received) unique.set(k, row);
    }
    const rows = [...unique.values()].sort((a,b) => a.t - b.t || a.stationId.localeCompare(b.stationId));
    const series = new Map(stations.map(s => [s.id, rows.filter(r => r.stationId === s.id)]));
    return { asOf, origin, stations, rows, series, rejected, future };
  }
  function evidence(p) {
    const entries = p.stations.map(s => {
      const rows = p.series.get(s.id), latest = rows.at(-1), fresh = !!latest && latest.valid && p.asOf - latest.t <= 120;
      let first = null, previous = null, lastConfirmed = null;
      for (const r of rows) {
        const positive = r.valid && r.dp > 25 && r.dc > .2;
        if (positive && previous && r.t - previous.t >= 30 && r.t - previous.t <= 90) { if (first === null) first = r.t; lastConfirmed = r.t; }
        previous = positive ? r : null;
      }
      const active = fresh && lastConfirmed === latest.t;
      return { id: s.id, lat: s.lat, lon: s.lon, status: !fresh ? 'UNKNOWN' : active ? 'SUSPECT' : latest.dp > 25 ? 'PARTICULATE_ONLY' : 'NO_ANOMALY', firstSignalAt: first === null ? null : iso(first), recentSignal: fresh && lastConfirmed !== null && lastConfirmed >= p.asOf - 1200, observedAt: latest?.observedAt || null, pm25: fresh ? latest.pm25 : null, co: fresh ? latest.co : null, dp: fresh ? latest.dp : null, dc: fresh ? latest.dc : null, windFromDeg: latest?.windValid && p.asOf - latest.t <= 120 ? latest.windFromDeg : null, windSpeedMps: latest?.windValid && p.asOf - latest.t <= 120 ? latest.windSpeedMps : null, temperatureC: fresh && finite(latest.temperatureC) ? latest.temperatureC : null, relativeHumidityPct: fresh && finite(latest.relativeHumidityPct) ? latest.relativeHumidityPct : null };
    });
    const alerts = entries.filter(e => e.status === 'SUSPECT'), first = entries.map(e => e.firstSignalAt).filter(Boolean).sort()[0] || null;
    return { entries, alerts, firstSignalAt: first, online: entries.filter(e => e.status !== 'UNKNOWN').length };
  }
  function windAt(p, x, y, t, biasDeg) {
    let u = 0, v = 0, weight = 0;
    for (const station of p.stations) {
      const a = p.series.get(station.id); let r;
      for (let i = a.length - 1; i >= 0; i--) if (a[i].t <= t) { r = a[i]; break; }
      if (!r?.windValid || t - r.t > 120) continue;
      const w = 1 / (250 * 250 + (x - r.x) ** 2 + (y - r.y) ** 2); weight += w; u += w * r.u; v += w * r.v;
    }
    if (!weight) return null;
    u /= weight; v /= weight;
    return { u: u * Math.cos(biasDeg * rad) + v * Math.sin(biasDeg * rad), v: v * Math.cos(biasDeg * rad) - u * Math.sin(biasDeg * rad), speed: Math.hypot(u,v) };
  }
  function trace(p, sample, biasDeg, spread) {
    let x = sample.x, y = sample.y; const steps = [];
    for (let age = 0; age <= 1800; age += 60) {
      const t = sample.t - age, w = windAt(p, x, y, t, biasDeg);
      if (!w || w.speed < .3) break;
      const sigma = 80 + age * spread;
      steps.push({ x, y, t, sigma2: sigma * sigma, weight: (80 / sigma) ** 2 * Math.exp(-age / 3600) });
      x -= w.u * 60; y -= w.v * 60;
    }
    return steps;
  }
  const huber = r => Math.abs(r) <= 2 ? .5 * r * r : 2 * Math.abs(r) - 2;
  function fit(q, samples) {
    let a = 0, bp = 0, bc = 0;
    for (let i=0;i<samples.length;i++) { a += q[i] * q[i]; bp += q[i] * samples[i].dp / 8; bc += q[i] * samples[i].dc / .06; }
    if (a < 1e-12) return { loss: Infinity, gp: 0, gc: 0 };
    let gp = Math.max(0,bp/a), gc = Math.max(0,bc/a);
    for (let k=0;k<2;k++) {
      let ap=0, ac=0; bp=0; bc=0;
      for (let i=0;i<samples.length;i++) { const yp=samples[i].dp/8,yc=samples[i].dc/.06,wp=Math.min(1,2/Math.max(.001,Math.abs(yp-gp*q[i]))),wc=Math.min(1,2/Math.max(.001,Math.abs(yc-gc*q[i]))); ap+=wp*q[i]*q[i];ac+=wc*q[i]*q[i];bp+=wp*q[i]*yp;bc+=wc*q[i]*yc; }
      gp=Math.max(0,bp/Math.max(ap,1e-12));gc=Math.max(0,bc/Math.max(ac,1e-12));
    }
    let loss=0; const residuals=Object.create(null);
    for(let i=0;i<samples.length;i++) { const v=(huber(samples[i].dp/8-gp*q[i])+huber(samples[i].dc/.06-gc*q[i]))/2; loss+=v; const id=samples[i].stationId; (residuals[id] ||= []).push(v); }
    const values=Object.values(residuals).map(a=>a.reduce((x,y)=>x+y,0)/a.length);
    return { loss: values.reduce((x,y)=>x+y,0)/values.length, gp, gc };
  }
  function scoreCandidate(candidate, traces, samples, starts) {
    const kernels=starts.map(()=>new Float64Array(samples.length));
    for(let j=0;j<traces.length;j++) {
      let sum=0, step=0; const tr=traces[j];
      for(let k=0;k<starts.length;k++) {
        while(step<tr.length && tr[step].t>=starts[k]) { const p=tr[step++]; const d2=(candidate.x-p.x)**2+(candidate.y-p.y)**2; if(d2<18*p.sigma2) sum+=Math.exp(-d2/(2*p.sigma2))*p.weight; }
        kernels[k][j]=sum;
      }
    }
    let best={loss:Infinity,onset:null};
    for(let k=0;k<starts.length;k++) { const f=fit(kernels[k],samples); if(f.loss<best.loss)best={...f,onset:starts[k]}; }
    return { ...candidate, ...best };
  }
  function groups(cells, origin) {
    const remaining=new Set(cells.map((_,i)=>i)), out=[];
    while(remaining.size) { const queue=[remaining.values().next().value], group=[];remaining.delete(queue[0]);
      while(queue.length){const i=queue.pop(),a=cells[i];group.push(a);for(const j of [...remaining]){const b=cells[j];if(Math.hypot(a.x-b.x,a.y-b.y)<=Math.max(a.size,b.size)*1.51){remaining.delete(j);queue.push(j);}}}
      const area=group.reduce((s,c)=>s+c.size*c.size,0)/1e6, xs=group.map(c=>c.x),ys=group.map(c=>c.y);
      out.push({ cellCount:group.length,areaKm2:area,bounds:[geo(origin,Math.min(...group.map(c=>c.x-c.size/2)),Math.min(...group.map(c=>c.y-c.size/2))),geo(origin,Math.max(...group.map(c=>c.x+c.size/2)),Math.max(...group.map(c=>c.y+c.size/2)))],bestLoss:Math.min(...group.map(c=>c.loss)),outsideStudy:group.some(c=>Math.hypot(c.x,c.y)>2000) });
    }
    return out.sort((a,b)=>a.bestLoss-b.bestLoss).map((g,i)=>({id:'ZONE-'+(i+1),...g}));
  }
  function infer(input) {
    const p=prepare(input), e=evidence(p); const support=e.entries.filter(r=>r.recentSignal); const base={modelVersion:VERSION,asOf:input.asOf,fieldValidated:false,probability:null,confidenceLevel:null,mode:'OBSERVATION_ONLY_UNCALIBRATED_SCREENING',firstSignalAt:e.firstSignalAt,evidence:e.entries,online:e.online,anomalousStations:support.map(r=>r.id),currentAnomalousStations:e.alerts.map(r=>r.id),sampleCount:0,discardedRecords:p.rejected,futureRecordsExcluded:p.future,cells:[],zones:[],estimatedIgnitionAt:null,releaseWindow:null,warnings:['NOT_A_FIRE_CONFIRMATION','NO_TERRAIN_OR_CANOPY_DISPERSION_SOLVER','FIT_SCORE_IS_NOT_PROBABILITY'],searchRadiusM:4000,resolutionM:200,refinementM:100};
    if(!e.online)return {...base,status:'INSUFFICIENT_DATA'};
    if(!support.length)return {...base,status:e.entries.some(r=>r.status==='PARTICULATE_ONLY')?'PARTICULATE_ONLY':'NO_SIGNAL'};
    const samples=[];
    for(const station of p.stations){if(e.entries.find(r=>r.id===station.id).status==='UNKNOWN')continue;
      const rows=p.series.get(station.id).filter(r=>r.valid && r.t>=p.asOf-1200), selected=new Map();
      for(const r of rows)selected.set(Math.floor(r.t/120),r);
      samples.push(...selected.values());
    }
    base.sampleCount=samples.length;
    if(samples.length<6)return {...base,status:'INSUFFICIENT_DATA'};
    const withWind=support.filter(r=>r.windSpeedMps!==null && r.windSpeedMps>=.3);
    if(!withWind.length)return {...base,status:'WIND_UNAVAILABLE'};
    const oldest=Math.max(p.asOf-1800, Math.min(...p.rows.map(r=>r.t))), starts=[];
    for(let t=Math.floor(p.asOf/120)*120;t>=oldest;t-=120)starts.push(t);
    if(!starts.length)return {...base,status:'INSUFFICIENT_DATA'};
    const candidates=[];
    for(let x=-4000;x<=4000;x+=200)for(let y=-4000;y<=4000;y+=200)if(x*x+y*y<=4000**2)candidates.push({x,y,size:200});
    const members=[], traceMembers=[];
    for(const [bias,spread] of [[0,.16],[-10,.12],[10,.22]]) {
      const traces=samples.map(s=>trace(p,s,bias,spread));
      if(traces.filter(t=>t.length>=2).length<samples.length*.6)return {...base,status:'WIND_UNAVAILABLE',warnings:[...base.warnings,'INCOMPLETE_WIND_HISTORY']};
      traceMembers.push(traces); members.push(candidates.map(c=>scoreCandidate(c,traces,samples,starts)).sort((a,b)=>a.loss-b.loss));
    }
    const bests=members.map(m=>m[0]), nominal=bests[0];
    if(!finite(nominal.loss))return {...base,status:'MODEL_MISMATCH'};
    const chosen=new Map();
    for(const member of members){const cut=member[0].loss+Math.max(.5,member[0].loss*.3);for(const c of member)if(c.loss<=cut){const k=c.x+','+c.y,old=chosen.get(k);if(!old||c.loss<old.loss)chosen.set(k,c);}}
    const coarse=[...chosen.values()]; let cells=coarse;
    if(coarse.length<=180){
      const fine=[];for(const c of coarse)for(const dx of [-50,50])for(const dy of [-50,50])fine.push({x:c.x+dx,y:c.y+dy,size:100});
      const refined=new Map();
      for(const traces of traceMembers){const scored=fine.map(c=>scoreCandidate(c,traces,samples,starts)).sort((a,b)=>a.loss-b.loss);const cut=scored[0].loss+Math.max(.5,scored[0].loss*.3);for(const c of scored)if(c.loss<=cut){const key=c.x+','+c.y,old=refined.get(key);if(!old||c.loss<old.loss)refined.set(key,c);}}
      if(refined.size)cells=[...refined.values()];
    }
    const zoneList=groups(cells,p.origin), areaKm2=zoneList.reduce((s,g)=>s+g.areaKm2,0);
    const external=cells.some(c=>Math.hypot(c.x,c.y)>2000), boundary=cells.some(c=>Math.hypot(c.x,c.y)>3750);
    const disagreement=Math.max(...bests.map(a=>Math.hypot(a.x-nominal.x,a.y-nominal.y)));
    const badFit=nominal.loss>1;
    const status=support.length<2?'DIRECTIONAL_ONLY':badFit?'MODEL_MISMATCH':external?'EXTERNAL_POSSIBLE':support.length<3||areaKm2>2||disagreement>600||zoneList.length>1?'AMBIGUOUS':'CANDIDATE_AREAS';
    const onsets=cells.map(c=>c.onset).filter(finite), min=onsets.length?Math.min(...onsets):null,max=onsets.length?Math.max(...onsets):null;
    return {...base,status,fitLoss:nominal.loss,ensembleDisagreementM:disagreement,areaKm2,singleSourceAssumption:true,externalPossible:external,searchBoundaryReached:boundary,
      releaseWindow:min===null||badFit||support.length<2?null:{earliest:iso(min),latest:iso(Math.min(p.asOf,max+120)),leftCensored:min<=oldest+120,meaning:'EFFECTIVE_SMOKE_RELEASE_NOT_IGNITION'},
      cells:badFit||support.length<2?[]:cells.map(c=>({...geo(p.origin,c.x,c.y),sizeM:c.size,fitLoss:c.loss,fitClass:c.loss<=nominal.loss+.3?'BETTER_FIT':'ALTERNATIVE_FIT'})),
      zones:badFit||support.length<2?[]:zoneList,
      directionalCorridors:support.map(s=>({stationId:s.id,points:trace(p,p.series.get(s.id).filter(r=>r.valid).at(-1),0,.16).map(t=>geo(p.origin,t.x,t.y))})),
      warnings:[...base.warnings,...(support.length<3?['FEW_INDEPENDENT_STATIONS']:[]),...(disagreement>600?['SENSITIVE_TO_WIND_ASSUMPTIONS']:[]),...(badFit?['SINGLE_SOURCE_MODEL_POOR_FIT_MULTIPLE_OR_EXTERNAL_POSSIBLE']:[]),...(boundary?['SOURCE_MAY_BE_BEYOND_SEARCH_BUFFER']:[])]};
  }
  const api={VERSION,prepare,evidence,infer,xy,geo};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;root.WildfireInverse=api;
})(typeof window!=='undefined'?window:globalThis);
