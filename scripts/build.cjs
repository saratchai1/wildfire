const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const C=require('../core.js'),S=require('../siting.js'),M=require('../console-model.js');
const out=path.resolve('site');fs.rmSync(out,{recursive:true,force:true});fs.mkdirSync(out,{recursive:true});
const files=['index.html','planning.html','v1.html','console.css','console-model.js','console-map.js','console.js','styles.css','core.js','core-v1.js','app.js','app-v1.js','history.js','history.css','siting.js','siting-ui.js','siting.css','data/context.js','data/context.json','data/plan.js','data/plan-v2.json','data/plan-v1.js','data/plan-v1-compare.js','docs/DESIGN.md','docs/DESIGN_V2.md','docs/LEGACY_REFERENCE.md','docs/OPERATOR_EXPLAINER.md','docs/NORTH_STATION.md'];
for(const file of files){const destination=path.join(out,file);fs.mkdirSync(path.dirname(destination),{recursive:true});fs.copyFileSync(file,destination);}
fs.writeFileSync(path.join(out,'.nojekyll'),'');
const box={window:{}};vm.runInNewContext(fs.readFileSync('data/plan.js','utf8'),box);const plan=box.window.WILDFIRE_PLAN;
fs.writeFileSync(path.join(out,'data/stations.geojson'),JSON.stringify(S.geojson(plan),null,2));fs.writeFileSync(path.join(out,'data/stations.csv'),C.csv(plan));fs.writeFileSync(path.join(out,'data/stations.kml'),C.kml(plan));
fs.writeFileSync(path.join(out,'data/study-area.geojson'),JSON.stringify({type:'Feature',properties:{role:'REQUESTED_STUDY_AREA_NOT_CERTIFIED_DETECTION_COVERAGE',radius_m:2000,area_km2:Math.PI*4},geometry:{type:'Polygon',coordinates:[S.circle(plan.target).map(p=>[p.lon,p.lat])]}}));
if(fs.existsSync('qa/screening-v2.json'))fs.copyFileSync('qa/screening-v2.json',path.join(out,'data/screening-baseline.json'));
fs.writeFileSync(path.join(out,'version.json'),JSON.stringify({sourceCommit:process.env.GITHUB_SHA||'local',appVersion:M.APP_VERSION,planVersion:plan.version,stationCount:plan.stations.length,primaryViews:['dashboard','principles'],mode:'SYNTHETIC_DEMO_WITH_CONDITIONAL_EXPLAINER',generatedAt:new Date().toISOString()},null,2));
console.log('Built two-part officer/explainer application; ten-station plan and v1/v2 tools preserved.');
