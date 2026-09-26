const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const A=require('../assessment-engine'),I=require('../inverse-engine'),G=require('../inverse-simulator'),P=require('../data/plan-v2.json'),{fixture}=require('./assessment-fixtures.cjs');
const clone=x=>JSON.parse(JSON.stringify(x));
for(const cadence of [5,10,15,20,30,60])test('paired weak watch at cadence '+cadence+' does not create a canonical alert',()=>{
 const p=fixture('weak',cadence),r=A.observe(p);assert.equal(r.status,'MULTI_STATION_WATCH');assert.deepEqual(r.watchStationIds,['R01','R02']);assert.equal(I.evidence(I.prepare(p)).alerts.length,0);assert.equal(r.firstReceivedSignalAt,null);
});
test('watch requires sustained duration, not one low spike',()=>{assert.equal(A.observe(fixture('weak',10,50)).watchStationIds.length,0);assert.equal(A.observe(fixture('noise')).watchStationIds.length,0);});
test('single channels are watch only, not confirmed smoke or localization',()=>{for(const[kind,reason]of [['pm','PM_RISE'],['co','CO_RISE']]){const r=A.observe(fixture(kind));assert.equal(r.status,'WATCH');assert.equal(r.entries[0].watchReason,reason);assert.equal(r.currentSignalStationIds.length,0);}});
test('gaps and invalid data break watch continuity; stale readings are not current watch',()=>{
 const p=fixture('weak'),t=Date.parse(p.asOf);p.observations=p.observations.map(o=>Date.parse(o.observedAt)===t-10000?{...o,quality:'INVALID'}:o);assert.equal(A.observe(p).watchStationIds.length,0);
 const q=fixture('weak');q.observations=q.observations.filter(o=>Date.parse(o.observedAt)<t-120000||Date.parse(o.observedAt)===t);assert.equal(A.observe(q).watchStationIds.length,0);
 const s=fixture('weak');s.asOf=new Date(Date.parse(s.asOf)+121000).toISOString();assert.equal(A.observe(s).status,'DATA_UNAVAILABLE');
});
test('canonical alert and pending override watch without changing existing alarm times',()=>{
 const p=fixture('strong'),r=A.observe(p),e=I.evidence(I.prepare(p));assert.equal(r.status,'SIGNAL');assert.equal(r.firstMeasurementSignalAt,e.firstSignalAt);assert.equal(r.firstReceivedSignalAt,e.firstSignalAt);assert.equal(r.watchStationIds.length,0);assert.equal(A.observe(fixture('strong',10,20)).status,'PENDING');
});
test('receiver time reflects delayed/out-of-order observations not simply second sample receipt',()=>{
 const p=fixture('strong',30,90),first=p.observations[0].observedAt;p.observations=p.observations.map(o=>['R01','R02'].includes(o.stationId)&&o.observedAt===first?{...o,receivedAt:p.asOf}:o);
 const r=A.observe(p);assert.ok(Date.parse(r.firstReceivedSignalAt)>Date.parse(r.firstMeasurementSignalAt));assert.equal(r.firstReceivedSignalAt,p.observations.filter(o=>o.stationId==='R01')[2].observedAt);
});
test('watch and reception are invariant to duplicates order and timezone encodings',()=>{
 const p=fixture('strong'),r=A.observe(p),q=clone(p);q.observations.push(clone(q.observations[0]));q.observations.reverse();q.observations=q.observations.map(o=>({...o,observedAt:new Date(Date.parse(o.observedAt)+7*3600000).toISOString().replace('Z','+07:00')}));assert.deepEqual(A.observe(q),r);
});
test('future and not received evidence is excluded and input is not mutated',()=>{
 const p=fixture('weak'),before=JSON.stringify(p);A.observe(p);A.trialsFor(p);assert.equal(JSON.stringify(p),before);
 p.observations=p.observations.map(o=>({...o,receivedAt:new Date(Date.parse(p.asOf)+1000).toISOString()}));assert.equal(A.observe(p).status,'DATA_UNAVAILABLE');
});
test('strict contract rejects hidden answer and unrecognized fields',()=>{for(const key of ['truth','source','scenario','ignitionAt'])assert.throws(()=>A.observe({...fixture(),[key]:{lat:0,lon:0}}),/CONTRACT/);});
test('station exclusion removes ALL measurements including wind but keeps domain/registry',()=>{
 const p=fixture('strong'),trials=A.trialsFor(p);assert.equal(trials.filter(t=>t.type==='LEAVE_ONE_STATION_OUT').length,10);const q=trials.find(t=>t.stationId==='R02').packet;assert.equal(q.observations.some(o=>o.stationId==='R02'),false);assert.deepEqual(q.stations,p.stations);assert.deepEqual(q.domain,p.domain);
});
test('quiet stress retains wind and all positive observations, never changes baseline',()=>{
 const p=fixture('strong'),q=A.trialsFor(p).find(t=>t.type==='QUIET_CONSTRAINT_STRESS').packet;
 assert.deepEqual(q.observations.filter(o=>o.stationId==='R01'),p.observations.filter(o=>o.stationId==='R01'));
 assert.ok(q.observations.filter(o=>o.stationId==='R03').every(o=>o.quality==='INVALID'&&o.windQuality==='VALID'&&o.windSpeedMps===2));assert.ok(p.observations.every(o=>o.quality==='VALID'));
});
test('wind perturbations use degrees modulo360 and leave concentration/time intact',()=>{const p=fixture();const q=A.trialsFor(p).find(t=>t.id==='wind--10').packet;assert.equal(q.observations[0].windFromDeg,260);assert.equal(q.observations[0].pm25,p.observations[0].pm25);});
const cell=(x,y,sizeM)=>({...I.geo(P.target,x,y),sizeM});
test('mixed-grid identical regions have IoU1, without treating centroid as a source',()=>{
 const a={cells:[cell(0,0,200)]},b={cells:[cell(-50,-50,100),cell(-50,50,100),cell(50,-50,100),cell(50,50,100)]};const c=A.compareRegions(a,b,P.target);assert.ok(c.iou>1-1e-8);assert.ok(c.centroidShiftM<1e-6);assert.equal(c.sensitive,false);
});
test('disjoint shifted and lost regions are sensitive; no-region baseline is not stable',()=>{
 const a={cells:[cell(0,0,200)]};assert.equal(A.compareRegions(a,{cells:[cell(1000,0,200)]},P.target).sensitive,true);assert.equal(A.compareRegions(a,{cells:[]},P.target).status,'REGION_LOST');assert.equal(A.compareRegions({cells:[]},a,P.target).status,'NOT_APPLICABLE');
});
test('failed/incomplete trials never produce a stable assessment',()=>{
 const row={status:'DONE',comparison:{sensitive:false}};assert.equal(A.summarizeTrials([row],2),'INCOMPLETE');assert.equal(A.summarizeTrials([{status:'ERROR'}],1),'INCOMPLETE');assert.equal(A.summarizeTrials([row],1),'STABLE_UNDER_TESTS');assert.equal(A.summarizeTrials([{...row,comparison:{sensitive:true}}],1),'SENSITIVE');
});
test('no-signal diagnosis abstains, no confidence or ignition claim',()=>{const r=A.diagnose(fixture('quiet'));assert.equal(r.status,'NOT_APPLICABLE');assert.equal(r.plannedCount,0);assert.equal(r.fieldValidated,false);assert.equal(r.confidenceLevel,null);});
test('real ten-station diagnostic covers all declared trials and publishes dependencies',()=>{
 const p=G.generate(P).packetAt(25),before=JSON.stringify(p),r=A.diagnose(p);assert.equal(JSON.stringify(p),before);assert.equal(r.testedCount,13);assert.equal(r.plannedCount,13);assert.ok(r.criticalStationIds.includes('R01'));assert.ok(r.criticalStationIds.includes('R02'));assert.equal(r.status,'SENSITIVE');assert.equal(r.trials.length,13);
 fs.mkdirSync('qa',{recursive:true});fs.writeFileSync('qa/v12-diagnostic.json',JSON.stringify(r,null,2));
});

