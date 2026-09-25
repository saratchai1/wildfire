"""Two primary views, shared model/time semantics and officer workflows on actual bundled data."""
import json, os, pathlib
from playwright.sync_api import sync_playwright, expect
qa=pathlib.Path('qa');qa.mkdir(exist_ok=True)
results=[];errors=[]
def record(name,fn):
 fn();results.append({'name':name,'status':'PASS'})
try:
 with sync_playwright() as p:
  browser=p.chromium.launch()
  page=browser.new_page(viewport={'width':1440,'height':1050},accept_downloads=True)
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.route('https://**/*',lambda r:r.abort())
  page.goto('http://127.0.0.1:4173/',wait_until='networkidle')
  page.wait_for_function('window.WildfireConsole')
  def state():return page.evaluate('WildfireConsole.getState()')
  def slider(selector,value):page.locator(selector).evaluate('(e,v)=>{e.value=String(v);e.dispatchEvent(new Event("input",{bubbles:true}));}',value)
  def landing():
   expect(page.locator('.primary-nav a')).to_have_count(2)
   expect(page.locator('#dashboard')).to_be_visible();expect(page.locator('#principles')).to_be_hidden()
   expect(page.locator('#ops-map [data-station]')).to_have_count(9)
   expect(page.locator('#station-table tr')).to_have_count(9)
   assert state()['stationCount']==9 and state()['mode']=='SYNTHETIC_DEMO'
   assert len(state()['snapshot']['alerts'])>=1
   expect(page.locator('#metric-first')).to_contain_text(str(state()['estimate']['firstAlert']['alertMin']))
   page.screenshot(path=str(qa/'console-dashboard-desktop.jpg'),type='jpeg',quality=70,full_page=True)
  record('Two primary views, officer landing, real nine-node map and shared alert KPI',landing)
  def officer():
   page.locator('#ack').click();assert state()['acknowledgedAt']==10
   expect(page.locator('#ack')).to_be_disabled();expect(page.locator('[data-event="ACK"]')).to_have_count(1)
   page.locator('#restart').click();assert state()['minute']==0 and state()['acknowledgedAt'] is None
   expect(page.locator('#metric-first')).to_have_text('ยังไม่แจ้ง');expect(page.locator('#ack')).to_be_disabled()
   expect(page.locator('[data-event="SUSPECT"]')).to_have_count(0)
   page.locator('#jump-alert').click();s=state();assert s['minute']==s['estimate']['firstAlert']['alertMin']
   expect(page.locator('#ack')).to_be_enabled()
   page.locator('#play').click();page.wait_for_function('WildfireConsole.getState().minute > WildfireConsole.getState().estimate.firstAlert.alertMin')
   page.locator('#play').click();assert not state()['playing']
   slider('#ops-minute',60);assert state()['minute']==60
  record('Time-consistent alerts, acknowledgement, rewind, jump and playback',officer)
  def presets():
   for preset in ['normal','dust']:
    page.locator('[data-preset="'+preset+'"]').click();assert len(state()['snapshot']['alerts'])==0
    expect(page.locator('#ack')).to_be_disabled()
   page.locator('[data-preset="offline"]').click();slider('#ops-minute',30)
   page.locator('[data-select="R09"]').click()
   assert len(state()['snapshot']['unknown'])==4
   expect(page.locator('.history-empty')).to_have_count(2)
   assert page.locator('#station-charts [data-series="pm"]').get_attribute('d')==''
   expect(page.locator('#station-values')).to_contain_text('—')
   page.locator('[data-preset="smoke"]').click()
  record('Normal/dust/offline presets, missing telemetry and chart gaps',presets)
  def learn():
   page.locator('#nav-principles').click();expect(page.locator('#principles')).to_be_visible()
   expect(page.locator('#direction-table tr')).to_have_count(8)
   for bearing in [0,45,90,135,180,225,270,315]:
    page.locator('#compass [data-bearing="'+str(bearing)+'"]').click()
    assert state()['windToDeg']==bearing
    row=page.locator('[data-direction-row="'+str(bearing)+'"]')
    assert 'selected' in row.get_attribute('class')
    first=state()['estimate']['firstAlert']
    if first:
     expect(page.locator('#alert-time')).to_contain_text(format(first['alertMin'],'.1f'))
     expect(row).to_contain_text(format(first['alertMin'],'.1f'))
    else:expect(page.locator('#alert-time')).to_contain_text('ยังระบุ')
   page.locator('#compass [data-bearing="90"]').click()
   s=state();assert s['estimate']['firstArrival']['smokeArrivalMin']<s['estimate']['firstAlert']['alertMin']
   expect(page.locator('#toast')).to_be_hidden(timeout=6000)
   page.screenshot(path=str(qa/'console-principles-desktop.jpg'),type='jpeg',quality=70,full_page=True)
  record('Interactive eight-direction table separates smoke transport from concentration alert',learn)
  def shared():
   original=state()['estimate']['firstAlert']['alertMin']
   page.locator('#smoke-delay').select_option('5');assert state()['estimate']['firstAlert']['alertMin']==original+5
   expected=state()['estimate']['firstAlert']['alertMin']
   page.locator('#replay').click();expect(page.locator('#dashboard')).to_be_visible()
   assert state()['minute']==0 and state()['windToDeg']==90 and state()['smokeDelayMin']==5
   page.locator('#jump-alert').click();assert state()['minute']==expected
   expect(page.locator('#metric-first')).to_contain_text(format(expected,'.1f'))
   page.locator('#nav-principles').click();assert state()['windToDeg']==90
  record('Same source wind smoke-onset and alert time replayed in officer view',shared)
  def unknown_and_source():
   slider('#learn-speed',0);assert state()['estimate']['geometryStatus']=='CALM_UNKNOWN'
   expect(page.locator('#arrival-time')).to_contain_text('ลมสงบ')
   page.get_by_text('สมมติฐานและสถานีพร้อมใช้งาน',exact=True).click()
   expect(page.locator('#availability')).to_be_visible()
   page.locator('#availability').select_option('none');assert state()['estimate']['firstAlert'] is None
   expect(page.locator('#alert-time')).to_have_text('ไม่มีสถานีพร้อม')
   page.locator('#availability').select_option('all');slider('#learn-speed',2);page.locator('#smoke-delay').select_option('0')
   page.locator('#learn-source').select_option('near');assert state()['sourceName']=='ใกล้สถานี E3'
   page.locator('#learn-source').select_option('custom')
   previous=state()['source']
   page.locator('#source-lat').fill('0');page.locator('#source-lon').fill('0');page.locator('#apply-source').click()
   assert state()['source']==previous;expect(page.locator('#toast')).to_contain_text('2 กม.')
   page.locator('#learn-source').select_option('center')
  record('Calm and unavailable are not zero; custom source validation retains valid state',unknown_and_source)
  def export_and_routes():
   with page.expect_download() as item:page.locator('#export-comparison').click()
   file=qa/'console-eight-directions.json';item.value.save_as(file);report=json.loads(file.read_text())
   assert len(report['directions'])==8 and report['fieldLatencyVerified'] is False and report['fieldDetectionProbability'] is None
   page.goto('http://127.0.0.1:4173/#principles',wait_until='networkidle')
   expect(page.locator('#principles')).to_be_visible();expect(page.locator('#dashboard')).to_be_hidden()
   page.locator('#nav-dashboard').click();expect(page.locator('#dashboard')).to_be_visible()
   page.go_back();expect(page.locator('#principles')).to_be_visible()
  record('Reproducible JSON export, direct principles URL and browser back navigation',export_and_routes)
  def mobile_and_fallback():
   page.set_viewport_size({'width':375,'height':812})
   assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
   expect(page.locator('#toast')).to_be_hidden(timeout=6000)
   page.screenshot(path=str(qa/'console-principles-mobile.jpg'),type='jpeg',quality=65,full_page=True)
   page.locator('[data-basemap="learn"]').select_option('satellite')
   expect(page.locator('#learn-map .map-error')).to_be_visible();expect(page.locator('#learn-map [data-station]')).to_have_count(9)
   page.locator('#nav-dashboard').click();expect(page.locator('#dashboard')).to_be_visible()
   assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
   page.locator('[data-select="R08"]').click();expect(page.locator('#station-title')).to_have_text('สถานี W3')
   page.screenshot(path=str(qa/'console-dashboard-mobile.jpg'),type='jpeg',quality=65,full_page=True)
   page.locator('#ops-map [data-station="R03"]').focus();page.keyboard.press('Enter')
   expect(page.locator('#station-title')).to_have_text('สถานี E3')
   assert not errors,errors
  record('375px mobile, keyboard station selection and failed imagery fallback',mobile_and_fallback)
  browser.close()
except Exception as error:
 results.append({'name':'Two-part browser failure','status':'FAIL','error':str(error)})
 raise
finally:
 report={'status':'PASS' if len(results)==8 and all(r['status']=='PASS' for r in results) and not errors else 'FAIL','source_commit':os.getenv('GITHUB_SHA','local'),'appVersion':'operator-explainer-v3','tests':results,'runtime_errors':errors,'fieldCommissioning':'NOT_PERFORMED','externalBasemaps':'blocked intentionally'}
 (qa/'console-latest.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
 print(json.dumps(report,ensure_ascii=False,indent=2))
