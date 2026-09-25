'use strict';
const fs=require('node:fs'),path=require('node:path'),G=require('../inverse-simulator.js');
const P=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/plan-v2.json'))),iso=t=>new Date(t*1000).toISOString();
const clone=x=>JSON.parse(JSON.stringify(x));
function cadence(seconds=10,times=null){
 const p=G.generate(P).packetAt(10);p.asOf=iso(G.BASE+615);p.observations=[];
 const ticks=times||Array.from({length:Math.floor(600/seconds)+1},(_,i)=>i*seconds);
 for(const t of ticks)for(const s of p.stations){const positive=['R01','R02'].includes(s.id);
  p.observations.push({stationId:s.id,observedAt:iso(G.BASE+t),receivedAt:iso(G.BASE+t+5),pm25:positive?115:15,co:positive?.8:.15,baselinePm25:15,baselineCo:.15,windFromDeg:255,windSpeedMps:2,temperatureC:29,relativeHumidityPct:48,quality:'VALID',windQuality:'VALID'});
 }
 return p;
}
function stale(quality='STALE'){
 const p=G.generate(P).packetAt(25);for(const id of ['R01','R02']){const last=p.observations.filter(o=>o.stationId===id).at(-1);Object.assign(last,{quality,windQuality:quality,pm25:null,co:null});}return p;
}
function pulse(shift=0){
 const p=G.generate(P).packetAt(25);
 for(const o of p.observations){const t=Date.parse(o.observedAt)/1000-G.BASE;const on=['R01','R02'].includes(o.stationId)&&t>=1200+shift&&t<=1260+shift; o.pm25=on?115:15;o.co=on?.8:.15;}
 return p;
}
function mixed(p=G.generate(P).packetAt(25)){
 const q=clone(p);q.observations.reverse();
 for(const o of q.observations)if(Math.floor(Date.parse(o.observedAt)/30000)%2===0)for(const k of ['observedAt','receivedAt'])o[k]=new Date(Date.parse(o[k])+7*3600000).toISOString().replace('Z','+07:00');
 // Equivalent timestamp duplicates must not duplicate chart points or evidence.
 q.observations.push({...q.observations[0]});return q;
}
function packets(){const base=G.generate(P).packetAt(25),shifted=clone(base);shifted.domain.center.lon+=.01425;
 return {'base':base,'cadence-10s':cadence(),'last-packet-stale':stale(),'last-packet-invalid':stale('INVALID'),'pulse':pulse(),'shifted-domain':shifted,'mixed-timezones':mixed(base)};
}
if(require.main===module){fs.mkdirSync('qa/review-inputs',{recursive:true});for(const [name,p]of Object.entries(packets()))fs.writeFileSync('qa/review-inputs/'+name+'.json',JSON.stringify(p));}
module.exports={P,G,iso,clone,cadence,stale,pulse,mixed,packets};
