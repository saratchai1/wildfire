# Design packet — Roadside 2 km / 9-station pilot v2

## 1. Requirements, scope and evidence states

ACCEPTED USER REQUIREMENTS: new work only in saratchai1/wildfire; reuse concepts from bdteamditto/fire without modifying it; reference WGS84 18.813555556,98.86225; study radius 2,000 m, area 12.5664 km²; sparse stations on the two roadside corridors circled in the user image; solar + battery at every site; assess timely wildfire indication and directional spread support.

IMPLEMENTED IN V2: nine anchors (east E1–E5, west W1–W4), local road/DEM map, 2 km assessment boundary, separately labeled conditional transport screening and synthetic PM/CO scenes, history and energy calculations, exports, preserved v1 application, reproducible tests. Publication status comes from GitHub Actions and live version.json, not from this document.

VERIFIED COMPUTATION: raw OSM polyline matching <2 m residual for all anchors; screenshot-to-road matching distances 6.9–117.9 m; all anchors within study radius; 197 test sources x 16 directions; unit/browser tests recorded in qa. This does NOT verify OSM physical accuracy or installed coordinates.

PROPOSED HARDWARE: nine co-located PM2.5 / electrochemical CO / air temperature-RH / wind speed-direction units, with two LoRaWAN gateways and cellular backhaul at E1 and W1. No cameras in base energy budget. Nine local wind observations would be more informative than a single uniform wind arrow but are not a validated full-forest wind field.

NOT VERIFIED: recurrent fire at the center, field solar access, permissions, shoulder safety, year-round vehicle access, radio/cellular propagation, actual loads, instrument thresholds and calibration, detection probability/latency, false positives, fire model accuracy. No procurement or field installation is authorized by this digital plan.

## 2. Siting correction and coordinate contract

V1 excluded highway=track from the acquisition shortlist. This omitted the user's closer agricultural/dirt corridors and selected more distant hard-surface roads. V2 explicitly accepts a track as a CONDITIONAL road survey anchor. It does not relabel tracks as paved highways. Footway, path and steps remain excluded from station siting.

The screenshot has one known center plus approximate scale. It is not a surveyed orthoimage or a multi-control-point georeference. The script estimates circle centers, then selects the nearest eligible OSM polyline within a 150 m matching tolerance. **150 m is an assumed screening allowance, not verified geolocation accuracy, an error bound, or a statistical confidence interval.** Any legacy metadata named screenHintUncertaintyM/screenshot_coordinate_uncertainty_m refers to this assumed allowance only and must not be used for surveying. A source/coordinate revision is needed after field survey. Digit precision is not accuracy.

| Label / internal ID | Latitude | Longitude | Distance to center m | Original way ID | Kit |
|---|---:|---:|---:|---:|---|
| E1 / R01 | 18.8189027 | 98.8712384 | 1117.4 | 696213525 | HUB |
| E2 / R02 | 18.8157345 | 98.8694230 | 792.9 | 696213525 | WX |
| E3 / R03 | 18.8097818 | 98.8656835 | 553.8 | 696213512 | WX |
| E4 / R04 | 18.8045497 | 98.8676286 | 1150.4 | 255517026 | WX |
| E5 / R05 | 18.7980103 | 98.8653743 | 1759.6 | 1215941741 | WX |
| W1 / R06 | 18.8205318 | 98.8513756 | 1382.7 | 1112030805 | HUB |
| W2 / R07 | 18.8150537 | 98.8504127 | 1257.0 | 1238533290 | WX |
| W3 / R08 | 18.8068676 | 98.8505923 | 1434.8 | 1125539934 | WX |
| W4 / R09 | 18.8009826 | 98.8491976 | 1960.1 | 964524419 | WX |

E1–E5 and W1–W3 have OSM motor_vehicle=private. W4 is a mapped concrete residential road, with access unverified. OSM tags are evidence to investigate, not a legal authorization or current closure determination. Obtain appropriate access/installation permission for all sites. Select actual safe roadside offsets and pole foundations with the road owner/park authority rather than installing on these digital centerlines.

Large northern and outer-annulus gaps remain. The 2 km circle describes where the user asks to assess detection, not where detection has been proven. Marked stations do not enclose the complete circle. Do not draw fixed detection-radius disks around smoke inlets or show an all-clear from low/stale readings.

## 3. What the original sensors do

Legacy app commit 1a38fffa105dbc12763f39ae364fdaeb5e0697de proposed 100 AQ and 100 weather nodes. PM and CO together indicate smoke anomalies at an inlet, not remote temperature/flame sensing, precise ignition triangulation or confirmed fire. Weather measurements are inputs to interpret transport and fire behavior, not substitutes for fuel/moisture/topography.

