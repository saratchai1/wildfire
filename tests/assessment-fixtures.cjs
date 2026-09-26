const G = require('../inverse-simulator'), P = require('../data/plan-v2.json');
function fixture(kind = 'weak', cadence = 10, until = 180) {
 const p = G.generate(P, {preset:'none'}).packetAt(5), origin = Date.parse(p.asOf)-300000, row=p.observations[0];
 p.asOf=new Date(origin+until*1000).toISOString();p.observations=[];
 for(let t=0;t<=until;t+=cadence)for(const s of p.stations){const active=['R01','R02'].includes(s.id),mode=active?kind:'quiet';
  const delta={weak:[18,.13],strong:[100,.65],pm:[80,0],co:[0,.3],quiet:[0,0],noise:[t%20?15:0,t%20?.12:0]}[mode];
  const stamp=new Date(origin+t*1000).toISOString();p.observations.push({...row,stationId:s.id,observedAt:stamp,receivedAt:stamp,quality:'VALID',windQuality:'VALID',pm25:15+delta[0],co:.15+delta[1],baselinePm25:15,baselineCo:.15,windFromDeg:270,windSpeedMps:2});
 }return p;
}
module.exports={fixture};
