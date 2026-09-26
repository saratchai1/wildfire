# V2B experimental terrain, plume-rise and collocation workbench

Base: 3182f6d6cdcef3c65eb056158a8c2e02fdf1f8b8 (verified source tree a2a2bd5a590e20e2c524668d0f69a9cf910b97b4).
Accepted scope: attempt terrain-influenced winds, vertical smoke sensitivity and a field-calibration workflow. Do NOT claim field work has occurred. Keep all ten coordinates, the 2km study disk, baseline/V2A algorithms and two primary views unchanged. Publish a separately labelled workbench, not a promoted operational algorithm.

## Decisions frozen before benchmark
- Wind: finite-volume depth-integrated potential-flow hypothesis, div(H grad(phi))=0, H=constant top altitude minus DEM. Top is maximum DEM plus assumed clearance (1000m default). Linear far-field potential on boundaries. Solve two basis fields with diagonally preconditioned conjugate gradients (relative residual <=1e-7, iteration cap 2000); fit their two amplitudes to available station wind components. Reconstruct past wind using only prior observations <=120s old. Flat terrain must reproduce uniform wind. Report residual and station leave-one-out vector error versus uniform and IDW; do not call an algebraic residual validation of real mountain wind.
- This is a vertically averaged diagnostic hypothesis, NOT WindNinja, CFD, a 10m wind forecast, canopy/thermal slope flow, flow separation, or a fire-atmosphere coupled solver. Wind measurement heights are not known; representativeness is explicitly unverified. No artificial numerical correction is advertised as physical proof.
- Domain is a 41x41 mesh +/-4200m (210m spacing), resampled from the bundled 65x65 mixed-source DEM (~140m input spacing). Require real DEM coverage; never replace missing elevations with zero. Upwind transport stops at wind gaps, calm or domain edge. Do not extrapolate into unavailable terrain.
- Plume: Briggs-type buoyancy sensitivity, F=8.8e-6 Q [m4/s3], bent-over transient rise 1.6 F^(1/3) x^(2/3)/U, limited by neutral final 1.3 F/(U uStar^2) and 1.25 mixing-layer depth. U<0.5m/s is out of scope for this plume formula, not zero rise. Q is an assumed heat input, never inferred from PM/CO or hidden simulation truth. Source height 2m, vertical sigma=sqrt(8^2+2 Kz age), Kz=5m2/s default. Reflected Gaussian vertical factor on a TERRAIN-FOLLOWING local-ground column. No 3D terrain impingement or elevated wind shear modeled.
- Inverse: use observation-only candidate fitting with the existing normalized evidence/history and actual event times, terrain-conditioned backtraces, and three nuisance heat members [0, 500000, 5000000] W. Keep unions of plausible members and explicit poor-fit/no-support states. Grid 200m; no claim that grid size is positional accuracy. Compare V1.1 on exactly the same packet. No truth/source keys allowed in input/worker messages. Zero-signal/calm/outage never becomes an all-clear assertion.
- Calibration: separate paired raw/reference, time-aligned PM2.5/CO observations. Per-station affine regression trained on chronologically earliest 70%, 60s guard gap, assessed on remaining >=30%; all coefficients fitted only on training. Report raw/corrected RMSE, MAE, bias, range and counts. Reject duplicates, missing timestamps/units/provenance, mixed references within a session, weak excitation, poor train/test coverage and failed validation. No auto-application to monitoring packets, no automatic live-baseline correction. Even a passing FIELD_COLLOCATION_UPLOAD is an unverified candidate, NOT certification. Synthetic example remains SYNTHETIC_TEST and cannot be relabelled field validated by the tool.

## Evaluation freeze
Model decisions above are fixed for the first development benchmark. Test existing independent (non-terrain) puff generator at two fixed times [20,30] min for presets single, changing, noise, outside, multiple, calm. Include abstentions and misses in denominators. These are development sensitivity cases and WILL NOT prove real terrain/plume accuracy. Do not tune settings after seeing misses or promote this workbench based on narrower polygons.
Also test numerical conservation/flat terrain, absent data, altitude metadata, plume units/calm limits/reflection, calibration chronology/holdout leakage/range/metadata, actual Worker boundary, stale requests, atomic import, local-only handling and mobile layout.

## Field work still needed
1. Record serial numbers, firmware, station coordinates, inlet/anemometer heights, reference device and its calibration record, clock offsets, shared exposure and averaging interval.
2. Collect collocated PM2.5/CO and weather over representative clean/smoky and humidity/temperature ranges; no prescribed number of days by this app guarantees validity. Preserve raw data and missing-data flags.
3. Hold out separate times and ultimately separate field events; inspect regression diagnostics, uncertainty and applicability. Test transmitted/received timestamps independently.
4. Measure winds at held-out stations and ideally several heights before treating the diagnostic wind field as verified. No need to ignite an unapproved forest fire; any controlled source trial requires the responsible authorities and trained staff.
5. Install/import terrain-aware physical model outputs and measured vertical meteorology before claiming 3D plume or calibrated source-location accuracy.

## References (method basis, not software executed here)
- USDA 2016 mass-consistent downscaling evaluation: https://research.fs.usda.gov/treesearch/61477
- USDA 2009 thermal slope wind discussion: https://research.fs.usda.gov/treesearch/61476
- Li et al. 2020 HYSPLIT heat/buoyancy ensemble: https://agupubs.onlinelibrary.wiley.com/doi/full/10.1029/2020JD032768
- NOAA smoke calculation: https://www.arl.noaa.gov/hysplit/hysplit-smoke-calculation-originated-from-a-prescribed-burn/
- NOAA plume-height sensitivity: https://ready.arl.noaa.gov/documents/TutorialX/html/plume_rise.html
- EPA collocation workflow: https://www.epa.gov/air-sensor-toolbox/air-sensor-collocation-macro-analysis-tool
- EPA guide: https://www.epa.gov/air-research/instruction-guide-and-macro-analysis-tool-evaluating-air-sensors-collocation-federal
