"""One-time, fail-closed migration; preserve complete v1 page and its tests. No network writes."""
import json,math,pathlib,hashlib
P=pathlib.Path
MARK='ROADSIDE_2KM_V2'
if P('data/plan.js').exists() and MARK in P('data/plan.js').read_text():
 print('V2 already prepared');raise SystemExit(0)
context=json.loads(P('data/context.json').read_text());review=json.loads(P('qa/roadside-v2-review.json').read_text());raw=json.loads(P('data/osm-source.json').read_text())
assert hashlib.sha256(P('data/osm-source.json').read_bytes()).hexdigest()==review['source_sha256']
# Preserve original runtime, page and station registry before any rewrite.
for src,dst in [('app.js','app-v1.js'),('data/plan.js','data/plan-v1.js'),('core.js','core-v1.js')]:
 assert not P(dst).exists(),dst;P(dst).write_bytes(P(src).read_bytes())
oldhtml=P('index.html').read_text();P('v1.html').write_text(oldhtml.replace('./data/plan.js','./data/plan-v1.js').replace('./core.js','./core-v1.js').replace('./app.js','./app-v1.js'))
P('data/plan-v1-compare.js').write_text(P('data/plan-v1.js').read_text().replace('window.WILDFIRE_PLAN','window.WILDFIRE_LEGACY_PLAN'))
# Every old assertion remains: only direct legacy regression tests to the preserved v1 assets/page.
for file in ['tests/core.test.cjs','tests/history.test.cjs']:
 text=P(file).read_text().replace("require('../core.js')","require('../core-v1.js')").replace("'data/plan.js'","'data/plan-v1.js'");P(file).write_text(text)
for file in ['tests/browser.py','tests/history_browser.py']:
 text=P(file).read_text().replace('http://127.0.0.1:4173/','http://127.0.0.1:4173/v1.html');P(file).write_text(text)
by={h['id']:h for h in review['hints']};order=['E1','E2','E3','E4','E5','W1','W2','W3','W4']
labels={'E1':'ทางดินตะวันออกตอนเหนือ','E2':'ทางดินตะวันออกใกล้หมุดกลาง','E3':'ทางดินด้านในตะวันออกเฉียงใต้','E4':'แนวทางตะวันออกตอนกลาง–ใต้','E5':'แนวทางตะวันออกตอนล่าง','W1':'ทางเกษตรตะวันตกตอนเหนือ','W2':'ทางเกษตรตะวันตกตอนกลาง','W3':'ทางเกษตรตะวันตกตอนใต้','W4':'แนวถนนปลายด้านตะวันตกเฉียงใต้'}
reasons={'E1':'รับลมและตรวจควันด้านตะวันออกตอนเหนือ พร้อม Gateway ฝั่งตะวันออก','E2':'ตรวจควันข้ามลาดเขาจากหมุดกลางตามแนวที่ผู้ใช้วงไว้','E3':'จุดใกล้หมุดกลางที่สุดในชุดนี้ แต่จะตรวจได้เมื่อควันมาถึง ไม่ใช่ตรวจได้ทุกทิศ','E4':'เติมแนวตรวจบนทางดินฝั่งตะวันออกลงมาทางใต้','E5':'ตรวจบริเวณปลายแนวตะวันออกและควันทางใต้','W1':'วัดลมและตรวจควันบริเวณเปิดฝั่งตะวันตกตอนเหนือ พร้อม Gateway ฝั่งตะวันตก','W2':'รับควันฝั่งตะวันตกช่วงกลาง แยกจากจุดที่สูงกว่า W1','W3':'เติมแนวตรวจทางเกษตรฝั่งตะวันตกตอนใต้','W4':'เฝ้าระวังปลายแนวถนนด้านตะวันตกเฉียงใต้ใกล้ขอบพื้นที่ศึกษา'}
terrain=context['terrain']
def elevation(lat,lon):
 w,s,e,n=terrain['bounds'];x=(lon-w)/(e-w)*(terrain['width']-1);y=(n-lat)/(n-s)*(terrain['height']-1);i=round(x);j=round(y)
 return terrain['elevations_m'][j*terrain['width']+i]
