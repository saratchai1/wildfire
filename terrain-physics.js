/* Experimental depth-integrated potential wind and vertical plume sensitivity.
   This is NOT WindNinja, a canopy solver, or a validated surface wind model. */
(function(root){
'use strict';
const I=typeof module!=='undefined'&&module.exports?require('./inverse-engine.js'):root.WildfireInverse;
const VERSION='terrain-physics-v2b.0', finite=Number.isFinite;
function number(x,lo,hi,name){if(!finite(x)||x<lo||x>hi)throw Error('PHYSICS_INVALID_'+name);return x;}
function options(input={}){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['clearanceM','mixingHeightM','frictionVelocityMps','diffusivityM2s','inletHeightM'].includes(k)))throw Error('PHYSICS_OPTIONS_INVALID');
 const o={clearanceM:1000,mixingHeightM:400,frictionVelocityMps:.3,diffusivityM2s:5,inletHeightM:2,...input};
 for(const[k,l,h]of[['clearanceM',300,3000],['mixingHeightM',50,3000],['frictionVelocityMps',.05,2],['diffusivityM2s',.1,100],['inletHeightM',.2,30]])number(o[k],l,h,k);
 return o;
}
function validateDEM(t){
 if(!t||!Number.isInteger(t.width)||!Number.isInteger(t.height)||t.width<3||t.height<3||t.width>256||t.height>256||!Array.isArray(t.bounds)||t.bounds.length!==4||!t.bounds.every(finite)||t.bounds[0]>=t.bounds[2]||t.bounds[1]>=t.bounds[3]||!Array.isArray(t.elevations_m)||t.elevations_m.length!==t.width*t.height||!t.elevations_m.every(v=>finite(v)&&v>=-500&&v<=9000))throw Error('DEM_INVALID_OR_NODATA');
 if(t.bounds[0]<-180||t.bounds[2]>180||t.bounds[1]<-85||t.bounds[3]>85)throw Error('DEM_BOUNDS_INVALID');return t;
}
function elevation(t,p){
 const[w,s,e,n]=t.bounds,x=(p.lon-w)/(e-w)*(t.width-1),y=(n-p.lat)/(n-s)*(t.height-1);
 if(!finite(x)||!finite(y)||x<0||y<0||x>t.width-1||y>t.height-1)return null;
 const a=Math.min(t.width-2,Math.floor(x)),b=Math.min(t.height-2,Math.floor(y)),fx=x-a,fy=y-b,v=t.elevations_m;
 return (1-fy)*((1-fx)*v[b*t.width+a]+fx*v[b*t.width+a+1])+fy*((1-fx)*v[(b+1)*t.width+a]+fx*v[(b+1)*t.width+a+1]);
}
function build(terrain,center,input={}){
 validateDEM(terrain);number(center?.lat,-85,85,'CENTER_LAT');number(center?.lon,-180,180,'CENTER_LON');const o=options(input),n=41,h=210,radius=4200;
 const z=new Float64Array(n*n);for(let j=0;j<n;j++)for(let i=0;i<n;i++){const v=elevation(terrain,I.geo(center,i*h-radius,j*h-radius));if(v===null)throw Error('DEM_DOES_NOT_COVER_WIND_DOMAIN');z[j*n+i]=v;}
 const top=Math.max(...z)+o.clearanceM,H=Float64Array.from(z,v=>top-v),m=(n-2)**2;
 const cell=(k)=>({i:k%(n-2)+1,j:Math.floor(k/(n-2))+1});
 const coefficients=k=>{const{i,j}=cell(k),p=j*n+i;return[(H[p]+H[p-1])/2,(H[p]+H[p+1])/2,(H[p]+H[p-n])/2,(H[p]+H[p+n])/2];};
 const cs=Array.from({length:m},(_,k)=>coefficients(k)),diag=Float64Array.from(cs,c=>c.reduce((a,b)=>a+b,0));
 function apply(v){const out=new Float64Array(m);for(let k=0;k<m;k++){const{i,j}=cell(k),c=cs[k];out[k]=diag[k]*v[k]-(i>1?c[0]*v[k-1]:0)-(i<n-2?c[1]*v[k+1]:0)-(j>1?c[2]*v[k-(n-2)]:0)-(j<n-2?c[3]*v[k+n-2]:0);}return out;}
 const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
 function solve(axis){
  const boundary=(i,j)=>(axis===0?i:j)*h-radius,x=new Float64Array(m),b=new Float64Array(m);
  for(let k=0;k<m;k++){const{i,j}=cell(k),c=cs[k];x[k]=boundary(i,j);if(i===1)b[k]+=c[0]*boundary(0,j);if(i===n-2)b[k]+=c[1]*boundary(n-1,j);if(j===1)b[k]+=c[2]*boundary(i,0);if(j===n-2)b[k]+=c[3]*boundary(i,n-1);}
  const ax=apply(x),res=Float64Array.from(b,(v,i)=>v-ax[i]);let pre=Float64Array.from(res,(v,i)=>v/diag[i]),d=pre.slice(),rz=dot(res,pre),norm=Math.max(1,Math.sqrt(dot(b,b))),rel=Math.sqrt(dot(res,res))/norm,iterations=0;
  for(;iterations<2000&&rel>1e-7;iterations++){const ad=apply(d),den=dot(d,ad);if(!(den>0))throw Error('WIND_SOLVER_BREAKDOWN');const alpha=rz/den;for(let k=0;k<m;k++){x[k]+=alpha*d[k];res[k]-=alpha*ad[k];}rel=Math.sqrt(dot(res,res))/norm;if(rel<=1e-7){iterations++;break;}pre=Float64Array.from(res,(v,i)=>v/diag[i]);const next=dot(res,pre),beta=next/rz;for(let k=0;k<m;k++)d[k]=pre[k]+beta*d[k];rz=next;}
  if(rel>1e-7||!finite(rel))throw Error('WIND_SOLVER_NOT_CONVERGED');
  const phi=new Float64Array(n*n);for(let j=0;j<n;j++)for(let i=0;i<n;i++)phi[j*n+i]=(i===0||j===0||i===n-1||j===n-1)?boundary(i,j):x[(j-1)*(n-2)+i-1];
  const u=new Float64Array(n*n),v=new Float64Array(n*n);for(let j=0;j<n;j++)for(let i=0;i<n;i++){const l=Math.max(0,i-1),r=Math.min(n-1,i+1),s=Math.max(0,j-1),a=Math.min(n-1,j+1);u[j*n+i]=(phi[j*n+r]-phi[j*n+l])/((r-l)*h);v[j*n+i]=(phi[a*n+i]-phi[s*n+i])/((a-s)*h);}
  return{u,v,iterations,relativeResidual:rel};
 }
 const east=solve(0),north=solve(1);
 function interp(array,x,y){const a=(x+radius)/h,b=(y+radius)/h;if(!finite(a)||!finite(b)||a<0||b<0||a>n-1||b>n-1)return null;const i=Math.min(n-2,Math.floor(a)),j=Math.min(n-2,Math.floor(b)),dx=a-i,dy=b-j;return (1-dy)*((1-dx)*array[j*n+i]+dx*array[j*n+i+1])+dy*((1-dx)*array[(j+1)*n+i]+dx*array[(j+1)*n+i+1]);}
 function basis(x,y){const a=interp(east.u,x,y);if(a===null)return null;return[a,interp(north.u,x,y),interp(east.v,x,y),interp(north.v,x,y)];}
 function fit(rows){if(!rows.length)return null;let aa=0,ab=0,bb=0,ay=0,by=0;for(const r of rows){const b=basis(r.x,r.y);if(!b)return null;const[a,c,d,e]=b;aa+=a*a+d*d;ab+=a*c+d*e;bb+=c*c+e*e;ay+=a*r.u+d*r.v;by+=c*r.u+e*r.v;}const det=aa*bb-ab*ab;if(det<=1e-12)return null;return{a:(ay*bb-by*ab)/det,b:(by*aa-ay*ab)/det,count:rows.length};}
 function vector(f,x,y){const b=basis(x,y);if(!f||!b)return null;const u=b[0]*f.a+b[1]*f.b,v=b[2]*f.a+b[3]*f.b;return{u,v,speed:Math.hypot(u,v)};}
 return{version:VERSION,n,spacingM:h,radiusM:radius,center:{...center},options:o,source:terrain.source||'SUPPLIED_DEM',minElevationM:Math.min(...z),maxElevationM:Math.max(...z),topMsl:top,eastResidual:east.relativeResidual,northResidual:north.relativeResidual,iterations:[east.iterations,north.iterations],basis,fit,vector,elevation:(x,y)=>interp(z,x,y)};
}
function priorWinds(p,t,exclude=null){const out=[];for(const s of p.stations){if(s.id===exclude)continue;const rows=p.series.get(s.id);let r;for(let j=rows.length-1;j>=0;j--)if(rows[j].t<=t){r=rows[j];break;}if(r?.windValid&&t-r.t<=120)out.push(r);}return out;}
function provider(field,p){const cache=new Map();return (x,y,t)=>{let f=cache.get(t);if(f===undefined){f=field.fit(priorWinds(p,t));cache.set(t,f);}return field.vector(f,x,y);};}
function crossValidate(field,p){const rows=priorWinds(p,p.asOf),tests=[];for(const r of rows){const training=rows.filter(x=>x.stationId!==r.stationId);if(training.length<2)continue;const predicted=field.vector(field.fit(training),r.x,r.y);let u=0,v=0,w=0;for(const s of training){const k=1/(250**2+(s.x-r.x)**2+(s.y-r.y)**2);u+=k*s.u;v+=k*s.v;w+=k;}const meanU=training.reduce((a,b)=>a+b.u,0)/training.length,meanV=training.reduce((a,b)=>a+b.v,0)/training.length;if(predicted)tests.push({stationId:r.stationId,terrainErrorMps:Math.hypot(predicted.u-r.u,predicted.v-r.v),idwErrorMps:Math.hypot(u/w-r.u,v/w-r.v),uniformErrorMps:Math.hypot(meanU-r.u,meanV-r.v)});}
 const rms=key=>tests.length?Math.sqrt(tests.reduce((a,b)=>a+b[key]**2,0)/tests.length):null;return{status:tests.length?'LEAVE_ONE_STATION_OUT':'INSUFFICIENT_STATIONS',sampleCount:tests.length,terrainVectorRmseMps:rms('terrainErrorMps'),idwVectorRmseMps:rms('idwErrorMps'),uniformVectorRmseMps:rms('uniformErrorMps'),cases:tests,fieldValidated:false};}
