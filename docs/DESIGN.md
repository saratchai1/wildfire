# Design packet — Roadside Solar Wildfire Pilot v1

## Decision and scope

ACCEPTED user requirements: new application in `saratchai1/wildfire`; roadside locations; independent solar panel + battery at every station; sparse, non-grid installation; smoke detection and directional spread exploration. Reference: WGS84 18.813555556, 98.862250000. Do not modify `bdteamditto/fire`.

PROPOSED: eight survey anchors, four east and four west of the reference. All have PM2.5, electrochemical CO, temperature/RH and low-power radio. R01/R04/R08 add wind speed/direction. R01/R08 add a LoRaWAN gateway and cellular backhaul. No camera is included in the base energy budget. LoRaWAN is not mesh; the two gateways are a proposed topology, not proof of cross-ridge reception. Store readings locally during backhaul interruption; surveyed dead zones require repositioning or a separately budgeted gateway/cellular link.

VERIFIED DESKTOP EVIDENCE: an OSM snapshot was retrieved successfully on 2026-09-25 via `scripts/acquire_context.py`. It contains 537 road/path features, with 187 sampled eligible motor-road locations. Selected anchors carry original OSM way IDs and source candidate IDs. R03 and R05 are service roads tagged unpaved, not footpaths. All eight sites still need access permission and an actual shoulder/solar/radio survey. The nearest sampled eligible anchor is approximately 1.54 km from the target; this is not an exhaustive nearest-point proof.

NOT VERIFIED: recurrent-fire history at the reference; installation permissions; year-round vehicle access; a safe roadside offset; direct sun duration; tree and terrain shadows; cellular/LoRa quality; sensor performance; fire detection probability or guaranteed latency. The app must never silently convert these into VERIFIED.

## Siting decisions

The eight coordinates are exact digital survey anchors along mapped road centerlines, not approved pole foundations. On site, select the legal shoulder and safe setback with the road owner; update the surveyed coordinates rather than installing on the centerline. Relocation within the local roadside segment must preserve source lineage and record survey evidence.

| Station | Latitude | Longitude | Kit | Surface / condition | Rationale |
|---|---:|---:|---|---|---|
| R01 | 18.8166609 | 98.8909221 | HUB | asphalt | High eastern wind and communications station |
| R02 | 18.8164598 | 98.8853976 | AQ | paved | Middle eastern road corridor |
| R03 | 18.8167034 | 98.8820312 | AQ | unpaved service road; conditional | Nearer eastern forest-facing anchor |
| R04 | 18.8107123 | 98.8869523 | WX | asphalt | Separate southern/eastern wind exposure |
| R05 | 18.8101230 | 98.8481055 | AQ | unpaved service road; conditional | Nearest selected western anchor |
| R06 | 18.8019146 | 98.8496934 | AQ | concrete | Southwestern hard-surface road |
| R07 | 18.8056821 | 98.8346230 | AQ | paved | Secondary western comparison point |
| R08 | 18.8149905 | 98.8321842 | HUB | concrete | Independent western gateway and wind station |

The arrangement does not enclose the target: substantial northern and southern gaps remain. Smoke sensors detect air that reaches their inlets, not a fixed circular ground area. Therefore no detection-radius disks, coverage percentage, whole-forest all-clear, or guaranteed detection time may be displayed. Roadside placement also creates traffic/cooking/dust confounders. Additional sites should be chosen from field evidence rather than adding a grid. The 6 hard-surface + 2 conditional-service-road distinction must remain visible.

## Energy contract

These are engineering budgets, not manufacturer-validated complete-system loads or a local solar climatology. Continuous PM sensing is budgeted; use electrochemical CO rather than assuming heated MQ-type modules have the same consumption. Sensor sample, fan stabilization, wind sampling and radio duty cycle must follow the selected hardware and radio regulations.

| Kit | Average load budget | Panel | Battery, LiFePO4 | Count |
|---|---:|---:|---:|---:|
| AQ | 1 W | 50 Wp | 12.8 V, 20 Ah | 5 |
| WX | 2 W | 80 Wp | 12.8 V, 30 Ah | 1 |
| HUB | 6 W | 150 Wp | 12.8 V, 60 Ah | 2 |

All stations: suitable MPPT/controller, DC protection, BMS, weatherproof enclosure with properly designed air inlet, serviceable fuse/disconnect, mounting designed for wind and lightning protection by qualified personnel. Keep battery shaded even though panel needs sun. Preliminary panel bearing: south, approximately 20-degree tilt, subject to actual shading and structural design; not a surveyed optimum.

Calculations: daily load = average W × 24. Daily PV = Wp × assumed peak-sun-hours × solar derate. Usable battery = V × Ah × depth of discharge × discharge efficiency × end-of-life capacity. No-sun autonomy = usable battery / average load W. Defaults: 3 peak-sun-hours/day, derate 0.70, DoD 0.80, discharge efficiency 0.90, end-of-life capacity 0.80. These deliberately include 20% battery capacity aging; do not double count charging efficiency. AQ: 147.46 h; WX: 110.59 h; HUB: 73.73 h. Minimum design target 72 h with no solar input. All calculations start from a fully charged battery at the assumed end-of-life capacity and exclude unbudgeted loads. Solar and autonomy must be shown as separate checks; sufficient battery does not cure a long-term PV energy deficit. Total proposed panel capacity 630 Wp; nominal storage 3.20 kWh; average load 19 W / 456 Wh/day.

