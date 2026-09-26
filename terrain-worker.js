'use strict';
importScripts('./inverse-engine.js','terrain-physics.js','terrain-inverse.js');
let field=null,key=null;
onmessage=({data})=>{try{
 if(!data||Object.keys(data).some(k=>!['id','packet','terrain','options'].includes(k)))throw Error('WORKER_CONTRACT_INVALID');
 const p=WildfireInverse.prepare(data.packet),o=WildfireTerrainPhysics.options(data.options),next=JSON.stringify({terrain:data.terrain,center:p.origin,clearanceM:o.clearanceM});
 if(next!==key){field=WildfireTerrainPhysics.build(data.terrain,p.origin,o);key=next;}else field.options=o;
 const started=performance.now(),report=WildfireTerrainInverse.infer(data.packet,field),elapsedMs=performance.now()-started;
 const baseline=WildfireInverse.infer(data.packet),w=WildfireTerrainPhysics.provider(field,p),arrows=[];
 for(let x=-3600;x<=3600;x+=600)for(let y=-3600;y<=3600;y+=600){const v=w(x,y,p.asOf);if(v)arrows.push({...WildfireInverse.geo(p.origin,x,y),u:v.u,v:v.v});}
 postMessage({id:data.id,report,baseline,arrows,elapsedMs,field:{spacingM:field.spacingM,minElevationM:field.minElevationM,maxElevationM:field.maxElevationM,iterations:field.iterations,relativeResidual:[field.eastResidual,field.northResidual]}});
 }catch(e){postMessage({id:data?.id,error:e.message});}};