test('baseline, experimental kernels and ten station registry remain byte-identical',()=>{
 const hashes={"inverse-engine.js": "cfa81c918492b671c1d7d81253c7d3b08c9a065577c3d1b7c2caaeb8beb52578", "inverse-simulator.js": "2fa0ceea865d0bdd1927b65316e2194b5676f1650d5689a301b7c052824d675a", "bayes-engine.js": "c434baea9c1b7abbcba0c854e75164459cc319146cab4cda4bdc2017bf166a44", "v2a-simulator.js": "902a28e9f7e1d6980081a05de2d0a1c01448154bae757053ec00c2e6c450311d", "terrain-physics.js": "4bd09920f06c2bdf4bc97a0339ddbe61a4a6e38bec368d3a83adc9a81133efdc", "terrain-inverse.js": "c80309789bd80726fe0d7bec657fce6063900e934e78b786f562ffcfc4342442", "calibration.js": "3f632830ba7dd1587806e1e4ca49ad03c150f895ded63452e34c0aad128e5b23", "data/plan.js": "63df0396fd27ab64814b08b4377944312d70de8fb4dd4cef2d0bb89607a509c4", "data/plan-v2.json": "97d331336a8e21250b63d02f06daec1e89e8f8a7d2c4f8d8bd8beb2b92961df0"};
 for(const[file,hash]of Object.entries(hashes))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),hash,file);
});
