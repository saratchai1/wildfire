/* Real bundled OSM/DEM basemap; overlay values are always synthetic. */
(function (root) {
  'use strict';
  const C = root.WildfireCore, S = root.RoadsideSiting, NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs, parent, text) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v); if (text !== undefined) e.textContent = text; parent.appendChild(e); return e; };
  class MapView {
    constructor(id, plan, context, onSelect, onSource) {
      this.host = document.getElementById(id); this.id = id; this.plan = plan; this.context = context; this.onSelect = onSelect; this.onSource = onSource; this.basemap = 'terrain'; this.center = C.world(plan.target.lat, plan.target.lon); this.zoom = 1; this.width = 600; this.height = 440; this.tiles = new Map(); this.generation = 0;
      this.host.innerHTML = '<canvas aria-hidden="true"></canvas><div class="map-tiles" aria-hidden="true"></div><svg xmlns="http://www.w3.org/2000/svg" aria-label="หมุดสถานีริมทางและฉากสมมติ"></svg><div class="map-north">N<br>↑</div><div class="map-tools"><button type="button" data-zoom="in" aria-label="ซูมเข้า">+</button><button type="button" data-zoom="out" aria-label="ซูมออก">−</button><button type="button" data-zoom="fit" aria-label="แสดงวงพื้นที่ศึกษา">⌖</button></div><div class="map-error" hidden>ภาพดาวเทียมโหลดไม่ได้ · ใช้ถนนและภูมิประเทศที่แนบมากับแอป</div><div class="map-scale"><i></i><span>500 m</span></div><div class="map-credit"><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a> · DEM Mapzen / AWS <span class="imagery-credit"></span></div>';
      this.canvas = this.host.querySelector('canvas'); this.svg = this.host.querySelector('svg'); this.tileLayer = this.host.querySelector('.map-tiles');
      this.roads = context.roads.features.map(f => ({ properties: f.properties, points: f.geometry.coordinates.map(([lon, lat]) => C.world(lat, lon)) }));
      this.makeTerrain();
      this.host.querySelectorAll('[data-zoom]').forEach(b => b.addEventListener('click', () => { const action = b.dataset.zoom; if (action === 'fit') { this.zoom = 1; this.center = C.world(plan.target.lat, plan.target.lon); } else this.zoom = C.clamp(this.zoom * (action === 'in' ? 1.45 : 1 / 1.45), 0.7, 8); this.draw(); }));
      this.svg.addEventListener('click', e => { const node = e.target.closest('[data-station]'); if (node) this.onSelect(node.dataset.station); });
      this.svg.addEventListener('keydown', e => { const node = e.target.closest('[data-station]'); if (node && ['Enter', ' '].includes(e.key)) { e.preventDefault(); this.onSelect(node.dataset.station); } });
      this.svg.addEventListener('dblclick', e => { if (e.target.closest('[data-station]')) return; const rect = this.host.getBoundingClientRect(); const p = C.unworld(this.center[0] + (e.clientX - rect.left - this.width / 2) / this.scale, this.center[1] + (e.clientY - rect.top - this.height / 2) / this.scale); this.onSource(p); });
      let drag = null;
      this.svg.addEventListener('pointerdown', e => { if (e.target.closest('[data-station]') || e.button !== 0) return; drag = { x: e.clientX, y: e.clientY, center: [...this.center] }; this.svg.setPointerCapture(e.pointerId); });
      this.svg.addEventListener('pointermove', e => { if (!drag) return; this.center = [drag.center[0] - (e.clientX - drag.x) / this.scale, drag.center[1] - (e.clientY - drag.y) / this.scale]; this.draw(); });
      ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(name => this.svg.addEventListener(name, () => { drag = null; }));
      this.observer = new ResizeObserver(() => this.draw()); this.observer.observe(this.host);
    }
    makeTerrain() {
      const t = this.context.terrain; if (!t) return;
      this.terrainImage = document.createElement('canvas'); this.terrainImage.width = t.width; this.terrainImage.height = t.height;
      const c = this.terrainImage.getContext('2d'), image = c.createImageData(t.width, t.height); const low = Math.min(...t.elevations_m), high = Math.max(...t.elevations_m);
      for (let y = 0; y < t.height; y++) for (let x = 0; x < t.width; x++) {
        const i = y * t.width + x, v = (t.elevations_m[i] - low) / (high - low || 1);
        const dx = t.elevations_m[y * t.width + Math.min(x + 1, t.width - 1)] - t.elevations_m[y * t.width + Math.max(x - 1, 0)];
        const dy = t.elevations_m[Math.max(y - 1, 0) * t.width + x] - t.elevations_m[Math.min(y + 1, t.height - 1) * t.width + x]; const shade = C.clamp((dy - dx) / 5, -40, 28);
        image.data.set([C.clamp(211 - v * 57 + shade, 0, 255), C.clamp(220 - v * 43 + shade, 0, 255), C.clamp(190 - v * 63 + shade, 0, 255), 255], i * 4);
      }
      c.putImageData(image, 0, 0);
    }
    screenWorld(p) { return [(p[0] - this.center[0]) * this.scale + this.width / 2, (p[1] - this.center[1]) * this.scale + this.height / 2]; }
    project(p) { return this.screenWorld(C.world(p.lat, p.lon)); }
    path(points) { return points.map((p, i) => { const [x, y] = this.project(p); return (i ? 'L' : 'M') + x.toFixed(2) + ' ' + y.toFixed(2); }).join(' '); }
    setBasemap(name) { this.basemap = name === 'satellite' ? name : 'terrain'; this.generation++; this.tiles.clear(); this.tileLayer.replaceChildren(); this.host.querySelector('.map-error').hidden = true; this.draw(); }
    render(state, snapshot, prediction, showSpread = false) { this.state = state; this.snapshot = snapshot; this.prediction = prediction; this.showSpread = showSpread; this.draw(); }
    drawTiles() {
      this.host.querySelector('.imagery-credit').textContent = this.basemap === 'satellite' ? '· Imagery © Esri, Maxar, Earthstar Geographics, GIS User Community' : '';
      if (this.basemap !== 'satellite') return;
      const z = Math.min(18, Math.max(10, Math.floor(Math.log2(this.scale / 256)))), count = 2 ** z, size = this.scale / count;
      const left = this.center[0] * count - this.width / (2 * size), top = this.center[1] * count - this.height / (2 * size), used = new Set();
      for (let y = Math.floor(top); y <= Math.floor(top + this.height / size); y++) for (let x = Math.floor(left); x <= Math.floor(left + this.width / size); x++) {
        if (x < 0 || y < 0 || x >= count || y >= count) continue;
        const key = z + '/' + y + '/' + x; used.add(key); let image = this.tiles.get(key);
        if (!image) { image = new Image(); image.alt = ''; image.decoding = 'async'; image.referrerPolicy = 'strict-origin-when-cross-origin'; const generation = this.generation; image.onerror = () => { image.style.display = 'none'; if (this.generation === generation) this.host.querySelector('.map-error').hidden = false; }; image.src = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/' + key; this.tileLayer.appendChild(image); this.tiles.set(key, image); }
        Object.assign(image.style, { left: ((x - left) * size) + 'px', top: ((y - top) * size) + 'px', width: (size + 0.5) + 'px', height: (size + 0.5) + 'px' });
      }
      for (const [key, image] of this.tiles) if (!used.has(key)) { image.remove(); this.tiles.delete(key); }
    }
    draw() {
      if (!this.state) return; const rect = this.host.getBoundingClientRect(); if (!rect.width || !rect.height) return;
      this.width = rect.width; this.height = rect.height;
      const west = C.world(...[C.offset(this.plan.target, -2300, 0).lat, C.offset(this.plan.target, -2300, 0).lon]);
      const east = C.world(...[C.offset(this.plan.target, 2300, 0).lat, C.offset(this.plan.target, 2300, 0).lon]);
      const north = C.world(C.offset(this.plan.target, 0, 2300).lat, this.plan.target.lon), south = C.world(C.offset(this.plan.target, 0, -2300).lat, this.plan.target.lon);
      this.scale = Math.min(this.width / (east[0] - west[0]), (this.height - 22) / (south[1] - north[1])) * this.zoom;
      const ratio = Math.min(root.devicePixelRatio || 1, 2); this.canvas.width = Math.round(this.width * ratio); this.canvas.height = Math.round(this.height * ratio); const c = this.canvas.getContext('2d'); c.scale(ratio, ratio); c.fillStyle = '#d4ddc4'; c.fillRect(0, 0, this.width, this.height);
      if (this.terrainImage) { const [w, s, e, n] = this.context.terrain.bounds, a = this.project({ lat: n, lon: w }), b = this.project({ lat: s, lon: e }); c.imageSmoothingEnabled = true; c.drawImage(this.terrainImage, a[0], a[1], b[0] - a[0], b[1] - a[1]); }
      this.drawTiles();
      const focus = document.activeElement?.getAttribute('data-station'); this.svg.replaceChildren(); this.svg.setAttribute('viewBox', '0 0 ' + this.width + ' ' + this.height);
      const roads = el('g', { 'aria-hidden': 'true' }, this.svg), chosen = new Set(this.plan.stations.map(s => s.wayId));
      for (const road of this.roads) { const active = chosen.has(road.properties.osm_way_id), minor = ['path', 'footway', 'steps'].includes(road.properties.highway); const d = road.points.map((p, i) => { const [x, y] = this.screenWorld(p); return (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1); }).join(' '); el('path', { d, fill: 'none', stroke: active ? '#8b7950' : minor ? '#8b9b80' : '#fffce8', 'stroke-width': active ? 3.4 : minor ? 0.7 : 1.6, opacity: active ? 0.85 : 0.75, 'stroke-dasharray': minor ? '3 4' : '', 'stroke-linejoin': 'round' }, roads); if (active) el('path', { d, fill: 'none', stroke: '#fff3c9', 'stroke-width': 1.5 }, roads); }
      const circlePath = this.path(S.circle(this.plan.target, this.plan.studyRadiusM)) + 'Z', defs = el('defs', {}, this.svg), clip = el('clipPath', { id: this.id + '-clip' }, defs); el('path', { d: circlePath }, clip);
      el('path', { d: circlePath, fill: 'none', stroke: '#586e94', 'stroke-width': 1.6, 'stroke-dasharray': '7 5', 'pointer-events': 'none' }, this.svg);
      const top = this.project(C.offset(this.plan.target, 0, 2000)); el('text', { x: top[0], y: top[1] + 15, 'text-anchor': 'middle', 'font-size': 10, fill: '#36517a', 'paint-order': 'stroke', stroke: '#fffce9', 'stroke-width': 3 }, this.svg, 'พื้นที่ศึกษา 2 กม.');
      const state = this.state, learn = this.id === 'learn-map', smoke = learn || state.scenario === 'smoke';
      if (smoke && state.windSpeedMps > 0 && (learn || state.minute > state.smokeDelayMin)) {
        const g = el('g', { 'clip-path': 'url(#' + this.id + '-clip)', 'pointer-events': 'none' }, this.svg), a = state.windToDeg * Math.PI / 180;
        const length = learn ? 3500 : Math.min(4500, state.windSpeedMps * Math.max(0, state.minute - state.smokeDelayMin) * 60), width = 25 + length * Math.tan(20 * Math.PI / 180);
        const tip = C.offset(state.source, Math.sin(a) * length, Math.cos(a) * length), left = C.offset(tip, Math.cos(a) * width, -Math.sin(a) * width), right = C.offset(tip, -Math.cos(a) * width, Math.sin(a) * width);
        el('path', { d: this.path([state.source, left, right]) + 'Z', fill: '#e4bc61', 'fill-opacity': learn ? 0.22 : 0.30, stroke: '#b58b33', 'stroke-width': 1, 'stroke-dasharray': '5 4' }, g);
        const arrow = C.offset(state.source, Math.sin(a) * Math.min(length, 650), Math.cos(a) * Math.min(length, 650));
        el('path', { d: this.path([state.source, arrow]), fill: 'none', stroke: '#886023', 'stroke-width': 2 }, g);
        const arrLeft = C.offset(arrow, -Math.sin(a - 0.45) * 85, -Math.cos(a - 0.45) * 85), arrRight = C.offset(arrow, -Math.sin(a + 0.45) * 85, -Math.cos(a + 0.45) * 85); el('path', { d: this.path([arrLeft, arrow, arrRight]), fill: 'none', stroke: '#886023', 'stroke-width': 2 }, g);
      }
      if (smoke && this.showSpread && !learn && state.minute > state.smokeDelayMin) { for (const contour of C.spread(state.source, state.windToDeg, state.windSpeedMps, 4, this.context.terrain).contours) { el('path', { d: this.path(contour.points) + 'Z', fill: 'none', stroke: '#b55444', 'stroke-width': 1.6, 'stroke-dasharray': '3 4', 'pointer-events': 'none' }, this.svg); const [x, y] = this.project(contour.points[0]); el('text', { x: x + 4, y: y - 3, 'font-size': 9, fill: '#954833', 'paint-order': 'stroke', stroke: '#fff9e9', 'stroke-width': 3 }, this.svg, contour.minutes + ' นาที*'); } }
      const [sx, sy] = this.project(state.source);
      if (smoke) { el('circle', { cx: sx, cy: sy, r: 7, fill: '#cd5838', stroke: '#fff8dc', 'stroke-width': 2, 'pointer-events': 'none' }, this.svg); el('text', { x: sx + 12, y: sy - 10, 'font-size': 10, fill: '#824526', 'paint-order': 'stroke', stroke: '#fff8e4', 'stroke-width': 3 }, this.svg, 'จุดเริ่มสมมติ'); }
      for (const station of this.plan.stations) {
        const [x, y] = this.project(station), value = this.snapshot.rows.find(r => r.id === station.id), selected = station.id === state.selected;
        const predicted = this.prediction.rows.find(r => r.id === station.id); const status = learn ? !predicted.enabled ? 'UNKNOWN' : this.prediction.firstAlert?.id === station.id ? 'SUSPECT' : this.prediction.firstArrival?.id === station.id ? 'PENDING' : 'NO_ANOMALY' : value.status;
        const fill = { SUSPECT: '#b96632', PENDING: '#b99943', UNKNOWN: '#8d9792', NO_ANOMALY: '#4d795e' }[status];
        const g = el('g', { class: 'map-pin', role: 'button', tabindex: 0, 'data-station': station.id, 'aria-label': 'เลือกสถานี ' + station.screenLabel, 'aria-pressed': String(selected) }, this.svg);
        if (selected) el('circle', { cx: x, cy: y, r: 21, fill: '#f9ffd1', 'fill-opacity': 0.7, stroke: '#708944', 'stroke-width': 1.2 }, g);
        el(station.kit === 'HUB' ? 'rect' : 'circle', station.kit === 'HUB' ? { class: 'pin-ring', x: x - 13, y: y - 13, width: 26, height: 26, rx: 7, fill, stroke: '#fffde9', 'stroke-width': 2 } : { class: 'pin-ring', cx: x, cy: y, r: 13, fill, stroke: '#fffde9', 'stroke-width': 2 }, g);
        el('text', { x, y: y + 3.5, 'text-anchor': 'middle', fill: '#fffef0', 'font-size': 10, 'font-weight': 700 }, g, station.screenLabel);
      }
      const p0 = this.project(this.plan.target), p1 = this.project(C.offset(this.plan.target, 500, 0)); this.host.querySelector('.map-scale i').style.width = Math.abs(p1[0] - p0[0]) + 'px';
      if (focus && this.host.contains(document.activeElement)) this.svg.querySelector('[data-station="' + focus + '"]')?.focus({ preventScroll: true });
    }
  }
  root.WildfireMapView = MapView;
})(window);
