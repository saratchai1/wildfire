const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const I=require('../inverse-engine.js'),G=require('../inverse-simulator.js'),P=JSON.parse(fs.readFileSync('data/plan-v2.json'));
const clone=o=>JSON.parse(JSON.stringify(o));
const sample=(preset='single',minute=25,extra={})=>G.generate(P,{preset,...extra}).packetAt(minute);
test('blind contract rejects source/ignition/scene/answer and no generator dependency exists',()=>{
 const p=sample();for(const k of ['source','truth','ignitionAt','scenario','answer'])assert.throws(()=>I.infer({...p,[k]:{lat:1,lon:2}}),/CONTRACT_INVALID/);
 assert.throws(()=>I.prepare({...p,observations:[{...p.observations[0],truth:123}]}),/CONTRACT/);
 assert.ok(!/require\([^)]*simulat|importScripts\([^)]*simulat/.test(fs.readFileSync('inverse-engine.js','utf8')));
});
test('independent forward fixture yields multiple observations and a non-probabilistic region',()=>{
 const g=G.generate(P),r=I.infer(g.packetAt(25));assert.equal(r.status,'AMBIGUOUS');assert.equal(r.anomalousStations.length,2);assert.ok(r.cells.length>0);assert.equal(r.probability,null);assert.equal(r.fieldValidated,false);assert.equal(r.estimatedIgnitionAt,null);assert.ok(r.zones.length>=1);
 assert.ok(r.cells.some(c=>{const[x,y]=I.xy(c,g.truth.sources[0]);return Math.abs(x)<=c.sizeM/2&&Math.abs(y)<=c.sizeM/2;}));
});
test('mutating hidden truth cannot affect estimates from identical packets',()=>{
 const g=G.generate(P),p=g.packetAt(25),r=I.infer(p);g.truth.sources[0]={lat:0,lon:0};g.truth.smokeReleaseAt='1900-01-01T00:00:00Z';assert.deepEqual(I.infer(p),r);
 assert.ok(!JSON.stringify(p).includes('smokeReleaseAt'));
});
test('arrival order and duplicates do not change inference',()=>{
 const p=sample(),r=I.infer(p),q=clone(p);q.observations.reverse();q.observations.push({...q.observations[0]});assert.deepEqual(I.infer(q),r);
 q.observations.push({...q.observations[0],pm25:300});assert.throws(()=>I.infer(q),/CONFLICTING_DUPLICATE/);
});
test('future measurements and late unreceived packets are ignored',()=>{
 const p=sample(),r=I.infer(p),future={...p.observations[0],observedAt:'2026-03-15T07:00:00Z',receivedAt:'2026-03-15T07:01:00Z',pm25:999,co:99};
 const q=I.infer({...p,observations:[...p.observations,future]});assert.equal(q.futureRecordsExcluded,1);assert.deepEqual(q.cells,r.cells);
 const late={...p.observations[0],observedAt:'2026-03-15T06:24:10Z',receivedAt:'2026-03-15T07:01:00Z',pm25:999};assert.deepEqual(I.infer({...p,observations:[...p.observations,late]}).cells,r.cells);
});
test('no data, stale, invalid, missing concentrations never become zero or all clear',()=>{
 const p=sample();assert.equal(I.infer({...p,observations:[]}).status,'INSUFFICIENT_DATA');
 for(const quality of ['INVALID','STALE']){const r=I.infer({...p,observations:p.observations.map(o=>({...o,quality}))});assert.equal(r.online,0);assert.ok(r.evidence.every(e=>e.pm25===null));}
 const r=I.infer({...p,observations:p.observations.map(o=>({...o,pm25:null}))});assert.equal(r.status,'INSUFFICIENT_DATA');
});
test('dust and no-smoke scenes do not create source regions or confirmed fire',()=>{
 assert.equal(I.infer(sample('dust')).status,'PARTICULATE_ONLY');assert.equal(I.infer(sample('none')).status,'NO_SIGNAL');assert.equal(I.infer(sample('single',0)).cells.length,0);
});
test('one station is directional only, not a pinpoint',()=>{
 const r=I.infer(sample('single-sensor'));assert.equal(r.status,'DIRECTIONAL_ONLY');assert.equal(r.cells.length,0);assert.equal(r.zones.length,0);assert.ok(r.directionalCorridors.length===1);
});
test('calm and missing wind history fail closed despite positive smoke observations',()=>{
 const p=sample();for(const patch of [{windSpeedMps:0},{windQuality:'INVALID'},{windFromDeg:null}])assert.equal(I.infer({...p,observations:p.observations.map(o=>({...o,...patch}))}).status,'WIND_UNAVAILABLE');
});
test('wind-from convention produces westward back trajectories under easterly transport',()=>{
 const p=sample('single',25,{windToDeg:90}),r=I.infer(p),line=r.directionalCorridors[0];assert.ok(line.points.at(-1).lon<line.points[0].lon);
});
test('temporal changes use past wind; multiple independent signal stations accumulate',()=>{
 const p=sample('changing'),r=I.infer(p);assert.ok(r.anomalousStations.length>=3);assert.ok(['CANDIDATE_AREAS','AMBIGUOUS'].includes(r.status));
 const q=clone(p);q.observations=q.observations.map(o=>({...o,windFromDeg:q.observations.at(-1).windFromDeg}));assert.notDeepEqual(I.infer(q).cells,r.cells);
});
test('noise delay and gaps do not yield calibrated confidence claims',()=>{
 const r=I.infer(sample('noise'));assert.ok(r.anomalousStations.length>0);assert.notEqual(r.status,'CONFIRMED');assert.equal(r.confidenceLevel,null);
});
test('outside source can remain outside or unidentified, never forced to a central point',()=>{
 const r=I.infer(sample('outside',30));assert.ok(r.externalPossible||['MODEL_MISMATCH','DIRECTIONAL_ONLY','NO_SIGNAL'].includes(r.status));assert.ok(r.cells.length===0||r.cells.some(c=>Math.hypot(...I.xy(P.target,c))>2000));
});
test('two-source mismatch fixture abstains rather than asserting one origin',()=>{
 const r=I.infer(sample('multiple',30));assert.equal(r.status,'MODEL_MISMATCH');assert.equal(r.cells.length,0);assert.ok(r.warnings.includes('SINGLE_SOURCE_MODEL_POOR_FIT_MULTIPLE_OR_EXTERNAL_POSSIBLE'));
});
test('quiet station readings constrain the fit rather than being discarded',()=>{
 const p=sample(),r=I.infer(p),q={...p,observations:p.observations.filter(o=>r.anomalousStations.includes(o.stationId))};const s=I.infer(q);assert.notDeepEqual(s.cells,r.cells);assert.ok(r.sampleCount>s.sampleCount);
});
test('N1 and all ten station coordinates remain unchanged in observation registry',()=>{
 const p=sample();assert.equal(p.stations.length,10);const n=p.stations.find(s=>s.id==='R10');assert.ok(Math.abs(n.lat-(18+49/60+53.6/3600))<1e-9);assert.ok(Math.abs(n.lon-(98+51/60+38.5/3600))<1e-9);
});
test('timestamp timezone, unknown stations, oversized inputs, invalid keys rejected',()=>{
 const p=sample();assert.throws(()=>I.prepare({...p,asOf:'2026-03-15 13:25'}),/TIMESTAMP/);assert.throws(()=>I.prepare({...p,observations:[{...p.observations[0],stationId:'evil'}]}),/STATION/);
 assert.throws(()=>I.prepare({...p,observations:Array(8001).fill(p.observations[0])}),/SIZE/);assert.throws(()=>I.prepare({...p,domain:{...p.domain,truth:1}}),/CONTRACT/);
});
test('several unseen point coordinates report honest coverage evidence, no tuned accuracy assertion',()=>{
 const summary=[];for(const [x,y] of [[-313,211],[-177,95],[188,-432]]){const point=I.geo(P.target,x,y),g=G.generate(P,{point}),r=I.infer(g.packetAt(25));summary.push({point,status:r.status,cells:r.cells.length,covered:r.cells.some(c=>{const[a,b]=I.xy(c,point);return Math.abs(a)<=c.sizeM/2&&Math.abs(b)<=c.sizeM/2;})});assert.equal(r.fieldValidated,false);}
 fs.mkdirSync('qa',{recursive:true});fs.writeFileSync('qa/inverse-held-out.json',JSON.stringify({scope:'SYNTHETIC_NOT_FIELD_ACCURACY',cases:summary},null,2));
});
