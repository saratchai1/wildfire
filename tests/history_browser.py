"""Preserved v1 evidence/history regression on the real static build."""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1440, "height": 1000})
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.route("**/*", lambda route: route.continue_() if route.request.url.startswith("http://localhost:4173/") else route.abort())
    page.goto("http://localhost:4173/v1.html", wait_until="networkidle")
    assert page.locator('.telemetry-history').count() == 0
    page.locator('[data-view="demo"]').click()
    page.locator('#source').select_option('R03')
    page.locator('[data-select="R03"]').click()
    history = page.locator('.telemetry-history[data-station="R03"]')
    expect(history).to_be_visible()
    expect(history.locator('[data-event="SUSPECT"]')).to_have_count(1)
    assert history.locator('[data-series="pm"]').get_attribute('d').strip()
    assert history.locator('[data-series="co"]').get_attribute('d').strip()
    page.locator('#acknowledge').click()
    expect(page.locator('.history-ack')).to_have_count(1)
    Path('qa').mkdir(exist_ok=True)
    page.screenshot(path='qa/history-desktop.png', full_page=True)
    page.locator('#scenario').select_option('offline')
    page.locator('[data-select="R05"]').click()
    history = page.locator('.telemetry-history[data-station="R05"]')
    expect(history).to_be_visible()
    expect(history.locator('.history-empty')).to_have_count(2)
    assert history.locator('[data-series="pm"]').get_attribute('d') == ''
    expect(history.locator('[data-event="STALE"]')).to_have_count(1)
    expect(page.locator('.history-ack')).to_have_count(0)
    page.locator('#scenario').select_option('dust')
    expect(page.locator('[data-event="DUST"]')).to_have_count(1)
    expect(page.locator('[data-event="SUSPECT"]')).to_have_count(0)
    page.locator('#restart').click()
    expect(page.locator('[data-event="DUST"]')).to_have_count(0)
    expect(page.locator('[data-event="START"]')).to_have_count(1)
    page.locator('[data-view="plan"]').click()
    expect(page.locator('.telemetry-history')).to_have_count(0)
    page.set_viewport_size({"width": 390, "height": 844})
    page.locator('[data-view="demo"]').click()
    expect(page.locator('.telemetry-history')).to_be_visible()
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
    page.screenshot(path='qa/history-mobile.png', full_page=True)
    assert errors == [], errors
    browser.close()

summary_path = Path('qa/latest.json')
summary = json.loads(summary_path.read_text()) if summary_path.exists() else {"status": "PASS", "tests": [], "runtime_errors": []}
summary['history_source_commit'] = os.environ.get('GITHUB_SHA', 'local')
summary['tests'].append({"name": "Preserved v1 PM/CO history, chronological network events, stale gaps, acknowledgement, restart and mobile layout", "status": "PASS"})
summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf8')
print('PASS: preserved v1 browser history and timeline; zero runtime errors.')
