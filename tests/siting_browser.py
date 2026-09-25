"""Browser evidence for preserved v2 planning UI, in addition to v1 and the two-part console."""
import json,os,pathlib
from playwright.sync_api import sync_playwright,expect
results=[];errors=[];qa=pathlib.Path('qa');qa.mkdir(exist_ok=True)
def record(name,fn):fn();results.append({'name':name,'status':'PASS'})
try:
 with sync_playwright() as p:
  browser=p.chromium.launch();page=browser.new_page(viewport={'width':1440,'height':1100},accept_downloads=True)
  page.on('pageerror',lambda e:errors.append(str(e)));page.route('https://**/*',lambda r:r.abort())
  page.goto('http://127.0.0.1:4173/planning.html',wait_until='networkidle')
  page.wait_for_function('window.WildfireScreening && document.querySelectorAll("[data-map-node]").length === 9')
  def set_range(selector,value):
   page.locator(selector).evaluate('(element,value)=>{element.value=String(value);element.dispatchEvent(new Event("input",{bubbles:true}));}',value)
  def plan():
   expect(page.locator('[data-select]')).to_have_count(9)
   expect(page.locator('#study-area-layer path')).to_have_count(1)
   page.locator('[data-select="R03"]').click();expect(page.locator('.coordinates')).to_contain_text('18.8097818, 98.8656835')
   expect(page.locator('.field-note')).to_contain_text('motor_vehicle=private')
   expect(page.locator('.metrics')).to_contain_text('860')
   page.locator('[data-view="power"]').click();expect(page.locator('#energy-summary')).to_contain_text('9 / 9')
   page.locator('[data-view="plan"]').click()
  record('Nine nearer road anchors, mapped study circle, restricted access and revised power budgets',plan)
  page.screenshot(path=str(qa/'v2-plan-desktop.jpg'),type='jpeg',quality=65,full_page=True)
  def analysis():
   page.locator('[data-view="analysis"]').click()
   expect(page.locator('#analysis-controls')).to_be_visible();expect(page.locator('#analysis-results')).to_be_visible()
   assert page.evaluate('WildfireScreening.getState().summary.total')==3152
   expect(page.locator('#analysis-results')).to_contain_text('197')
   page.locator('#screen-source').select_option('near')
   assert page.evaluate('WildfireScreening.getState().result.first.id')=='R03'
   assert page.evaluate('WildfireScreening.getState().result.first.minutes')<3
   page.locator('#screen-source').select_option('center')
   page.locator('#screen-wind').focus();page.keyboard.press('Home')
   assert page.evaluate('WildfireScreening.getState().result.status')=='NO_INTERCEPTION'
   page.locator('#screen-speed').focus();page.keyboard.press('Home')
   assert page.evaluate('WildfireScreening.getState().result.status')=='CALM_UNKNOWN'
   assert page.evaluate('WildfireScreening.getState().summary.unknown')==3152
   page.locator('#screen-availability').select_option('none')
   assert page.evaluate('WildfireScreening.getState().result.status')=='NO_ACTIVE_STATIONS'
   page.locator('#screen-availability').select_option('all')
   set_range('#screen-speed',2);set_range('#screen-wind',90)
   page.locator('[data-screen-bearing="270"]').click();assert page.evaluate('WildfireScreening.getState().settings.windToDeg')==270
   page.locator('#screen-grid').uncheck();expect(page.locator('#study-area-layer circle')).to_have_count(1)
   page.locator('#screen-grid').check()
  record('Full-domain deterministic screening, nearby case, northern miss, calm, unavailable, wind controls and overlay',analysis)
  page.screenshot(path=str(qa/'v2-screening-desktop.jpg'),type='jpeg',quality=60,full_page=True)
  def exports():
   for kind in ['geojson','kml','csv']:
    page.locator('#export-format').select_option(kind)
    with page.expect_download() as dl:page.locator('#export').click()
    file=qa/('v2-stations.'+kind);dl.value.save_as(file);text=file.read_text(encoding='utf-8-sig')
    if kind=='geojson':
     data=json.loads(text);assert len(data['features'])==9;assert data['features'][0]['geometry']['coordinates']==[98.8712384,18.8189027];assert data['features'][0]['properties']['motor_vehicle']=='private'
    elif kind=='kml':assert text.count('<Placemark>')==9
    else:assert len(text.strip().splitlines())==10
   with page.expect_download() as dl:page.locator('#screen-export').click()
   file=qa/'v2-screening-export.json';dl.value.save_as(file);r=json.loads(file.read_text());assert r['summary']['total']==3152;assert r['fieldDetectionProbability'] is None;assert r['fieldLatencyVerified'] is False
  record('Nine-coordinate GIS exports and complete reproducible screening export',exports)
  def demo():
   page.locator('[data-view="demo"]').click();page.locator('#source').select_option('R03');page.locator('[data-select="R03"]').click()
   expect(page.locator('.detail-alert')).to_contain_text('ยังไม่ยืนยันไฟ')
   expect(page.locator('#acknowledge')).to_be_visible();page.locator('#acknowledge').click();expect(page.locator('#acknowledge')).to_be_disabled()
   history=page.locator('.telemetry-history[data-station="R03"]');expect(history).to_be_visible()
   assert history.locator('[data-series="pm"]').get_attribute('d').strip()
   assert history.locator('[data-series="co"]').get_attribute('d').strip()
   page.locator('#scenario').select_option('offline');page.locator('[data-select="R09"]').click()
   expect(page.locator('.data-values')).to_contain_text('—');expect(page.locator('#demo-summary')).to_contain_text('ขาดข้อมูล 4 จุด')
   expect(page.locator('.telemetry-history[data-station="R09"] .history-empty')).to_have_count(2)
   page.locator('[data-view="plan"]').click();assert page.locator('.data-values').count()==0
  record('Original-style PM CO timeline and offline handling preserved with new station positions',demo)
  def mobile():
   page.set_viewport_size({'width':375,'height':812});page.locator('[data-view="analysis"]').click()
   assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth+2')
   expect(page.locator('#screen-source')).to_be_visible();page.locator('#screen-source').select_option('north')
   page.screenshot(path=str(qa/'v2-screening-mobile.jpg'),type='jpeg',quality=60,full_page=True)
   page.locator('[data-view="plan"]').click();page.locator('#basemap').select_option('satellite')
   expect(page.locator('#tile-error')).to_be_visible();expect(page.locator('[data-map-node]')).to_have_count(9)
  record('Mobile analysis layout and unavailable online imagery retain actual roads and all station markers',mobile)
  assert not errors,errors
  browser.close()
except Exception as exc:
 results.append({'name':'V2 browser failure','status':'FAIL','error':str(exc)});raise
finally:
 report={'status':'PASS' if len(results)==5 and all(r['status']=='PASS' for r in results) and not errors else 'FAIL','source_commit':os.getenv('GITHUB_SHA','local'),'tests':results,'runtime_errors':errors,'fieldCommissioning':'NOT_PERFORMED'}
 (qa/'v2-latest.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False,indent=2))
