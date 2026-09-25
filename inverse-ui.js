/* Two views; truth belongs to the laboratory only. The inference worker receives observations only. */
(function(){
'use strict';
const P=window.WILDFIRE_PLAN,C=window.WildfireCore,I=window.WildfireInverse,G=window.WildfireSimulator,$=id=>document.getElementById(id),NS='http://www.w3.org/2000/svg';
const f=(n,d=1)=>Number.isFinite(n)?n.toFixed(d):'—';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const time=t=>t?new Date(t).toLocaleTimeString('th-TH',{timeZone:'Asia/Bangkok',hour12:false}):'—';
const statuses={NO_SIGNAL:['ยังไม่พบสัญญาณควันตามเกณฑ์','ไม่ใช่การยืนยันว่าไม่มีไฟ โดยเฉพาะจุดที่ควันไม่ผ่านสถานี'],PARTICULATE_ONLY:['พบฝุ่นเพิ่ม แต่ยังไม่มีหลักฐานควันคู่ PM + CO','ตรวจสอบกิจกรรมริมทางและคุณภาพข้อมูลก่อนสรุป'],INSUFFICIENT_DATA:['ข้อมูลยังไม่เพียงพอ','ข้อมูลขาดหรือประวัติสั้นเกินไป ไม่แทนค่าที่หายด้วยศูนย์'],WIND_UNAVAILABLE:['มีสัญญาณ แต่ยังย้อนต้นทางไม่ได้','ลมสงบหรือประวัติลมไม่พอ แจ้งให้ตรวจสอบสัญญาณได้โดยไม่ต้องรอตำแหน่ง'],DIRECTIONAL_ONLY:['ได้เพียงแนวต้นลม ยังระบุตำแหน่งไม่ได้','หลักฐานหลายตำแหน่งยังไม่พอ ไม่วาดจุดต้นเพลิงจากสถานีเดียว'],AMBIGUOUS:['ยังมีหลายพื้นที่ต้นทางที่เป็นไปได้','ดูพื้นที่สีม่วงประกอบสถานีและประวัติลม ไม่ใช่ตำแหน่งต้นเพลิงยืนยัน'],CANDIDATE_AREAS:['พบพื้นที่ที่อธิบายข้อมูลหลายสถานีได้','ใช้เป็นพื้นที่เสนอให้ตรวจสอบ คะแนนยังไม่ใช่ความน่าจะเป็นที่สอบเทียบ'],EXTERNAL_POSSIBLE:['ควันอาจมาจากนอกพื้นที่ศึกษา','ระบบค้นหาเผื่อนอกวง 2 กม. ไม่บังคับต้นทางให้อยู่ในโครงการ'],MODEL_MISMATCH:['แบบจำลองแหล่งเดียวอธิบายข้อมูลไม่ดี','อาจมีหลายแหล่งควัน ลมซับซ้อน หรือข้อมูลผิดพลาด จึงไม่ปักต้นทางจุดเดียว']};
let spec={preset:'single',windToDeg:75,windSpeedMps:2},fixture=G.generate(P,spec),minute=25,view='dashboard',playing=false,selected='R02',revealed=false,imported=null,packet=null,report=null,ackAt=null,history=[],requestId=0,worker=null,busy=false;
function fail(message){$('fatal').textContent=message;$('fatal').hidden=false;}
function clearFailure(){$('fatal').hidden=true;}
function sendDownload(name,value){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function svg(tag,attrs,parent,text){const e=document.createElementNS(NS,tag);for(const[k,v]of Object.entries(attrs))e.setAttribute(k,v);if(text!==undefined)e.textContent=text;parent.appendChild(e);return e;}
class ObservationMap extends window.WildfireMapView{
 draw(){super.draw();if(!this.state||!this.observationReport||!this.scale)return;const r=this.observationReport,g=svg('g',{'pointer-events':'none','data-inverse-overlay':'true'},this.svg),first=this.svg.querySelector('[data-station]');if(first)this.svg.insertBefore(g,first);
  for(const cell of r.cells){const d=cell.sizeM/2,points=[C.offset(cell,-d,-d),C.offset(cell,d,-d),C.offset(cell,d,d),C.offset(cell,-d,d)];svg('path',{d:this.path(points)+'Z',fill:cell.fitClass==='BETTER_FIT'?'#694587':'#a184b7','fill-opacity':'.40',stroke:'#785b90','stroke-opacity':'.15','stroke-width':'.4'},g);}
  for(const line of r.directionalCorridors||[])svg('path',{d:this.path(line.points),fill:'none',stroke:'#827249','stroke-width':1.4,'stroke-dasharray':'4 4'},g);
  for(const e of r.evidence){if(e.windFromDeg===null||!e.windSpeedMps)continue;const a=(e.windFromDeg+180)*Math.PI/180,end=C.offset(e,Math.sin(a)*180,Math.cos(a)*180),left=C.offset(end,-Math.sin(a-.5)*55,-Math.cos(a-.5)*55),right=C.offset(end,-Math.sin(a+.5)*55,-Math.cos(a+.5)*55);svg('path',{d:this.path([e,end])+' '+this.path([left,end,right]),fill:'none',stroke:'#34556a','stroke-width':'1.4',class:'obs-wind'},g);}
  if(this.labTruth)for(const point of this.labTruth.sources){const[x,y]=this.project(point);svg('circle',{cx:x,cy:y,r:9,fill:'#e04b2f',stroke:'white','stroke-width':3,class:'truth-pin','data-truth-pin':'true'},this.svg);svg('text',{x:x+13,y:y-12,'font-size':11,fill:'#822f23','paint-order':'stroke',stroke:'white','stroke-width':3},this.svg,'เฉลยในห้องทดลอง');}
 }
 show(result,id,truth){this.observationReport=result;this.labTruth=truth;const rows=result.evidence.map(e=>({...e,status:e.status==='PARTICULATE_ONLY'?'PENDING':e.status}));this.render({scenario:'normal',source:P.target,selected:id,minute:0,windSpeedMps:0},{rows},{rows:P.stations.map(s=>({id:s.id,enabled:true}))});}
}
const map=new ObservationMap('inverse-map',P,window.WILDFIRE_CONTEXT, id=>{selected=id;render();},point=>{if(view!=='principles'||imported)return;spec.point=point;newScene();});
function analyze(){
 const id=++requestId;clearFailure();busy=true;$('computing').textContent='กำลังคำนวณพื้นที่…';$('export-report').disabled=true;
 packet=imported||fixture.packetAt(minute);
 if(worker)worker.postMessage({id,packet});else setTimeout(()=>{try{receive({id,result:I.infer(packet)});}catch(e){receive({id,error:e.message});}},0);
}
function receive(data){if(data.id!==requestId)return;busy=false;$('computing').textContent='';if(data.error){report=null;fail(data.error);$('situation').textContent='ไม่สามารถประมวลผลชุดข้อมูลนี้ได้';return;}
 report=data.result;$('export-report').disabled=false;
 const row={asOf:report.asOf,status:report.status,areaKm2:report.cells.length?report.areaKm2:null,support:report.anomalousStations.length};history=history.filter(r=>r.asOf<row.asOf);history.push(row);if(history.length>61)history.shift();render();
}
try{worker=new Worker('./inverse-worker.js');worker.onmessage=e=>receive(e.data);worker.onerror=()=>{worker.terminate();worker=null;analyze();};}catch(_){worker=null;}
function seriesChart(station,key,title,unit){const rows=packet.observations.filter(o=>o.stationId===station.id && Date.parse(o.receivedAt)<=Date.parse(packet.asOf)&&Date.parse(o.observedAt)<=Date.parse(packet.asOf)&&Date.parse(o.observedAt)>=Date.parse(packet.asOf)-600000).sort((a,b)=>a.observedAt.localeCompare(b.observedAt));
 const high=Math.max(key==='pm25'?50:.5,...rows.map(r=>Number.isFinite(r[key])?r[key]:0)),end=Date.parse(packet.asOf),start=end-600000;let d='',pen=false,last=null;
 for(const r of rows){const v=r[key],t=Date.parse(r.observedAt);if(r.quality!=='VALID'||!Number.isFinite(v)){pen=false;continue;}if(last!==null&&t-last>90000)pen=false;d+=(pen?'L':'M')+(15+(t-start)/600000*280).toFixed(1)+' '+(72-v/high*60).toFixed(1)+' ';pen=true;last=t;}
 return '<div class="chart-head"><b>'+title+'</b><span>'+unit+' · 10 นาทีล่าสุด</span></div><svg viewBox="0 0 320 92" class="history-chart" aria-label="กราฟ '+title+'"><path d="M15 12V72H300" fill="none" stroke="#c2cdbd"/><path data-series="'+key+'" d="'+d+'" fill="none" stroke="'+(key==='pm25'?'#a76a36':'#537c81')+'" stroke-width="2"/><text x="15" y="88">-10 นาที</text><text x="270" y="88">ล่าสุด</text>'+(!d?'<text x="90" y="40">ไม่มีข้อมูลที่ใช้ได้</text>':'')+'</svg>';
}
function revealResult(){const box=$('truth-result');box.hidden=!revealed||view!=='principles'||!!imported;if(box.hidden){box.replaceChildren();return;}
 const truth=fixture.truth;const lines=truth.sources.map(s=>{const hits=report.cells.filter(c=>{const[x,y]=I.xy(c,s);return Math.abs(x)<=c.sizeM/2&&Math.abs(y)<=c.sizeM/2;});const best=report.cells.reduce((a,b)=>!a||b.fitLoss<a.fitLoss?b:a,null),distance=best?Math.hypot(...I.xy(s,best)):null;return 'เฉลย '+s.lat.toFixed(6)+', '+s.lon.toFixed(6)+' · '+(!report.cells.length?'ยังไม่มีพื้นที่ให้เปรียบเทียบ':hits.length?'อยู่ในพื้นที่ที่ยังเป็นไปได้':'ไม่อยู่ในพื้นที่ที่ระบบเสนอ')+(distance!==null?' · จุดคะแนนต่ำสุดห่างเฉลย '+Math.round(distance)+' ม.':'');});
 box.innerHTML='<b>เฉลยจากตัวสร้างฉากเท่านั้น — ไม่ได้ส่งเข้า Worker</b>'+lines.map(esc).join('<br>')+'<p>ผลสังเคราะห์รายฉาก ไม่ใช่ความแม่นยำภาคสนาม · สูตรปล่อยควันไม่ใช่สูตรเดียวกับตัววิเคราะห์</p>';
}
function render(){if(!report)return;
 $('clock').textContent=time(packet.asOf)+' น. (ข้อมูล)';$('minute').value=minute;$('minute').disabled=!!imported;$('play').disabled=!!imported;$('restart').disabled=!!imported;$('play').textContent=playing?'Ⅱ พักข้อมูล':'▶ เล่นข้อมูล';
 $('data-mode').textContent=imported?'ข้อมูลนำเข้า · ยังไม่ตรวจสอบ / ไม่ใช่ Live':'● ข้อมูลจำลอง · ยังไม่ใช่ระบบแจ้งเตือนจริง';
 const st=statuses[report.status]||['ยังประเมินไม่ได้',''];$('situation').className='situation'+(['NO_SIGNAL','PARTICULATE_ONLY'].includes(report.status)?'':' warn');$('situation').innerHTML='<div><strong>'+st[0]+'</strong><p>'+st[1]+'</p></div>';
 $('online').textContent=report.online+' / '+P.stations.length;$('support').textContent=report.anomalousStations.length+' สถานี';$('first-signal').textContent=report.firstSignalAt?time(report.firstSignalAt)+' น.':'ยังไม่พบ';$('area').textContent=report.cells.length?f(report.areaKm2,2)+' ตร.กม.':'ยังระบุไม่ได้';
 const row=report.evidence.find(e=>e.id===selected)||report.evidence[0],station=P.stations.find(s=>s.id===row.id);selected=row.id;
 $('station-title').textContent='สถานี '+station.screenLabel;$('station-status').textContent={UNKNOWN:'ขาดข้อมูล',SUSPECT:'ควันผิดปกติ',PARTICULATE_ONLY:'ฝุ่นเพิ่ม',NO_ANOMALY:'ยังไม่พบสัญญาณ'}[row.status];
 $('station-values').innerHTML='<div><strong>'+f(row.pm25)+'</strong><span>PM2.5 · µg/m³</span></div><div><strong>'+f(row.co,2)+'</strong><span>CO · ppm</span></div><div class="small-reading"><strong>'+f(row.temperatureC)+' °C</strong><span>อุณหภูมิอากาศ</span></div><div class="small-reading"><strong>'+f(row.relativeHumidityPct)+' %</strong><span>ความชื้นอากาศ</span></div>';
 $('station-note').textContent=station.lat.toFixed(6)+', '+station.lon.toFixed(6)+' · วัด '+time(row.observedAt)+' · ลมจาก '+f(row.windFromDeg,0)+'° / '+f(row.windSpeedMps)+' m/s';$('station-charts').innerHTML=seriesChart(station,'pm25','PM2.5','µg/m³')+seriesChart(station,'co','CO','ppm');
 $('station-table').innerHTML=report.evidence.map(e=>'<tr class="'+(e.id===selected?'selected':'')+'"><td><button data-select="'+e.id+'">'+P.stations.find(s=>s.id===e.id).screenLabel+'</button></td><td><span class="status-chip '+(e.status==='UNKNOWN'?'gray':e.status==='SUSPECT'?'warn':'')+'">'+({UNKNOWN:'ขาดข้อมูล',SUSPECT:'ควันผิดปกติ',PARTICULATE_ONLY:'ฝุ่นเพิ่ม',NO_ANOMALY:'ยังไม่พบ'}[e.status])+'</span></td><td>'+f(e.pm25)+'</td><td>'+f(e.co,2)+'</td><td>'+f(e.windFromDeg,0)+' / '+f(e.windSpeedMps)+'</td></tr>').join('');
 $('ack').disabled=ackAt!==null||!report.firstSignalAt;$('ack').textContent=ackAt?'รับทราบแล้ว '+time(ackAt):'รับทราบสัญญาณในหน้านี้';
 $('zones').innerHTML=report.zones.length?report.zones.slice(0,5).map(z=>'<div class="zone-line"><b>'+z.id+' · '+f(z.areaKm2,2)+' ตร.กม.</b><p>'+z.bounds.map(p=>f(p.lat,4)+', '+f(p.lon,4)).join(' ถึง ')+'</p><small>'+(z.outsideStudy?'มีส่วนอยู่นอกวงศึกษา':'พื้นที่เสนอให้ตรวจสอบ')+'</small></div>').join(''):'<p>ยังไม่มีพื้นที่ต้นทางที่ควรระบุ ให้ใช้ข้อมูลสถานีและแนวต้นลมประกอบ</p>';
 if(report.searchBoundaryReached)$('zones').innerHTML+='<p>สมมติฐานแตะขอบค้นหา 4 กม. ต้นทางอาจอยู่ไกลกว่านี้</p>';
 const events=[...history].reverse().map(h=>'<li><time>'+time(h.asOf)+'</time><div><b>'+esc((statuses[h.status]||[''])[0])+'</b><p>หลักฐาน '+h.support+' สถานี'+(h.areaKm2!==null?' · พื้นที่ '+f(h.areaKm2,2)+' ตร.กม.':'')+'</p></div></li>');
 if(ackAt)events.unshift('<li><time>'+time(ackAt)+'</time><div><b>รับทราบสัญญาณในหน้านี้</b><p>ไม่ใช่การยืนยันไฟ</p></div></li>');$('events').innerHTML=events.join('');
 revealResult();map.show(report,selected,view==='principles'&&revealed&&!imported?fixture.truth:null);
}
function route(){view=location.hash==='#principles'?'principles':'dashboard';playing=false;revealed=false;for(const v of ['dashboard','principles']){$(v).hidden=view!==v;$('nav-'+v).toggleAttribute('aria-current',view===v);if(view===v)$('nav-'+v).setAttribute('aria-current','page');}$('principles-extra').hidden=view!=='principles';$('truth-result').hidden=true;$('truth-result').replaceChildren();$('reveal').textContent='เปิดเฉลยจุดกำเนิดควัน';$('truth-lat').value='';$('truth-lon').value='';$('direction-table').replaceChildren();render();}
function newScene(){try{fixture=G.generate(P,spec);imported=null;minute=0;playing=false;revealed=false;ackAt=null;history=[];$('reveal').disabled=false;$('direction-table').replaceChildren();analyze();}catch(e){fail(e.message);}}
$('apply-scene').onclick=()=>{const old=spec;spec={...spec,preset:$('lab-preset').value,windToDeg:Number($('lab-wind').value),windSpeedMps:$('lab-speed').value.trim()?Number($('lab-speed').value):NaN};try{G.generate(P,spec);newScene();}catch(e){spec=old;fail(e.message);}};
$('apply-truth').onclick=()=>{if(view!=='principles')return;const point={lat:$('truth-lat').value.trim()?Number($('truth-lat').value):NaN,lon:$('truth-lon').value.trim()?Number($('truth-lon').value):NaN};try{G.generate(P,{...spec,point});spec={...spec,point};newScene();}catch(e){fail(e.message);}};
$('reveal').onclick=()=>{if(view!=='principles'||imported)return;revealed=!revealed;$('reveal').textContent=revealed?'ซ่อนเฉลย':'เปิดเฉลยจุดกำเนิดควัน';render();};
$('replay').onclick=()=>{revealed=false;location.hash='dashboard';};
$('minute').oninput=()=>{playing=false;const next=Number($('minute').value);if(next<minute){ackAt=null;history=[];}minute=next;analyze();};
$('play').onclick=()=>{if(imported)return;if(minute>=60){minute=0;ackAt=null;history=[];}playing=!playing;render();};
$('restart').onclick=()=>{minute=0;playing=false;ackAt=null;history=[];analyze();};
$('ack').onclick=()=>{if(report?.firstSignalAt&&ackAt===null){ackAt=report.asOf;render();}};
$('station-table').onclick=e=>{const b=e.target.closest('[data-select]');if(b){selected=b.dataset.select;render();}};
$('basemap').onchange=()=>map.setBasemap($('basemap').value);
$('export-report').onclick=()=>{if(report&&!busy)sendDownload('wildfire-observation-only-report.json',{schemaVersion:1,planVersion:P.version,report,assessmentHistory:history,acknowledgedAt:ackAt,mode:imported?'IMPORTED_UNVERIFIED':'SYNTHETIC_DEMO'});};
$('export-input').onclick=()=>sendDownload('wildfire-observations.json',packet);
$('import-file').onchange=async()=>{const file=$('import-file').files[0];if(!file)return;try{if(file.size>2*1024*1024)throw Error('ไฟล์ต้องไม่เกิน 2 MB');const data=JSON.parse(await file.text());I.prepare(data);if(data.stations.length!==P.stations.length||data.stations.some(s=>{const a=P.stations.find(a=>a.id===s.id);return !a||Math.abs(a.lat-s.lat)>1e-8||Math.abs(a.lon-s.lon)>1e-8;}))throw Error('พิกัดและรหัสต้องตรงสถานี 10 จุดของแผนนี้');imported=data;ackAt=null;revealed=false;playing=false;history=[];$('reveal').disabled=true;analyze();}catch(e){fail(e.message);}};
$('compare-winds').onclick=()=>{if(view!=='principles'||imported)return;const names=['เหนือ','ตะวันออกเฉียงเหนือ','ตะวันออก','ตะวันออกเฉียงใต้','ใต้','ตะวันตกเฉียงใต้','ตะวันตก','ตะวันตกเฉียงเหนือ'];$('direction-table').innerHTML=names.map((name,i)=>{const g=G.generate(P,{preset:'single',point:fixture.truth.sources[0],windToDeg:i*45,windSpeedMps:spec.windSpeedMps}),e=I.evidence(I.prepare(g.packetAt(60))),first=e.entries.filter(s=>s.firstSignalAt).sort((a,b)=>a.firstSignalAt.localeCompare(b.firstSignalAt))[0];return '<tr><td>'+name+' '+i*45+'°</td><td>'+(first?P.stations.find(s=>s.id===first.id).screenLabel:'—')+'</td><td>'+(first?f((Date.parse(first.firstSignalAt)-Date.parse(g.truth.smokeReleaseAt))/60000)+' นาที*':'ยังไม่พบตามเกณฑ์ใน 60 นาที')+'</td></tr>';}).join('');};
window.addEventListener('hashchange',route);document.addEventListener('visibilitychange',()=>{if(document.hidden){playing=false;render();}});
setInterval(()=>{if(!playing||busy||document.hidden||imported)return;minute=Math.min(60,minute+1);if(minute===60)playing=false;analyze();},1500);
window.WildfireInverseApp=Object.freeze({getState:()=>JSON.parse(JSON.stringify({view,minute,playing,busy,requestId,report,ackAt,stationCount:P.stations.length,mode:imported?'IMPORTED_UNVERIFIED':'SYNTHETIC_DEMO'}))});
route();analyze();
})();
