/* Event-level development probes; numeric localization is intentionally unchanged. */
const fs=require('node:fs'),crypto=require('node:crypto'),A=require('../assessment-engine'),I=require('../inverse-engine'),{fixture}=require('../tests/assessment-fixtures.cjs');
const manifest={version:'evidence-watch-development-v1',cases:['weak','strong','pm','co','quiet','noise'],cadenceSec:10,durationSec:180};
const cases=manifest.cases.map(kind=>{const packet=fixture(kind),r=A.observe(packet);return{id:kind,status:r.status,watchStations:r.watchStationIds,canonicalSignals:r.currentSignalStationIds,
 firstMeasuredSignalAt:r.firstMeasurementSignalAt,firstReceivedSignalAt:r.firstReceivedSignalAt,
 truthMeaning:['strong','weak'].includes(kind)?'INJECTED_PAIRED_SIGNAL_NOT_A_FIELD_FIRE':'NO_PAIRED_SMOKE_SIGNAL',
 falseWatchInNonPairedScenario:!['weak','strong'].includes(kind)&&r.watchStationIds.length>0};});
const out={version:A.VERSION,scope:'FIXED_SYNTHETIC_EVENT_PROBES_NOT_FIELD_PERFORMANCE',sourceCommit:process.env.GITHUB_SHA||'local',
 fieldValidated:false,baselineVersion:I.VERSION,baselineKernelSha256:crypto.createHash('sha256').update(fs.readFileSync('inverse-engine.js')).digest('hex'),
 manifest,cases,summary:{eventCount:cases.length,nonPairedEvents:4,watchInNonPairedEvents:cases.filter(c=>c.falseWatchInNonPairedScenario).length,
 canonicalSignalsInNonPairedEvents:cases.filter(c=>c.truthMeaning==='NO_PAIRED_SMOKE_SIGNAL'&&c.canonicalSignals.length).length},
 limitations:['WATCH is intentionally sensitive to sustained particulate/CO pollution; not fire classification','No improvement of source-location accuracy claimed','Development inputs, not independent field events']};
fs.mkdirSync('qa',{recursive:true});fs.writeFileSync('qa/v12-events.json',JSON.stringify(out,null,2));console.log(JSON.stringify(out.summary));
