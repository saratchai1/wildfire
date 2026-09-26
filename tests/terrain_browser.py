"""V2B HTTP/Worker proof in CI; opt-in local DOM/Blob mode records its narrower scope."""
import json,os,pathlib,re
from playwright.sync_api import sync_playwright,expect
qa=pathlib.Path('qa');qa.mkdir(exist_ok=True);checks=[];errors=[];dom=os.getenv('LOCAL_DOM_PROOF')=='1'
try:
 with sync_playwright() as pw:
  options={}
  if os.getenv('PW_CHROMIUM_EXECUTABLE'):options={'executable_path':os.getenv('PW_CHROMIUM_EXECUTABLE'),'args':['--no-sandbox']}
  browser=pw.chromium.launch(**options);page=browser.new_page(viewport={'width':1440,'height':1050},accept_downloads=True)
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.route('https://**/*',lambda r:r.abort())
  spy='(()=>{window.sentPackets=[];const send=Worker.prototype.postMessage;Worker.prototype.postMessage=function(x){sentPackets.push(JSON.parse(JSON.stringify(x)));return send.call(this,x);};})()'
  if dom:
   site=pathlib.Path('site');html=(site/'terrain.html').read_text();worker='\n'.join((site/f).read_text() for f in ['inverse-engine.js','terrain-physics.js','terrain-inverse.js'])+'\n'+re.sub(r"importScripts\([^;]+;",'',(site/'terrain-worker.js').read_text())
   page.evaluate('(code)=>{const Native=Worker;const url=URL.createObjectURL(new Blob([code],{type:"text/javascript"}));window.Worker=class extends Native{constructor(path){if(path!=="./terrain-worker.js")throw Error("unexpected worker");super(url);}};}',worker)
   page.evaluate(spy)
   html=re.sub(r'<link rel="stylesheet" href="\./([^\"]+)">',lambda m:'<style>'+(site/m[1]).read_text()+'</style>',html)
   html=re.sub(r'<script src="\./([^\"]+)"></script>',lambda m:'<script>'+(site/m[1]).read_text().replace('</script','<\\/script')+'</script>',html)
   page.set_content(html,wait_until='load')
  else:
   page.add_init_script(spy);page.goto('http://127.0.0.1:4173/terrain.html',wait_until='networkidle')
  def state():return page.evaluate('WildfireTerrainLab.getState()')
  def wait():page.wait_for_function('window.WildfireTerrainLab&&!WildfireTerrainLab.getState().busy&&WildfireTerrainLab.getState().report',timeout=90000)
  wait();assert state()['report']['modelVersion']=='terrain-inverse-v2b.0'
  assert state()['baseline']['modelVersion']=='inverse-footprint-v1.1-evidence'
  expect(page.locator('[data-station]')).to_have_count(10)
  expect(page.locator('[data-truth-pin]')).to_have_count(0)
  assert state()['field']['relativeResidual'][0]<=1e-7
  expect(page.locator('#terrain-results')).to_contain_text('V1.1')
  expect(page.locator('#terrain-results')).to_contain_text('V2B')
  checks.append('Observed-only worker returns both models and ten pins; discrete wind solver converges')
  page.screenshot(path=str(qa/'terrain-desktop.jpg'),type='jpeg',quality=75,full_page=True)
  page.locator('#reveal-source').click();expect(page.locator('[data-truth-pin]')).to_have_count(1)
  page.locator('#reveal-source').click();expect(page.locator('[data-truth-pin]')).to_have_count(0)
  page.locator('[data-station="R10"]').focus();page.keyboard.press('Enter');expect(page.locator('#station-detail')).to_contain_text('N1')
  with page.expect_download() as item:page.locator('#export-terrain').click()
  dest=qa/'terrain-browser-export.json';item.value.save_as(dest);export=json.loads(dest.read_text());assert export['fieldValidated'] is False
  assert 'truth' not in export and export['report']['probability'] is None
  checks.append('Lab reveal, N1 keyboard selection and truth-free output export')
  packet=page.evaluate('WildfireSimulator.generate(WILDFIRE_PLAN).packetAt(25)')
  bad=json.loads(json.dumps(packet));bad['domain']['center']['lon']+=.001
  before=state()['requestId'];page.locator('#observations-file').set_input_files({'name':'bad-domain.json','mimeType':'application/json','buffer':json.dumps(bad).encode()})
  expect(page.locator('#work-error')).to_contain_text('ไม่นำเข้า');assert state()['requestId']==before
  assert not state()['imported']
  page.locator('#observations-file').set_input_files({'name':'observations.json','mimeType':'application/json','buffer':json.dumps(packet).encode()})
  page.wait_for_function('(n)=>WildfireTerrainLab.getState().requestId>n&&!WildfireTerrainLab.getState().busy',arg=before,timeout=90000)
  assert state()['imported'];expect(page.locator('#reveal-source')).to_be_disabled()
  expect(page.locator('#packet-kind')).to_contain_text('ไม่ใช่ Live')
  expect(page.locator('[data-truth-pin]')).to_have_count(0)
  checks.append('Atomic fixed-domain observation import and no reveal of imported data')
  page.locator('#reset-demo').click();wait();page.locator('#time-input').fill('20');page.locator('#run-terrain').click();page.locator('#time-input').fill('30');page.locator('#run-terrain').click();wait()
  assert state()['report']['asOf']=='2026-03-15T06:30:15.000Z'
  checks.append('Cancelled older requests cannot overwrite the newest assessment')
  page.locator('[data-tab="plume"]').click()
  expect(page.locator('#plume-table tr')).to_have_count(5)
  expect(page.locator('[data-height-curve]')).to_have_count(1)
  page.screenshot(path=str(qa/'plume-desktop.jpg'),type='jpeg',quality=75,full_page=True)
  page.locator('#plume-speed').fill('0');page.locator('#update-plume').click()
  expect(page.locator('#plume-notice')).to_contain_text('อยู่นอกขอบเขต')
  expect(page.locator('[data-height-curve]')).to_have_count(0)
  page.locator('#plume-speed').fill('2');page.locator('#update-plume').click()
  expect(page.locator('#plume-table tr')).to_have_count(5)
  checks.append('Plume height/factor curves are computed; calm is unknown, not zero height')
  page.locator('[data-tab="calibration"]').click();page.locator('#demo-calibration').click()
  expect(page.locator('#calibration-results')).to_contain_text('ไม่ใช่ผลภาคสนาม')
  assert state()['calibration']['sourceKind']=='SYNTHETIC_TEST'
  with page.expect_download() as item:page.locator('#export-calibration').click()
  dest=qa/'calibration-browser-export.json';item.value.save_as(dest);profile=json.loads(dest.read_text())
  assert profile['fieldValidated'] is False and profile['usableForLive'] is False
  assert profile['stations'][0]['validationCount']==36
  page.screenshot(path=str(qa/'calibration-desktop.jpg'),type='jpeg',quality=75,full_page=True)
  badcal=page.evaluate('WildfireCalibration.example()');badcal['units']['co']='ppb'
  page.locator('#calibration-file').set_input_files({'name':'bad-units.json','mimeType':'application/json','buffer':json.dumps(badcal).encode()})
  expect(page.locator('#calibration-error')).to_contain_text('UNITS')
  assert state()['calibration']==profile
  checks.append('Chronological candidate calibration export; synthetic flag and atomic rejection preserved')
  with page.expect_download() as item:page.locator('#template-calibration').click()
  dest=qa/'collocation-template.json';item.value.save_as(dest);template=json.loads(dest.read_text())
  assert template['rows']==[] and template['sourceKind']=='FIELD_COLLOCATION_UPLOAD'
  page.set_viewport_size({'width':375,'height':812})
  for tab in ['wind','plume','calibration']:
   page.locator('[data-tab="'+tab+'"]').click()
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),tab
  page.screenshot(path=str(qa/'calibration-mobile.jpg'),type='jpeg',quality=70,full_page=True)
  checks.append('Empty field template and all three tabs fit a 375px mobile screen')
  payloads=page.evaluate('sentPackets');assert len(payloads)>=4
  for payload in payloads:
   assert set(payload)==set(['id','packet','terrain','options'])
   assert set(payload['packet'])==set(['schemaVersion','asOf','domain','stations','observations'])
   assert 'truth' not in json.dumps(payload['packet'])
  assert not errors,errors;checks.append('Actual worker message capture excludes hidden source; no runtime errors')
  browser.close()
finally:
 report={'status':'PASS' if len(checks)==8 and not errors else 'FAIL','sourceCommit':os.getenv('GITHUB_SHA','local'),'checks':checks,'runtimeErrors':errors,'mode':'DOM_BLOB_WORKER_NOT_HTTP' if dom else 'HTTP_REAL_WORKER','fieldValidated':False}
 (qa/'terrain-browser.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False,indent=2))