plan={'version':'roadside-2km-v2','status':'PROPOSED_FOR_FIELD_SURVEY','target':{'lat':18.8135555556,'lon':98.86225},'studyRadiusM':2000,'studyAreaKm2':math.pi*4,'screenHintUncertaintyM':150,'sourceSha256':review['source_sha256'],'powerAssumptions':{'peakSunHours':3,'solarDerate':.7,'depthOfDischarge':.8,'batteryEfficiency':.9,'endOfLifeCapacity':.8,'minimumAutonomyHours':72},'kits':{'AQ':{'name':'สถานีควัน','averageW':1,'panelWp':50,'batteryV':12.8,'batteryAh':20,'weather':False,'gateway':False},'WX':{'name':'ควัน + อุณหภูมิ/RH + ลม','averageW':2,'panelWp':80,'batteryV':12.8,'batteryAh':30,'weather':True,'gateway':False},'HUB':{'name':'ควัน + อุณหภูมิ/RH + ลม + Gateway','averageW':6,'panelWp':150,'batteryV':12.8,'batteryAh':60,'weather':True,'gateway':True}},'stations':[]}
for i,name in enumerate(order,1):
 h=by[name];p=h['nearest'][0];tags=p['tags'];lon,lat=p['coordinate']
 assert p['distance_from_hint_m']<=150 and p['distance_to_target_m']<=2000
 assert tags['highway'] not in ['path','footway','steps']
 restricted=tags.get('motor_vehicle') in ['private','no'] or tags.get('access') in ['private','no']
 plan['stations'].append({'id':'R%02d'%i,'screenLabel':name,'label':name+' · '+labels[name],'side':name[0],'kit':'HUB' if name in ['E1','W1'] else 'WX','lat':lat,'lon':lon,'elevationM':elevation(lat,lon),'wayId':p['wayId'],'highway':tags['highway'],'surface':tags.get('surface','unknown'),'motorVehicle':tags.get('motor_vehicle','unknown'),'access':tags.get('access','unknown'),'osmTags':tags,'sampleId':'USER_SCREEN_'+name,'hintDistanceM':p['distance_from_hint_m'],'distanceM':p['distance_to_target_m'],'gateway':'R01' if name[0]=='E' else 'R06','reason':reasons[name],'fieldNote':('OSM ระบุ motor_vehicle=private; ต้องตรวจสิทธิ์เข้าถึงกับอุทยาน/ผู้ดูแลทางก่อน '+('' if not restricted else '') if restricted else 'ยังไม่ยืนยันสิทธิ์เข้าถึงและติดตั้ง ')+'· สำรวจเงาต้นไม้/ภูเขา ไหล่ทาง และวิทยุ · ตำแหน่งเทียบภาพโดยประมาณ ±150 ม. ไม่ใช่รังวัด','conditional':tags['highway']=='track' or restricted})
P('data/plan.js').write_text('/* '+MARK+'; screenshot-derived road anchors, not surveyed foundations. */\nwindow.WILDFIRE_PLAN = '+json.dumps(plan,ensure_ascii=False,indent=2)+';\n')
P('data/plan-v2.json').write_text(json.dumps(plan,ensure_ascii=False,indent=2))
# Carefully patch retained app; assertions prevent silently applying on unknown source.
app=P('app.js').read_text()
def replace(text,a,b):
 assert a in text, 'Missing migration anchor: '+a[:100]
 return text.replace(a,b)
