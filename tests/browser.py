"""Browser proof against the actual bundled OSM/DEM snapshot, with optional basemaps blocked."""
import base64, json, os, pathlib, xml.etree.ElementTree as ET
from playwright.sync_api import sync_playwright, expect

OUT=pathlib.Path('artifacts');OUT.mkdir(exist_ok=True)
QA=pathlib.Path('qa');QA.mkdir(exist_ok=True)
results=[];errors=[]

def record(name, fn):
    fn();results.append({'name':name,'status':'PASS'})

def run():
    with sync_playwright() as p:
        browser=p.chromium.launch()
        page=browser.new_page(viewport={'width':1440,'height':1100},device_scale_factor=1,accept_downloads=True)
        page.on('pageerror',lambda error:errors.append(str(error)))
        # Proves core app works offline; optional basemap failure must remain visible and recoverable.
        page.route('https://**/*',lambda route:route.abort())
        page.goto('http://127.0.0.1:4173/v1.html',wait_until='networkidle')
        expect(page.locator('[data-select]')).to_have_count(8)
        page.wait_for_function('window.WildfireApp && document.querySelectorAll("[data-map-node]").length === 8')
        def station_workflow():
            assert page.evaluate('WildfireApp.getState().mode')=='PROPOSED_PLAN'
            page.locator('[data-select="R05"]').click()
            expect(page.locator('.detail-id')).to_have_text('R05')
            expect(page.locator('.coordinates')).to_contain_text('18.8101230, 98.8481055')
            expect(page.locator('.detail-status')).to_contain_text('มีเงื่อนไข')
            page.locator('[data-map-node="R02"]').click()
            expect(page.locator('.detail-id')).to_have_text('R02')
            z=page.evaluate('WildfireApp.getState().mapZoom')
            page.locator('#zoom-in').click()
            assert page.evaluate('WildfireApp.getState().mapZoom')>z
            page.locator('#fit').click()
            page.locator('[data-side="W"]').click()
            expect(page.locator('[data-select]')).to_have_count(4)
            page.locator('[data-side="all"]').click()
            expect(page.locator('[data-select]')).to_have_count(8)
            page.locator('[data-select="R01"]').click()
        record('Desktop list/map selection, survey status, zoom and side filtering',station_workflow)
        page.screenshot(path=str(OUT/'desktop.png'),full_page=True)
        page.screenshot(path=str(QA/'desktop-preview.jpg'),type='jpeg',quality=48,full_page=True)
        def exports():
            for kind in ['geojson','kml','csv']:
                page.locator('#export-format').select_option(kind)
                with page.expect_download() as item:page.locator('#export').click()
                destination=OUT/('stations.'+kind);item.value.save_as(destination)
                text=destination.read_text(encoding='utf-8-sig')
                if kind=='geojson':
                    data=json.loads(text);assert len(data['features'])==8
                    assert data['features'][0]['geometry']['coordinates']==[98.8909221,18.8166609]
                elif kind=='kml':assert len(ET.fromstring(text).findall('.//{http://www.opengis.net/kml/2.2}Placemark'))==8
                else:assert len(text.strip().splitlines())==9
        record('GeoJSON KML and CSV downloads preserve eight real coordinates',exports)
        def smoke_and_guardrails():
            page.locator('[data-view="demo"]').click()
            expect(page.locator('#mode-pill')).to_contain_text('ข้อมูลสังเคราะห์')
            page.locator('#source').select_option('R03')
            page.locator('[data-select="R03"]').click()
            expect(page.locator('.detail-alert')).to_contain_text('ยังไม่ยืนยันไฟ')
            page.locator('#acknowledge').click()
            expect(page.locator('#acknowledge')).to_be_disabled()
            page.locator('#scenario').select_option('dust')
            expect(page.locator('#demo-summary')).to_contain_text('ผิดปกติ 0 จุด')
            page.locator('#scenario').select_option('offline')
            page.locator('#minute').focus();page.keyboard.press('End')
            expect(page.locator('#demo-summary')).to_contain_text('ขาดข้อมูล 4 จุด')
            page.locator('[data-select="R05"]').click()
            expect(page.locator('.detail-alert')).to_contain_text('ไม่ใช่พื้นที่ปลอดภัย')
            assert page.locator('.data-values strong').all_text_contents()==['—','—']
            page.locator('#scenario').select_option('smoke')
            page.locator('#source').select_option('target')
            page.locator('#wind').focus();page.keyboard.press('Home')
            expect(page.locator('#wind-label')).to_contain_text('0° · เหนือ')
            page.locator('#restart').click()
            expect(page.locator('#minute-label')).to_have_text('0 นาที')
            page.locator('#play').click()
            page.wait_for_function('WildfireApp.getState().minute >= 1')
            page.locator('#play').click()
            page.locator('[data-view="plan"]').click()
            expect(page.locator('#mode-pill')).to_contain_text('ยังไม่ติดตั้ง')
            assert page.locator('.data-values').count()==0
        record('Synthetic smoke acknowledgement dust/offline guardrails wind and playback',smoke_and_guardrails)
        def energy():
            page.locator('[data-view="power"]').click()
            expect(page.locator('#energy-summary')).to_contain_text('8 / 8')
            page.locator('#psh').focus();page.keyboard.press('Home')
            expect(page.locator('#energy-summary')).to_contain_text('0 / 8')
            expect(page.locator('#power-table')).to_contain_text('PV ไม่พอ')
            page.locator('#load').focus();page.keyboard.press('End')
            expect(page.locator('#power-table')).to_contain_text('สำรอง ไม่พอ')
            page.screenshot(path=str(OUT/'energy-deficit.png'),full_page=True)
            page.locator('[data-view="plan"]').click()
        record('Zero-sun generation deficit and increased-load autonomy failures are visible',energy)
        def basemap_fallback():
            page.locator('#basemap').select_option('satellite')
            expect(page.locator('#tile-error')).to_be_visible()
            expect(page.locator('[data-map-node]')).to_have_count(8)
            page.locator('[data-select="R06"]').click()
            expect(page.locator('.detail-id')).to_have_text('R06')
            page.locator('#basemap').select_option('terrain')
            expect(page.locator('#tile-error')).to_be_hidden()
        record('Blocked external imagery retains offline terrain roads and station interaction',basemap_fallback)
        def mobile():
            page.set_viewport_size({'width':375,'height':812})
            page.locator('[data-select="R08"]').click()
            expect(page.locator('.detail-id')).to_have_text('R08')
            assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 2')
            page.locator('[data-view="power"]').click()
            expect(page.locator('#power-table tr')).to_have_count(8)
            page.locator('[data-view="plan"]').click()
            page.evaluate('window.scrollTo(0,0)')
            page.screenshot(path=str(OUT/'mobile.png'),full_page=True)
            page.screenshot(path=str(QA/'mobile-preview.jpg'),type='jpeg',quality=42,full_page=True)
        record('Mobile selection layout and energy table remain usable without page overflow',mobile)
        assert not errors,errors
        browser.close()

try:
    run()
except Exception as exc:
    results.append({'name':'Browser test failure','status':'FAIL','error':str(exc)})
    raise
finally:
    report={'status':'PASS' if len(results)==6 and not errors and all(r['status']=='PASS' for r in results) else 'FAIL','source_commit':os.getenv('GITHUB_SHA','local'),'browser':'Chromium via Playwright','external_basemaps':'blocked deliberately; offline fallback tested','tests':results,'runtime_errors':errors,'field_commissioning':'NOT_PERFORMED'}
    (QA/'latest.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
    (OUT/'browser-proof.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
    print(json.dumps(report,ensure_ascii=False,indent=2))
