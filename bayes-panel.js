/* Model selection/comparison UI. No hidden truth in model routing or comparisons. */
(function(){
'use strict';
const I=window.WildfireInverse,B=window.WildfireBayes,P=window.WILDFIRE_PLAN,$=id=>document.getElementById(id);
let choice='baseline',options={},latest=null,comparisonWorker=null,comparisonId=0,benchmark=null;
const clone=x=>JSON.parse(JSON.stringify(x));
window.WildfireModelRouter=Object.freeze({
 current:()=>choice,settings:()=>clone(options),
 useBaseline:()=>{if(choice==='baseline')return;choice='baseline';$('model-choice').value=choice;change();},
 path:()=>choice==='v2a'?'./bayes-worker.js':'./inverse-worker.js',
 send:(worker,id,packet)=>worker.postMessage(choice==='v2a'?{id,packet,options:clone(options)}:{id,packet}),
 infer:packet=>choice==='v2a'?B.infer(packet,options):I.infer(packet),
 generate:(plan,spec)=>['pulse','ramp','intermittent','sensor-lag'].includes(spec.preset)?window.WildfireV2ASimulator.generate(plan,spec):window.WildfireSimulator.generate(plan,spec)
});
const fmt=(x,d=2)=>Number.isFinite(x)?x.toFixed(d):'—';
function invalidate(){latest=null;comparisonId++;if(comparisonWorker){comparisonWorker.terminate();comparisonWorker=null;}$('compare-models').disabled=true;$('model-comparison').replaceChildren();}
function describe(report){
 $('model-badge').textContent=choice==='v2a'?'V2A · รุ่นทดลอง · ยังไม่สอบเทียบ':'V1.1 · ตัวอ้างอิงเดิม';
 const box=$('model-diagnostics');box.replaceChildren();
 if(choice!=='v2a')return;
 const lines=['ใช้ความคลาดเคลื่อนของแต่ละเครื่อง + สมมติฐานลม 5 ชุด + การปล่อยควัน 5 รูปแบบ และรวมคำตอบโดยไม่ใช้เฉลย',
  'คำนวณใหม่จากข้อมูลไม่ซ้ำในหน้าต่างย้อนหลัง ไม่สะสมความมั่นใจจากแพ็กเก็ตเดิมซ้ำ',
  report?.posterior?'แผนที่เป็นชุดมวลน้ำหนักแบบจำลอง 90% ไม่ใช่โอกาสครอบคลุมต้นทางจริง 90%':'ยังไม่มีชุดพื้นที่จาก V2A สำหรับข้อมูลขณะนี้',
  'ยังไม่ใช้ลมตามภูเขา/การยกตัวของควัน และไม่มีผลความแม่นยำภาคสนาม'];
 if(report?.emissionSummary){const e=report.emissionSummary;lines.push('รูปแบบที่ฟิตข้อมูลดีที่สุด: '+e.type+' · ค่าปล่อยสัมพัทธ์ช่วงต้น/ปลาย '+fmt(e.earlyRelative,1)+' / '+fmt(e.lateRelative,1)+' (ไม่ใช่กำลังไฟหรือปริมาณควันที่วัดจริง)');}
 for(const text of lines){const p=document.createElement('p');p.textContent=text;box.append(p);}
}
function change(){invalidate();describe(null);window.dispatchEvent(new Event('wildfire-model-change'));}
$('model-choice').onchange=()=>{if(location.hash!=='#principles'){$('model-choice').value=choice;return;}choice=$('model-choice').value;change();};
const tbody=$('sensor-models');
for(const s of P.stations){const tr=document.createElement('tr');tr.dataset.sensorModel=s.id;const label=document.createElement('th');label.scope='row';label.textContent=s.screenLabel;tr.append(label);
 for(const [key,value,min,max,step] of [['pmStd',8,.1,500,.5],['coStd',.06,.001,10,.01],['responseLagSec',0,0,120,5]]){
  const td=document.createElement('td'),input=document.createElement('input');Object.assign(input,{type:'number',value:String(value),min:String(min),max:String(max),step:String(step)});input.dataset.key=key;input.setAttribute('aria-label',s.screenLabel+' '+key);td.append(input);tr.append(td);
 }tbody.append(tr);
}
$('apply-sensor-models').onclick=()=>{if(location.hash!=='#principles')return;try{const next={sensorModels:[...tbody.children].map(tr=>{const s={stationId:tr.dataset.sensorModel};for(const el of tr.querySelectorAll('input'))s[el.dataset.key]=el.value.trim()?Number(el.value):NaN;return s;})};B.sensorModels(next,P.stations);options=next;$('sensor-model-error').textContent='';choice='v2a';$('model-choice').value=choice;change();}catch(e){$('sensor-model-error').textContent=e.message;}};
$('reset-sensor-models').onclick=()=>{options={};for(const input of tbody.querySelectorAll('input'))input.value=String({pmStd:8,coStd:.06,responseLagSec:0}[input.dataset.key]);$('sensor-model-error').textContent='';if(choice==='v2a')change();};
window.addEventListener('wildfire-analysis-start',invalidate);
window.addEventListener('wildfire-analysis',e=>{latest={packet:e.detail.packet,report:e.detail.report};$('compare-models').disabled=false;describe(latest.report);});
$('compare-models').onclick=()=>{if(!latest)return;const packet=clone(latest.packet),id=++comparisonId;$('compare-models').disabled=true;$('model-comparison').textContent='กำลังเปรียบเทียบข้อมูลชุดเดียวกัน…';
 try{comparisonWorker=new Worker('./bayes-worker.js');comparisonWorker.onmessage=({data})=>{if(id!==comparisonId)return;comparisonWorker.terminate();comparisonWorker=null;$('compare-models').disabled=false;
 if(data.error){$('model-comparison').textContent='ประเมินไม่ได้: '+data.error;return;}const c=data.comparison;const text=['ข้อมูล ณ '+c.asOf+' · ไม่ได้ใช้เฉลยในทั้งสองโมเดล'];
 for(const[k,title]of [['baseline','V1.1'],['v2a','V2A']])text.push(title+' — '+c[k].status+' · พื้นที่ '+fmt(c[k].areaKm2)+' ตร.กม. · คำนวณ '+fmt(c[k].computeMs/1000,2)+' วินาที');
 text.push('พื้นที่เล็กลงไม่ใช่หลักฐานว่าแม่นขึ้น ต้องเทียบกับเฉลยในชุดทดสอบด้วย');$('model-comparison').replaceChildren();for(const t of text){const p=document.createElement('p');p.textContent=t;$('model-comparison').append(p);} $('model-comparison').dataset.asOf=c.asOf;
 };comparisonWorker.onerror=()=>{if(id!==comparisonId)return;comparisonWorker.terminate();comparisonWorker=null;$('compare-models').disabled=false;$('model-comparison').textContent='Worker เปรียบเทียบทำงานไม่ได้';};comparisonWorker.postMessage({id,task:'compare',packet,options:clone(options)});
 }catch(e){$('model-comparison').textContent=e.message;$('compare-models').disabled=false;}
};
function showBenchmark(){
 const host=$('benchmark-results');host.replaceChildren();if(!benchmark){host.textContent='ยังโหลดผลชุดทดสอบไม่ได้';return;}
 const note=document.createElement('p');note.textContent='ชุด '+benchmark.suite+' · '+benchmark.summary.baseline.allSnapshots+' ภาพเวลา · เก็บทุกฉากรวมกรณีไม่พบ/ไม่ระบุพื้นที่ · ผลพัฒนาแบบสังเคราะห์ ไม่ใช่ความแม่นยำภาคสนาม';host.append(note);
 const table=document.createElement('table');table.innerHTML='<thead><tr><th>ตัวชี้วัด</th><th>V1.1</th><th>V2A</th></tr></thead><tbody></tbody>';const body=table.querySelector('tbody');
 for(const[label,key]of [['ภาพเวลาที่ครอบต้นทางทุกจุด','allTruthsCovered'],['ภาพเวลาที่พลาดหรือยังระบุไม่ได้','missedTruthOrAbstained'],['ภาพเวลาที่ไม่ระบุพื้นที่','abstainedFireSnapshots'],['พื้นที่เฉลี่ยเฉพาะกรณีที่ระบุ (ตร.กม.)','meanReportedAreaKm2'],['สัญญาณผิดในฉากไม่มีไฟ','falseSignalsInNoFireSnapshots']]){const tr=document.createElement('tr');for(const v of[label,benchmark.summary.baseline[key],benchmark.summary.v2a[key]]){const td=document.createElement('td');td.textContent=typeof v==='number'?fmt(v,Number.isInteger(v)?0:2):String(v);tr.append(td);}body.append(tr);}host.append(table);
 const fine=document.createElement('p');fine.textContent='ฉากนี้ใช้ประเมินระหว่างพัฒนา จึงไม่ใช่ blind field holdout อิสระ · ยังไม่เลื่อน V2A เป็นค่าเริ่มต้น';host.append(fine);
}
$('load-benchmark').onclick=async()=>{try{const r=await fetch('./data/v2a-benchmark.json');if(!r.ok)throw Error('HTTP '+r.status);benchmark=await r.json();if(benchmark.challengerVersion!==B.VERSION||benchmark.fieldValidated!==false||!Array.isArray(benchmark.cases))throw Error('BENCHMARK_VERSION_INVALID');showBenchmark();}catch(e){$('benchmark-results').textContent='โหลดผลทดสอบไม่ได้: '+e.message;}};
describe(null);
})();
