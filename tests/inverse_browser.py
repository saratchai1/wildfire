"""Real browser observation-only integration, worker isolation and independent fixtures."""
import json, os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
qa=Path('qa');qa.mkdir(exist_ok=True);checks=[];errors=[]
try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch();page=browser.new_page(viewport={'width':1440,'height':1000},accept_downloads=True)
  page.on('pageerror',lambda e:errors.append(str(e)));page.route('https://**/*',lambda r:r.abort())
  page.add_init_script("window.sentPackets=[];const send=Worker.prototype.postMessage;Worker.prototype.postMessage=function(x){sentPackets.push(JSON.parse(JSON.stringify(x)));return send.call(this,x);};")
  page.goto('http://127.0.0.1:4173/',wait_until='networkidle')
  def wait():page.wait_for_function('window.WildfireInverseApp && !WildfireInverseApp.getState().busy && WildfireInverseApp.getState().report',timeout=30000)
  def state():return page.evaluate('WildfireInverseApp.getState()')
  def seek(minute):
   page.locator('#minute').evaluate('(e,v)=>{e.value=v;e.dispatchEvent(new Event("input",{bubbles:true}));}',str(minute));wait()
  def scene(name):
   page.locator('#nav-principles').click();page.locator('#lab-preset').select_option(name);page.locator('#apply-scene').click();wait();seek(25)
  wait();expect(page.locator('.primary-nav a')).to_have_count(2);expect(page.locator('#dashboard')).to_be_visible()
  expect(page.locator('#inverse-map [data-station]')).to_have_count(10);expect(page.locator('#station-table tr')).to_have_count(10)
  assert state()['report']['status']=='AMBIGUOUS';assert len(state()['report']['cells'])>0
  expect(page.locator('[data-truth-pin]')).to_have_count(0);assert 'source' not in state()
  page.screenshot(path=str(qa/'inverse-dashboard-desktop.jpg'),type='jpeg',quality=70,full_page=True)
  sent=page.evaluate('sentPackets');assert len(sent)>=1
  for item in sent:
   assert set(item)=={'id','packet'} and set(item['packet'])=={'schemaVersion','asOf','domain','stations','observations'}
   assert all('source' not in row and 'truth' not in row for row in item['packet']['observations'])
  checks.append('Two views, 10 pins, observation-only worker messages and no operator truth marker')
  page.locator('#nav-principles').click();page.locator('#reveal').click();expect(page.locator('[data-truth-pin]')).to_have_count(1)
  expect(page.locator('#truth-result')).to_be_visible();page.screenshot(path=str(qa/'inverse-principles-desktop.jpg'),type='jpeg',quality=70,full_page=True)
  page.locator('#replay').click();expect(page.locator('#dashboard')).to_be_visible();expect(page.locator('[data-truth-pin]')).to_have_count(0)
  assert page.locator('#truth-result').inner_text()=='' and page.locator('#truth-lat').input_value()==''
  checks.append('Reveal restricted to lab and removed when returning to officer view')
  page.locator('#ack').click();assert state()['ackAt'] is not None
  seek(0);assert state()['report']['firstSignalAt'] is None and state()['ackAt'] is None
  expect(page.locator('#ack')).to_be_disabled();seek(25)
  page.locator('#minute').evaluate('(e)=>{for(const v of [10,35,40]){e.value=v;e.dispatchEvent(new Event("input",{bubbles:true}));}}');wait()
  assert state()['minute']==40 and state()['report']['asOf'].startswith('2026-03-15T06:40:')
  checks.append('Observed timeline, acknowledgement reset, no future event and stale worker responses ignored')
  for preset,status in [('single-sensor','DIRECTIONAL_ONLY'),('dust','PARTICULATE_ONLY'),('none','NO_SIGNAL'),('multiple','MODEL_MISMATCH')]:
   scene(preset);assert state()['report']['status']==status,(preset,state()['report']['status']);assert len(state()['report']['cells'])==0
  scene('changing');assert len(state()['report']['anomalousStations'])>=3
  scene('noise');assert state()['report']['fieldValidated'] is False
  scene('outside');assert state()['report']['externalPossible'] or state()['report']['status']=='DIRECTIONAL_ONLY'
  scene('offline');assert state()['report']['online']==6
  page.locator('[data-select="R09"]').click();assert page.locator('[data-series="pm25"]').get_attribute('d')==''
  checks.append('Independent multi-station, changing wind, noise, external, multi-source, dust and offline scenarios')
  scene('single');page.locator('#compare-winds').click();expect(page.locator('#direction-table tr')).to_have_count(8)
  with page.expect_download() as item:page.locator('#export-report').click()
  file=qa/'inverse-report.json';item.value.save_as(file);r=json.loads(file.read_text());assert r['report']['probability'] is None and 'truth' not in r
  page.locator('.import-panel summary').click()
  with page.expect_download() as item:page.locator('#export-input').click()
  file=qa/'inverse-observations.json';item.value.save_as(file);p=json.loads(file.read_text());assert 'truth' not in p and 'source' not in p
  checks.append('Eight-direction signal times and reproducible truth-free input/result exports')
  bad=qa/'inverse-bad.json';bad.write_text(json.dumps({**p,'source':{'lat':0,'lon':0}}));page.locator('#import-file').set_input_files(str(bad))
  expect(page.locator('#fatal')).to_contain_text('CONTRACT_INVALID');assert state()['mode']=='SYNTHETIC_DEMO'
  page.locator('#import-file').set_input_files(str(file));wait();assert state()['mode']=='IMPORTED_UNVERIFIED';expect(page.locator('#reveal')).to_be_disabled()
  expect(page.locator('#data-mode')).to_contain_text('ไม่ใช่ Live')
  checks.append('Local import validation, no hidden truth injection and imported-not-live provenance')
  page.set_viewport_size({'width':375,'height':812});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
  page.locator('#basemap').select_option('satellite');expect(page.locator('.map-error')).to_be_visible();expect(page.locator('[data-station]')).to_have_count(10)
  page.screenshot(path=str(qa/'inverse-principles-mobile.jpg'),type='jpeg',quality=65,full_page=True)
  page.locator('#nav-dashboard').click();assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
  page.locator('[data-station="R10"]').focus();page.keyboard.press('Enter');expect(page.locator('#station-title')).to_have_text('สถานี N1')
  page.screenshot(path=str(qa/'inverse-dashboard-mobile.jpg'),type='jpeg',quality=65,full_page=True)
  checks.append('Mobile 375px, N1 keyboard selection, map offline fallback')
  page.goto('http://127.0.0.1:4173/#principles');wait();expect(page.locator('#principles')).to_be_visible()
  page.locator('#nav-dashboard').click();page.go_back();expect(page.locator('#principles')).to_be_visible()
  assert not errors,errors;checks.append('Direct lab URL, browser history and zero runtime errors');browser.close()
finally:
 report={'status':'PASS' if len(checks)==8 and not errors else 'FAIL','sourceCommit':os.getenv('GITHUB_SHA','local'),'checks':checks,'runtimeErrors':errors,'fieldValidated':False}
 (qa/'inverse-browser.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False,indent=2))
