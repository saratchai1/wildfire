"""V1.2 evidence/sensitivity UI on actual HTTP workers. All data are synthetic."""
import json,os,pathlib,subprocess
from playwright.sync_api import sync_playwright,expect
qa=pathlib.Path('qa');qa.mkdir(exist_ok=True);checks=[];errors=[]
subprocess.run(['node','-e',"const fs=require('fs'),{fixture}=require('./tests/assessment-fixtures.cjs');for(const k of ['weak','pm','co','strong','quiet'])fs.writeFileSync('qa/v12-'+k+'.json',JSON.stringify(fixture(k)));const p=require('./inverse-simulator').generate(require('./data/plan-v2.json')).packetAt(25);fs.writeFileSync('qa/v12-base.json',JSON.stringify(p));p.observations=p.observations.map(o=>({...o,pm25:15+(['R01','R02'].includes(o.stationId)?18:0),co:.15+(['R01','R02'].includes(o.stationId)?.13:0)}));fs.writeFileSync('qa/v12-base-weak.json',JSON.stringify(p));"],check=True)
try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch();page=browser.new_page(viewport={'width':1440,'height':1050},accept_downloads=True)
  page.on('pageerror',lambda e:errors.append(str(e)));page.route('https://**/*',lambda r:r.abort())
  page.add_init_script('window.workerMessages=[];const send=Worker.prototype.postMessage;Worker.prototype.postMessage=function(x){workerMessages.push(JSON.parse(JSON.stringify(x)));return send.call(this,x);};')
  page.goto('http://127.0.0.1:4173/',wait_until='networkidle')
  def state():return page.evaluate('WildfireInverseApp.getState()')
  def companion():return page.evaluate('WildfireAssessmentPanel.getState()')
  def wait():page.wait_for_function('window.WildfireInverseApp && !WildfireInverseApp.getState().busy && WildfireInverseApp.getState().report',timeout=90000)
  def load(name):
   old=state()['requestId'];page.locator('#import-file').set_input_files(str(qa/('v12-'+name+'.json')))
   page.wait_for_function('(n)=>WildfireInverseApp.getState().requestId>n && !WildfireInverseApp.getState().busy',arg=old,timeout=90000);wait()
  def seek(n):
   page.locator('#minute').evaluate('(e,n)=>{e.value=n;e.dispatchEvent(new Event("input",{bubbles:true}));}',n);wait()
  wait();assert state()['algorithm']=='baseline';expect(page.locator('#experimental-models')).to_be_hidden()
  expect(page.locator('.primary-nav a')).to_have_count(2);expect(page.locator('[data-station]')).to_have_count(10)
  expect(page.locator('#evidence-stage')).to_contain_text('มีสัญญาณ');expect(page.locator('#location-stage')).to_contain_text('พื้นที่สมมติฐาน')
  checks.append('Officer sees separate evidence/location and baseline only with all ten stations')
  page.locator('.sensitivity-details summary').click();before=state()['report']['cells'];page.locator('#sensitivity-run').click()
  page.wait_for_function('WildfireAssessmentPanel.getState().diagnostics && !WildfireAssessmentPanel.getState().running',timeout=120000)
  diag=companion()['diagnostics'];assert diag['testedCount']==13 and diag['status']=='SENSITIVE'
  assert 'R01' in diag['criticalStationIds'] and 'R02' in diag['criticalStationIds']
  assert state()['report']['cells']==before;expect(page.locator('#sensitivity-rows tr')).to_have_count(13)
  expect(page.locator('#location-sensitivity-note')).to_contain_text('E1 / E2')
  page.screenshot(path=str(qa/'v12-sensitivity-desktop.jpg'),type='jpeg',quality=75,full_page=True)
  checks.append('Real-worker leave-one-out/wind/quiet trials expose dependency without altering baseline region')
  with page.expect_download() as item:page.locator('#export-report').click()
  file=qa/'v12-report.json';item.value.save_as(file);data=json.loads(file.read_text())
  assert data['robustnessAssessment']['testedCount']==13 and data['observationAssessment']['mode']=='WATCH_SHADOW_ONLY'
  assert data['robustnessAssessment']['probability'] is None and 'truth' not in data
  checks.append('Export includes matched evidence and diagnostic provenance, not hidden truth or probabilities')
  page.locator('#sensitivity-run').click();page.locator('#sensitivity-cancel').click()
  assert companion()['diagnostics'] is None;expect(page.locator('#sensitivity-status')).to_contain_text('ยกเลิก')
  page.locator('#sensitivity-run').click();seek(0);assert companion()['diagnostics'] is None
  expect(page.locator('#sensitivity-rows tr')).to_have_count(0);expect(page.locator('#sensitivity-run')).to_be_disabled()
  expect(page.locator('#ack')).to_be_disabled()
  checks.append('Cancel/rewind invalidate old diagnostics and never label a partial run stable')
  page.locator('.import-panel summary').click();load('weak')
  assert companion()['evidence']['status']=='MULTI_STATION_WATCH' and state()['report']['firstSignalAt'] is None
  expect(page.locator('#ack')).to_be_disabled();expect(page.locator('#location-stage')).to_contain_text('ยังระบุ')
  for kind in ['pm','co']:
   load(kind);assert companion()['evidence']['status']=='WATCH' and not state()['report']['currentAnomalousStations']
  load('quiet');assert companion()['evidence']['status']=='NO_WATCH'
  checks.append('Weak multi-station and single-channel watch remain separate from alarms and localization')
  # Same timestamp, different dataset must invalidate a prior diagnostic as well.
  load('base');same_time=state()['report']['asOf'];page.locator('#sensitivity-run').click();load('base-weak');assert state()['report']['asOf']==same_time
  assert companion()['diagnostics'] is None and companion()['running'] is False
  expect(page.locator('#sensitivity-rows tr')).to_have_count(0)
  checks.append('New packet with the same asOf cancels stale diagnostic results')
  page.locator('#nav-principles').click();expect(page.locator('#experimental-models')).to_be_visible()
  page.locator('#model-choice').select_option('v2a');wait();assert state()['algorithm']=='v2a'
  expect(page.locator('#sensitivity-run')).to_be_disabled()
  page.locator('#nav-dashboard').click();page.wait_for_function("WildfireInverseApp.getState().view==='dashboard' && WildfireInverseApp.getState().algorithm==='baseline'");wait();assert state()['algorithm']=='baseline'
  expect(page.locator('#experimental-models')).to_be_hidden();expect(page.locator('[data-truth-pin]')).to_have_count(0)
  checks.append('Experimental selection is lab-only and returning to officer restores baseline on same input')
  page.set_viewport_size({'width':375,'height':812});load('weak')
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
  page.screenshot(path=str(qa/'v12-watch-mobile.jpg'),type='jpeg',quality=75,full_page=True)
  assert not errors,errors
  for message in page.evaluate('workerMessages'):
   assert set(message['packet'])=={'schemaVersion','asOf','domain','stations','observations'}
   assert 'truth' not in json.dumps(message['packet'])
  checks.append('Mobile layout and every worker input preserve observation-only boundary')
  browser.close()
finally:
 result={'status':'PASS' if len(checks)==8 and not errors else 'FAIL','checks':checks,'runtimeErrors':errors,'sourceCommit':os.getenv('GITHUB_SHA','local'),'fieldValidated':False}
 (qa/'v12-browser.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result,ensure_ascii=False,indent=2))