Survey sunlight during the critical fire season and adverse months. Roadside does NOT mean guaranteed sunlight. Record canopy/terrain horizon, shade duration, panel orientation, measured charge and battery behavior. PVGIS or equivalent time-series simulation can support design but cannot resolve small roadside tree shadows by itself.

## App architecture and contracts

Implementation: static, dependency-free HTML/CSS/JavaScript. `index.html`, `styles.css`, `core.js`, `app.js`, `data/context.js`, `data/plan.js`. It can run over HTTP or from a complete downloaded folder without a backend. Offline terrain, roads and station interaction must work without remote basemaps. Online basemap images are optional; attribute providers. No API keys, login, real alerts or real sensor connections in v1. Browser persistence, if introduced, must be explicitly local rather than described as server save.

Map: use WGS84 input with Web Mercator rendering. Store GeoJSON as [longitude, latitude]. Show target reference separately from station anchors and demo ignition. Display DEM as approximate terrain, never as tree cover. DEM source: Mapzen Terrarium tiles via AWS, sampled from zoom 12 into 65×65 values; roughly 140 m sample spacing. Not a site engineering survey. Do not infer visibility or a radio link budget from elevation alone.

Plan mode: station status PROPOSED, not ONLINE. Display station reason, original road identity, surface, permission/shade/radio checks and kit. Clicking list or map selects the same station. Export CSV, GeoJSON and KML with identical coordinates, status and evidence links. Local survey checklist is explicitly local and must never silently change official site approval.

Demo mode: every generated PM/CO/wind reading and event carries SYNTHETIC_DEMO. Scenarios: smoke, road dust, offline. PM plus CO sustained beyond a demo threshold may be SUSPECT; never automatically CONFIRMED. Offline or invalid data cannot produce a normal/all-clear status. A low-value reading is not proof of no fire. Accepting an event in the UI is acknowledgement, not confirmation or dispatch.

Wind convention: `windToDeg` is the destination bearing clockwise from true north. A future meteorological `windFromDeg` input is converted by (from + 180) mod 360. Zero-speed wind has no meaningful advection direction. Do not label an arbitrary slider input as a live observed wind.

Illustrative spread model: a direction/shape demonstration based on user-specified wind, base spread budget and optional local DEM slope. It is NOT FARSITE, FlamMap, WindNinja, a calibrated wildfire model, or a prediction of actual safety/arrival time. Label 15/30/60-minute shapes as hypothetical with missing fuel/moisture and uncertainty. Smoke advection and surface-fire spread are separate computations. Source location is scenario input, not triangulation from PM/CO. Production model work requires fuels, moisture, terrain-adjusted wind, calibration and uncertainty ensembles; WindNinja/FlamMap are proposed future adapters, not claimed dependencies.

Future telemetry envelope (not implemented backend): `stationId`, ISO-8601 `observedAt`, `receivedAt`, `sequence`, `pm25UgM3`, `coPpm`, `airTempC`, `relativeHumidityPct`, nullable `windFromDeg` and `windSpeedMps`, `batteryVoltageV`, estimated `batterySocPct`, `panelPowerW`, `quality`, `calibrationVersion`. Missing and stale are explicit; never coerce null to zero. Backend authenticates device identity, rejects replay/invalid units, records raw observations and audits incident status. Frontend must not perform real control/dispatch.

## Acceptance and evidence

Tests must establish: eight unique IDs; all coordinates within 2 m of corresponding raw OSM polylines; zero anchors on footway/path/track; source candidate IDs match; kit totals 8 AQ / 3 weather / 2 gateway; power formulas including aging and zero-sun deficit; north/east wind bearing correctness; invalid/stale values never suspect; dust-only scenario not conflated with PM+CO; plan defaults are not live telemetry; exports round-trip eight stations in correct axis order; desktop/mobile selection, mode switching, playback, map zoom/pan, energy sliders and external-tile failure work without runtime errors. Browser screenshots and run summaries are evidence, not a field commissioning certificate.

Deployment: only publish static application assets, data exports and design/source documentation. Do not expose test artifacts, raw build credentials or node_modules. Run unit + geospatial integrity + browser tests before Pages deployment. First-time Pages enablement may require the repository owner's Settings → Pages → GitHub Actions selection; report that blocker instead of claiming a live deployment. No changes to the legacy repo.

## Commissioning stop conditions

Do not procure/fix pole foundations based only on these map anchors. Stop a site's installation for unsafe shoulder, prohibited access, inadequate shade-adjusted generation, insufficient worst-case autonomy or failed communications. Do not claim operational wildfire prediction until tested against field/historical evidence. A failed R03/R05 survey removes that conditional station; do not silently move it into forest or replace it with a footpath.

## Primary references

- OpenStreetMap contributors and ODbL: https://www.openstreetmap.org/copyright ; raw OSM snapshot and SHA-256 in `data/context.json`.
- Mapzen/AWS terrain tiles: https://registry.opendata.aws/terrain-tiles/ ; attribution https://github.com/tilezen/joerd/blob/master/docs/attribution.md .
- Sensirion SPS30 published average supply current (55 mA at approximately 5 V); this supports PM-only budget context, not a total station specification: https://sensirion.com/sps30 .
- European Commission JRC, PVGIS off-grid modeling: https://joint-research-centre.ec.europa.eu/photovoltaic-geographical-information-system-pvgis/using-pvgis-5/pvgis-5-tools/grid-pv-systems_en .
- USDA Forest Service WindNinja: https://research.fs.usda.gov/firelab/products/dataandtools/windninja .
- GitHub Pages workflows: https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages .
