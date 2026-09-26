const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const B=require('../bayes-engine.js'),I=require('../inverse-engine.js'),G=require('../inverse-simulator.js'),V=require('../v2a-simulator.js'),F=require('./review-fixtures.cjs'),P=F.P;
const close=(a,b,tol=1e-8)=>assert.ok(Math.abs(a-b)<tol,`${a} != ${b}`);
const packet=G.generate(P).packetAt(25);let base;
const get=()=>base||(base=B.infer(packet));
test('baseline engine and ten-station registry are unchanged byte for byte',()=>{
 const hash=f=>crypto.createHash('sha1').update(Buffer.concat([Buffer.from('blob '+fs.statSync(f).size+'\0'),fs.readFileSync(f)])).digest('hex');
 assert.equal(hash('inverse-engine.js'),'ad84be59fafdb869a7cdddb51b50f6bdb8b90d86');assert.equal(hash('data/plan.js'),'d043a083b6ab42bd51b1d5884a94ee1a227ad3a3');
});
test('finite posterior normalizes without overflow and with area-proportional priors',()=>{
 const w=B.normalize([-10000,-10001,-10002]);close(w.reduce((a,b)=>a+b),1);assert.ok(w[0]>w[1]);
 const p=B.posterior([{size:200,logEvidence:0},{size:100,logEvidence:0}]);close(p[0].weight,.8);close(p[1].weight,.2);
});
test('half-normal amplitude marginal gives unit evidence with no data and symmetric normal CDF',()=>{
 close(B.mixture({aa:0,ab:0,bb:0,ay:0,by:0,yy:0}).logEvidence,0,1e-7);
 close(Math.exp(B.logPhi(1.7))+Math.exp(B.logPhi(-1.7)),1);assert.ok(Number.isFinite(B.logPhi(-50)));
});
test('full search partition retains unrefined area and normalized tails after refinement',()=>{
 const r=get();assert.ok(r.posterior);close(r.posterior.totalMass,1);
 close(r.posterior.priorAreaM2,B.spatialGrid().reduce((a,c)=>a+c.size*c.size,0));
 assert.ok(r.posterior.selectedMass>=.9&&r.posterior.selectedMass<=1.0000001);
 assert.ok(r.posterior.cells.some(c=>c.sizeM===200)&&r.posterior.cells.some(c=>c.sizeM===100));
});
test('Bayesian output is not a calibrated field probability or ignition estimate',()=>{
 const r=get();assert.equal(r.probability,null);assert.equal(r.confidenceLevel,null);assert.equal(r.estimatedIgnitionAt,null);assert.equal(r.fieldValidated,false);
 assert.ok(r.warnings.includes('CONDITIONAL_MODEL_MASS_NOT_CALIBRATED_COVERAGE'));assert.ok(r.emissionSummary);
});
test('same packet and same rolling window are idempotent with no repeated evidence accumulation',()=>{
 assert.deepEqual(B.infer(packet),get());assert.equal(get().updatePolicy,'REBUILD_FROM_FIXED_PRIOR_AND_DEDUPLICATED_ROLLING_WINDOW');
});
test('reordering equivalent timezone and duplicate observations cannot increase confidence',()=>{
 const q=F.mixed(packet);assert.deepEqual(B.infer(q),get());
});
test('future or unreceived records do not alter posterior cells',()=>{
 const q=F.clone(packet);q.observations.push({...q.observations.at(-1),observedAt:'2026-03-15T08:00:00Z',receivedAt:'2026-03-15T08:01:00Z'});
 const r=B.infer(q);assert.deepEqual(r.cells,get().cells);assert.equal(r.futureRecordsExcluded,1);
});
test('truth and unknown options cannot enter the engine or sensor model contract',()=>{
 assert.throws(()=>B.infer({...packet,truth:{lat:0,lon:0}}),/CONTRACT/);
 for(const opt of [{source:1},{sensorModels:[{stationId:'R02',truth:2}]},{sensorModels:[{stationId:'R02',pmStd:0}]},{sensorModels:[{stationId:'R02',coStd:-1}]},{sensorModels:[{stationId:'R02',responseLagSec:121}]}])assert.throws(()=>B.infer(packet,opt));
});
test('sensor uncertainty and fixed delay are per station and never change evidence thresholds',()=>{
 const o={sensorModels:[{stationId:'R02',pmStd:70,coStd:.4,responseLagSec:30}]},p=I.prepare(packet),models=B.sensorModels(o,p.stations),w=B.weightedSamples(p,models);
 assert.ok(w.filter(r=>r.stationId==='R02').every(r=>r.sp>70&&r.lag===30));assert.ok(w.filter(r=>r.stationId==='R01').every(r=>r.lag===0));
 const r=B.infer(packet,o);assert.deepEqual(r.anomalousStations,get().anomalousStations);assert.notDeepEqual(r.posterior?.cells,get().posterior.cells);
});
test('null, dust, one station and missing wind remain abstentions, not pinpoint claims',()=>{
 for(const [name,state]of [['none','NO_SIGNAL'],['dust','PARTICULATE_ONLY'],['single-sensor','DIRECTIONAL_ONLY']]){const r=B.infer(G.generate(P,{preset:name}).packetAt(25));assert.equal(r.status,state);assert.equal(r.cells.length,0);}
 const q=F.clone(packet);q.observations=q.observations.map(o=>({...o,windQuality:'INVALID'}));assert.equal(B.infer(q).status,'WIND_UNAVAILABLE');
});
test('R1-R3 safeguards remain active for high cadence, stale history and short pulse',()=>{
 assert.deepEqual(I.evidence(I.prepare(F.cadence())).alerts.map(x=>x.id),['R01','R02']);
 const stale=B.infer(F.stale());assert.deepEqual(stale.anomalousStations,get().anomalousStations);assert.equal(stale.online,8);assert.equal(stale.assessmentDataStatus,'HISTORICAL_EVIDENCE_DATA_GAP');
 const pulse=B.infer(F.pulse());assert.ok(pulse.solverPositiveCount>=6);assert.deepEqual(pulse.solverSupportStationIds,['R01','R02']);
});
test('independent variable-release generator returns only original observation contract fields',()=>{
 for(const preset of ['pulse','ramp','intermittent','sensor-lag']){const g=V.generate(P,{preset});const p=g.packetAt(25);assert.deepEqual(Object.keys(p).sort(),['asOf','domain','observations','schemaVersion','stations']);assert.doesNotThrow(()=>I.prepareForPlan(p,P));assert.equal(p.stations.length,10);assert.ok(!JSON.stringify(p).includes('truth'));}
 assert.ok(!fs.readFileSync('v2a-simulator.js','utf8').includes('bayes-engine'));
});
test('worker imports only observation engines and rejects unknown control fields',()=>{
 const code=fs.readFileSync('bayes-worker.js','utf8');assert.ok(!code.includes('simulator.js'));assert.ok(code.includes('WORKER_CONTRACT_INVALID'));
});
