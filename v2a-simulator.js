/* Independent stress fixture: forward puffs, not inverse kernels. Never imported by inference workers. */
(function(root) {
  'use strict';
  const R=6371008.8,rad=Math.PI/180,BASE=Date.parse('2026-03-15T06:00:00Z')/1000;
  const xy=(o,p)=>[(p.lon-o.lon)*rad*R*Math.cos(o.lat*rad),(p.lat-o.lat)*rad*R];
  const geo=(o,x,y)=>({lat:o.lat+y/R/rad,lon:o.lon+x/(R*Math.cos(o.lat*rad))/rad});
  function generate(plan,options={}) {
    const preset=options.preset||'pulse';
    if(!['pulse','ramp','intermittent','sensor-lag'].includes(preset))throw Error('V2A_SCENARIO_INVALID');
    const point=options.point||geo(plan.target,-250,150),speed=options.windSpeedMps??2,heading=options.windToDeg??75;
    if(!Number.isFinite(point.lat)||!Number.isFinite(point.lon)||Math.hypot(...xy(plan.target,point))>4000)throw Error('SOURCE_OUTSIDE_SIMULATION_DOMAIN');
    if(!Number.isFinite(speed)||speed<0||speed>8||!Number.isFinite(heading)||heading<0||heading>=360)throw Error('WIND_INVALID');
    let seed=(options.seed??701)>>>0; const rng=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
    const puffs=[],all=[],raw=new Map(plan.stations.map(s=>[s.id,[]])),[sx,sy]=xy(plan.target,point);
    const rate=t=>t<300?0:preset==='pulse'?(t<960?1.8:0):preset==='ramp'?Math.min(2.2,.2+(t-300)/700):preset==='intermittent'?(Math.floor((t-300)/240)%2?0:1.5):1;
    for(let t=0;t<=3600;t+=30) {
      const u=speed*Math.sin(heading*rad),v=speed*Math.cos(heading*rad);
      for(const p of puffs){p.x+=u*30;p.y+=v*30;p.age+=30;}
      if(rate(t)>0&&t%60===0)puffs.push({x:sx,y:sy,age:0,mass:5.5e6*rate(t)});
      for(const s of plan.stations){const[x,y]=xy(plan.target,s);let signal=0;
        for(const p of puffs){const a=68+.21*p.age,b=57+.2*p.age;signal+=p.mass/(2*Math.PI*a*b)*Math.exp(-.5*((x-p.x)**2/a**2+(y-p.y)**2/b**2))*Math.exp(-p.age/2700);}
        const history=raw.get(s.id);history.push(signal);
        if(preset==='sensor-lag'&&s.id==='R02')signal=history[Math.max(0,history.length-3)];
        const missing=preset==='intermittent'&&s.id==='R04'&&t>=1050&&t<1440;
        all.push({stationId:s.id,observedAt:new Date((BASE+t)*1000).toISOString(),receivedAt:new Date((BASE+t+15)*1000).toISOString(),pm25:missing?null:Math.max(0,15+signal+(rng()-.5)*4),co:missing?null:Math.max(0,.15+signal*.0067+(rng()-.5)*.015),baselinePm25:15,baselineCo:.15,windFromDeg:(heading+180)%360,windSpeedMps:speed,temperatureC:missing?null:29,relativeHumidityPct:missing?null:48,quality:missing?'STALE':'VALID',windQuality:missing?'STALE':'VALID'});
      }
    }
    const stations=plan.stations.map(s=>({id:s.id,lat:s.lat,lon:s.lon,elevationM:s.elevationM,inletHeightM:null}));
    return {truth:{sources:[point],smokeReleaseAt:new Date((BASE+300)*1000).toISOString(),preset},packetAt(minute){if(!Number.isFinite(minute)||minute<0||minute>60)throw Error('REPLAY_TIME_INVALID');const asOf=BASE+minute*60+15;return {schemaVersion:1,asOf:new Date(asOf*1000).toISOString(),domain:{center:{...plan.target},radiusM:2000},stations,observations:all.filter(o=>Date.parse(o.receivedAt)<=asOf*1000).map(o=>({...o}))};}};
  }
  const api={generate};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.WildfireV2ASimulator=api;
})(typeof window!=='undefined'?window:globalThis);
