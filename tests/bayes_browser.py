"""V2A challenger: real worker, unchanged observations, uncertainty, replay and explicit limitations."""
import json,os,pathlib
from playwright.sync_api import sync_playwright,expect
qa=pathlib.Path('qa');qa.mkdir(exist_ok=True);checks=[];errors=[]
try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch();page=browser.new_page(viewport={'width':1440,'height':1050},accept_downloads=True)
  page.on('pageerror',lambda e:errors.append(str(e)));page.route('https://**/*',lambda r:r.abort())
  page.add_init_script('window.sentPackets=[];const send=Worker.prototype.postMessage;Worker.prototype.postMessage=function(x){sentPackets.push(JSON.parse(JSON.stringify(x)));return send.call(this,x);};')
  page.goto('http://127.0.0.1:4173/',wait_until='networkidle')
  def state():return page.evaluate('WildfireInverseApp.getState()')
  def wait():page.wait_for_function('window.WildfireInverseApp && !WildfireInverseApp.getState().busy && WildfireInverseApp.getState().report',timeout=90000)
  def change_model(value):
   old=state()['requestId'];page.locator('#model-choice').select_option(value)
   page.wait_for_function('(n)=>WildfireInverseApp.getState().requestId>n&&!WildfireInverseApp.getState().busy',arg=old,timeout=90000)
  def seek(minute):
   page.locator('#minute').evaluate('(e,v)=>{e.value=v;e.dispatchEvent(new Event("input",{bubbles:true}));}',str(minute));wait()
  wait();assert state()['algorithm']=='baseline';oldtime=state()['report']['asOf'];oldsignal=state()['report']['anomalousStations']
  page.locator('#nav-principles').click();change_model('v2a');r=state()['report'];assert r['modelVersion']=='bayes-grid-v2a.1' and r['asOf']==oldtime
  assert r['anomalousStations']==oldsignal;assert len(page.workers)==1
  expect(page.locator('#model-badge')).to_contain_text('ทดลอง');expect(page.locator('#model-diagnostics')).to_contain_text('ไม่ใช่โอกาส')
  expect(page.locator('[data-truth-pin]')).to_have_count(0)
  expect(page.locator('#station-table tr')).to_have_count(10)
  checks.append('Selectable V2A uses same timestamp/evidence on a real observation-only worker')
  page.locator('#compare-models').click();page.wait_for_function("document.getElementById('model-comparison').dataset.asOf",timeout=90000)
  expect(page.locator('#model-comparison')).to_contain_text('V1.1');expect(page.locator('#model-comparison')).to_contain_text('พื้นที่เล็กลงไม่ใช่หลักฐาน')
  assert page.locator('#model-comparison').get_attribute('data-as-of')==r['asOf']
  page.screenshot(path=str(qa/'bayes-dashboard-desktop.jpg'),type='jpeg',quality=75,full_page=True)
  checks.append('Explicit same-input comparison does not assert narrower means more accurate')
  page.locator('.model-panel summary').click();cell=page.locator('[data-sensor-model="R02"] [data-key="pmStd"]')
  cell.fill('-1');before=state()['requestId'];page.locator('#apply-sensor-models').click()
  expect(page.locator('#sensor-model-error')).to_contain_text('INVALID');assert state()['requestId']==before
  cell.fill('50');page.locator('#apply-sensor-models').click();wait()
  model=next(x for x in state()['report']['sensorModels'] if x['stationId']=='R02');assert model['pmStd']==50 and model['basis']=='USER_SUPPLIED_UNVERIFIED'
  with page.expect_download() as item:page.locator('#export-report').click()
  file=qa/'bayes-report.json';item.value.save_as(file);data=json.loads(file.read_text());assert data['algorithm']=='v2a' and data['report']['probability'] is None
  assert not any(k in data for k in ['truth','source','ignition'])
  checks.append('Per-sensor assumptions validate atomically and export without truth or calibration claims')
  page.locator('#reset-sensor-models').click();wait();page.locator('.model-panel summary').click()
  page.locator('#nav-principles').click();page.locator('#lab-preset').select_option('ramp');page.locator('#apply-scene').click();wait();seek(25)
  assert state()['report']['modelVersion']=='bayes-grid-v2a.1'
  page.locator('#reveal').click();expect(page.locator('[data-truth-pin]')).to_have_count(1)
  page.locator('#load-benchmark').click();expect(page.locator('#benchmark-results')).to_contain_text('39',timeout=10000)
  expect(page.locator('#benchmark-results')).to_contain_text('ยังไม่เลื่อน')
  page.screenshot(path=str(qa/'bayes-principles-desktop.jpg'),type='jpeg',quality=75,full_page=True)
  page.locator('#replay').click();page.wait_for_function("WildfireInverseApp.getState().view==='dashboard' && WildfireInverseApp.getState().algorithm==='baseline'");wait();expect(page.locator('[data-truth-pin]')).to_have_count(0)
  assert state()['algorithm']=='baseline';expect(page.locator('#experimental-models')).to_be_hidden()
  checks.append('Variable-release laboratory, reveal boundary and complete mixed benchmark results')
  seek(0);assert state()['report']['firstSignalAt'] is None;expect(page.locator('#ack')).to_be_disabled()
  page.locator('#nav-principles').click();page.locator('#model-choice').select_option('baseline');page.locator('#model-choice').select_option('v2a');wait()
  assert state()['algorithm']=='v2a' and state()['report']['modelVersion']=='bayes-grid-v2a.1'
  assert state()['report']['asOf'].startswith('2026-03-15T06:00:')
  checks.append('Rewind and rapid model switch cannot apply obsolete inference results')
  for item in page.evaluate('sentPackets'):
   assert set(item)<=set(['id','packet','options','task'])
   assert set(item['packet'])==set(['schemaVersion','asOf','domain','stations','observations'])
   assert 'truth' not in json.dumps(item['packet'])
  checks.append('Every captured inference/comparison message excludes scenario and hidden source')
  page.set_viewport_size({'width':375,'height':812});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
  page.locator('#basemap').select_option('satellite');expect(page.locator('.map-error')).to_be_visible()
  page.locator('[data-station="R10"]').focus();page.keyboard.press('Enter');expect(page.locator('#station-title')).to_have_text('สถานี N1')
  page.screenshot(path=str(qa/'bayes-dashboard-mobile.jpg'),type='jpeg',quality=70,full_page=True)
  assert not errors,errors;checks.append('375px layout, N1 keyboard selection, imagery fallback and no runtime errors')
  browser.close()
finally:
 report={'status':'PASS' if len(checks)==7 and not errors else 'FAIL','sourceCommit':os.getenv('GITHUB_SHA','local'),'checks':checks,'runtimeErrors':errors,'fieldValidated':False}
 (qa/'bayes-browser.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False,indent=2))
