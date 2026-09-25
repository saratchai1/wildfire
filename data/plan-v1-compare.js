/* Survey anchors, not approved foundations. Coordinates follow actual OSM road geometry. */
window.WILDFIRE_LEGACY_PLAN = {
  version: 'roadside-solar-v1',
  status: 'PROPOSED_FOR_FIELD_SURVEY',
  target: { lat: 18.8135555556, lon: 98.86225 },
  powerAssumptions: { peakSunHours: 3, solarDerate: 0.7, depthOfDischarge: 0.8, batteryEfficiency: 0.9, endOfLifeCapacity: 0.8, minimumAutonomyHours: 72 },
  kits: {
    AQ: { name: 'สถานีควัน', averageW: 1, panelWp: 50, batteryV: 12.8, batteryAh: 20, weather: false, gateway: false },
    WX: { name: 'ควัน + ลม', averageW: 2, panelWp: 80, batteryV: 12.8, batteryAh: 30, weather: true, gateway: false },
    HUB: { name: 'ควัน + ลม + Gateway', averageW: 6, panelWp: 150, batteryV: 12.8, batteryAh: 60, weather: true, gateway: true }
  },
  stations: [
    { id: 'R01', label: 'แนวถนนด้านตะวันออกตอนบน', side: 'E', kit: 'HUB', lat: 18.8166609, lon: 98.8909221, elevationM: 1574, wayId: 1326288076, highway: 'tertiary', surface: 'asphalt', sampleId: 'C06', distanceM: 3038, gateway: 'R01', reason: 'จุดอ้างอิงระดับสูงของฝั่งตะวันออก วัดลมและรวมข้อมูลฝั่งดอยปุย ไม่พึ่ง Gateway ข้ามเขา', fieldNote: 'สำรวจช่องเปิดรับแดด ความปั่นป่วนของลมจากหน้าผา และสัญญาณเครือข่ายมือถือ', conditional: false },
    { id: 'R02', label: 'แนวถนนเข้าพื้นที่ดอยปุย', side: 'E', kit: 'AQ', lat: 18.8164598, lon: 98.8853976, elevationM: 1321, wayId: 134771207, highway: 'residential', surface: 'paved', sampleId: 'C04', distanceM: 2458, gateway: 'R01', reason: 'เติมจุดตรวจบนถนนช่วงกลางระหว่างสถานีระดับสูงกับแนวขอบชุมชน', fieldNote: 'หลีกเลี่ยงจุดจอดรถ ร้านอาหาร และไอเสียที่เข้าช่องรับอากาศโดยตรง', conditional: false },
    { id: 'R03', label: 'ทางบริการด้านตะวันตกของดอยปุย', side: 'E', kit: 'AQ', lat: 18.8167034, lon: 98.8820312, elevationM: 1247, wayId: 134770784, highway: 'service', surface: 'unpaved', sampleId: 'C03', distanceM: 2111, gateway: 'R01', reason: 'ขยับจุดตรวจฝั่งตะวันออกเข้าใกล้ป่าเป้าหมาย โดยยังอ้างอิงทางบริการที่ปรากฏใน OSM', fieldNote: 'ทางไม่ลาดยาง: ตรวจรถเข้าถึง ความกว้าง ความเป็นทางสาธารณะ และช่องเปิดรับแดดก่อนเลือกใช้', conditional: true },
    { id: 'R04', label: 'แนวถนนด้านตะวันออกตอนใต้', side: 'E', kit: 'WX', lat: 18.8107123, lon: 98.8869523, elevationM: 1341, wayId: 113778920, highway: 'unclassified', surface: 'asphalt', sampleId: 'C09', distanceM: 2619, gateway: 'R01', reason: 'แยกวัดลมและควันจากแนวใต้ของฝั่งตะวันออก ช่วยเห็นความต่างจาก R01', fieldNote: 'ตรวจลมที่ได้รับอิทธิพลจากโค้งถนนและเรือนยอด ไม่ถือว่าลมริมถนนแทนลมทั้งภูเขา', conditional: false },
    { id: 'R05', label: 'ทางบริการใกล้หมุดด้านตะวันตก', side: 'W', kit: 'AQ', lat: 18.810123, lon: 98.8481055, elevationM: 760, wayId: 1125539935, highway: 'service', surface: 'unpaved', sampleId: 'C22', distanceM: 1537, gateway: 'R08', reason: 'เป็นหมุดถนนที่ใกล้เป้าหมายที่สุดในชุดคัดเลือก ลดช่องว่างฝั่งตะวันตกโดยไม่ปักกลางป่า', fieldNote: 'ทางไม่ลาดยาง: เป็นจุดมีเงื่อนไข ต้องตรวจแดด สิทธิ์เข้าถึง และเส้นทางบำรุงรักษา', conditional: true },
    { id: 'R06', label: 'แนวถนนคอนกรีตด้านตะวันตกเฉียงใต้', side: 'W', kit: 'AQ', lat: 18.8019146, lon: 98.8496934, elevationM: 639, wayId: 964524420, highway: 'residential', surface: 'concrete', sampleId: 'C14', distanceM: 1850, gateway: 'R08', reason: 'เติมการตรวจควันทางตะวันตกเฉียงใต้จากถนนผิวแข็ง แยกจากทางบริการ R05', fieldNote: 'ตรวจแหล่งควันชุมชนและระยะห่างจากรถ พร้อมสำรวจสัญญาณถึง R08', conditional: false },
    { id: 'R07', label: 'แนวถนนฝั่งตะวันตกตอนใต้', side: 'W', kit: 'AQ', lat: 18.8056821, lon: 98.834623, elevationM: 545, wayId: 242068982, highway: 'unclassified', surface: 'paved', sampleId: 'C21', distanceM: 3037, gateway: 'R08', reason: 'ติดตามสัญญาณอีกช่วงของแนวถนนตะวันตก และใช้เปรียบเทียบค่าพื้นหลังเมื่อทิศลมเหมาะสม', fieldNote: 'ไม่มีสถานีใดเป็นจุดต้นลมถาวร ต้องเลือกค่าพื้นหลังใหม่ตามลม', conditional: false },
    { id: 'R08', label: 'แนวถนนฝั่งปางยาง', side: 'W', kit: 'HUB', lat: 18.8149905, lon: 98.8321842, elevationM: 652, wayId: 556865958, highway: 'residential', surface: 'concrete', sampleId: 'C23', distanceM: 3169, gateway: 'R08', reason: 'สถานีลมและ Gateway แยกของฝั่งตะวันตก ลดจุดล้มเหลวจากการรับส่งข้ามภูเขา', fieldNote: 'ตรวจช่องเปิดรับแดดและ cellular backhaul; เส้นเชื่อมในแผนเป็นสถาปัตยกรรม ไม่ใช่ผลทดสอบคลื่น', conditional: false }
  ]
};
