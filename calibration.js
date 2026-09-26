/* Local-only candidate calibration from paired collocation readings.
   Passing held-out regression checks is NOT a calibration certificate. */
(function(root){
'use strict';
const VERSION='collocation-candidate-v1',finite=Number.isFinite;
function strict(x,keys,label){if(!x||typeof x!=='object'||Array.isArray(x)||Object.keys(x).some(k=>!keys.includes(k)))throw Error('CALIBRATION_CONTRACT_'+label);}
function stamp(s){if(typeof s!=='string'||!/T.*(?:Z|[+-]\d\d:\d\d)$/.test(s)||!finite(Date.parse(s)))throw Error('CALIBRATION_TIMESTAMP_INVALID');return Date.parse(s)/1000;}
function prepare(data){
 strict(data,['schemaVersion','sourceKind','reference','units','rows'],'ROOT');if(data.schemaVersion!==1||!['SYNTHETIC_TEST','FIELD_COLLOCATION_UPLOAD'].includes(data.sourceKind))throw Error('CALIBRATION_KIND_INVALID');
 strict(data.units,['pm25','co'],'UNITS');if(data.units.pm25!=='ug/m3'||data.units.co!=='ppm')throw Error('CALIBRATION_UNITS_INVALID');
 strict(data.reference,['id','serial','calibrationRecord','averagingSec'],'REFERENCE');for(const k of ['id','serial','calibrationRecord'])if(typeof data.reference[k]!=='string'||!data.reference[k].trim()||data.reference[k].length>200)throw Error('REFERENCE_METADATA_REQUIRED');
 if(data.reference.averagingSec!==60)throw Error('PREALIGN_TO_SHARED_60_SECOND_AVERAGES');if(!Array.isArray(data.rows)||data.rows.length>20000)throw Error('CALIBRATION_SIZE_INVALID');
 const unique=new Map();let excluded=0,duplicates=0;for(const row of data.rows){strict(row,['stationId','observedAt','referenceObservedAt','pm25Raw','pm25Reference','coRaw','coReference','quality','temperatureC','relativeHumidityPct'],'ROW');
  if(typeof row.stationId!=='string'||!/^[A-Za-z0-9_-]{1,32}$/.test(row.stationId))throw Error('CALIBRATION_STATION_INVALID');const t=stamp(row.observedAt),rt=stamp(row.referenceObservedAt);if(Math.abs(t-rt)>30)throw Error('REFERENCE_TIME_ALIGNMENT_INVALID');
  if(!['VALID','INVALID'].includes(row.quality))throw Error('CALIBRATION_QUALITY_INVALID');const clean={...row,observedAt:new Date(t*1000).toISOString(),referenceObservedAt:new Date(rt*1000).toISOString(),t};const key=row.stationId+'/'+t;
  if(unique.has(key)){const old=unique.get(key);if([...new Set([...Object.keys(old),...Object.keys(clean)])].some(k=>old[k]!==clean[k]))throw Error('CALIBRATION_DUPLICATE_CONFLICT');duplicates++;continue;}unique.set(key,clean);
 }
 const rows=[...unique.values()].sort((a,b)=>a.t-b.t||a.stationId.localeCompare(b.stationId));
 const last=new Map();for(const r of rows){const prior=last.get(r.stationId);if(prior&&(r.t-prior.t<60||stamp(r.referenceObservedAt)-stamp(prior.referenceObservedAt)<60))throw Error('CALIBRATION_OVERLAPPING_AVERAGES');last.set(r.stationId,r);}
 if(rows.length&&Object.values(data.reference).some(v=>typeof v==='string'&&v.startsWith('FILL_')))throw Error('REFERENCE_METADATA_REQUIRED');
 for(const row of rows){row.valid=row.quality==='VALID'&&['pm25Raw','pm25Reference','coRaw','coReference'].every(k=>finite(row[k])&&row[k]>=0)&&row.pm25Raw<=10000&&row.pm25Reference<=10000&&row.coRaw<=1000&&row.coReference<=1000;if(!row.valid)excluded++;
  if(row.temperatureC!==undefined&&row.temperatureC!==null&&(!finite(row.temperatureC)||row.temperatureC< -40||row.temperatureC>70))throw Error('CALIBRATION_TEMPERATURE_INVALID');
  if(row.relativeHumidityPct!==undefined&&row.relativeHumidityPct!==null&&(!finite(row.relativeHumidityPct)||row.relativeHumidityPct<0||row.relativeHumidityPct>100))throw Error('CALIBRATION_HUMIDITY_INVALID');
 }
 return{sourceKind:data.sourceKind,reference:{...data.reference},rows,excluded,duplicates};
}
const mean=a=>a.reduce((x,y)=>x+y,0)/a.length;
function metrics(pairs){const error=pairs.map(([x,y])=>x-y),reference=pairs.map(r=>r[1]),m=mean(reference),sst=reference.reduce((s,x)=>s+(x-m)**2,0),sse=error.reduce((s,x)=>s+x*x,0);return{n:pairs.length,rmse:Math.sqrt(sse/error.length),mae:mean(error.map(Math.abs)),bias:mean(error),r2:sst>1e-12?1-sse/sst:null};}
function fitChannel(training,validation,channel){
 const key=channel==='pm25'?'pm25':'co',raw=key+'Raw',ref=key+'Reference',x=training.map(r=>r[raw]),y=training.map(r=>r[ref]),mx=mean(x),my=mean(y),range=[Math.min(...x),Math.max(...x)],yrange=[Math.min(...y),Math.max(...y)],minimum=channel==='pm25'?10:.05;
 if(range[1]-range[0]<minimum||yrange[1]-yrange[0]<minimum)return{status:'INSUFFICIENT_CONCENTRATION_RANGE',coefficients:null,unit:channel==='pm25'?'ug/m3':'ppm'};
 const xx=x.reduce((s,v)=>s+(v-mx)**2,0),xy=x.reduce((s,v,i)=>s+(v-mx)*(y[i]-my),0),gain=xy/xx,offset=my-gain*mx;
 if(!finite(gain)||gain<=.01||gain>100)return{status:'IMPLAUSIBLE_FIT',coefficients:null};
 const corrected=metrics(validation.map(r=>[offset+gain*r[raw],r[ref]])),unadjusted=metrics(validation.map(r=>[r[raw],r[ref]])),outside=validation.filter(r=>r[raw]<range[0]||r[raw]>range[1]).length;
 return{status:outside?'VALIDATION_EXTRAPOLATION':corrected.rmse<unadjusted.rmse?'VALIDATION_IMPROVED_NOT_CERTIFIED':'NO_VALIDATION_IMPROVEMENT',coefficients:{gain,offset},unit:channel==='pm25'?'ug/m3':'ppm',trainingRawRange:range,trainingReferenceRange:yrange,validationOutsideRangeCount:outside,validationRaw:unadjusted,validationCorrected:corrected,
  trainingResidualStd:Math.sqrt(training.reduce((s,r)=>s+(r[ref]-offset-gain*r[raw])**2,0)/Math.max(1,training.length-2))};
}
function analyze(data){const p=prepare(data),ids=[...new Set(p.rows.map(r=>r.stationId))],stations=[];for(const id of ids){const rows=p.rows.filter(r=>r.stationId===id&&r.valid),cut=Math.floor(rows.length*.7),validation=rows.slice(cut),start=validation[0]?.t,training=rows.slice(0,cut).filter(r=>r.t<start-60);
 const base={stationId:id,validRows:rows.length,trainingCount:training.length,validationCount:validation.length,fieldValidated:false,usableForLive:false};
 if(training.length<30||validation.length<12){stations.push({...base,status:'INSUFFICIENT_PAIRED_DATA',channels:{}});continue;}
 const channels={pm25:fitChannel(training,validation,'pm25'),co:fitChannel(training,validation,'co')};
 const ranges={};for(const k of ['temperatureC','relativeHumidityPct']){const values=training.map(r=>r[k]).filter(finite),valid=validation.map(r=>r[k]).filter(finite);ranges[k]={training:values.length?[Math.min(...values),Math.max(...values)]:null,validation:valid.length?[Math.min(...valid),Math.max(...valid)]:null};}
 stations.push({...base,status:Object.values(channels).every(c=>c.status==='VALIDATION_IMPROVED_NOT_CERTIFIED')?'CANDIDATE_FOR_REVIEW':'NOT_READY',trainingThrough:new Date(training.at(-1).t*1000).toISOString(),validationFrom:new Date(validation[0].t*1000).toISOString(),channels,environmentRanges:ranges});
 }
 return{schemaVersion:1,modelVersion:VERSION,sourceKind:p.sourceKind,reference:p.reference,status:!stations.length?'NO_DATA':stations.every(s=>s.status==='CANDIDATE_FOR_REVIEW')?'CANDIDATES_NOT_CERTIFIED':'REVIEW_REQUIRED',fieldValidated:false,usableForLive:false,excludedRows:p.excluded,duplicateRows:p.duplicates,stations,method:'PER_STATION_AFFINE_TRAIN_70_PERCENT_TIME_ORDERED_WITH_60_SECOND_GUARD',warnings:['USER_REFERENCE_METADATA_NOT_INDEPENDENTLY_VERIFIED','NO_AUTOMATIC_APPLICATION_TO_SENSOR_STREAM','NO_HUMIDITY_OR_DRIFT_CORRECTION','TEMPORAL_VALIDATION_NOT_INDEPENDENT_FIELD_LOCALIZATION_TEST',...(p.sourceKind==='SYNTHETIC_TEST'?['SYNTHETIC_TEST_NOT_FIELD_DATA']:[])]};
}
function template(){return{schemaVersion:1,sourceKind:'FIELD_COLLOCATION_UPLOAD',units:{pm25:'ug/m3',co:'ppm'},reference:{id:'FILL_REFERENCE_MODEL',serial:'FILL_REFERENCE_SERIAL',calibrationRecord:'FILL_RECORD_ID_OR_FILE',averagingSec:60},rows:[]};}
function example(){const d=template();d.sourceKind='SYNTHETIC_TEST';d.reference={id:'SYNTHETIC_REFERENCE',serial:'NOT_A_REAL_DEVICE',calibrationRecord:'SOFTWARE_TEST_ONLY',averagingSec:60};for(let i=0;i<120;i++){const t=new Date(Date.parse('2026-03-15T06:00:00Z')+i*60000).toISOString(),pm=40+25*Math.sin(i*.31),co=.45+.22*Math.sin(i*.31);d.rows.push({stationId:'R02',observedAt:t,referenceObservedAt:t,pm25Raw:pm,pm25Reference:5+.8*pm,coRaw:co,coReference:.03+.7*co,quality:'VALID',temperatureC:29+Math.cos(i*.1),relativeHumidityPct:55+10*Math.sin(i*.2)});}return d;}
const api={VERSION,prepare,metrics,analyze,template,example};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.WildfireCalibration=api;
})(typeof window!=='undefined'?window:globalThis);
