(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const C = window.WildfireCore, plan = window.WILDFIRE_PLAN, context = window.WILDFIRE_CONTEXT;
  if (!C || !plan || !context || !context.roads || !context.roads.features.length) {
    $('workspace').innerHTML = '<p class="fatal">อ่านชุดข้อมูลแผนที่ไม่สำเร็จ กรุณาเปิดโฟลเดอร์แอปให้ครบ หรือโหลดหน้าใหม่ ไม่แสดงหมุดสมมติแทนข้อมูลที่หาย</p>';
    $('data-status').textContent = 'ข้อมูลไม่พร้อม · ไม่สามารถประเมินสถานี';
    return;
  }
  const stations = plan.stations;
  const byId = new Map(stations.map(s => [s.id, s]));
  const state = { view: 'plan', selected: 'R01', side: 'all', scenario: 'smoke', minute: 25, windToDeg: 90, windSpeedMps: 2.5, ros: 4, source: 'target', playing: false, acknowledged: false, psh: 3, sunAccess: 1, load: 1, basemap: 'terrain' };
  const map = $('map'), canvas = $('terrain-canvas'), svg = $('map-svg');
  const view = { center: C.world(plan.target.lat, plan.target.lon), zoom: 13, width: 700, height: 560 };
  const NS = 'http://www.w3.org/2000/svg';
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const number = (value, digits = 0) => Number(value).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const direction = bearing => ['เหนือ', 'ตะวันออกเฉียงเหนือ', 'ตะวันออก', 'ตะวันออกเฉียงใต้', 'ใต้', 'ตะวันตกเฉียงใต้', 'ตะวันตก', 'ตะวันตกเฉียงเหนือ'][Math.round(bearing / 45) % 8];
  const kitClass = station => station.kit === 'HUB' ? 'hub' : station.kit === 'WX' ? 'weather' : '';
  function toast(text) { $('toast').textContent = text; $('toast').hidden = false; clearTimeout(toast.timer); toast.timer = setTimeout(() => { $('toast').hidden = true; }, 4000); }
  function options() { return { scenario: state.scenario, source: state.source === 'target' ? plan.target : byId.get(state.source), windToDeg: state.windToDeg, windSpeedMps: state.windSpeedMps }; }
  function values() { return new Map(stations.map(s => [s.id, C.reading(s, state.minute, options())])); }
  function elem(tag, attrs, parent, text) { const node = document.createElementNS(NS, tag); Object.entries(attrs || {}).forEach(([k, v]) => node.setAttribute(k, v)); if (text !== undefined) node.textContent = text; if (parent) parent.appendChild(node); return node; }
  function select(id) {
    if (!byId.has(id)) return;
    state.selected = id;
    renderList(); renderDetails(); requestMap();
  }
  function renderList() {
    const readings = state.view === 'demo' ? values() : null;
    $('site-list').innerHTML = stations.filter(s => state.side === 'all' || s.side === state.side).map(s => {
      const status = readings ? readings.get(s.id).status : 'PROPOSED';
      const extra = status === 'SUSPECT' ? 'suspect' : status === 'UNKNOWN' ? 'unknown' : '';
      const subtitle = state.view === 'demo' ? status === 'SUSPECT' ? 'PM + CO ผิดปกติ · จำลอง' : status === 'UNKNOWN' ? 'ไม่มีข้อมูลใหม่ · จำลอง' : 'ไม่พบสัญญาณตามฉาก' : plan.kits[s.kit].name + (s.conditional ? ' · ทางบริการ*' : '');
      return '<button class="site-card ' + (s.id === state.selected ? 'selected' : '') + '" data-select="' + s.id + '" aria-pressed="' + (s.id === state.selected) + '" aria-label="เลือกสถานี ' + s.id + ' ' + escape(s.label) + '"><span class="site-id ' + kitClass(s) + ' ' + extra + '">' + s.id + '</span><span><strong>' + escape(s.label) + '</strong><small>' + escape(subtitle) + '</small></span></button>';
    }).join('');
  }
  function renderDetails() {
    const s = byId.get(state.selected), kit = plan.kits[s.kit];
    const p = C.power(kit, plan.powerAssumptions);
    const surface = { asphalt: 'แอสฟัลต์', paved: 'ผิวแข็ง', concrete: 'คอนกรีต', unpaved: 'ไม่ลาดยาง' }[s.surface] || s.surface;
    const readings = state.view === 'demo' ? values() : null;
    const r = readings && readings.get(s.id);
    let telemetry = '';
    if (r) {
      const statusText = r.status === 'UNKNOWN' ? 'ขาดข้อมูลฝั่งตะวันตกตั้งแต่นาที 12 · ไม่ใช่พื้นที่ปลอดภัย' : r.status === 'SUSPECT' ? 'PM + CO เพิ่มต่อเนื่องตามเกณฑ์เดโม · ยังไม่ยืนยันไฟ' : state.scenario === 'dust' && s.side === 'E' ? 'PM เพิ่ม แต่ CO ไม่เพิ่ม · ไม่จัดเป็น PM + CO ผิดปกติ' : 'ไม่พบสัญญาณตามเกณฑ์ฉากนี้ · ไม่ใช่การยืนยันว่าไม่มีไฟ';
      telemetry = '<h3>ค่าจำลอง ณ นาที ' + state.minute + '</h3><div class="data-values"><div><strong>' + (r.pm === null ? '—' : number(r.pm, 1)) + '</strong><small>PM2.5 · µg/m³</small></div><div><strong>' + (r.co === null ? '—' : number(r.co, 2)) + '</strong><small>CO · ppm</small></div></div><div class="detail-alert">' + statusText + '</div>' + ([...readings.values()].some(v => v.status === 'SUSPECT') ? '<button id="acknowledge" class="button-outline" style="margin-top:10px" ' + (state.acknowledged ? 'disabled' : '') + '>' + (state.acknowledged ? 'รับทราบฉากแล้ว · ยังไม่ยืนยันไฟ' : 'รับทราบในฉากจำลอง') + '</button>' : '');
    }
    $('details').innerHTML = '<div class="detail-header-block"><div class="detail-top"><span class="detail-id">' + s.id + '</span><span class="detail-status ' + (s.conditional ? 'warn' : '') + '">' + (s.conditional ? 'ทางบริการ · มีเงื่อนไข' : 'รอสำรวจหน้างาน') + '</span></div><h2>' + escape(s.label) + '</h2><p class="detail-subtitle">' + escape(kit.name) + ' · ฝั่ง' + (s.side === 'E' ? 'ตะวันออก' : 'ตะวันตก') + '</p><div class="coordinates">' + s.lat.toFixed(7) + ', ' + s.lon.toFixed(7) + '<a href="https://www.google.com/maps/search/?api=1&query=' + s.lat + '%2C' + s.lon + '" target="_blank" rel="noopener noreferrer">เปิดพิกัดใน Google Maps ↗</a></div><div class="detail-grid"><div><span>ห่างหมุดเป้าหมาย</span><b>' + number(s.distanceM / 1000, 2) + ' กม.</b></div><div><span>ระดับ DEM โดยประมาณ</span><b>' + number(s.elevationM) + ' ม.</b></div><div><span>ผิวทางใน OSM</span><b>' + surface + '</b></div><div><span>Gateway ที่เสนอ</span><b>' + s.gateway + '</b></div></div></div><div class="detail-body-block"><h3>เหตุผลที่เลือกจุดนี้</h3><p class="reason">' + escape(s.reason) + '</p><h3>สิ่งที่ต้องตรวจหน้างาน</h3><p class="field-note">' + escape(s.fieldNote) + '<br>แดด / สิทธิ์ติดตั้ง / ไหล่ทาง / วิทยุ: ยังไม่ผ่านการสำรวจ</p>' + telemetry + '<a class="detail-doc" href="https://www.openstreetmap.org/way/' + s.wayId + '" target="_blank" rel="noopener noreferrer">ตรวจถนนต้นทาง OSM #' + s.wayId + ' ↗</a></div><div class="detail-power-block"><div class="power-card"><p class="eyebrow">SOLAR + BATTERY</p><div class="power-line"><span>แผงโซลาร์</span><b>' + kit.panelWp + ' Wp</b></div><div class="power-line"><span>LiFePO₄</span><b>' + kit.batteryV + ' V · ' + kit.batteryAh + ' Ah</b></div><div class="power-line"><span>งบโหลดเฉลี่ย</span><b>' + kit.averageW + ' W</b></div><div class="autonomy-bar"><span style="width:' + Math.min(100, p.autonomyHours / 168 * 100) + '%"></span></div><div class="power-line"><span>สำรองเมื่อไม่มีแดด</span><b>' + number(p.autonomyHours, 1) + ' ชม.</b></div><small>สมมติแบตเต็ม · เผื่อความจุเสื่อม 20% แล้ว ไม่ใช่ค่าที่วัดจากอุปกรณ์จริง</small></div><a class="detail-doc" href="./docs/DESIGN.md" target="_blank" rel="noopener">อ่าน Design และสูตรคำนวณ ↗</a></div>';
  }
  function renderEnergy() {
    const rows = stations.map(s => ({ s, kit: plan.kits[s.kit], p: C.power(plan.kits[s.kit], plan.powerAssumptions, state.psh, state.sunAccess, state.load) }));
    const sum = key => rows.reduce((total, row) => total + row.p[key], 0);
    const pass = rows.filter(row => row.p.solarPass && row.p.batteryPass).length;
    $('psh-label').textContent = number(state.psh, 1) + ' ชั่วโมง/วัน';
    $('shade-label').textContent = number(state.sunAccess * 100) + '%';
    $('load-label').textContent = number(state.load, 1) + ' เท่า';
    $('energy-summary').innerHTML = '<div><span>พลังงานใช้รวมต่อวัน</span><strong>' + number(sum('dailyLoadWh')) + ' <small>Wh</small></strong><small>โหลดเฉลี่ยรวม ' + number(sum('loadW'), 1) + ' W</small></div><div><span>พลังงานผลิตตามสมมติฐาน</span><strong>' + number(sum('solarWh')) + ' <small>Wh/วัน</small></strong><small class="' + (sum('surplusWh') >= 0 ? 'pass' : 'fail') + '">' + (sum('surplusWh') >= 0 ? 'ส่วนเกิน ' : 'ขาดดุล ') + number(Math.abs(sum('surplusWh'))) + ' Wh/วัน</small></div><div><span>ผ่านทั้ง PV และสำรอง ≥72 ชม.</span><strong class="' + (pass === stations.length ? 'pass' : 'fail') + '">' + pass + ' / ' + stations.length + '</strong><small>ผลออกแบบเท่านั้น · ไม่ใช่การรับรองหน้างาน</small></div>';
    $('power-table').innerHTML = rows.map(({ s, kit, p }) => '<tr><td><strong>' + s.id + '</strong> · ' + kit.name + '</td><td>' + kit.panelWp + ' Wp</td><td>' + kit.batteryV + ' V / ' + kit.batteryAh + ' Ah</td><td>' + number(p.dailyLoadWh, 1) + ' Wh</td><td>' + number(p.solarWh, 1) + ' Wh</td><td>' + number(p.autonomyHours, 1) + ' ชม.</td><td><span class="' + (p.solarPass ? 'pass' : 'fail') + '">PV ' + (p.solarPass ? 'ผ่าน' : 'ไม่พอ') + '</span> · <span class="' + (p.batteryPass ? 'pass' : 'fail') + '">สำรอง ' + (p.batteryPass ? 'ผ่าน' : 'ไม่พอ') + '</span></td></tr>').join('');
  }
  function renderDemo() {
    $('wind-label').textContent = state.windToDeg + '° · ' + direction(state.windToDeg);
    $('speed-label').textContent = number(state.windSpeedMps, 1) + ' m/s';
    $('ros-label').textContent = state.ros + ' m/min';
    $('minute-label').textContent = state.minute + ' นาที';
    $('minute').value = state.minute;
    $('play').textContent = state.playing ? 'Ⅱ พักฉาก' : '▶ เล่นฉาก';
    const all = [...values().values()], suspects = all.filter(r => r.status === 'SUSPECT').length, unknown = all.filter(r => r.status === 'UNKNOWN').length;
    $('demo-summary').textContent = 'PM + CO ผิดปกติ ' + suspects + ' จุด · ขาดข้อมูล ' + unknown + ' จุด';
    renderList(); renderDetails(); requestMap();
  }
  function setView(name) {
    if (!['plan', 'demo', 'power'].includes(name)) return;
    state.view = name;
    if (name !== 'demo') state.playing = false;
    document.querySelectorAll('[data-view]').forEach(button => { button.classList.toggle('active', button.dataset.view === name); button.setAttribute('aria-pressed', String(button.dataset.view === name)); });
    $('demo-controls').hidden = name !== 'demo'; $('workspace').hidden = name === 'power'; $('power-view').hidden = name !== 'power';
    $('mode-pill').classList.toggle('demo', name === 'demo');
    $('mode-pill').innerHTML = name === 'demo' ? '<i></i>ข้อมูลสังเคราะห์ · ไม่ใช่เหตุจริง' : '<i></i>แบบเสนอ · ยังไม่ติดตั้ง';
    $('map-title').textContent = name === 'demo' ? 'สถานการณ์จำลองบนถนนจริง' : 'แผนติดตั้งริมถนน';
    if (name === 'power') renderEnergy(); else { renderList(); renderDetails(); if (name === 'demo') renderDemo(); requestAnimationFrame(resize); }
  }
  function screenWorld(w) { const scale = 256 * 2 ** view.zoom; return [(w[0] - view.center[0]) * scale + view.width / 2, (w[1] - view.center[1]) * scale + view.height / 2]; }
  function screen(point) { return screenWorld(C.world(point.lat, point.lon)); }
  function path(points) { return points.map((p, index) => { const [x, y] = screen(p); return (index ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1); }).join(' '); }
  const roadPaths = context.roads.features.map(feature => ({ properties: feature.properties, world: feature.geometry.coordinates.map(([lon, lat]) => C.world(lat, lon)) }));
  const terrain = context.terrain;
  let terrainImage = null;
  const contours = [];
  if (terrain) {
    terrainImage = document.createElement('canvas'); terrainImage.width = terrain.width; terrainImage.height = terrain.height;
    const tc = terrainImage.getContext('2d'), pixels = tc.createImageData(terrain.width, terrain.height);
    const minimum = Math.min(...terrain.elevations_m), maximum = Math.max(...terrain.elevations_m);
    for (let y = 0; y < terrain.height; y++) for (let x = 0; x < terrain.width; x++) {
      const i = y * terrain.width + x, z = terrain.elevations_m[i], level = (z - minimum) / (maximum - minimum || 1);
      const east = terrain.elevations_m[y * terrain.width + Math.min(x + 1, terrain.width - 1)] - terrain.elevations_m[y * terrain.width + Math.max(x - 1, 0)];
      const north = terrain.elevations_m[Math.max(y - 1, 0) * terrain.width + x] - terrain.elevations_m[Math.min(y + 1, terrain.height - 1) * terrain.width + x];
      const shade = C.clamp((north - east) / 6, -32, 30);
      pixels.data.set([C.clamp(208 - level * 48 + shade, 0, 255), C.clamp(215 - level * 37 + shade, 0, 255), C.clamp(182 - level * 48 + shade, 0, 255), 255], i * 4);
    }
    tc.putImageData(pixels, 0, 0);
    const [west, south, east, north] = terrain.bounds;
    const location = (x, y) => C.world(north + (south - north) * y / (terrain.height - 1), west + (east - west) * x / (terrain.width - 1));
    for (let level = Math.ceil(minimum / 100) * 100; level < maximum; level += 100) {
      for (let y = 0; y < terrain.height - 1; y++) for (let x = 0; x < terrain.width - 1; x++) {
        const points = [[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]], intersections = [];
        for (let k = 0; k < 4; k++) {
          const a = points[k], b = points[(k + 1) % 4], za = terrain.elevations_m[a[1] * terrain.width + a[0]], zb = terrain.elevations_m[b[1] * terrain.width + b[0]];
          if ((za < level && zb >= level) || (zb < level && za >= level)) { const t = (level - za) / (zb - za); intersections.push(location(a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]))); }
        }
        for (let k = 0; k + 1 < intersections.length; k += 2) contours.push([intersections[k], intersections[k + 1]]);
      }
    }
  }
  function drawTerrain() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(view.width * ratio); canvas.height = Math.round(view.height * ratio);
    const ctx = canvas.getContext('2d'); ctx.scale(ratio, ratio); ctx.fillStyle = '#c5cfb4'; ctx.fillRect(0, 0, view.width, view.height);
    if (terrainImage) {
      const [west, south, east, north] = terrain.bounds, a = screen({ lat: north, lon: west }), b = screen({ lat: south, lon: east });
      ctx.imageSmoothingEnabled = true; ctx.drawImage(terrainImage, a[0], a[1], b[0] - a[0], b[1] - a[1]);
      ctx.strokeStyle = 'rgba(59,89,48,.18)'; ctx.lineWidth = 0.7; ctx.beginPath();
      contours.forEach(segment => { const a = screenWorld(segment[0]), b = screenWorld(segment[1]); ctx.moveTo(...a); ctx.lineTo(...b); }); ctx.stroke();
    }
  }
  const tiles = new Map();
  let tileGeneration = 0;
  function drawTiles() {
    const layer = $('tile-layer');
    if (state.basemap === 'terrain') { layer.replaceChildren(); tiles.clear(); $('tile-error').hidden = true; return; }
    const z = Math.floor(view.zoom), count = 2 ** z, tileSize = 256 * 2 ** (view.zoom - z);
    const topX = view.center[0] * count - view.width / (2 * tileSize), topY = view.center[1] * count - view.height / (2 * tileSize);
    const used = new Set();
    for (let y = Math.floor(topY); y <= Math.floor(topY + view.height / tileSize); y++) for (let x = Math.floor(topX); x <= Math.floor(topX + view.width / tileSize); x++) {
      if (x < 0 || y < 0 || x >= count || y >= count) continue;
      const key = state.basemap + '/' + z + '/' + x + '/' + y; used.add(key);
      let image = tiles.get(key);
      if (!image) {
        image = new Image(); image.alt = ''; image.decoding = 'async'; image.referrerPolicy = 'strict-origin-when-cross-origin';
        const generation = tileGeneration;
        image.onerror = () => { if (generation === tileGeneration && state.basemap !== 'terrain') $('tile-error').hidden = false; image.style.display = 'none'; };
        image.src = state.basemap === 'satellite' ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/' + z + '/' + y + '/' + x : 'https://tile.openstreetmap.org/' + z + '/' + x + '/' + y + '.png';
        tiles.set(key, image); layer.appendChild(image);
      }
      image.style.left = ((x - topX) * tileSize) + 'px'; image.style.top = ((y - topY) * tileSize) + 'px'; image.style.width = (tileSize + 0.5) + 'px'; image.style.height = (tileSize + 0.5) + 'px';
    }
    for (const [key, image] of tiles) if (!used.has(key)) { image.remove(); tiles.delete(key); }
  }
  let frame = 0;
  function requestMap() { if (frame) return; frame = requestAnimationFrame(() => { frame = 0; renderMap(); }); }
  function renderMap() {
    if (state.view === 'power') return;
    const focused = document.activeElement && document.activeElement.getAttribute('data-map-node');
    drawTerrain(); drawTiles(); svg.replaceChildren(); svg.setAttribute('viewBox', '0 0 ' + view.width + ' ' + view.height);
    const roads = elem('g', { 'aria-hidden': 'true' }, svg);
    for (const road of roadPaths) {
      const minor = ['path', 'footway', 'track', 'steps'].includes(road.properties.highway);
      const d = road.world.map((w, i) => { const [x, y] = screenWorld(w); return (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1); }).join(' ');
      const active = road.properties.osm_way_id === byId.get(state.selected).wayId;
      if (!minor) elem('path', { d, fill: 'none', stroke: active ? '#729342' : '#6d7e5f', 'stroke-width': active ? 6.5 : 3.5, opacity: active ? 0.85 : 0.55, 'stroke-linejoin': 'round' }, roads);
      elem('path', { d, fill: 'none', stroke: minor ? '#7c8064' : active ? '#f3ffd4' : '#ffffea', 'stroke-width': minor ? 1 : active ? 3.5 : 1.8, 'stroke-dasharray': minor ? '3 4' : '', opacity: minor ? 0.5 : 0.95, 'stroke-linejoin': 'round' }, roads);
    }
    if (state.view === 'demo' && state.scenario === 'smoke' && state.minute > 5) {
      const spread = C.spread(options().source, state.windToDeg, state.windSpeedMps, state.ros, terrain);
      for (const contour of [...spread.contours].reverse()) {
        elem('path', { d: path(contour.points) + 'Z', fill: '#d28642', 'fill-opacity': 0.045, stroke: contour.minutes === 60 ? '#bc6651' : '#b98537', 'stroke-width': 1.8, 'stroke-dasharray': '6 4' }, svg);
        const point = contour.points[0], [x, y] = screen(point);
        elem('text', { x: x + 6, y: y - 6, fill: '#884a29', 'font-size': 10, 'paint-order': 'stroke', stroke: '#fff4dd', 'stroke-width': 3 }, svg, contour.minutes + ' นาที*');
      }
      const [x, y] = screen(options().source);
      elem('circle', { cx: x, cy: y, r: 7, fill: '#ba6b3a', stroke: '#fff3d0', 'stroke-width': 2 }, svg);
      elem('text', { x: x + 11, y: y + 17, fill: '#82502f', 'font-size': 9, 'paint-order': 'stroke', stroke: '#fff8e5', 'stroke-width': 3 }, svg, 'จุดเริ่มฉากสมมติ');
    }
    const [tx, ty] = screen(plan.target);
    elem('circle', { cx: tx, cy: ty, r: 8, fill: '#fdf4d8', stroke: '#a9864c', 'stroke-width': 2 }, svg);
    elem('path', { d: 'M' + (tx - 4) + ' ' + ty + 'h8M' + tx + ' ' + (ty - 4) + 'v8', stroke: '#a9864c', 'stroke-width': 1.5 }, svg);
    elem('text', { x: tx + 12, y: ty - 10, fill: '#665c37', 'font-size': 10, 'paint-order': 'stroke', stroke: '#fff9e7', 'stroke-width': 4 }, svg, 'หมุดเป้าหมาย');
    const labels = context.pois.filter(p => [14109247021, 2494623688, 2494621549].includes(p.id));
    labels.forEach(p => { const [x, y] = screen(p); elem('text', { x: x + 6, y: y + 27, fill: '#475439', 'font-size': 10, 'paint-order': 'stroke', stroke: '#fffbe9', 'stroke-width': 3 }, svg, p.tags['name:th'] || p.tags.name || ''); });
    const readings = state.view === 'demo' ? values() : null;
    for (const s of stations) {
      const [x, y] = screen(s), selected = s.id === state.selected, r = readings && readings.get(s.id);
      const fill = r && r.status === 'UNKNOWN' ? '#919e96' : r && r.status === 'SUSPECT' ? '#c47b3e' : s.kit === 'HUB' ? '#264e40' : s.kit === 'WX' ? '#527e90' : '#769756';
      const g = elem('g', { class: 'station-marker', role: 'button', tabindex: '0', 'data-map-node': s.id, 'aria-label': 'เลือกสถานี ' + s.id + ' ' + s.label, 'aria-pressed': String(selected) }, svg);
      if (selected) elem('circle', { cx: x, cy: y, r: 24, fill: '#f1ffc0', 'fill-opacity': 0.65, stroke: '#577848', 'stroke-width': 1, 'stroke-dasharray': '3 3' }, g);
      if (s.kit === 'HUB') elem('rect', { x: x - 14, y: y - 14, width: 28, height: 28, rx: 8, fill, stroke: '#fffef1', 'stroke-width': 2.5 }, g);
      else elem('circle', { cx: x, cy: y, r: 14, fill, stroke: '#fffef1', 'stroke-width': 2.5 }, g);
      elem('text', { x, y: y + 3.5, fill: '#fffde9', 'font-size': 10, 'font-weight': 700, 'text-anchor': 'middle' }, g, s.id);
      if (s.conditional) elem('circle', { cx: x + 12, cy: y - 12, r: 4, fill: '#d7a052', stroke: '#fff6e2', 'stroke-width': 1 }, g);
    }
    if (state.view === 'demo') {
      const angle = state.windToDeg * Math.PI / 180, x = view.width - 37, y = 100, length = 24;
      if (state.windSpeedMps > 0) {
        const ex = x + Math.sin(angle) * length, ey = y - Math.cos(angle) * length;
        elem('path', { d: 'M' + x + ' ' + y + 'L' + ex + ' ' + ey, stroke: '#345c65', 'stroke-width': 2.5 }, svg);
        elem('path', { d: 'M' + (ex - 7 * Math.sin(angle - 0.5)) + ' ' + (ey + 7 * Math.cos(angle - 0.5)) + 'L' + ex + ' ' + ey + 'L' + (ex - 7 * Math.sin(angle + 0.5)) + ' ' + (ey + 7 * Math.cos(angle + 0.5)), stroke: '#345c65', 'stroke-width': 2.5, fill: 'none' }, svg);
      }
      $('map-caption').innerHTML = '<b>' + (state.windSpeedMps > 0 ? 'ลมสมมติพัดไป' + direction(state.windToDeg) : 'ลมสงบในฉากสมมติ') + '</b><span>' + (state.scenario === 'smoke' ? '* แนวลาม 15/30/60 นาทีหลังเริ่มไฟ: สมมติ ไม่สอบเทียบ<br>ไม่มีข้อมูลเชื้อเพลิง/ความชื้น · ไม่ใช้กำหนดเขตปลอดภัย' : state.scenario === 'offline' ? 'จุดเทา = ขาดข้อมูล ไม่ใช่พื้นที่ปลอดภัย' : 'ฝุ่นถนนอาจเพิ่ม PM โดยไม่เพิ่ม CO') + '</span>';
    } else $('map-caption').innerHTML = '<b>ปักหมุดตามแนวถนนจริง</b><span>สีพื้น = ระดับภูมิประเทศ ไม่ใช่ชนิดป่า<br>ไม่มีวงรัศมีรับประกันการตรวจไฟ</span>';
    const metresPerPixel = Math.cos(view.center[1] ? C.unworld(...view.center).lat * Math.PI / 180 : 0) * 2 * Math.PI * 6378137 / (256 * 2 ** view.zoom);
    const scaleMetres = metresPerPixel * 80 > 1000 ? 1000 : metresPerPixel * 80 > 500 ? 500 : metresPerPixel * 80 > 200 ? 200 : 100;
    $('scale-line').style.width = (scaleMetres / metresPerPixel) + 'px'; $('scale-label').textContent = scaleMetres >= 1000 ? '1 km' : scaleMetres + ' m';
    $('map-attribution').innerHTML = 'ถนน © OpenStreetMap · DEM: Mapzen / AWS' + (state.basemap === 'satellite' ? ' · Imagery © Esri, Maxar, Earthstar Geographics, GIS User Community' : '') + ' · <a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noopener">ที่มาภูมิประเทศ ↗</a>';
    if (focused) svg.querySelector('[data-map-node="' + focused + '"]')?.focus({ preventScroll: true });
  }
  function resize() { const rect = map.getBoundingClientRect(); if (!rect.width || !rect.height) return; view.width = rect.width; view.height = rect.height; requestMap(); }
  function fit() {
    resize();
    const points = [...stations, plan.target].map(p => C.world(p.lat, p.lon));
    const xs = points.map(p => p[0]), ys = points.map(p => p[1]), west = Math.min(...xs), east = Math.max(...xs), north = Math.min(...ys), south = Math.max(...ys);
    view.center = [(west + east) / 2, (north + south) / 2];
    view.zoom = C.clamp(Math.log2(Math.min(view.width / ((east - west) * 1.27), view.height / ((south - north) * 1.9)) / 256), 11, 18);
    requestMap();
  }
  function zoom(change, point) {
    const oldScale = 256 * 2 ** view.zoom, nextZoom = C.clamp(view.zoom + change, 11, 18), nextScale = 256 * 2 ** nextZoom;
    if (point) { view.center[0] += (point[0] - view.width / 2) * (1 / oldScale - 1 / nextScale); view.center[1] += (point[1] - view.height / 2) * (1 / oldScale - 1 / nextScale); }
    view.zoom = nextZoom; requestMap();
  }
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
  document.querySelectorAll('[data-side]').forEach(button => button.addEventListener('click', () => { state.side = button.dataset.side; document.querySelectorAll('[data-side]').forEach(b => { b.classList.toggle('active', b === button); b.setAttribute('aria-pressed', String(b === button)); }); renderList(); }));
  $('site-list').addEventListener('click', event => { const button = event.target.closest('[data-select]'); if (button) select(button.dataset.select); });
  svg.addEventListener('click', event => { const node = event.target.closest('[data-map-node]'); if (node) select(node.getAttribute('data-map-node')); });
  svg.addEventListener('keydown', event => { if (['Enter', ' '].includes(event.key)) { const node = event.target.closest('[data-map-node]'); if (node) { event.preventDefault(); select(node.getAttribute('data-map-node')); } } });
  $('details').addEventListener('click', event => { if (event.target.id === 'acknowledge') { state.acknowledged = true; renderDetails(); toast('รับทราบเฉพาะฉากนี้ · ไม่ใช่ยืนยันไฟ และไม่มีการส่งแจ้งเตือน'); } });
  $('zoom-in').onclick = () => zoom(0.6); $('zoom-out').onclick = () => zoom(-0.6); $('fit').onclick = fit;
  $('basemap').onchange = () => { state.basemap = $('basemap').value; tileGeneration++; tiles.clear(); $('tile-layer').replaceChildren(); $('tile-error').hidden = true; requestMap(); };
  map.addEventListener('wheel', event => { event.preventDefault(); const rect = map.getBoundingClientRect(); zoom(event.deltaY < 0 ? 0.25 : -0.25, [event.clientX - rect.left, event.clientY - rect.top]); }, { passive: false });
  let drag = null;
  map.addEventListener('pointerdown', event => { if (event.target.closest('button,select,.station-marker')) return; drag = { x: event.clientX, y: event.clientY, center: [...view.center] }; map.setPointerCapture(event.pointerId); });
  map.addEventListener('pointermove', event => { if (!drag) return; const scale = 256 * 2 ** view.zoom; view.center = [drag.center[0] - (event.clientX - drag.x) / scale, drag.center[1] - (event.clientY - drag.y) / scale]; view.center[0] = C.clamp(view.center[0], 0, 1); view.center[1] = C.clamp(view.center[1], 0.001, 0.999); requestMap(); });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(name => map.addEventListener(name, () => { drag = null; }));
  map.addEventListener('keydown', event => { if (event.target !== map) return; const moves = { ArrowLeft: [-60, 0], ArrowRight: [60, 0], ArrowUp: [0, -60], ArrowDown: [0, 60] }; if (moves[event.key]) { event.preventDefault(); const scale = 256 * 2 ** view.zoom; view.center[0] += moves[event.key][0] / scale; view.center[1] += moves[event.key][1] / scale; requestMap(); } else if (['+', '='].includes(event.key)) zoom(0.5); else if (event.key === '-') zoom(-0.5); });
  const demoInputs = { scenario: ['scenario', false], source: ['source', false], wind: ['windToDeg', true], 'wind-speed': ['windSpeedMps', true], ros: ['ros', true], minute: ['minute', true] };
  Object.entries(demoInputs).forEach(([id, [key, numeric]]) => { $(id).addEventListener('input', () => { state[key] = numeric ? Number($(id).value) : $(id).value; state.playing = false; state.acknowledged = false; renderDemo(); }); });
  $('play').onclick = () => { if (state.minute >= 60) { state.minute = 0; state.acknowledged = false; } state.playing = !state.playing; renderDemo(); };
  $('restart').onclick = () => { state.minute = 0; state.playing = false; state.acknowledged = false; renderDemo(); };
  setInterval(() => { if (!state.playing || document.hidden || state.view !== 'demo') return; state.minute = Math.min(60, state.minute + 1); if (state.minute >= 60) state.playing = false; renderDemo(); }, 1000);
  [['psh', 'psh', 1], ['shade', 'sunAccess', 100], ['load', 'load', 1]].forEach(([id, key, divisor]) => $(id).addEventListener('input', () => { state[key] = Number($(id).value) / divisor; renderEnergy(); }));
  $('export').onclick = () => {
    const format = $('export-format').value, content = format === 'csv' ? C.csv(plan) : format === 'kml' ? C.kml(plan) : JSON.stringify(C.features(plan), null, 2);
    const mime = format === 'csv' ? 'text/csv;charset=utf-8' : format === 'kml' ? 'application/vnd.google-earth.kml+xml' : 'application/geo+json';
    const url = URL.createObjectURL(new Blob([content], { type: mime })), anchor = document.createElement('a'); anchor.href = url; anchor.download = 'wildfire-roadside-8-stations.' + format; document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast('ส่งออก 8 หมุดแล้ว · สถานะจุดเสนอสำรวจ ไม่ใช่ฐานรากที่อนุมัติ');
  };
  $('data-status').textContent = 'OSM snapshot ' + context.meta.acquired_at.slice(0, 10) + ' · ' + context.roads.features.length + ' แนวถนน/เส้นทาง · พิกัดยังไม่ผ่านสำรวจ';
  new ResizeObserver(resize).observe(map);
  renderList(); renderDetails(); fit();
  // Read-only introspection for reproducible QA. No command, dispatch or live-sensor access.
  window.WildfireApp = Object.freeze({ getState: () => ({ ...state, selectedStation: { ...byId.get(state.selected) }, stationCount: stations.length, hasTerrain: Boolean(terrain), mapZoom: view.zoom, mode: state.view === 'demo' ? 'SYNTHETIC_DEMO' : 'PROPOSED_PLAN' }) });
})();
