'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const I=require('../inverse-engine.js'),F=require('./review-fixtures.cjs');
const paired=r=>r.valid&&r.dp>25&&r.dc>.2;
for(const seconds of [5,10,15,20,30,60])test('R1 sustained signal at '+seconds+'s cadence remains detectable',()=>{
 const p=F.cadence(seconds),e=I.evidence(I.prepare(p));assert.deepEqual(e.alerts.map(e=>e.id),['R01','R02']);
 const elapsed=Date.parse(e.firstSignalAt)/1000-F.G.BASE;assert.ok(elapsed>=30&&elapsed<30+seconds);
});
test('R1 jitter accumulates duration rather than requiring adjacent samples 30s apart',()=>{
 const ticks=[0,7,16,29,34,41,55,64],p=F.cadence(1,ticks);p.asOf=F.iso(F.G.BASE+69);
 assert.equal(I.evidence(I.prepare(p)).firstSignalAt,F.iso(F.G.BASE+34));
});
test('R1 pending is not dust; invalid/gap/below-threshold observations break continuity',()=>{
 for(const kind of ['gap','invalid','quiet']){const ticks=kind==='gap'?[0,100,110]:[0,10,20],p=F.cadence(1,ticks);p.asOf=F.iso(F.G.BASE+ticks.at(-1)+5);
  if(kind!=='gap')for(const o of p.observations.filter(o=>Date.parse(o.observedAt)/1000===F.G.BASE+10)){if(kind==='invalid')o.quality='INVALID';else{o.pm25=15;o.co=.15;}}
  const e=I.evidence(I.prepare(p));assert.equal(e.alerts.length,0);assert.equal(e.entries[0].status,'PENDING');
 }
});
test('R1 cadence beyond max gap does not manufacture continuity',()=>{
 const e=I.evidence(I.prepare(F.cadence(120)));assert.equal(e.alerts.length,0);assert.equal(e.entries[0].status,'PENDING');
});
for(const quality of ['STALE','INVALID'])test('R2 '+quality+' newest packet retains valid smoke history and separate health',()=>{
 const p=F.stale(quality),r=I.infer(p);assert.deepEqual(r.anomalousStations,['R01','R02']);assert.equal(r.currentAnomalousStations.length,0);
 assert.notEqual(r.status,'NO_SIGNAL');assert.deepEqual(r.incident.dataGapStationIds,['R01','R02']);
 assert.equal(r.assessmentDataStatus,'HISTORICAL_EVIDENCE_DATA_GAP');assert.ok(r.solverPositiveCount>0);
 assert.ok(r.evidence.filter(e=>['R01','R02'].includes(e.id)).every(e=>e.status==='UNKNOWN'&&e.pm25===null&&e.recentSignal));
});
test('R2 missing/delayed latest telemetry retains old incident without presenting current readings',()=>{
 const p=F.G.generate(F.P).packetAt(25);p.observations=p.observations.filter(o=>!['R01','R02'].includes(o.stationId)||Date.parse(o.observedAt)/1000<F.G.BASE+1350);
 const r=I.infer(p);assert.deepEqual(r.anomalousStations,['R01','R02']);assert.notEqual(r.status,'NO_SIGNAL');assert.equal(r.incident.status,'HISTORICAL_SIGNAL_DATA_GAP');
});
test('R2 signal older than solver window remains historical, not an all-clear',()=>{
 const p=F.pulse();p.asOf=F.iso(F.G.BASE+3000);const r=I.infer(p);assert.equal(r.online,0);assert.equal(r.status,'INSUFFICIENT_DATA');assert.ok(r.incident.firstSignalAt);assert.equal(r.incident.closure,'NOT_ASSESSED');
});
for(const shift of [0,30,60,90])test('R3 pulse retains onset/confirmation/end and quiet data across bin shift '+shift,()=>{
 const p=I.prepare(F.pulse(shift)),samples=I.selectSamples(p),positive=samples.filter(paired);
 assert.equal(positive.length,6);assert.deepEqual([...new Set(positive.map(r=>r.stationId))],['R01','R02']);
 assert.ok(samples.some(r=>r.dp===0&&r.dc===0));assert.ok(samples.every(r=>r.valid&&r.fitWeight>0));
 for(const id of ['R01','R02']){const sum=samples.filter(r=>r.stationId===id).reduce((s,r)=>s+r.fitWeight,0);assert.ok(Math.abs(sum-1)<1e-9);}
});
test('R3 inference cannot operate on a quiet-only subset while reporting positive support',()=>{
 const r=I.infer(F.pulse());assert.ok(r.solverPositiveCount>=6);assert.deepEqual(r.solverSupportStationIds,['R01','R02']);
 assert.ok(r.cells.length===0||r.solverSupportStationIds.every(id=>r.anomalousStations.includes(id)));
 // This simultaneous artificial pulse is NOT a calibrated plume or a target location.
});
test('R3 invalid samples are not invented zero-valued solver evidence',()=>{
 const p=I.prepare(F.stale()),samples=I.selectSamples(p);assert.ok(samples.every(r=>r.valid&&Number.isFinite(r.dp)));assert.ok(samples.some(r=>paired(r)&&r.stationId==='R01'));
});
test('R4 fixed-site import rejects center radius and registry mismatch before mutation',()=>{
 const all=F.packets(),before=JSON.stringify(all.base);assert.doesNotThrow(()=>I.prepareForPlan(all.base,F.P));
 assert.throws(()=>I.prepareForPlan(all['shifted-domain'],F.P),/DOMAIN_MISMATCH/);
 const radius=F.clone(all.base);radius.domain.radiusM=2100;assert.throws(()=>I.prepareForPlan(radius,F.P),/DOMAIN/);
 const registry=F.clone(all.base);registry.stations[0].lon+=.001;assert.throws(()=>I.prepareForPlan(registry,F.P),/REGISTRY/);
 assert.equal(JSON.stringify(all.base),before);
});
test('R5 mixed zones, unsorted rows and equivalent duplicates canonicalize identically',()=>{
 const base=F.G.generate(F.P).packetAt(25),a=I.prepare(base),b=I.prepare(F.mixed(base));assert.deepEqual(a.rows,b.rows);
 assert.deepEqual(I.infer(base),I.infer(F.mixed(base)));
 for(const rows of b.series.values())assert.ok(rows.every((r,i)=>i===0||r.t>rows[i-1].t));
});
test('R5 future and unreceived records never enter chart or solver canonical rows',()=>{
 const p=F.G.generate(F.P).packetAt(25),rows=I.prepare(p).rows;
 p.observations.push({...p.observations.at(-1),receivedAt:F.iso(F.G.BASE+7200),pm25:999});
 assert.deepEqual(I.prepare(p).rows,rows);
});
test('R1-R5 summary retains all ten stations and explicit uncalibrated outputs',()=>{
 const p=F.packets(),out={scope:'SYNTHETIC_REVIEW_REGRESSION_NOT_FIELD_VALIDATION',model:I.VERSION,cases:{}};
 for(const name of ['base','last-packet-stale','last-packet-invalid','pulse']){const r=I.infer(p[name]);out.cases[name]={status:r.status,online:r.online,support:r.anomalousStations,current:r.currentAnomalousStations,solverPositiveCount:r.solverPositiveCount,incident:r.incident,areaKm2:r.cells.length?r.areaKm2:null};assert.equal(r.evidence.length,10);assert.equal(r.fieldValidated,false);assert.equal(r.probability,null);}
 out.cadence=[5,10,15,20,30,60].map(seconds=>({seconds,alerts:I.evidence(I.prepare(F.cadence(seconds))).alerts.length}));
 fs.mkdirSync('qa',{recursive:true});fs.writeFileSync('qa/review-fixes.json',JSON.stringify(out,null,2));
});
