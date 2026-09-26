/* Observation-only V2B hypothesis test. Vertical factors are conditional sensitivity,
   not measured plume heights or a terrain-resolving 3D smoke solution. */
(function(root){
'use strict';
const I=typeof module!=='undefined'&&module.exports?require('./inverse-engine.js'):root.WildfireInverse;
const T=typeof module!=='undefined'&&module.exports?require('./terrain-physics.js'):root.WildfireTerrainPhysics;
const VERSION='terrain-inverse-v2b.0',HEATS=Object.freeze([0,500000,5000000]),finite=Number.isFinite;
const huber=r=>Math.abs(r)<=2?.5*r*r:2*Math.abs(r)-2;
function fit(q,samples){let a=0,b=0,c=0;for(let j=0;j<q.length;j++){const w=samples[j].fitWeight;a+=w*q[j]*q[j];b+=w*q[j]*samples[j].dp/8;c+=w*q[j]*samples[j].dc/.06;}if(a<1e-15)return Infinity;
 let p=Math.max(0,b/a),k=Math.max(0,c/a);for(let iteration=0;iteration<2;iteration++){let ap=0,ak=0,bp=0,bk=0;for(let j=0;j<q.length;j++){const r=samples[j],x=r.dp/8,y=r.dc/.06,wp=r.fitWeight*Math.min(1,2/Math.max(.001,Math.abs(x-p*q[j]))),wk=r.fitWeight*Math.min(1,2/Math.max(.001,Math.abs(y-k*q[j])));ap+=wp*q[j]**2;ak+=wk*q[j]**2;bp+=wp*q[j]*x;bk+=wk*q[j]*y;}p=Math.max(0,bp/Math.max(ap,1e-15));k=Math.max(0,bk/Math.max(ak,1e-15));}
 const losses=new Map();for(let j=0;j<q.length;j++){const r=samples[j],loss=r.fitWeight*(huber(r.dp/8-p*q[j])+huber(r.dc/.06-k*q[j]))/2;losses.set(r.stationId,(losses.get(r.stationId)||0)+loss);}return [...losses.values()].reduce((a,b)=>a+b,0)/losses.size;
}
function trace(field,wind,row,inlet){let x=row.x,y=row.y,age=0,distance=0,stop='LOOKBACK_LIMIT';const points=[];for(let step=0;step<1000&&age<1800;step++){
 const w=wind(x,y,row.t-age);if(!w){stop='WIND_OR_DOMAIN_GAP';break;}if(w.speed<.5){stop='CALM_OUTSIDE_SCOPE';break;}
 const dt=Math.min(30,field.spacingM/2/w.speed,1800-age),mx=x-w.u*dt/2,my=y-w.v*dt/2,mid=wind(mx,my,row.t-age-dt/2);
 if(!mid){stop='WIND_OR_DOMAIN_GAP';break;}if(mid.speed<.5){stop='CALM_OUTSIDE_SCOPE';break;}
 const midAge=age+dt/2,sigma=80+.16*midAge,mean=(distance+mid.speed*dt/2)/midAge;
 const vertical=HEATS.map(q=>T.plume(midAge,mean,q,{...field.options,inletHeightM:inlet}).verticalFactor);
 points.push({x:mx,y:my,t:row.t-midAge,age:midAge,dtSec:dt,sigma2:sigma*sigma,weights:vertical.map(v=>v===null?0:(80/sigma)**2*Math.exp(-midAge/3600)*v*dt/60)});
 x-=mid.u*dt;y-=mid.v*dt;distance+=mid.speed*dt;age+=dt;
 }return {points,stop};}
function score(c,traces,samples,starts,member){const kernels=starts.map(()=>new Float64Array(samples.length));for(let j=0;j<traces.length;j++){const points=traces[j].points;let index=0,sum=0;for(let k=0;k<starts.length;k++){while(index<points.length&&points[index].t>=starts[k]){const p=points[index++],d=(p.x-c.x)**2+(p.y-c.y)**2;if(d<18*p.sigma2)sum+=Math.exp(-d/(2*p.sigma2))*p.weights[member];}kernels[k][j]=sum;}}
 let loss=Infinity,onset=null;for(let k=0;k<starts.length;k++){const v=fit(kernels[k],samples);if(v<loss){loss=v;onset=starts[k];}}return{...c,loss,onset};}
function infer(packet,field){const p=I.prepare(packet);if(!field||field.version!==T.VERSION||Math.hypot(...I.xy(field.center,p.origin))>.01)throw Error('TERRAIN_DOMAIN_MISMATCH');
 const e=I.evidence(p),support=e.entries.filter(x=>x.recentSignal),samples=I.selectSamples(p),wind=T.provider(field,p),cv=T.crossValidate(field,p);
 const base={modelVersion:VERSION,asOf:new Date(p.asOf*1000).toISOString(),status:'INSUFFICIENT_DATA',fieldValidated:false,probability:null,confidenceLevel:null,estimatedIgnitionAt:null,releaseWindow:null,defaultAlgorithmChanged:false,incident:e.incident,evidence:e.entries,firstSignalAt:e.firstSignalAt,online:e.online,anomalousStations:support.map(s=>s.id),currentAnomalousStations:e.alerts.map(s=>s.id),cells:[],zones:[],areaKm2:null,searchRadiusM:4000,resolutionM:200,sampleCount:samples.length,solverPositiveCount:samples.filter(s=>s.dp>25&&s.dc>.2).length,windValidation:cv,
  assessmentDataStatus:!support.length?'NO_RECENT_EVIDENCE':e.incident.dataGapStationIds.length?'HISTORICAL_EVIDENCE_DATA_GAP':e.alerts.length?'CURRENT_AND_RECENT_EVIDENCE':'HISTORICAL_EVIDENCE',supportDataThrough:e.incident.lastConfirmedAt,
  physics:{windModel:'DEPTH_INTEGRATED_POTENTIAL_HYPOTHESIS',verticalModel:'TERRAIN_FOLLOWING_REFLECTED_GAUSSIAN_BRIGGS_SENSITIVITY',heatMembersW:HEATS,windMeshM:field.spacingM,options:field.options,relativeResidual:[field.eastResidual,field.northResidual],assumedInletStationIds:p.stations.filter(s=>s.inletHeightM==null).map(s=>s.id)},
  warnings:['EXPERIMENTAL_NOT_PROMOTED','NO_WINDNINJA_OR_3D_CFD','WIND_HEIGHT_REPRESENTATIVENESS_UNVERIFIED','NO_THERMAL_SLOPE_CANOPY_OR_FIRE_COUPLING','HEAT_ASSUMED_NOT_MEASURED','FIT_SCORE_NOT_PROBABILITY','FIELD_CALIBRATION_NOT_PERFORMED']};
 if(!e.online)return base;if(!support.length)return{...base,status:e.firstSignalAt?'SIGNAL_HISTORY':e.entries.some(x=>x.status==='PENDING')?'PENDING':e.entries.some(x=>x.status==='PARTICULATE_ONLY')?'PARTICULATE_ONLY':'NO_SIGNAL'};
 if(samples.length<6||samples.length>1000||support.some(s=>!samples.some(r=>r.stationId===s.id&&r.dp>25&&r.dc>.2)))return{...base,warnings:[...base.warnings,'SOLVER_EVIDENCE_OR_SIZE_LIMIT']};
 const traces=samples.map(r=>{const station=p.stations.find(s=>s.id===r.stationId),inlet=station.inletHeightM??field.options.inletHeightM;if(!finite(inlet)||inlet<.2||inlet>30)throw Error('INLET_HEIGHT_INVALID');return trace(field,wind,r,inlet);});
 if(traces.filter(t=>t.points.length>=2).length<samples.length*.6)return{...base,status:'WIND_UNAVAILABLE'};
 base.directionalCorridors=support.map(s=>{const index=samples.findLastIndex(r=>r.stationId===s.id&&r.dp>25&&r.dc>.2);return{stationId:s.id,points:traces[index].points.map(t=>I.geo(p.origin,t.x,t.y))};});
 if(support.length<2)return{...base,status:'DIRECTIONAL_ONLY'};
 const oldest=Math.max(p.asOf-1800,Math.min(...p.rows.map(r=>r.t))),starts=[];for(let t=Math.floor(p.asOf/120)*120;t>=oldest;t-=120)starts.push(t);if(!starts.length)return base;
 const candidates=[];for(let x=-4000;x<=4000;x+=200)for(let y=-4000;y<=4000;y+=200)if(x*x+y*y<=4000**2)candidates.push({x,y,sizeM:200});
 const members=HEATS.map((heat,i)=>{const rows=candidates.map(c=>score(c,traces,samples,starts,i)).sort((a,b)=>a.loss-b.loss);return{heat,rows,best:rows[0].loss};}),plausible=new Map();
 base.memberFits=members.map(m=>({assumedHeatW:m.heat,fitLoss:finite(m.best)?m.best:null,adequate:finite(m.best)&&m.best<=1}));
 for(const m of members){if(!finite(m.best)||m.best>1)continue;const cutoff=m.best+Math.max(.5,.3*m.best);for(const c of m.rows)if(c.loss<=cutoff){const key=c.x+','+c.y,old=plausible.get(key);if(!old||c.loss<old.loss)plausible.set(key,c);}}
 if(!plausible.size)return{...base,status:'MODEL_MISMATCH',warnings:[...base.warnings,'NO_HEAT_MEMBER_FITS_OBSERVATIONS']};
 const cells=[...plausible.values()],outside=cells.some(c=>Math.hypot(c.x,c.y)>2000),area=cells.length*.04;
 // Keep disjoint hypotheses, never replace them with one centroid.
 const pending=new Map(cells.map(c=>[c.x+','+c.y,c])),groups=[];while(pending.size){const start=pending.values().next().value,queue=[start],group=[];pending.delete(start.x+','+start.y);while(queue.length){const a=queue.pop();group.push(a);for(const dx of [-200,0,200])for(const dy of [-200,0,200]){if(!dx&&!dy)continue;const key=(a.x+dx)+','+(a.y+dy),v=pending.get(key);if(v){pending.delete(key);queue.push(v);}}}groups.push({id:'ZONE-'+(groups.length+1),areaKm2:group.length*.04,cellCount:group.length,outsideStudy:group.some(c=>Math.hypot(c.x,c.y)>2000),bounds:[I.geo(p.origin,Math.min(...group.map(c=>c.x))-100,Math.min(...group.map(c=>c.y))-100),I.geo(p.origin,Math.max(...group.map(c=>c.x))+100,Math.max(...group.map(c=>c.y))+100)]});}
 return{...base,status:outside?'EXTERNAL_POSSIBLE':support.length<3||area>2||groups.length>1?'AMBIGUOUS':'CANDIDATE_AREAS',cells:cells.map(c=>({...I.geo(p.origin,c.x,c.y),sizeM:c.sizeM,fitLoss:c.loss})),zones:groups,areaKm2:area,externalPossible:outside,searchBoundaryReached:cells.some(c=>Math.hypot(c.x,c.y)>3750),fitLoss:Math.min(...members.map(m=>m.best)),truncatedTrajectories:traces.filter(t=>t.stop!=='LOOKBACK_LIMIT').length};
}
const api={VERSION,HEATS,trace,infer};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.WildfireTerrainInverse=api;
})(typeof window!=='undefined'?window:globalThis);
