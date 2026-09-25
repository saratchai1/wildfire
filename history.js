/* Legacy-inspired evidence view. All histories are SYNTHETIC_DEMO, never telemetry. */
(function (root) {
  'use strict';
  function series(core, station, minute, options, windowMinutes = 10) {
    if (!Number.isFinite(minute) || minute < 0 || minute > 60 || !Number.isFinite(windowMinutes) || windowMinutes <= 0) throw new Error('Invalid history interval');
    const start = Math.max(0, minute - windowMinutes);
    const times = Array.from({ length: Math.floor(minute - start) + 1 }, (_, i) => start + i);
    if (times[times.length - 1] !== minute) times.push(minute);
    return times.map(t => {
      const r = core.reading(station, t, options);
      const valid = r.quality === 'VALID' && core.finite(r.pm) && core.finite(r.co);
      return { minute: t, quality: r.quality, pm: valid ? r.pm : null, co: valid ? r.co : null, baselinePm: valid ? r.baselinePm : null, baselineCo: valid ? r.baselineCo : null };
    });
  }
  function events(core, stations, minute, options) {
    if (!Number.isFinite(minute) || minute < 0 || minute > 60) throw new Error('Invalid event time');
    const result = [{ minute: 0, kind: 'START', title: 'เริ่มฉากจำลอง', detail: 'ไม่มีการเชื่อมเซนเซอร์จริง' }];
    if (options.scenario === 'smoke' && minute >= 5) result.push({ minute: 5, kind: 'SOURCE', title: 'เริ่มควันตามฉากที่กำหนด', detail: 'ตำแหน่งเริ่มเป็นข้อมูลตั้งต้น ไม่ใช่ต้นเพลิงที่คำนวณจากเซนเซอร์' });
    if (options.scenario === 'dust' && minute >= 8) result.push({ minute: 8, kind: 'DUST', title: 'PM เพิ่มจากฝุ่นในฉาก', detail: 'CO ไม่เพิ่มตามฉากนี้ ไม่ใช่หลักฐานยืนยันหรือปฏิเสธไฟจริง' });
    if (options.scenario === 'offline' && minute >= 12) {
      const ids = stations.filter(s => s.side === 'W').map(s => s.id);
      if (ids.length) result.push({ minute: 12, kind: 'STALE', title: 'ข้อมูลฝั่งตะวันตกขาด', detail: ids.join(' · ') + ' — ไม่แสดงค่าที่หายเป็นศูนย์' });
    }
    for (let t = 0; t <= Math.floor(minute); t++) {
      const ids = stations.filter(s => core.reading(s, t, options).status === 'SUSPECT').map(s => s.id);
      if (ids.length) {
        result.push({ minute: t, kind: 'SUSPECT', title: 'พบ PM + CO เพิ่มต่อเนื่องในฉาก', detail: ids.join(' · ') + ' — รอตรวจสอบ ไม่ใช่การยืนยันไฟ' });
        break;
      }
    }
    return result.sort((a, b) => b.minute - a.minute);
  }
  const api = Object.freeze({ series, events });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.WildfireHistory = api;
  if (!root.document) return;
  const document = root.document;
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  function chart(samples, field, label, unit) {
    const available = samples.filter(s => s[field] !== null);
    const baselineKey = field === 'pm' ? 'baselinePm' : 'baselineCo';
    const threshold = available.length ? available[0][baselineKey] + (field === 'pm' ? 25 : 0.2) : null;
    const maximum = Math.max(field === 'pm' ? 50 : 0.5, threshold || 0, ...available.map(s => s[field])) * 1.12;
    const start = samples[0].minute, end = samples[samples.length - 1].minute;
    const x = t => 37 + (t - start) / Math.max(1, end - start) * 244;
    const y = v => 78 - v / maximum * 62;
    let pen = false, path = '';
    for (const sample of samples) {
      if (sample[field] === null) { pen = false; continue; }
      path += (pen ? 'L' : 'M') + x(sample.minute).toFixed(2) + ' ' + y(sample[field]).toFixed(2) + ' ';
      pen = true;
    }
    const digits = field === 'pm' ? 0 : 2;
    const description = label + ' ' + unit + ' ข้อมูลจำลอง นาที ' + start + ' ถึง ' + end + (available.length ? '' : ' ไม่มีข้อมูลที่ใช้ได้ในช่วงนี้');
    return '<figure class="history-chart"><figcaption>' + label + '<span>' + unit + '</span></figcaption><svg viewBox="0 0 296 102" role="img" aria-label="' + escape(description) + '"><path class="history-grid" d="M37 16H281M37 47H281M37 78H281"/><text x="31" y="20" text-anchor="end">' + maximum.toFixed(digits) + '</text><text x="31" y="81" text-anchor="end">0</text>' + (threshold === null ? '' : '<path class="history-threshold" d="M37 ' + y(threshold).toFixed(2) + 'H281"/>') + '<path class="history-line ' + field + '" data-series="' + field + '" d="' + path + '"/>' + (available.length === 1 ? '<circle class="history-point" cx="' + x(available[0].minute) + '" cy="' + y(available[0][field]) + '" r="2.5"/>' : '') + '<text x="37" y="97">นาที ' + start + '</text><text x="281" y="97" text-anchor="end">' + end + '</text></svg>' + (available.length ? '' : '<p class="history-empty">ช่วงนี้ไม่มีข้อมูลใหม่ที่ใช้ได้</p>') + '</figure>';
  }
  function render() {
    if (!root.WildfireApp || !root.WildfireCore || !root.WILDFIRE_PLAN) return;
    const state = root.WildfireApp.getState();
    const host = document.querySelector('#details .detail-body-block');
    if (!host) return;
    host.querySelector('.telemetry-history')?.remove();
    if (state.view !== 'demo') return;
    const core = root.WildfireCore, plan = root.WILDFIRE_PLAN;
    const source = state.source === 'target' ? plan.target : plan.stations.find(s => s.id === state.source);
    const options = { source, scenario: state.scenario, windToDeg: state.windToDeg, windSpeedMps: state.windSpeedMps };
    const samples = series(core, state.selectedStation, state.minute, options);
    const timeline = events(core, plan.stations, state.minute, options);
    const section = document.createElement('section');
    section.className = 'telemetry-history';
    section.dataset.station = state.selected;
    section.setAttribute('aria-label', 'กราฟและเหตุการณ์จำลองของ ' + state.selected);
    section.innerHTML = '<h3>แนวโน้ม ' + escape(state.selected) + ' · ย้อนหลัง 10 นาที</h3><p class="history-note">ค่าจำลอง · ช่องว่างคือข้อมูลขาด ไม่ใช่ค่าศูนย์</p>' + chart(samples, 'pm', 'PM2.5', 'µg/m³') + chart(samples, 'co', 'CO', 'ppm') + '<p class="history-note">เส้นประ = เกณฑ์ของเดโมแต่ละค่า ต้องเพิ่มทั้ง PM และ CO ต่อเนื่องจึงขึ้นสถานะต้องตรวจสอบ ไม่ใช้เป็นเกณฑ์ปฏิบัติการจริง</p><h3>ลำดับเหตุการณ์ทั้งเครือข่าย</h3><ol class="history-events">' + timeline.map(e => '<li data-event="' + e.kind + '"><time>นาที ' + e.minute + '</time><div><b>' + escape(e.title) + '</b><small>' + escape(e.detail) + '</small></div></li>').join('') + '</ol>' + (state.acknowledged ? '<p class="history-ack">รับทราบฉากนี้แล้ว · ไม่ใช่ยืนยันไฟหรือบันทึกในระบบกลาง</p>' : '');
    host.appendChild(section);
  }
  // Existing app replaces direct children of #details on selection / playback / reset.
  // Observe only that boundary. Inserting charts deeper in the tree cannot retrigger us.
  const details = document.getElementById('details');
  if (details) {
    const observer = new MutationObserver(render);
    observer.observe(details, { childList: true });
    root.addEventListener('pagehide', () => observer.disconnect(), { once: true });
    root.addEventListener('pageshow', () => { observer.observe(details, { childList: true }); render(); });
    render();
  }
})(typeof window !== 'undefined' ? window : globalThis);
