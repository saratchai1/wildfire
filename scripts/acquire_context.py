"""Acquire reproducible public road/elevation context; never invent missing data."""
import collections, datetime, hashlib, io, json, math, pathlib, time, urllib.parse, urllib.request
from PIL import Image

OUT=pathlib.Path('data'); OUT.mkdir(exist_ok=True)
LAT,LON=18.8135555556,98.86225
R=6371008.8
BBOX=(18.7735,98.8172,18.8536,98.9073)
HEADERS={'User-Agent':'WildfireRoadsidePilot/1.0 (https://github.com/saratchai1/wildfire)'}
def get(url,timeout=65):
    with urllib.request.urlopen(urllib.request.Request(url,headers=HEADERS),timeout=timeout) as r:return r.read()
def xy(lat,lon):return ((lon-LON)*math.pi/180*R*math.cos(math.radians(LAT)),(lat-LAT)*math.pi/180*R)
def ll(x,y):return [LON+math.degrees(x/(R*math.cos(math.radians(LAT)))),LAT+math.degrees(y/R)]
def dp(p,eps):
    if len(p)<3:return p
    ax,ay=p[0];bx,by=p[-1];dx=bx-ax;dy=by-ay;den=dx*dx+dy*dy
    ds=[]
    for x,y in p[1:-1]:
        t=max(0,min(1,((x-ax)*dx+(y-ay)*dy)/den)) if den else 0
        ds.append(math.hypot(x-ax-t*dx,y-ay-t*dy))
    m=max(ds,default=0)
    if m<=eps:return [p[0],p[-1]]
    i=ds.index(m)+1;return dp(p[:i+1],eps)[:-1]+dp(p[i:],eps)
query='[out:json][timeout:45];(way["highway"](%s);node["tourism"~"viewpoint|camp_site"](%s);node["place"~"village|hamlet"](%s););out geom;'%(','.join(map(str,BBOX)),)*3
raw=None
for ep in ['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter','https://overpass.private.coffee/api/interpreter']:
    try:
        raw=get(ep+'?'+urllib.parse.urlencode({'data':query})); osm=json.loads(raw)
        if not osm.get('elements'):raise RuntimeError('Empty OSM result')
        source=ep;break
    except Exception as e:print('Source unavailable:',ep,str(e),flush=True);time.sleep(3)
else:raise RuntimeError('No road snapshot acquired; do not publish fabricated stations')
(OUT/'osm-source.json').write_bytes(raw)
now=datetime.datetime.now(datetime.timezone.utc).isoformat()
road_types={'primary','secondary','tertiary','unclassified','residential','service','primary_link','secondary_link','tertiary_link','living_street'}
features=[];samples=[];pois=[]
for e in osm['elements']:
    tags=e.get('tags',{})
    if e['type']=='node':
        pois.append({'id':e['id'],'lat':e['lat'],'lon':e['lon'],'tags':tags});continue
    if not e.get('geometry'):continue
    coords=[xy(p['lat'],p['lon']) for p in e['geometry']]
    if min(math.hypot(x,y) for x,y in coords)>4500:continue
    properties={k:v for k,v in tags.items() if k in ['highway','name','name:en','name:th','ref','surface','access','motor_vehicle','tracktype','width','lanes','lit']}
    properties['osm_way_id']=e['id']
    features.append({'type':'Feature','properties':properties,'geometry':{'type':'LineString','coordinates':[[round(v,7) for v in ll(x,y)] for x,y in dp(coords,6)]}})
    if tags.get('highway') not in road_types or tags.get('access') in ['private','no'] or tags.get('motor_vehicle') in ['no','private']:continue
    carry=0
    for (ax,ay),(bx,by) in zip(coords,coords[1:]):
        length=math.hypot(bx-ax,by-ay)
        if not length:continue
        d=carry
        while d<=length:
            f=d/length;x=ax+f*(bx-ax);y=ay+f*(by-ay);dist=math.hypot(x,y)
            if 200<dist<3500:
                lon,lat=ll(x,y)
                samples.append({'lat':round(lat,7),'lon':round(lon,7),'distance_m':round(dist),'bearing_deg':round(math.degrees(math.atan2(x,y))%360,1),'osm_way_id':e['id'],'highway':tags['highway'],'road_name':tags.get('name:th',tags.get('name',tags.get('ref','Unnamed mapped road'))),'surface':tags.get('surface','unknown'),'access':tags.get('access','unknown')})
            d+=150
        carry=d-length
