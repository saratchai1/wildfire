/* The worker can only receive an observation packet. No generator is imported. */
importScripts('./inverse-engine.js');
self.onmessage = ({data}) => {
  try { self.postMessage({id:data.id,result:WildfireInverse.infer(data.packet)}); }
  catch(error) { self.postMessage({id:data.id,error:String(error.message||error)}); }
};
