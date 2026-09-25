"""R1-R5 reproduced through real-worker UI; all readings are synthetic."""
import json,os,pathlib,subprocess
from playwright.sync_api import sync_playwright,expect
qa=pathlib.Path('qa');qa.mkdir(exist_ok=True);checks=[];errors=[]
subprocess.run(['node','tests/review-fixtures.cjs'],check=True)
try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch();page=browser.new_page(viewport={'width':1440,'height':1050},accept_downloads=True)
  page.on('pageerror',lambda e:errors.append(str(e)));page.route('https://**/*',lambda r:r.abort())
  page.add_init_script('window.sentPackets=[];const send=Worker.prototype.postMessage;Worker.prototype.postMessage=function(x){sentPackets.push(x);return send.call(this,x);};')
  page.goto('http://127.0.0.1:4173/',wait_until='networkidle')
  def wait():page.wait_for_function('window.WildfireInverseApp && !WildfireInverseApp.getState().busy && WildfireInverseApp.getState().report',timeout=60000)
  def state():return page.evaluate('WildfireInverseApp.getState()')
  def load(name):
   page.locator('#import-file').set_input_files(str(qa/'review-inputs'/(name+'.json')));wait()
  wait();page.locator('.import-panel summary').click();load('cadence-10s')
  assert state()['report']['currentAnomalousStations']==['R01','R02'];expect(page.locator('#support')).to_contain_text('2')
  checks.append('R1: 10-second telemetry is sustained smoke, not particulate-only')
  load('last-packet-stale');s=state();assert s['report']['online']==8
  assert s['report']['anomalousStations']==['R01','R02'] and not s['report']['currentAnomalousStations']
  expect(page.locator('#evidence-notice')).to_contain_text('ขณะนี้ข้อมูลสถานีขาด');expect(page.locator('#evidence-notice')).to_contain_text('ย้อนหลัง')
  page.locator('[data-select="R02"]').click();expect(page.locator('#station-status')).to_have_text('ขาดข้อมูล')
  expect(page.locator('#station-values')).to_contain_text('—');assert page.locator('[data-series="pm25"]').get_attribute('d')
  page.screenshot(path=str(qa/'review-stale-history-desktop.jpg'),type='jpeg',quality=75,full_page=True)
  load('last-packet-invalid');expect(page.locator('#evidence-notice')).to_contain_text('ขณะนี้ข้อมูลสถานีขาด')
  checks.append('R2: stale and invalid latest readings retain timestamped evidence, not an all-clear')
  load('pulse');assert state()['report']['solverPositiveCount']>=6
  assert state()['report']['solverSupportStationIds']==['R01','R02'];assert state()['report']['firstSignalAt']
  checks.append('R3: short pulse evidence actually remains in solver input')
  load('base');page.locator('#ack').click();before=state();sent=page.evaluate('sentPackets.length')
  page.locator('#import-file').set_input_files(str(qa/'review-inputs/shifted-domain.json'))
  expect(page.locator('#fatal')).to_contain_text('DOMAIN_MISMATCH');after=state()
  assert before['report']==after['report'] and before['ackAt']==after['ackAt']
  assert before['requestId']==after['requestId'] and sent==page.evaluate('sentPackets.length')
  checks.append('R4: domain mismatch rejected before state, acknowledgement or worker payload changes')
  load('base');page.locator('[data-select="R02"]').click()
  paths={key:page.locator('[data-series="'+key+'"]').get_attribute('d') for key in ['pm25','co']};cells=state()['report']['cells']
  load('mixed-timezones');assert state()['report']['cells']==cells
  for key in paths:assert page.locator('[data-series="'+key+'"]').get_attribute('d')==paths[key]
  checks.append('R5: equivalent UTC/+07:00 unsorted and duplicate records yield identical chart paths and cells')
  page.set_viewport_size({'width':375,'height':812});load('last-packet-stale')
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
  page.screenshot(path=str(qa/'review-stale-history-mobile.jpg'),type='jpeg',quality=70,full_page=True)
  with page.expect_download() as item:page.locator('#export-report').click()
  out=qa/'review-export.json';item.value.save_as(out);r=json.loads(out.read_text())
  assert r['report']['incident']['dataGapStationIds']==['R01','R02'] and r['report']['fieldValidated'] is False
  assert 'truth' not in r and r['incidentMemory']['firstSignalAt']
  checks.append('Mobile history warning and truth-free export retain explicit data-gap provenance')
  # A controlled input adapter simulates total dropout after T+25 without changing
  # the engine or UI. This exercises the in-session last-assessment display.
  replay=browser.new_page(viewport={'width':1440,'height':1050});replay.on('pageerror',lambda e:errors.append(str(e)))
  replay.route('https://**/*',lambda r:r.abort())
  adapter=pathlib.Path('inverse-simulator.js').read_text()+'''\n(function(){const g=WildfireSimulator.generate;WildfireSimulator.generate=function(...args){const f=g(...args);const at=f.packetAt;f.packetAt=function(m){const p=at(m);if(m>=30)p.observations=p.observations.map(o=>Date.parse(o.observedAt)>=Date.parse('2026-03-15T06:25:00Z')?{...o,quality:'STALE',windQuality:'STALE',pm25:null,co:null}:o);return p;};return f;};})();'''
  replay.route('**/inverse-simulator.js',lambda r:r.fulfill(status=200,body=adapter,content_type='application/javascript'))
  replay.goto('http://127.0.0.1:4173/',wait_until='networkidle');replay.wait_for_function('WildfireInverseApp.getState().report && !WildfireInverseApp.getState().busy',timeout=60000)
  replay.locator('#minute').evaluate('(e)=>{e.value=30;e.dispatchEvent(new Event("input",{bubbles:true}));}')
  replay.wait_for_function('!WildfireInverseApp.getState().busy',timeout=60000)
  rs=replay.evaluate('WildfireInverseApp.getState()');assert rs['report']['online']==0 and not rs['report']['cells']
  expect(replay.locator('#last-area-assessment')).to_contain_text('ไม่ใช่พื้นที่ประเมินปัจจุบัน')
  expect(replay.locator('#evidence-notice')).to_contain_text('ข้อมูลสถานีขาด')
  replay.locator('#restart').click();replay.wait_for_function('!WildfireInverseApp.getState().busy',timeout=60000)
  assert replay.evaluate('WildfireInverseApp.getState().incidentMemory') is None
  checks.append('Total dropout keeps labeled previous assessment without drawing it as current; rewind resets session')
  for item in page.evaluate('sentPackets'):
   assert set(item['packet'])=={'schemaVersion','asOf','domain','stations','observations'}
  assert not errors,errors;browser.close()
finally:
 result={'status':'PASS' if len(checks)==7 and not errors else 'FAIL','checks':checks,'runtimeErrors':errors,'sourceCommit':os.getenv('GITHUB_SHA','local'),'fieldValidated':False}
 (qa/'review-browser.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result,ensure_ascii=False,indent=2))
