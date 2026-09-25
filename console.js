/* Two primary views, one shared synthetic scene. No network telemetry or dispatch. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id), P = window.WILDFIRE_PLAN, X = window.WILDFIRE_CONTEXT, C = window.WildfireCore, M = window.WildfireConsoleModel;
  if (!P || !X?.roads?.features?.length || !M || !window.WildfireMapView) { $('fatal').hidden = false; $('fatal').textContent = 'โหลดข้อมูลแผนที่หรือโมเดลไม่ครบ กรุณาโหลดหน้าใหม่ ไม่มีการสร้างค่าหรือพิกัดทดแทน'; $('dashboard').hidden = true; return; }
  let state = M.initial(P), estimate = M.prediction(P, state), comparisons = M.comparison(P, state), showSpread = false;
  const names = new Map(P.stations.map(s => [s.id, s.screenLabel]));
  const fmt = (v, n = 1) => typeof v === 'number' && Number.isFinite(v) ? v.toFixed(n) : '—';
  const time = minute => { const seconds = Math.round(minute * 60); return 'T+' + String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0'); };
  const esc = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const direction = bearing => M.directions[Math.round(bearing / 45) % 8].name;
  const statusName = s => ({ SUSPECT: 'ให้ตรวจสอบ', PENDING: 'กำลังประเมิน', UNKNOWN: 'ไม่มีข้อมูล', NO_ANOMALY: 'ยังไม่ถึงเกณฑ์' })[s];
  function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toast.timer); toast.timer = setTimeout(() => { $('toast').hidden = true; }, 4500); }
  function recalculate() { estimate = M.prediction(P, state); comparisons = M.comparison(P, state); }
  function update(patch) { try { state = M.change(P, state, patch); recalculate(); render(); } catch (error) { toast(error.message); syncControls(); } }
  function chooseStation(id) { if (!names.has(id)) return; state = { ...state, selected: id }; render(); }
  function chooseSource(point) { update({ source: point, sourceName: 'พิกัดที่กำหนดเอง' }); }
  const maps = {
    ops: new window.WildfireMapView('ops-map', P, X, chooseStation, chooseSource),
    learn: new window.WildfireMapView('learn-map', P, X, chooseStation, chooseSource)
  };
  const compassLayout = [315, 0, 45, 270, null, 90, 225, 180, 135];
  $('compass').innerHTML = compassLayout.map(b => b === null ? '<span class="compass-center" aria-hidden="true">↗</span>' : '<button type="button" data-bearing="' + b + '" aria-pressed="false" aria-label="ลมพัดไป' + direction(b) + '">' + ({ 0: 'เหนือ', 45: 'อีสาน', 90: 'ตะวันออก', 135: 'อาคเนย์', 180: 'ใต้', 225: 'หรดี', 270: 'ตะวันตก', 315: 'พายัพ' })[b] + '</button>').join('');
  function syncControls() {
    for (const input of document.querySelectorAll('[data-key]')) if (document.activeElement !== input) input.value = state[input.dataset.key];
    $('ops-minute').value = state.minute;
    const choice = state.sourceName === 'หมุดกลางภูเขา' ? 'center' : state.sourceName === 'ใกล้สถานี E3' ? 'near' : state.sourceName === 'ตอนเหนือของพื้นที่' ? 'north' : state.sourceName === 'ตอนใต้ของพื้นที่' ? 'south' : 'custom';
    $('learn-source').value = choice; $('source-lat').value = state.source.lat.toFixed(6); $('source-lon').value = state.source.lon.toFixed(6);
    $('learn-coordinates').textContent = state.source.lat.toFixed(6) + ', ' + state.source.lon.toFixed(6);
    $('learn-direction').textContent = state.windSpeedMps ? direction(state.windToDeg) : 'ลมสงบ'; $('learn-bearing-label').textContent = state.windToDeg + '°'; $('learn-speed-label').textContent = fmt(state.windSpeedMps) + ' m/s';
    document.querySelectorAll('[data-bearing]').forEach(button => { const active = Number(button.dataset.bearing) === state.windToDeg; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
    $('compass').querySelector('.compass-center').style.transform = 'rotate(' + (state.windToDeg - 45) + 'deg)';
    for (const button of document.querySelectorAll('[data-preset]')) button.classList.toggle('active', state.scenario === button.dataset.preset && (state.scenario !== 'smoke' || state.windToDeg === 135) || button.dataset.preset === 'north' && state.scenario === 'smoke' && state.windToDeg === 0);
  }
  function chart(series, key, label, unit, threshold) {
    const valid = series.filter(r => r[key] !== null), max = Math.max(threshold * 1.2, ...valid.map(r => r[key] * 1.12)), start = series[0].minute, end = Math.max(start + 0.5, series.at(-1).minute);
    const px = t => 32 + (t - start) / (end - start) * 246, py = v => 62 - v / max * 49;
    let d = '', connected = false; for (const r of series) { if (r[key] === null) { connected = false; continue; } d += (connected ? 'L' : 'M') + px(r.minute).toFixed(2) + ' ' + py(r[key]).toFixed(2) + ' '; connected = true; }
    return '<div class="chart-block"><div class="chart-head"><b>' + label + '</b><span>' + unit + ' · จำลอง</span></div><svg class="history-chart" viewBox="0 0 296 86" role="img" aria-label="กราฟ ' + label + ' ย้อนหลัง 10 นาที"><path d="M32 13H278 M32 62H278" stroke="#e0e6dc" fill="none"/><path d="M32 ' + py(threshold) + 'H278" stroke="#b39353" stroke-dasharray="3 3" fill="none"/><text x="28" y="17" text-anchor="end">' + fmt(max, key === 'co' ? 1 : 0) + '</text><text x="28" y="66" text-anchor="end">0</text><path data-series="' + key + '" d="' + d + '" stroke="' + (key === 'pm' ? '#a77536' : '#4f8173') + '" stroke-width="2" fill="none"/><text x="32" y="79">' + time(start) + '</text><text x="278" y="79" text-anchor="end">' + time(series.at(-1).minute) + '</text>' + (valid.length ? '' : '<text class="history-empty" x="153" y="40" text-anchor="middle">ไม่มีข้อมูลในช่วงนี้</text>') + '</svg></div>';
  }
  function renderDashboard(snap) {
    $('ops-clock').textContent = time(state.minute); $('play-status').textContent = state.playing ? 'กำลังเล่น · 1 วินาที = 30 วินาทีในฉาก' : 'พักการจำลอง'; $('play').textContent = state.playing ? 'Ⅱ พักฉาก' : '▶ เล่นฉาก';
    const first = estimate.firstAlert, visibleFirst = state.scenario === 'smoke' && first && first.alertMin <= state.minute;
    $('metric-alerts').textContent = snap.alerts.length + ' จุด'; $('metric-online').textContent = snap.online + ' / ' + P.stations.length;
    $('metric-quality').textContent = snap.unknown.length ? 'ไม่มีข้อมูล ' + snap.unknown.length + ' จุด' : 'ข้อมูลสังเคราะห์ครบทุกสถานี';
    $('metric-wind').textContent = state.windSpeedMps > 0 ? direction(state.windToDeg) : 'ลมสงบ'; $('metric-wind').classList.toggle('long', direction(state.windToDeg).length > 8);
    $('metric-speed').textContent = fmt(state.windSpeedMps) + ' m/s · พัดไป ' + state.windToDeg + '° (สมมติ)';
    $('metric-first').textContent = visibleFirst ? fmt(first.alertMin) + ' นาที' : 'ยังไม่แจ้ง'; $('metric-first').classList.toggle('long', !visibleFirst);
    $('metric-first-note').textContent = visibleFirst ? 'สถานี ' + first.label + ' · นับจากเริ่มไฟสมมติ' : 'ยังไม่มีเหตุแจ้งถึงเวลาที่กำลังดู';
    const situation = $('ops-situation'); situation.className = 'situation' + (snap.alerts.length || snap.pending.length ? ' warn' : snap.unknown.length ? ' unknown' : '');
    const title = snap.alerts.length ? 'พบสัญญาณควัน ให้เจ้าหน้าที่ตรวจสอบ' : snap.unknown.length ? 'ข้อมูลบางจุดขาด ต้องตรวจระบบ' : snap.pending.length ? 'ค่าสูงขึ้น กำลังประเมินต่อเนื่อง' : state.scenario === 'dust' && state.minute >= 8 ? 'ฝุ่นเพิ่ม แต่ไม่ผ่านเกณฑ์ควันคู่ในฉาก' : 'ยังไม่พบสัญญาณตามเกณฑ์ในฉากนี้';
    const detail = snap.alerts.length ? 'สถานี ' + snap.alerts.map(r => r.label).join(', ') + ' · ตรวจหลักฐานเพิ่มเติมก่อนยืนยันไฟ' : snap.unknown.length ? 'ไม่มีข้อมูลไม่ใช่พื้นที่ปลอดภัย · จุดที่ขาดข้อมูลแสดงสีเทา' : 'ติดตามค่าต่อเนื่อง · การไม่ถึงเกณฑ์ไม่ใช่การยืนยันว่าไม่มีไฟ';
    situation.innerHTML = '<div><strong>' + title + '</strong><p>' + detail + '</p></div><a href="#principles">ดูว่าทิศลมมีผลต่อเวลาอย่างไร ↗</a>';
    const station = P.stations.find(s => s.id === state.selected), reading = snap.rows.find(r => r.id === station.id), pred = estimate.rows.find(r => r.id === station.id);
    $('station-title').textContent = 'สถานี ' + station.screenLabel; $('station-status').textContent = statusName(reading.status); $('station-status').className = 'status-chip' + (['SUSPECT', 'PENDING'].includes(reading.status) ? ' warn' : reading.status === 'UNKNOWN' ? ' gray' : '');
    $('station-values').innerHTML = '<div><strong>' + fmt(reading.pm) + '</strong><span>PM2.5 · µg/m³</span></div><div><strong>' + fmt(reading.co, 2) + '</strong><span>CO · ppm</span></div><div class="small-reading"><strong>' + fmt(reading.temperature) + ' °C</strong><span>อุณหภูมิอากาศจำลอง</span></div><div class="small-reading"><strong>' + fmt(reading.humidity, 0) + ' %</strong><span>ความชื้นอากาศจำลอง</span></div>';
    $('station-note').textContent = station.id + ' · ' + station.lat.toFixed(6) + ', ' + station.lon.toFixed(6) + ' · ลม ' + fmt(reading.windSpeedMps) + ' m/s';
    const series = M.history(P, station, state, pred); $('station-charts').innerHTML = chart(series, 'pm', 'PM2.5', 'µg/m³', 40) + chart(series, 'co', 'CO', 'ppm', 0.35) + '<small>เส้นประ = เกณฑ์ของสูตรสาธิต ไม่ใช่เกณฑ์ที่สอบเทียบแล้ว</small>';
    $('ack').disabled = !snap.alerts.length || state.acknowledgedAt !== null; $('ack').textContent = state.acknowledgedAt !== null ? 'รับทราบแล้ว · ' + time(state.acknowledgedAt) : 'รับทราบเหตุจำลอง';
    $('jump-alert').disabled = state.scenario !== 'smoke' || !first;
    $('station-table').innerHTML = snap.rows.map(r => '<tr class="' + (r.id === state.selected ? 'selected' : '') + '"><td><button data-select="' + r.id + '" aria-label="เลือกสถานี ' + r.label + '">' + r.label + '</button><small>' + r.id + '</small></td><td><span class="status-chip' + (['SUSPECT', 'PENDING'].includes(r.status) ? ' warn' : r.status === 'UNKNOWN' ? ' gray' : '') + '">' + statusName(r.status) + '</span></td><td>' + fmt(r.pm) + '</td><td>' + fmt(r.co, 2) + '</td><td>' + fmt(r.windSpeedMps) + '</td></tr>').join('');
    $('events').innerHTML = M.events(P, state, estimate).map(e => '<li data-event="' + e.kind + '"><time>' + time(e.minute) + '</time><div><b>' + esc(e.title) + '</b><p>' + esc(e.detail) + '</p></div></li>').join('');
    $('spread-note').hidden = !showSpread; maps.ops.render(state, snap, estimate, showSpread);
  }
  function resultText(pred) {
    if (pred.geometryStatus === 'NO_ACTIVE_STATIONS') return 'ไม่มีสถานีพร้อม';
    if (state.windSpeedMps === 0) return 'ลมสงบ · ประเมินไม่ได้';
    return 'ไม่เข้าแนวใน 60 นาที';
  }
  function renderPrinciples(snap) {
    const arrival = estimate.firstArrival, alarm = estimate.firstAlert;
    $('arrival-time').textContent = arrival ? fmt(arrival.smokeArrivalMin) + ' นาที' : resultText(estimate); $('arrival-time').classList.toggle('no-time', !arrival);
    $('arrival-station').textContent = arrival ? 'สถานี ' + arrival.label + ' รับแนวควันก่อน' : 'ไม่ได้หมายความว่าไม่มีไฟ';
    $('alert-time').textContent = alarm ? fmt(alarm.alertMin) + ' นาที*' : estimate.geometryStatus === 'NO_ACTIVE_STATIONS' ? 'ไม่มีสถานีพร้อม' : 'ยังระบุเวลาแจ้งไม่ได้'; $('alert-time').classList.toggle('no-time', !alarm);
    $('alert-station').textContent = alarm ? 'สถานี ' + alarm.label + ' เข้าเกณฑ์ก่อน' : 'สูตรไม่เข้าเกณฑ์แจ้งภายใน 60 นาที';
    const box = $('learn-explanation'); box.className = 'learn-explanation' + (!alarm ? ' warn' : '');
    box.innerHTML = alarm ? '<b>* เวลาในฉากสังเคราะห์ ไม่ใช่เวลาตรวจไฟจริงที่รับประกัน</b>ก่อนมีควัน ' + fmt(state.smokeDelayMin) + ' + เวลาถึงเกณฑ์นับจากเริ่มมีควัน ' + fmt(alarm.thresholdMin - state.smokeDelayMin) + ' + เวลาอุปกรณ์ ' + fmt(estimate.deviceDelayMin) + ' = <strong>' + fmt(alarm.alertMin) + ' นาที</strong><br>เวลาเดินทางรวมอยู่ในเวลาถึงเกณฑ์แล้ว ไม่บวกซ้ำ' : '<b>' + (estimate.geometryStatus === 'NO_ACTIVE_STATIONS' ? 'ฉากนี้ไม่มีสถานีให้รับข้อมูล' : state.windSpeedMps === 0 ? 'ลมสงบ ไม่สามารถสรุปเวลาเดินทางของควันได้' : 'มีช่องว่างของการตรวจในทิศลมนี้') + '</b>ไม่มีเวลาแจ้งจากสูตรในกรอบที่ทดสอบ ไม่ควรใช้ผลนี้สรุปว่าไม่มีไฟหรือปลอดภัย';
    $('direction-table').innerHTML = comparisons.map(r => '<tr class="' + (r.bearing === state.windToDeg ? 'selected' : '') + '" data-direction-row="' + r.bearing + '"><td><button data-direction="' + r.bearing + '">' + r.name + ' <small>' + r.bearing + '° · พัดไป</small></button></td><td>' + (r.firstArrival ? r.firstArrival.label : '—') + '</td><td>' + (r.firstArrival ? fmt(r.firstArrival.smokeArrivalMin) + ' นาที' : r.geometryStatus === 'NO_ACTIVE_STATIONS' ? 'ไม่มีสถานีพร้อม' : r.geometryStatus === 'CALM_UNKNOWN' ? 'ลมสงบ / ไม่ทราบ' : 'ไม่เข้าแนวในกรอบนี้') + '</td><td>' + (r.firstAlert ? r.firstAlert.label : '—') + '</td><td>' + (r.firstAlert ? '<span class="time">' + fmt(r.firstAlert.alertMin) + '</span> นาที*' : '<span>ยังระบุไม่ได้</span><small>ไม่เข้าเกณฑ์ใน 60 นาที</small>') + '</td></tr>').join('');
    maps.learn.render(state, snap, estimate);
  }
  function render() {
    syncControls(); const snap = M.snapshot(P, state, estimate);
    $('dashboard').hidden = state.view !== 'dashboard'; $('principles').hidden = state.view !== 'principles';
    for (const name of ['dashboard', 'principles']) { const nav = $('nav-' + name); if (name === state.view) nav.setAttribute('aria-current', 'page'); else nav.removeAttribute('aria-current'); }
    if (state.view === 'dashboard') renderDashboard(snap); else renderPrinciples(snap);
  }
  function route() { const view = location.hash === '#principles' ? 'principles' : 'dashboard'; state = { ...state, view, playing: false }; render(); }
  window.addEventListener('hashchange', route);
  document.querySelectorAll('[data-key]').forEach(input => input.addEventListener(input.type === 'range' ? 'input' : 'change', () => { const key = input.dataset.key; const value = key === 'availability' ? input.value : input.value.trim() === '' ? NaN : Number(input.value); update({ [key]: value }); }));
  $('compass').addEventListener('click', e => { const button = e.target.closest('[data-bearing]'); if (button) update({ windToDeg: Number(button.dataset.bearing) }); });
  $('direction-table').addEventListener('click', e => { const button = e.target.closest('[data-direction]'); if (button) update({ windToDeg: Number(button.dataset.direction) }); });
  $('learn-source').addEventListener('change', () => {
    const choice = $('learn-source').value; if (choice === 'custom') { $('source-lat').closest('details').open = true; return; }
    const source = choice === 'center' ? { ...P.target } : choice === 'near' ? C.offset(P.stations.find(s => s.screenLabel === 'E3'), -100, 0) : C.offset(P.target, 0, choice === 'north' ? 1500 : -1500);
    update({ source, sourceName: { center: 'หมุดกลางภูเขา', near: 'ใกล้สถานี E3', north: 'ตอนเหนือของพื้นที่', south: 'ตอนใต้ของพื้นที่' }[choice] });
  });
  $('apply-source').onclick = () => { const lat = $('source-lat').value, lon = $('source-lon').value; chooseSource({ lat: lat.trim() ? Number(lat) : NaN, lon: lon.trim() ? Number(lon) : NaN }); };
  document.querySelectorAll('[data-preset]').forEach(button => button.onclick = () => { const preset = button.dataset.preset; state = M.initial(P); state.scenario = ['north', 'smoke'].includes(preset) ? 'smoke' : preset; state.windToDeg = preset === 'north' ? 0 : 135; state.minute = preset === 'offline' ? 20 : 10; recalculate(); render(); });
  $('station-table').onclick = e => { const button = e.target.closest('[data-select]'); if (button) chooseStation(button.dataset.select); };
  $('ops-minute').oninput = () => { state = M.seek(P, state, Number($('ops-minute').value)); render(); };
  $('play').onclick = () => { if (state.minute >= 60) state = M.seek(P, state, 0); state = { ...state, playing: !state.playing }; render(); };
  $('restart').onclick = () => { state = M.seek(P, state, 0); state.acknowledgedAt = null; render(); };
  $('jump-alert').onclick = () => { if (estimate.firstAlert) { state = M.seek(P, state, estimate.firstAlert.alertMin); state.selected = estimate.firstAlert.id; render(); } };
  $('ack').onclick = () => { state = M.acknowledge(P, state); render(); toast('รับทราบเฉพาะฉากจำลอง · ไม่มีการส่งแจ้งเตือนจริง'); };
  $('replay').onclick = () => { state = M.change(P, state, { scenario: 'smoke' }); recalculate(); location.hash = 'dashboard'; };
  $('spread-toggle').onchange = () => { showSpread = $('spread-toggle').checked; render(); };
  document.querySelectorAll('[data-basemap]').forEach(select => select.onchange = () => maps[select.dataset.basemap].setBasemap(select.value));
  $('export-comparison').onclick = () => { const report = { appVersion: M.APP_VERSION, planVersion: P.version, scenario: { source: state.source, windSpeedMps: state.windSpeedMps, smokeDelayMin: state.smokeDelayMin, availability: state.availability, timeOrigin: 'HYPOTHETICAL_IGNITION', deviceDelayMin: estimate.deviceDelayMin }, directions: comparisons, fieldLatencyVerified: false, fieldDetectionProbability: null }; const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })), a = document.createElement('a'); a.href = url; a.download = 'wildfire-eight-directions-synthetic.json'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
  setInterval(() => { if (!state.playing || document.hidden || state.view !== 'dashboard') return; state.minute = Math.min(60, state.minute + 0.5); if (state.minute >= 60) state.playing = false; render(); }, 1000);
  document.addEventListener('visibilitychange', () => { if (document.hidden && state.playing) { state.playing = false; render(); } });
  window.WildfireConsole = Object.freeze({ getState: () => JSON.parse(JSON.stringify({ ...state, appVersion: M.APP_VERSION, stationCount: P.stations.length, estimate, snapshot: M.snapshot(P, state, estimate), mode: 'SYNTHETIC_DEMO', fieldLatencyVerified: false })) });
  route();
})();
