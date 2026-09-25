# Forest Watch — observation-only smoke source-area screening

เว็บ: https://saratchai1.github.io/wildfire/

## สองส่วนหลัก
1. `#dashboard` แดชบอร์ดเจ้าหน้าที่ เห็นข้อมูลตรวจวัดและพื้นที่ต้นทางที่เป็นไปได้ ไม่เห็นพิกัดไฟที่ซ่อนในตัวสร้างฉาก
2. `#principles` ห้องทดลองแบบซ่อนคำตอบ ปรับลม/ตำแหน่ง ทดลองควันหลายกรณี และเปิดเฉลยเพื่อเทียบพื้นที่ที่ระบบประเมิน

ตัววิเคราะห์รับเฉพาะค่าจากสถานีและประวัติลม ไม่รับ true source / ignition time / ชื่อฉาก มี Worker แยกจากตัวสร้างข้อมูล ใช้ข้อมูลจำลองแบบ Gaussian puffs คนละสูตรกับ inverse footprint solver และนำเข้า observation JSON ที่ตรงสัญญาข้อมูลได้ใน browser (ไม่อัปโหลด)

คงสิบสถานี E1–E5, W1–W4, N1 / R10 ตำแหน่งพลังงานเดิมทั้งหมด และวงศึกษารัศมี 2 กม. เพิ่ม buffer ค้นหาต้นทางถึง 4 กม. เพื่อไม่บังคับว่าควันต้องมาจากในโครงการ

ผลเป็นพื้นที่ที่สอดคล้องกับข้อมูล ไม่ใช่พิกัดต้นเพลิงยืนยันหรือความน่าจะเป็นที่สอบเทียบ ข้อมูลสถานีเดียว ลมสงบ ข้อมูลหาย และแบบจำลองที่อธิบายข้อมูลไม่ดีต้องแสดงข้อจำกัด ไม่ถือว่าไม่มีไฟ ไม่มี live feed/backend หรือแจ้งเตือน/สั่งการจริง

## เครื่องมือเดิม
- `forward.html` แดชบอร์ดจำลองไปข้างหน้าและตารางลม 8 ทิศเดิม
- `planning.html` แผนติดตั้ง พลังงาน และการคัดกรองพื้นที่เดิม
- `v1.html` แผนรุ่นแปดจุด

## พัฒนาและทดสอบ
```sh
node --test tests/*.test.cjs
node scripts/build.cjs
python -m http.server 4173 --directory site
```
Browser suite ต้องมี Playwright/Chromium: tests/browser.py, tests/history_browser.py, tests/siting_browser.py, tests/legacy_console_regression.py, tests/inverse_browser.py ขณะ server ทำงาน

[Design / Observation contract / assumptions / limitations](docs/INVERSE_SOURCE.md) · [N1](docs/NORTH_STATION.md)

CI รัน unit/model/geospatial และ browser regression ก่อน deploy ตรวจ commit/appVersion/assets SHA-256 กับเว็บจริงหลัง deploy ผลและภาพ desktop/mobile อยู่ Actions artifact `wildfire-qa-and-portable-app`. Tests ผ่านไม่เท่ากับการพิสูจน์ความแม่นยำภาคสนาม
