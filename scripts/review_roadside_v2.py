"""Review user-marked corridors against the existing immutable OSM snapshot; no field claims."""
import json, math, pathlib, hashlib
R=6371008.8; LAT=18.8135555556; LON=98.86225
# Measured in a 1330 x 1120 rendering of the user's 1760 x 1482 screenshot.
# A single known target + approximate scale; NOT a surveyed image georeference.
SCALE=500/134; ORIGIN=(681,491)
HINTS=[('W1',403,270),('W2',365,470),('W3',340,694),('W4',311,866),('E1',930,330),('E2',875,420),('E3',775,603),('E4',806,760),('E5',760,927)]
def xy(lat,lon):return ((lon-LON)*math.pi/180*R*math.cos(math.radians(LAT)),(lat-LAT)*math.pi/180*R)
def ll(x,y):return [LON+math.degrees(x/(R*math.cos(math.radians(LAT)))),LAT+math.degrees(y/R)]
def nearest(point,coords):
 best=None
 for a,b in zip(coords,coords[1:]):
  dx=b[0]-a[0];dy=b[1]-a[1];den=dx*dx+dy*dy
  t=max(0,min(1,((point[0]-a[0])*dx+(point[1]-a[1])*dy)/den)) if den else 0
  q=(a[0]+t*dx,a[1]+t*dy); d=math.dist(point,q)
  if best is None or d<best[0]:best=(d,q)
 return best
raw=pathlib.Path('data/osm-source.json').read_bytes();osm=json.loads(raw); ways=[]
for e in osm['elements']:
 if e['type']!='way' or not e.get('geometry') or 'highway' not in e.get('tags',{}):continue
 coords=[xy(p['lat'],p['lon']) for p in e['geometry']]
 if nearest((0,0),coords)[0]>2300:continue
 ways.append((e,coords))
report={'status':'DESKTOP_REVIEW_NOT_SURVEY','source_sha256':hashlib.sha256(raw).hexdigest(),'screen_hint_uncertainty_m':150,'metres_per_rendered_pixel':SCALE,'center':[LON,LAT],'radius_m':2000,'hints':[]}
for id,px,py in HINTS:
 hint=((px-ORIGIN[0])*SCALE,(ORIGIN[1]-py)*SCALE); options=[]
 for e,coords in ways:
  d,q=nearest(hint,coords);tags=e['tags']
  options.append({'wayId':e['id'],'distance_from_hint_m':round(d,1),'coordinate':list(map(lambda v:round(v,7),ll(*q))),'distance_to_target_m':round(math.hypot(*q),1),'tags':tags})
 options.sort(key=lambda v:v['distance_from_hint_m'])
 report['hints'].append({'id':id,'pixel':[px,py],'hint_coordinate':list(map(lambda v:round(v,7),ll(*hint))),'nearest':options[:4]})
pathlib.Path('qa').mkdir(exist_ok=True)
pathlib.Path('qa/roadside-v2-review.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
# Compact linework for independent desktop inspection; source raw geometry remains authoritative.
lines=[]
for e,coords in ways:
 tags=e['tags']; pts=[];last=None
 for q in coords:
  if last is None or math.dist(q,last)>55:pts.append([round(v,6) for v in ll(*q)]);last=q
 end=[round(v,6) for v in ll(*coords[-1])]
 if len(pts)==1 or pts[-1]!=end:pts.append(end)
 lines.append({'id':e['id'],'highway':tags['highway'],'points':pts})
pathlib.Path('qa/roadside-v2-lines.json').write_text(json.dumps(lines,ensure_ascii=False),encoding='utf8')
print(json.dumps(report,ensure_ascii=False,indent=2))