Original app readings and spread lines were synthetic. The new app does not present a UI simulation as scientific validation. Its demonstration retains the original smoke kernel amplitudes and 900 m attenuation rather than v1's increased 4,200 m attenuation. This change prevents making a sparse design appear successful merely by boosting synthetic signals.

## 4. Conditional transport model contract

Code: siting.js. Canonical model name CONSTANT_WIND_GEOMETRIC_INTERCEPTION_NOT_DETECTION. Inputs are an assumed source location, wind destination bearing (0=N,90=E), speed, plume half-angle, initial capture width, timing assumptions and active station subset. Wind source bearing must be converted before use. Calm wind yields CALM_UNKNOWN, not a chosen drift direction. No active stations yields NO_ACTIVE_STATIONS.

A station intersects the assumed plume only if its along-wind distance is nonnegative and its absolute crosswind distance is <= 25 m + along-distance x tan(half-angle). Conditional arrival plus device delay = along-distance / wind-speed + sampling + persistence + uplink. Defaults: half-angle 20°, speed 2 m/s, 30+60+30 seconds overhead, 60-minute horizon, 10-minute goal. These are design assumptions, not measured communication or sensor guarantees.

Limitations: smoke is assumed to exist immediately at the selected release time and inlet height. This is NOT ignition time. No emission rate, plume rise, dilution threshold, atmospheric stability, canopy airflow, terrain-following wind, turbulence, changing wind, delayed smoke production, instrument response or responder confirmation is modeled. A geometric interception does not prove PM/CO detection. Absence of interception is a miss in this idealized scenario, not a prediction that no real smoke ever reaches that point. The model is a transparent diagnostic to expose gaps, not an operational hazard map.

Grid of 197 source points at 250 m within the circle is a TEST grid, never a sensor installation grid. All 16 wind bearings are weighted equally, not by a measured wind rose. Report numerator and full denominator (3,152), including misses, beyond-horizon and unknown states. Do not call this fraction detection probability or areal coverage. fieldDetectionProbability=null; fieldLatencyVerified=false.

Original PM/CO kernel diagnostic: exp(-along/900), crosswind Gaussian sigma=90+.18*along, local sigma85, PM=15+130*signal, CO=.15+.85*signal, growth1-exp(-elapsed/8). Joint synthetic thresholds deltaPM>25 and deltaCO>.2. legacyFirst samples threshold time every .5 minute then adds stated 2-minute overhead. It is not calibrated and does not establish hardware sensitivity. Its time origin is smoke release; dashboard playback has a separate scene-onset offset.

## 5. Computed findings, not field performance

At default 2 m/s and 20° half-angle, v2 passes the geometric <=10-minute test in 697/3152 cases (22.1%) versus v1 173/3152 (5.5%). Interception within60: v2 1638, v1 1313. No intersection: v2 1514, v1 1839. Both layouts use the same source grid, winds and settings. This comparison includes the changed count (9 vs8), so it is not a controlled attribution solely to station distance.

Sensitivity at half-angle20°, within10 v2: speed .5m/s 76/3152; 1m/s 237/3152; 2m/s 697/3152; 4m/s 1427/3152. Full 12-combination sensitivity in qa/screening-v2.json. Assumptions strongly affect results; do not select only the most favorable combination.

Center-source examples at2m/s:

| Wind going to | First station | Transport + assumed device min | Original synthetic concentration diagnostic min |
|---|---|---:|---:|
| North0° | none in assumed plume | no intersection | no threshold crossing within60 |
| Northeast45° | E1 | 11.1 | no threshold crossing within60 |
| East90° | E2 | 8.3 | 29.5 |
| Southeast135° | E3 | 6.6 | 7.0 |
| South180° | E5 | 16.4 | no threshold crossing within60 |
| West270° | W2 | 12.4 | no threshold crossing within60 |

Conclusion: the user's closer roadside alignment improves the modeled opportunity for short travel time but does not justify guaranteed early detection throughout 12.57 km². Hardware detection and smoke-plume transport validation remain necessary. Adding many sensors on the same downstream-inadequate corridor is not automatically the best remedy.

## 6. Power and communications

Seven WX budgets:2W average,80Wp panel,12.8V30Ah LiFePO4. Two HUB budgets:6W,150Wp,12.8V60Ah. Total26W/624Wh daily,860Wp,4224Wh nominal. No-sun autonomy = VxAhx.8DoDx.9 discharge efficiencyx.8 aged capacity / meanW: WX110.592h,HUB73.728h. Start full at end-of-life capacity. Solar defaults3peak-sun-hoursx.7derate, not local climatology. Batteries and electronics shaded/protected although panels need direct sun. Roadside sun is not guaranteed: check canopy and terrain shadows in fire season and adverse months. Qualified field/electrical design must establish safe mounting, protection, maintenance and measured system load. In particular always-on cellular routers, heated gas sensors or high-load weather instruments can invalidate these budgets.