# Sparse shortlist: nearest eligible road point within each of 16 bearings, then additional near-target anchors.
selected=[]
for b in range(0,360,22):
    choices=[s for s in samples if abs((s['bearing_deg']-b+180)%360-180)<=30 and all(math.hypot(*(a-b for a,b in zip(xy(s['lat'],s['lon']),xy(p['lat'],p['lon']))))>=300 for p in selected)]
    if choices:selected.append(min(choices,key=lambda s:s['distance_m']+8*abs((s['bearing_deg']-b+180)%360-180)))
for s in sorted(samples,key=lambda s:s['distance_m']):
    if len(selected)>=24:break
    if all(math.hypot(*(a-b for a,b in zip(xy(s['lat'],s['lon']),xy(p['lat'],p['lon']))))>=350 for p in selected):selected.append(s)
selected.sort(key=lambda s:s['bearing_deg'])
for i,s in enumerate(selected,1):s['id']='C%02d'%i
# Terrain: Mapzen Terrarium tiles. Data is real context, not a fire fuel or solar/shadow survey.
terrain=None
try:
    z=12;n=2**z;cache={}
    def elevation(lat,lon):
        x=(lon+180)/360*n;y=(1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2*n
        tx,ty=int(x),int(y)
        if (tx,ty) not in cache:
            blob=get(f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{tx}/{ty}.png',25)
            cache[tx,ty]=Image.open(io.BytesIO(blob)).convert('RGB')
        r,g,b=cache[tx,ty].getpixel((min(255,int((x-tx)*256)),min(255,int((y-ty)*256))))
        return round(r*256+g+b/256-32768)
    size=65;w,s,e,north=BBOX[1],BBOX[0],BBOX[3],BBOX[2]
    grid=[elevation(north+(s-north)*j/(size-1),w+(e-w)*i/(size-1)) for j in range(size) for i in range(size)]
    terrain={'width':size,'height':size,'bounds':[w,s,e,north],'elevations_m':grid,'source':'Mapzen Terrarium elevation tiles via AWS Open Data','source_url':'https://registry.opendata.aws/terrain-tiles/','sample_zoom':z,'sample_spacing_m_approx':140,'note':'Mixed-source DEM; not a canopy, shoulder, solar horizon, or calibrated fire model.'}
    for p in selected:p['elevation_m']=elevation(p['lat'],p['lon'])
except Exception as ex:print('Elevation unavailable; keep unknown:',str(ex),flush=True)
meta={'schema_version':1,'acquired_at':now,'osm_base_timestamp':osm.get('osm3s',{}).get('timestamp_osm_base'),'osm_source':source,'osm_query':query,'osm_sha256':hashlib.sha256(raw).hexdigest(),'target':{'lat':LAT,'lon':LON,'status':'USER_SELECTED_PLANNING_REFERENCE'},'license':'Road data © OpenStreetMap contributors, ODbL 1.0','solar_survey_status':'NOT_SURVEYED','radio_survey_status':'NOT_SURVEYED'}
context={'meta':meta,'roads':{'type':'FeatureCollection','features':features},'pois':pois,'terrain':terrain}
(OUT/'context.json').write_text(json.dumps(context,ensure_ascii=False,separators=(',',':')),encoding='utf8')
(OUT/'context.js').write_text('window.WILDFIRE_CONTEXT='+json.dumps(context,ensure_ascii=False,separators=(',',':'))+';',encoding='utf8')
(OUT/'survey-candidates.json').write_text(json.dumps({'meta':meta,'candidates':selected},ensure_ascii=False,indent=2),encoding='utf8')
summary={'acquired_at':now,'road_features':len(features),'road_types':dict(collections.Counter(f['properties']['highway'] for f in features)),'eligible_samples':len(samples),'nearest_eligible_road_m':min((s['distance_m'] for s in samples),default=None),'terrain_available':terrain is not None,'pois':pois,'candidates':selected}
(OUT/'acquisition-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(summary,ensure_ascii=False,indent=2))
