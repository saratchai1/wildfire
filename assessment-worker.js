/* No generator, hidden source or operational notifications in this worker. */
importScripts('./inverse-engine.js', './assessment-engine.js');
self.onmessage = ({ data }) => {
  const id = data?.id;
  try {
    if (!data || Object.keys(data).some(k => !['id', 'packet'].includes(k)) || !Number.isSafeInteger(id)) throw Error('ASSESSMENT_CONTRACT_INVALID');
    const result = WildfireAssessment.diagnose(data.packet, progress => self.postMessage({ id, progress }));
    self.postMessage({ id, result });
  } catch (error) { self.postMessage({ id, error: String(error.message || error) }); }
};
