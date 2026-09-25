# Roadside 2 km pilot — revision 2 design packet

## Accepted requirements
User target WGS84 18.813555556,98.86225; radius 2000 m (12.5664 km²), nine user-circled roadside locations: west W1–W4 and east E1–E5. Every station solar + battery. Preserve old PM/CO, weather, incident history and illustrative fire spread concepts from bdteamditto/fire. Modify saratchai1/wildfire only.

## Identified v1 siting defect
The v1 acquisition script excluded highway=track from eligible samples. This selected farther roads and omitted the near-target rural corridors visible in the user screenshot. V2 may use an OSM track as a CONDITIONAL rural-road survey anchor, but never silently relabel it as a paved highway or verified public/vehicle-accessible road. Footway/path/steps remain excluded for installation. If a screenshot mark cannot be matched within a documented tolerance, show unmatched rather than invent a verified coordinate.

## Implementation decisions
Nine co-located PM2.5 + electrochemical CO + air temperature/RH + wind speed/direction stations, two proposed gateways, no camera in base power budget. Weather masts need exposure assessment; nine local measurements are not a validated full-forest wind field. Reserve 72 h no-sun autonomy with aging as in v1, updating kit counts.

Coordinates are approximate screenshot-derived intent snapped to a raw OSM polyline, with hint-to-road distance and original tags preserved. They are NOT surveyed foundations. Separate target AOI, reference ignition and station icons. The 2 km circle is a requested assessment area, NOT certified coverage.

Add a deterministic transport-screening module: smoke released at a user-selected location, constant specified wind, adjustable plume half-angle and effective local capture tolerance. Conditional inlet-arrival time = along-wind distance / speed + explicitly itemized assumed sampling/persistence/upload delay. No emission strength, plume height, dilution, vegetation-flow effects or PM/CO instrument threshold prediction; hence NEVER call modeled interception a measured detection probability or guaranteed alarm time. Calm/adverse directions, out-of-domain inputs, unreachable within a time horizon, unknown/offline stations must remain distinct. Test source locations over the entire requested circle and every bearing, including missed scenarios in denominators. Export reproducible assumptions/results.

Preserve original illustrative smoke readings as SYNTHETIC_DEMO. Do not increase emission/amplitude/decay to make a sparse layout pass. Original app PM=15+130*signal; CO=.15+.85*signal; attenuation scale 900 m. V1 changed amplitude/attenuation; retain old demo separately and do not use it as siting validation.

## Acceptance gates
Road anchor raw-polyline error <2 m, each mark matched within 150 m or explicitly unmatched; no path/footway auto-conversion; 9 unique IDs; all within 2 km; export round-trip; wind-to convention N=0 E=90; crosswind/upwind misses and calm unknown; latency monotonic with distance/speed/overhead; tally all sampled source/wind scenarios; field coverage and verified latency remain UNKNOWN. Preserve v1 snapshot and enable comparison. Build, unit and browser tests before production deployment. No legacy-repository writes.

## Delivery states
This document defines PROPOSED design and acceptance criteria; actual coordinate evidence and QA will be linked after generated and reviewed. No field survey or live telemetry is claimed.
