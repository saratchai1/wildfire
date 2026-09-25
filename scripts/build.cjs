const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const C = require('../core.js');
const out = path.resolve('site');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const files = ['index.html','styles.css','core.js','app.js','history.js','history.css','data/context.js','data/context.json','data/plan.js','docs/DESIGN.md','docs/LEGACY_REFERENCE.md'];
for (const file of files) {
  const destination = path.join(out, file);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(file, destination);
}
fs.writeFileSync(path.join(out, '.nojekyll'), '');
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync('data/plan.js', 'utf8'), sandbox);
const plan = sandbox.window.WILDFIRE_PLAN;
fs.writeFileSync(path.join(out,'data/stations.geojson'), JSON.stringify(C.features(plan), null, 2));
fs.writeFileSync(path.join(out,'data/stations.csv'), C.csv(plan));
fs.writeFileSync(path.join(out,'data/stations.kml'), C.kml(plan));
fs.writeFileSync(path.join(out,'version.json'), JSON.stringify({ sourceCommit: process.env.GITHUB_SHA || 'local', planVersion: plan.version, mode: 'PROPOSED_PLAN_WITH_SYNTHETIC_DEMO', generatedAt: new Date().toISOString() }, null, 2));
console.log('Static site built with actual OSM/DEM context, history and eight station exports.');