Two proposed LoRaWAN gateway clusters reduce reliance on crossing the main terrain obstruction; LoRaWAN is not mesh and no RF link is guaranteed. E1/E2–E5 and W1/W2–W4 associations are logical design only. Survey link margins and cellular, buffer locally during outage, preserve sequence/timestamps and gap flags. No gateway coverage circles claimed.

## 7. Detection and spread operational design (PROPOSED, not implemented live)

Sample according to sensor response/stabilization requirements; 30-second sampling and 60-second persistence are latency-study assumptions. In real operation calibrate site-specific baselines and thresholds, compensate validated humidity/interference effects, retain raw readings and air-quality flags, and test road dust, vehicle exhaust, cooking, fog and regional haze. PM+CO are not unique to wildfire.

A strong anomaly at one eligible station should initiate SUSPECT review; do not require waiting for 2 or3 distant stations before notifying an operator. Subsequent wind-consistent signals and verified images/field observations add evidence. Human acknowledgement is not confirmation. Only authorized confirmation changes CONFIRMED. Stale/invalid data remains UNKNOWN. No real dispatch or control from this static application.

The fire-spread demonstration is an uncalibrated local-slope ellipse. Production spread requires a source/initial perimeter with uncertainty, fuels and fuel moisture, topography, local weather/wind fields and calibration with independent evidence. WindNinja and FlamMap/FARSITE are future candidate tools, NOT dependencies already running here. Smoke drift and surface-fire advance must remain separate. Never use the demo contour to prescribe safety zones or escape routes.

If an operational requirement is <=5–10minutes throughout the circle, evaluate complementary remote visual/thermal observations from legally accessible sunny roadside sites and additional northern/outer corridor candidates. Viewsheds, smoke visibility, obscuration, resolution, power and false alarms need their own design; thermal cameras do not see through opaque tree cover. Cameras are not silently added to current BOM or claimed coverage. Actual procurement strategy depends on performance validation, not the illustrative22.1% figure.

## 8. Acceptance, commissioning and stop conditions

Software: nine unique source-matched anchors within2km, all road metadata preserved; geospatial/energy/formula/invalid-data tests; browser selection, PM/CO history, offline graphs, arbitrary source, wind settings, calm/no-active, scenario denominator and GIS/JSON exports; desktop/mobile; optional tile outage; preserved v1 regression. QA code distinguishes application PASS from field NOT_PERFORMED.

Field pilot: survey nine legal roadside segments and shadow horizon; check actual average/peak loads and charge recovery; test RF and station time synchronization; establish calibrated PM/CO baseline and confounder data; validate through authorized professionally managed experiments or independently documented events, never improvised ignition in forest. Report missed events and time-to-indication by source distance/bearing and wind condition, plus false-alert rate and power uptime. Do not infer field detection probability from geometric scenario fractions.

Stop a site's deployment for denied access, unsafe roadside position, inadequate shade-adjusted generation/battery reserve or radio failure. Do not replace a failed site with a guessed forest point. Do not claim operational detection or fire-spread accuracy before independent validation. No user imagery/account details or credentials are committed.

## 9. Sources and reproducibility

- Legacy code: https://github.com/bdteamditto/fire at1a38fffa105dbc12763f39ae364fdaeb5e0697de; docs/LEGACY_REFERENCE.md.
- OSM raw source: data/osm-source.json. SHA25655e80f17c003e4e6c2b239d53b8530c51ac98845e2e5cacc9a4478c884a49653. Evidence qa/roadside-v2-review.json and qa/v2-geospatial.json. Attribution https://www.openstreetmap.org/copyright .
- DEM Mapzen/AWS source: https://registry.opendata.aws/terrain-tiles/ ; approximate grid65x65, not a site survey.
- USDA WindNinja: https://research.fs.usda.gov/firelab/products/dataandtools/windninja — terrain-influenced wind modeling.
- USDA FlamMap: https://research.fs.usda.gov/firelab/products/dataandtools/flammap — fuel, weather/moisture and topographic input requirements for modeled fire behavior.
- US EPA smoke measurement: https://www.epa.gov/air-research/wildland-fire-research-smoke-measurement — need validation of smoke-monitoring technology and its accuracy/robustness.

Recompute: node --test tests/*.test.cjs; node scripts/assess_roadside_v2.cjs; node scripts/build.cjs; run HTTPserver4173 and all three browser scripts. scripts/prepare_roadside_v2.py is a preserved one-time migration, not a required runtime/build transformation now that the generated v2 files are committed.
