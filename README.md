# Wildfire — Doi Suthep roadside solar pilot

New application and engineering design for roadside wildfire sensing around **18.813555556, 98.862250000** (WGS84), requested 25 September 2026.

## Accepted scope

- A new application in this repository; do not modify `bdteamditto/fire`.
- Sparse roadside stations, each powered by its own solar panel and battery.
- PM/CO and air temperature/humidity at sensing stations; wind measurements at selected stations; low-power radio plus gateway backhaul.
- Actual mapped road geometry and traceable station coordinates, not a rectangular sensor grid.
- A map, station details, power sizing and explicitly synthetic detection/spread scenarios.

## Evidence boundary

Road mapping is not a survey of road shoulders, permissions, tree shading, radio propagation or safety. Candidate station coordinates are survey anchors, not approved foundation locations. The target coordinate is a user-selected planning reference, not a verified current fire or a verified recurrent-fire hotspot. Solar yield, battery autonomy and model outputs must retain their assumptions. No sensor is connected in this prototype.

Implementation, source snapshots, design decisions and tests are being added to this newly initialized repository.
