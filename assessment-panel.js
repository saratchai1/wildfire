/* Fast evidence is separate from slow, explicitly requested source-area stress tests. */
(function () {
  'use strict';
  const A = window.WildfireAssessment, P = window.WILDFIRE_PLAN, $ = id => document.getElementById(id);
  let packet = null, evidence = null, baseline = null, diagnostics = null, worker = null, ticket = 0, timer = null, running = false;
  const names = ids => ids.map(id => P.stations.find(s => s.id === id)?.screenLabel || id).join(' / ');
  const time = value => value ? new Date(value).toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour12: false }) + ' น.' : 'ยังไม่มี';
  const fmt = (x, digits = 2) => Number.isFinite(x) ? x.toFixed(digits) : '—';
  const labels = { SIGNAL: 'มีสัญญาณให้ตรวจสอบ', SIGNAL_HISTORY: 'เคยพบสัญญาณ · เหตุยังไม่ปิด',
    PENDING: 'PM + CO สูง · รอความต่อเนื่อง', MULTI_STATION_WATCH: 'เฝ้าดูแนวโน้มหลายสถานี',
    WATCH: 'เฝ้าดูความผิดปกติ', DATA_UNAVAILABLE: 'ไม่มีข้อมูลปัจจุบันที่ใช้ได้', NO_WATCH: 'ยังไม่พบตามเกณฑ์เฝ้าดู' };
  function stop() {
    ticket++; running = false; clearTimeout(timer); timer = null;
    if (worker) worker.terminate(); worker = null; $('sensitivity-cancel').hidden = true;
  }
  function canRun() {
    return !!packet && !!baseline?.cells.length && baseline.modelVersion === window.WildfireInverse.VERSION && !window.WildfireInverseApp?.getState().playing;
  }
  function controls() { $('sensitivity-run').disabled = running || !canRun(); }
  function invalidate() {
    stop(); packet = evidence = baseline = diagnostics = null;
    $('evidence-stage').textContent = 'กำลังตรวจข้อมูลชุดใหม่';
    $('location-stage').textContent = 'รอผลของข้อมูลชุดใหม่';
    $('evidence-details').replaceChildren(); $('sensitivity-rows').replaceChildren();
    $('sensitivity-status').textContent = 'ยังไม่ตรวจความไวของข้อมูลชุดนี้';
    $('location-sensitivity-note').textContent = 'ยังไม่ตรวจความไวของพื้นที่ · ไม่ใช่ต้นเพลิงที่ยืนยันแล้ว';
    controls();
  }
  function addLine(text) { const p = document.createElement('p'); p.textContent = text; $('evidence-details').append(p); }
  function showEvidence() {
    $('evidence-stage').textContent = labels[evidence.status]; $('evidence-stage').dataset.status = evidence.status;
    $('evidence-time').textContent = 'ข้อมูล ณ ' + time(evidence.asOf);
    $('evidence-details').replaceChildren();
    addLine('สัญญาณปัจจุบัน: ' + (names(evidence.currentSignalStationIds) || 'ยังไม่มี') + ' · เฝ้าดู: ' + (names(evidence.watchStationIds) || 'ยังไม่มี'));
    addLine('วัดพบตามลำดับเวลาวัด: ' + time(evidence.firstMeasurementSignalAt) + ' · ข้อมูลที่จำเป็นมาถึงระบบครบครั้งแรก: ' + time(evidence.firstReceivedSignalAt));
    const watching = evidence.entries.filter(r => r.watchReason);
    for (const row of watching) addLine(names([row.id]) + ' — ' + ({ PAIRED_RISE: 'PM และ CO เพิ่มระดับเฝ้าดู', PM_RISE: 'PM เพิ่มอย่างเดียว', CO_RISE: 'CO เพิ่มอย่างเดียว' }[row.watchReason]) +
      ' · ΔPM ' + fmt(row.deltaPm25, 1) + ' µg/m³ / ΔCO ' + fmt(row.deltaCo) + ' ppm · ตั้งแต่ ' + time(row.watchSince));
    addLine('ชั้นเฝ้าดูเป็นกฎทดลอง ไม่ยืนยันไฟ ไม่เปิดเหตุหรือเปลี่ยนเกณฑ์แจ้งเดิม และไม่ต้องรอระบุต้นทางจึงเห็นสัญญาณ');
  }
  function showDiagnostics() {
    const r = diagnostics;
    const text = r.status === 'SENSITIVE' ? 'ผลไวต่อข้อมูล/สมมติฐาน · ยังไม่ควรจำกัดพื้นที่แคบ' :
      r.status === 'STABLE_UNDER_TESTS' ? 'ผลใกล้เคียงกันภายใต้การทดสอบนี้ · ไม่ใช่การรับรองความแม่นยำ' :
      r.status === 'INCOMPLETE' ? 'การตรวจไม่ครบ · ยังสรุปความมั่นคงไม่ได้' : 'ยังไม่มีพื้นที่ให้ตรวจความไว';
    $('sensitivity-status').textContent = text; $('sensitivity-status').dataset.status = r.status;
    $('location-sensitivity-note').textContent = text + (r.criticalStationIds.length ? ' · ขึ้นกับสถานี ' + names(r.criticalStationIds) : '');
    $('sensitivity-rows').replaceChildren();
    for (const item of r.trials) {
      const tr = document.createElement('tr'); tr.dataset.trial = item.id;
      const title = item.type === 'LEAVE_ONE_STATION_OUT' ? 'ตัด ' + names([item.stationId]) + ' (ควันและลม)' :
        item.type === 'WIND_STRESS' ? 'ทิศลมคลาด ' + item.offsetDeg + '° (สมมติ)' : 'ไม่ใช้ค่าควันจากสถานีเงียบ · ยังใช้ลม';
      const c = item.comparison;
      for (const value of [title, item.status === 'ERROR' ? item.error : c.status === 'REGION_LOST' ? 'ระบุพื้นที่ไม่ได้' : c.sensitive ? 'ไวต่อเงื่อนไขนี้' : 'ใกล้เคียงเดิม',
        fmt(c?.iou), fmt(c?.centroidShiftM, 0), fmt(item.areaKm2)]) {
        const td = document.createElement('td'); td.textContent = value; tr.append(td);
      }
      $('sensitivity-rows').append(tr);
    }
  }
  window.addEventListener('wildfire-analysis-start', invalidate);
  window.addEventListener('wildfire-observations', ({ detail }) => {
    try { packet = detail.packet; evidence = A.observe(packet); showEvidence(); }
    catch (error) { packet = evidence = null; $('evidence-stage').textContent = 'ข้อมูลใช้ไม่ได้: ' + error.message; }
  });
  window.addEventListener('wildfire-analysis-error',()=>{stop();baseline=null;diagnostics=null;$('location-stage').textContent='คำนวณพื้นที่ไม่สำเร็จ';$('sensitivity-status').textContent='ไม่มีผลพื้นที่ใหม่ให้ตรวจ';controls();});
  window.addEventListener('wildfire-analysis', ({ detail }) => {
    baseline = detail.report;
    $('location-stage').textContent = baseline.cells.length ? 'มีพื้นที่สมมติฐาน · ' + fmt(baseline.areaKm2) + ' ตร.กม.' : 'ยังระบุพื้นที่ต้นทางไม่ได้';
    controls();
  });
  window.addEventListener('wildfire-play-state', () => {
    if (window.WildfireInverseApp?.getState().playing) { stop(); diagnostics = null; $('sensitivity-rows').replaceChildren(); $('sensitivity-status').textContent = 'พักข้อมูลก่อนตรวจความไว'; }
    controls();
  });
  $('sensitivity-run').onclick = () => {
    if (!canRun() || running) return;
    stop(); diagnostics = null; running = true; const id = ++ticket;
    $('sensitivity-rows').replaceChildren(); $('sensitivity-status').textContent = 'กำลังทดสอบทีละสถานีและสมมติฐาน…';
    $('location-sensitivity-note').textContent = 'กำลังตรวจความไว · พื้นที่ยังเป็นสมมติฐานเดิม';
    $('sensitivity-cancel').hidden = false; controls();
    try {
      worker = new Worker('./assessment-worker.js');
      worker.onmessage = ({ data }) => {
        if (data.id !== ticket || !running) return;
        if (data.progress) { $('sensitivity-status').textContent = 'ตรวจแล้ว ' + data.progress.completed + ' / ' + data.progress.total + ' เงื่อนไข'; return; }
        stop();
        if (data.error) { $('sensitivity-status').textContent = 'ตรวจไม่สำเร็จ: ' + data.error; $('location-sensitivity-note').textContent = 'ตรวจความไวไม่สำเร็จ · ยังสรุปความมั่นคงไม่ได้'; }
        else { diagnostics = data.result; showDiagnostics(); }
        controls();
      };
      worker.onerror = () => { stop(); diagnostics = null; $('sensitivity-status').textContent = 'Worker ทำงานไม่ได้ · ยังตรวจไม่ครบ'; $('location-sensitivity-note').textContent = 'ตรวจความไวไม่สำเร็จ'; controls(); };
      timer = setTimeout(() => { stop(); diagnostics = null; $('sensitivity-status').textContent = 'เกินเวลา 120 วินาที · ยกเลิกการตรวจ ไม่ถือว่าผ่าน'; $('location-sensitivity-note').textContent = 'ตรวจความไวไม่ครบ'; controls(); }, 120000);
      worker.postMessage({ id, packet });
    } catch (error) { stop(); $('sensitivity-status').textContent = 'ใช้ Worker ไม่ได้: ' + error.message; $('location-sensitivity-note').textContent='ยังไม่ได้ตรวจความไว'; controls(); }
  };
  $('sensitivity-cancel').onclick = () => { stop(); diagnostics = null; $('sensitivity-rows').replaceChildren(); $('sensitivity-status').textContent = 'ยกเลิกแล้ว · ยังไม่ได้ตรวจครบ'; $('location-sensitivity-note').textContent = 'ยกเลิกการตรวจความไว · ยังสรุปไม่ได้'; controls(); };
  window.WildfireAssessmentPanel = Object.freeze({ getState: () => JSON.parse(JSON.stringify({ evidence, diagnostics, running })) });
  invalidate();
})();
