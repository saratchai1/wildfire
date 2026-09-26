/* No simulator import; both engines see the same observation-only packet. */
importScripts('./inverse-engine.js', './bayes-engine.js');
self.onmessage = ({data}) => {
  const start=performance.now();
  try {
    if (!data || Object.keys(data).some(k=>!['id','packet','options','task'].includes(k)) || !['infer','compare'].includes(data.task||'infer')) throw Error('WORKER_CONTRACT_INVALID');
    const result=WildfireBayes.infer(data.packet,data.options||{});
    if(data.task==='compare'){
      const v2aMs=performance.now()-start,t=performance.now(),baseline=WildfireInverse.infer(data.packet);
      const summary=r=>({modelVersion:r.modelVersion,status:r.status,asOf:r.asOf,areaKm2:r.cells.length?r.areaKm2:null,signalStations:r.anomalousStations.length,fieldValidated:false});
      self.postMessage({id:data.id,comparison:{asOf:result.asOf,baseline:{...summary(baseline),computeMs:performance.now()-t},v2a:{...summary(result),computeMs:v2aMs},sameObservationPacket:true,fieldValidated:false}});
    }else self.postMessage({id:data.id,result});
  } catch(error) {self.postMessage({id:data.id,error:String(error.message||error)});}
};
