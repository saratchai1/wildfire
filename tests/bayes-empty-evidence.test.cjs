const test=require('node:test'),assert=require('node:assert/strict'),B=require('../bayes-engine.js'),G=require('../inverse-simulator.js'),P=require('../data/plan-v2.json');
test('no signal or particulate-only data cannot imply a historical source-area assessment',()=>{
 for(const preset of ['none','dust']){const r=B.infer(G.generate(P,{preset}).packetAt(25));assert.equal(r.assessmentDataStatus,'NO_RECENT_EVIDENCE');assert.equal(r.supportDataThrough,null);assert.equal(r.cells.length,0);}
 const r=B.infer(G.generate(P).packetAt(0));assert.equal(r.assessmentDataStatus,'NO_RECENT_EVIDENCE');
});
