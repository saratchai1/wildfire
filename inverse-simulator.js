/* Independent forward puff fixture. Truth never appears in observation packets. Not a terrain solver. */
(function(root){
'use strict';
const R=6371008.8,rad=Math.PI/180;
const geo=(o,x,y)=>({lat:o.lat+y/R/rad,lon:o.lon+x/(R*Math.cos(o.lat*rad))/rad});
const xy=(o,p)=>[(p.lon-o.lon)*rad*R*Math.cos(o.lat*rad),(p.lat-o.lat)*rad*R];
const BASE=Date.parse('2026-03-15T06:00:00Z')/1000;
function random(seed){let n=seed>>>0;return()=>{n=(1664525*n+1013904223)>>>0;return n/4294967296;};}
function generate(plan,opts={}){
 const preset=opts.preset||'single',allowed=['single','changing','noise','outside','multiple','calm','offline','dust','none','single-sensor'];
 if(!allowed.includes(preset))throw Error('SCENARIO_INVALID');
 const point=opts.point||geo(plan.target,-250,150);
 if(!Number.isFinite(point.lat)||!Number.isFinite(point.lon)||Math.hypot(...xy(plan.target,point))>4000)throw Error('SOURCE_OUTSIDE_SIMULATION_DOMAIN');
 const heading=opts.windToDeg??75,speed=opts.windSpeedMps??2;
 if(!Number.isFinite(heading)||heading<0||heading>=360||!Number.isFinite(speed)||speed<0||speed>8)throw Error('WIND_INVALID');
 const start=5*60,source0=preset==='outside'?geo(plan.target,-2800,300):point;
 const sources=preset==='multiple'?[source0,geo(plan.target,-1700,-900)]:[source0];
 const sourceXY=sources.map(s=>xy(plan.target,s)),rng=random(opts.seed??260925),puffs=[],observations=[];
 function wind(t){const to=heading+(preset==='changing'&&t>=900?70:0)+(preset==='noise'?10*Math.sin(t/240):0);return{to,speed:preset==='calm'?0:speed};}
 for(let t=0;t<=3600;t+=30){
  const w=wind(t),u=w.speed*Math.sin(w.to*rad),v=w.speed*Math.cos(w.to*rad);
  for(const p of puffs){p.x+=u*30;p.y+=v*30;p.age+=30;}
  if(t>=start&&t%60===0&&!['dust','none','offline'].includes(preset))for(const s of sourceXY)puffs.push({x:s[0],y:s[1],age:0});
  for(const s of plan.stations){const [x,y]=xy(plan.target,s);let dp=0;
   for(const p of puffs){const sx=65+p.age*.22,sy=60+p.age*.19,dx=x-p.x,dy=y-p.y;dp+=6e6/(2*Math.PI*sx*sy)*Math.exp(-.5*(dx*dx/(sx*sx)+dy*dy/(sy*sy)))*Math.exp(-p.age/2400);}
   let dc=dp*.0065;
   if(preset==='dust'&&s.side==='E'&&t>=600)dp+=85;
   if(preset==='noise'){dp=dp*(1+(Number(s.id.slice(1))%3-1)*.08)+(rng()-.5)*14;dc=dc+(rng()-.5)*.08;}
   else {dp+=(rng()-.5)*3;dc+=(rng()-.5)*.012;}
   const missing=(preset==='offline'&&s.side==='W'&&t>=720)||(preset==='single-sensor'&&s.id!=='R02')||(preset==='noise'&&s.id==='R04'&&t>780&&t<1350);
   const delayed=preset==='noise'&&s.id==='R01'&&t%180===0?150:15;
   const from=((w.to+180+(preset==='noise'?(rng()-.5)*12:0))%360+360)%360;
   observations.push({stationId:s.id,observedAt:new Date((BASE+t)*1000).toISOString(),receivedAt:new Date((BASE+t+delayed)*1000).toISOString(),pm25:missing?null:Math.max(0,15+dp),co:missing?null:Math.max(0,.15+dc),baselinePm25:15,baselineCo:.15,windFromDeg:missing?null:from,windSpeedMps:missing?null:w.speed,temperatureC:missing?null:29,relativeHumidityPct:missing?null:48,quality:missing?'STALE':'VALID',windQuality:missing?'STALE':'VALID'});
  }
 }
 const registry=plan.stations.map(s=>({id:s.id,lat:s.lat,lon:s.lon,elevationM:s.elevationM,inletHeightM:null}));
 return {truth:{sources,smokeReleaseAt:new Date((BASE+start)*1000).toISOString(),preset,windToDeg:heading,windSpeedMps:speed},packetAt(minute){if(!Number.isFinite(minute)||minute<0||minute>60)throw Error('REPLAY_TIME_INVALID');const asOf=BASE+minute*60+15;return {schemaVersion:1,asOf:new Date(asOf*1000).toISOString(),domain:{center:{...plan.target},radiusM:2000},stations:registry,observations:observations.filter(r=>Date.parse(r.receivedAt)/1000<=asOf&&Date.parse(r.observedAt)/1000<=asOf).map(r=>({...r}))};}};
}
const api={generate,BASE};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.WildfireSimulator=api;
})(typeof window!=='undefined'?window:globalThis);