function plume(ageSec,speedMps,heatW,input={}){
 const o=options(input);number(ageSec,0,3600,'AGE');number(speedMps,0,50,'SPEED');number(heatW,0,1e8,'HEAT');if(speedMps<.5)return{status:'CALM_OUTSIDE_BRIGGS_SCOPE',heightM:null,verticalFactor:null};
 const F=8.8e-6*heatW,x=speedMps*ageSec,transient=1.6*Math.cbrt(F)*Math.pow(x,2/3)/speedMps,final=1.3*F/(speedMps*o.frictionVelocityMps**2),cap=1.25*o.mixingHeightM,rise=Math.min(transient,final,cap),heightM=2+rise,sigma=Math.sqrt(64+2*o.diffusivityM2s*ageSec),z=o.inletHeightM;
 const sum=Math.exp(-.5*((z-heightM)/sigma)**2)+Math.exp(-.5*((z+heightM)/sigma)**2);
 return{status:'ASSUMED_NEUTRAL_BUOYANCY_SENSITIVITY',heatW,buoyancyFluxM4s3:F,heightM,riseM:rise,sigmaZM:sigma,verticalFactor:8/sigma*sum/2,limitedByMixingHeight:cap<=Math.min(transient,final),sourceHeatBasis:'ASSUMPTION_NOT_INFERRED_FROM_SENSORS',fieldValidated:false};
}
const api={VERSION,options,validateDEM,elevation,build,priorWinds,provider,crossValidate,plume};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.WildfireTerrainPhysics=api;
})(typeof window!=='undefined'?window:globalThis);
