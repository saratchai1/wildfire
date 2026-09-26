/* Invoked after the unchanged default application build. Fail closed without evidence. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const version=require('../terrain-inverse.js').VERSION;
if(!fs.existsSync('qa/v2b-benchmark.json'))throw Error('V2B_BENCHMARK_REQUIRED');
const report=JSON.parse(fs.readFileSync('qa/v2b-benchmark.json'));
if(report.version!==version||report.fieldValidated!==false||report.defaultPromoted!==false)throw Error('V2B_BENCHMARK_MISMATCH');
for(const[file,hash]of Object.entries(report.frozen.hashes))if(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==hash)throw Error('V2B_BENCHMARK_STALE_'+file);
const files=['terrain.html','terrain.css','terrain-ui.js','terrain-physics.js','terrain-inverse.js','terrain-worker.js','calibration.js','docs/TERRAIN_V2B.md'];
for(const file of files){fs.mkdirSync(path.dirname('site/'+file),{recursive:true});fs.copyFileSync(file,'site/'+file);}
fs.copyFileSync('qa/v2b-benchmark.json','site/data/v2b-benchmark.json');
fs.writeFileSync('site/data/collocation-template.json',JSON.stringify(require('../calibration').template(),null,2));
const out=JSON.parse(fs.readFileSync('site/version.json'));out.experimentalTerrain={version,entry:'terrain.html',promoted:false,fieldValidated:false,calibrationVersion:require('../calibration').VERSION};
for(const file of [...files,'data/v2b-benchmark.json','data/collocation-template.json'])out.assets[file]=crypto.createHash('sha256').update(fs.readFileSync('site/'+file)).digest('hex');
fs.writeFileSync('site/version.json',JSON.stringify(out,null,2));console.log('Built separate V2B experimental workbench. Baseline stays default; no field validation.');
