"""N1 workflow proof on both primary views and planning; images deliberately offline."""
import json, os, pathlib
from playwright.sync_api import sync_playwright, expect
qa=pathlib.Path('qa');qa.mkdir(exist_ok=True)
errors=[];checks=[]
try:
 with sync_playwright() as p:
  browser=p.chromium.launch()
  page=browser.new_page(viewport={'width':1440,'height':1050},accept_downloads=True)
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.route('https://**/*',lambda r:r.abort())
  page.goto('http://127.0.0.1:4173/',wait_until='networkidle')
  def state():return page.evaluate('WildfireConsole.getState()')
  expect(page.locator('#station-table tr')).to_have_count(10)
  expect(page.locator('#ops-map [data-station]')).to_have_count(10)
  page.locator('[data-select="R10"]').click()
  expect(page.locator('#station-title')).to_have_text('สถานี N1')
  expect(page.locator('#station-note')).to_contain_text('18.831556, 98.860694')
  page.locator('[data-preset="north"]').click()
  assert state()['selected']=='R10'
  assert state()['estimate']['firstArrival']['id']=='R10'
  assert state()['estimate']['firstAlert'] is None
  expect(page.locator('#jump-alert')).to_be_disabled()
  checks.append('10 pins and N1 selection; center smoke arrival is not a fabricated alert')
  page.locator('#nav-principles').click()
  expect(page.locator('#learn-map [data-station]')).to_have_count(10)
  expect(page.locator('#arrival-station')).to_contain_text('N1')
  expect(page.locator('#arrival-time')).to_contain_text('16.7')
  page.locator('#learn-source').select_option('north')
  assert state()['estimate']['firstAlert']['id']=='R10'
  assert state()['estimate']['firstAlert']['alertMin']==10
  expect(page.locator('#alert-time')).to_contain_text('10.0')
  expect(page.locator('[data-direction-row="0"]')).to_contain_text('N1')
  page.screenshot(path=str(qa/'north-principles-desktop.jpg'),type='jpeg',quality=70,full_page=True)
  page.locator('#replay').click();page.locator('#jump-alert').click()
  expect(page.locator('#station-title')).to_have_text('สถานี N1')
  assert state()['minute']==10 and any(r['id']=='R10' for r in state()['snapshot']['alerts'])
  page.locator('#ack').click();expect(page.locator('#ack')).to_be_disabled()
  page.screenshot(path=str(qa/'north-dashboard-desktop.jpg'),type='jpeg',quality=70,full_page=True)
  checks.append('north-area input and wind share N1 10-minute alert, replay and acknowledgement')
  page.locator('#nav-principles').click()
  page.get_by_text('สมมติฐานและสถานีพร้อมใช้งาน',exact=True).click()
  page.locator('#availability').select_option('north')
  assert state()['snapshot']['online']==1 and len(state()['snapshot']['unknown'])==9
  page.locator('#availability').select_option('none')
  assert len(state()['snapshot']['unknown'])==10 and state()['estimate']['firstAlert'] is None
  page.locator('#availability').select_option('all')
  page.set_viewport_size({'width':375,'height':812})
  assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+1')
  expect(page.locator('#learn-map [data-station="R10"]')).to_be_visible()
  page.screenshot(path=str(qa/'north-principles-mobile.jpg'),type='jpeg',quality=65,full_page=True)
  checks.append('north-only/none remain explicit; N1 and layout work at 375px')
  page.set_viewport_size({'width':1440,'height':1050})
  page.goto('http://127.0.0.1:4173/planning.html',wait_until='networkidle')
  expect(page.locator('[data-select]')).to_have_count(10)
  page.locator('[data-side="N"]').click();expect(page.locator('[data-select]')).to_have_count(1)
  page.locator('[data-select="R10"]').click()
  expect(page.locator('.detail-subtitle')).to_contain_text('เหนือ')
  expect(page.locator('.field-note')).to_contain_text('พิกัดจากผู้ใช้โดยตรง')
  expect(page.locator('#details')).to_contain_text('รอทดสอบสัญญาณ')
  page.locator('[data-view="power"]').click()
  expect(page.locator('#energy-summary')).to_contain_text('10 / 10')
  expect(page.locator('#power-table tr')).to_have_count(10)
  page.locator('[data-view="plan"]').click()
  page.locator('#export-format').select_option('geojson')
  with page.expect_download() as item:page.locator('#export').click()
  file=qa/'north-stations.geojson';item.value.save_as(file);data=json.loads(file.read_text())
  assert len(data['features'])==10
  n=next(f for f in data['features'] if f['properties']['id']=='R10')
  assert abs(n['geometry']['coordinates'][0]-(98+51/60+38.5/3600))<1e-9
  assert n['properties']['osm_way_id'] is None and n['properties']['coordinate_source']=='USER_DMS'
  checks.append('planning north filter, unverified road/radio, energy and exact-coordinate export')
  assert not errors,errors
  browser.close()
finally:
 report={'status':'PASS' if len(checks)==4 and not errors else 'FAIL','sourceCommit':os.getenv('GITHUB_SHA','local'),'checks':checks,'runtimeErrors':errors,'fieldLatencyVerified':False,'fieldCommissioning':'NOT_PERFORMED'}
 (qa/'north-latest.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
 print(json.dumps(report,ensure_ascii=False,indent=2))