app=replace(app,"['plan', 'demo', 'power']","['plan', 'analysis', 'demo', 'power']")
app=replace(app,"$('demo-controls').hidden = name !== 'demo';","$('analysis-controls').hidden = name !== 'analysis'; $('analysis-results').hidden = name !== 'analysis'; $('demo-controls').hidden = name !== 'demo';")
app=replace(app,"['path', 'footway', 'track', 'steps'].includes(road.properties.highway)","['path', 'footway', 'steps'].includes(road.properties.highway)")
app=replace(app,"'stroke-dasharray': minor ? '3 4' : ''","'stroke-dasharray': minor ? '3 4' : road.properties.highway === 'track' ? '6 3' : ''")
app=replace(app,"}, g, s.id);","}, g, s.screenLabel || s.id);")
app=replace(app,"const points = stations.map(s => C.world(s.lat, s.lon));","const points = window.RoadsideSiting.circle(plan.target, plan.studyRadiusM).map(s => C.world(s.lat, s.lon));") if "const points = stations.map(s => C.world(s.lat, s.lon));" in app else app
# fit() actual array may include target. Replace its point expression while retaining padding logic.
import re
app,n=re.subn(r"const points = \[plan.target, \.\.\.stations\]\.map\([^;]+;","const points = window.RoadsideSiting.circle(plan.target, plan.studyRadiusM).map(s => C.world(s.lat, s.lon));",app)
app=app.replace('const points = [...stations, plan.target].map(p => C.world(p.lat, p.lon));', 'const points = window.RoadsideSiting.circle(plan.target, plan.studyRadiusM).map(p => C.world(p.lat, p.lon));')
assert 'RoadsideSiting.circle(plan.target' in app, 'fit point expression changed'
app=app.replace("s.conditional ? 'ทางบริการ · มีเงื่อนไข'", "s.conditional ? 'ทางดิน · ต้องตรวจสิทธิ์'")
app=app.replace("' · ทางบริการ*'","' · ทางดิน*'")
app=app.replace("wildfire-roadside-8-stations.","wildfire-roadside-9-stations.").replace('ส่งออก 8 หมุดแล้ว','ส่งออก 9 หมุดแล้ว')
app=replace(app,"JSON.stringify(C.features(plan), null, 2)","JSON.stringify(window.RoadsideSiting.geojson(plan), null, 2)")
app=app.replace("return;\n    const focused", "return;\n    const focused")
app=replace(app,"  function resize()", "  function resize()")
# A render event is emitted by the scheduled map draw, after the SVG has been replaced.
app=replace(app,"frame = 0; renderMap();", "frame = 0; renderMap(); window.dispatchEvent(new Event('wildfire:map-render'));")
app=replace(app,"Object.freeze({ getState:","Object.freeze({ project: point => screen(point), unproject: (x,y) => C.unworld(view.center[0]+(x-view.width/2)/(256*2**view.zoom),view.center[1]+(y-view.height/2)/(256*2**view.zoom)), requestMap, getState:")
P('app.js').write_text(app)
# Keep old synthetic model explicitly, without v1's tuned long-range signal.
core=P('core.js').read_text();core=replace(core,'const baselinePm = 14 + index % 3;','const baselinePm = 15;');core=replace(core,'const baselineCo = 0.12;','const baselineCo = 0.15;');core=replace(core,'(2 * 120 ** 2)','(2 * 85 ** 2)');core=replace(core,'(100 + along * 0.18)','(90 + along * 0.18)');core=replace(core,'Math.exp(-along / 4200)','Math.exp(-along / 900)');core=replace(core,'Math.exp(-age / 4)','Math.exp(-age / 8)');core=replace(core,'300 * smoke','130 * smoke');core=replace(core,'1.2 * smoke','0.85 * smoke');P('core.js').write_text(core)
# Main UI: nine co-located smoke/weather stations and an explicit assessment area.
html=oldhtml.replace('8 จุด','9 จุด').replace('8 <small>จุดติดตั้ง','9 <small>จุดติดตั้ง').replace('ตะวันออก 4 · ตะวันตก 4','ตะวันออก 5 · ตะวันตก 4').replace('3 <small>สถานีวัดลม','9 <small>สถานีวัดลม').replace('R01 · R04 · R08','วัดลมร่วมทุกจุด').replace('630','860').replace('>08<','>09<').replace('ส่งออก 8 หมุด','ส่งออก 9 หมุด')
html=html.replace('R01 · R08','E1 · W1').replace('6 ถนนผิวแข็ง + 2 ทางบริการ','8 ทางเกษตร/ทางดิน + 1 แนวถนน').replace('ทางเดิน / ทางวิบาก ไม่ใช้ปักหมุด','เส้นประ: ทางดิน / เส้นทางใน OSM')
html=html.replace('ดอยสุเทพ–ปุย · วางจุดตรวจควันตามถนนจริง ไม่ใช้กริดกลางป่า','ดอยสุเทพ–ปุย · 9 จุดตามแนวที่วงไว้ · พื้นที่ศึกษา 2 กม. / 12.57 ตร.กม.')
html=html.replace('ด้านเหนือ–ใต้ยังไม่มีสถานีในชุดนี้ · หมุดห่างเป้าหมายประมาณ 1.5–3.2 กม. · ควันต้องเดินทางถึงเซนเซอร์จึงตรวจได้','วงรัศมี 2 กม. คือพื้นที่ศึกษา ไม่ใช่ขอบเขตรับประกันตรวจไฟ · ช่องว่างด้านเหนือและรอบนอกยังมี · ควันต้องมาถึงช่องรับอากาศ')
html=replace(html,'<button data-view="demo"','<button data-view="analysis" aria-pressed="false">ตรวจได้เร็วแค่ไหน?</button><button data-view="demo"')
html=replace(html,'    <section id="workspace"',P('partials/analysis.html').read_text()+'\n    <section id="workspace"')
html=replace(html,'    <footer class="footer">','    <section id="analysis-results" class="analysis-results" hidden></section>\n    <footer class="footer">')
html=html.replace('href="./docs/DESIGN.md"','href="./docs/DESIGN_V2.md"')
html=replace(html,'  <link rel="stylesheet" href="./styles.css">','  <link rel="stylesheet" href="./styles.css"><link rel="stylesheet" href="./siting.css">')
html=replace(html,'<script src="./core.js"></script>','<script src="./data/plan-v1-compare.js"></script><script src="./core.js"></script><script src="./siting.js"></script>')
html=replace(html,'</body>','<script src="./siting-ui.js"></script>\n</body>')
P('index.html').write_text(html)
P('qa/v2-prepared.json').write_text(json.dumps({'status':'PREPARED_NOT_YET_TESTED','stations':len(plan['stations']),'old_version_preserved':'v1.html','source_sha256':review['source_sha256']},indent=2))
print('Prepared v2: nine source-matched anchors, v1 preserved, assessment area and screening hooks added.')
