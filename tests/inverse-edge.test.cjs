const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),I=require('../inverse-engine.js'),G=require('../inverse-simulator.js');
const P=JSON.parse(fs.readFileSync('data/plan-v2.json'));
test('old event cannot turn a new isolated spike into a sustained current signal',()=>{
 const p=G.generate(P).packetAt(25),last=p.observations.filter(o=>o.stationId==='R02').at(-1).observedAt;
 p.observations=p.observations.map(o=>o.stationId==='R02'&&o.observedAt>='2026-03-15T06:20:00Z'&&o.observedAt!==last?{...o,pm25:15,co:.15}:o);
 const r=I.evidence(I.prepare(p)).entries.find(o=>o.id==='R02');assert.notEqual(r.status,'SUSPECT');
});
test('duplicate key ordering does not create a false data conflict',()=>{
 const p=G.generate(P).packetAt(25),row=p.observations[0];p.observations.push(Object.fromEntries(Object.entries(row).reverse()));assert.doesNotThrow(()=>I.prepare(p));
});
test('unidentified source cannot produce a release interval as though location were solved',()=>{
 assert.equal(I.infer(G.generate(P,{preset:'single-sensor'}).packetAt(25)).releaseWindow,null);
 assert.equal(I.infer(G.generate(P,{preset:'multiple'}).packetAt(30)).releaseWindow,null);
});
