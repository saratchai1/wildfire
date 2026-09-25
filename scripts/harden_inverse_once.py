from pathlib import Path

def replace(path, old, new):
    p=Path(path);s=p.read_text(encoding='utf-8')
    assert s.count(old)==1,(path,old[:80],s.count(old))
    p.write_text(s.replace(old,new),encoding='utf-8')

p='inverse-engine.js'
replace(p,'const residuals={};','const residuals=Object.create(null);')
replace(p,'let first = null, previous = null, lastSignal = null;','let first = null, previous = null, lastConfirmed = null;')
replace(p,'if (positive && previous && r.t - previous.t >= 30 && r.t - previous.t <= 90 && first === null) first = r.t;\n        if (positive) lastSignal = r.t; previous = positive ? r : null;', 'if (positive && previous && r.t - previous.t >= 30 && r.t - previous.t <= 90) { if (first === null) first = r.t; lastConfirmed = r.t; }\n        previous = positive ? r : null;')
replace(p,'latest.dp > 25 && latest.dc > .2 && first !== null','lastConfirmed === latest.t')
replace(p,'fresh && first !== null && lastSignal >= p.asOf - 1200','fresh && lastConfirmed !== null && lastConfirmed >= p.asOf - 1200')
replace(p,'JSON.stringify({ ...prev, receivedAt: null, received: null }) !== JSON.stringify({ ...row, receivedAt: null, received: null })',"['pm25','co','baselinePm25','baselineCo','windFromDeg','windSpeedMps','temperatureC','relativeHumidityPct','quality','windQuality'].some(k => prev[k] !== row[k])")
replace(p,'geo(origin,Math.min(...xs)-100,Math.min(...ys)-100),geo(origin,Math.max(...xs)+100,Math.max(...ys)+100)','geo(origin,Math.min(...group.map(c=>c.x-c.size/2)),Math.min(...group.map(c=>c.y-c.size/2))),geo(origin,Math.max(...group.map(c=>c.x+c.size/2)),Math.max(...group.map(c=>c.y+c.size/2)))')
replace(p,'releaseWindow:min===null?null:','releaseWindow:min===null||badFit||support.length<2?null:')
p='inverse-ui.js'
replace(p,'packet=imported||fixture.packetAt(minute);',"packet=imported||fixture.packetAt(minute); $('ack').disabled=true; $('situation').textContent='กำลังวิเคราะห์ข้อมูลชุดใหม่ · ยังไม่ใช้ผลเดิมตัดสินชุดนี้';")
replace(p,'function render(){if(!report)return;','function render(){if(!report||busy)return;')
replace(p,"$('direction-table').replaceChildren();render();}","$('direction-table').replaceChildren();if(report)map.show(report,selected,null);render();}")
replace(p,'if(report?.firstSignalAt&&ackAt===null)','if(!busy&&report?.firstSignalAt&&ackAt===null)')
Path('tests/inverse-edge.test.cjs').write_text('''const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),I=require('../inverse-engine.js'),G=require('../inverse-simulator.js');
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
''',encoding='utf-8')
print('Applied bounded source hardening; new edge regressions included.')
