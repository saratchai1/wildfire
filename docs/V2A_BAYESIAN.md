# V2A: uncertainty-aware source inference (experimental challenger)

## Accepted scope and release decision
User approved the staged upgrade. This slice implements V2A only: sensor uncertainty,
time-varying emissions, finite-grid generalized Bayesian inference and a blind
baseline/challenger comparison in the same two primary views. Existing 10 station
coordinates, N1, solar kits, baseline engine, alert thresholds and R1–R5 fixes stay
unchanged. V2A is selectable; baseline remains the default until comparative evidence
justifies promotion. Software test success is not a scientific or field validation.
V2B terrain-flow/plume-rise and V2C authorized field trials are NOT implemented here.

## Contracts and decisions
- `bayes-engine.js`: `infer(packet, options)` consumes only observation contract v1
  plus strict `sensorModels` (per-station noise/baseline standard deviations and an
  assumed fixed response delay). No truth/source/scenario/ignition inputs.
- Reuse canonical `prepare/evidence/selectSamples` to preserve cadence-independent
  persistence, invalid/stale history, event boundaries and timezone ordering.
- Defaults are assumed, not manufacturer specifications or learned calibration.
  Sensor model changes affect localization weights, not the anomaly evidence gate.
  Response delay is an assumed pure delay, NOT a full sensor transfer function.
- Model: horizontal measurement-IDW wind backtrajectories. Marginalize five wind
  perturbations and source onset bins; emission nuisance is a mixture of five constant/two-period release shapes with analytically marginalized
  nonnegative half-normal amplitude (three prior scales), and PM/CO ratios. This is
  not HYSPLIT/WindNinja and does not resolve multiple spatial sources.
- Generalized Gaussian log likelihood includes PM/CO cross-channel correlation,
  sensor + baseline + model-error variances, and temporal-support weights with a
  capped effective sample size. Amplitude is integrated analytically and the finite shape/onset/wind mixture is marginalized (not just the
  best fitting nuisance). Spatial prior is uniform by cell area. A coarse grid
  covers the whole 4km search domain; refinement replaces selected parents by four
  children while retaining ALL other cells and prior area, avoiding tail truncation.
- Rebuild the rolling-window posterior from the same prior per observation snapshot.
  Do not multiply the previous overlapping-window posterior. Canonical deduplication
  and fresh recomputation make repeated/reordered packets idempotent and permit late
  data. This is sequential *snapshot recomputation*, not a recursive particle filter.
- Numerical posterior weights are conditional on this finite, misspecified model.
  A 90%-mass model set is NOT a calibrated 90% coverage statement. Public probability,
  confidenceLevel and estimatedIgnitionAt remain null; fieldValidated=false.
- Keep weak/missing/calm/single-station/mismatch abstention, historic data labels and
  incident memory. Relative release strength is not physical fire power or fuel load.
- Dedicated worker imports no generator. Baseline path and old worker stay intact.
  UI sends only observations/options. Obsolete responses and comparisons are ignored.
  Imported files remain local and require canonical domain/registry validation.

## Evaluation (fixed before tuning)
Compare both engines against a committed fixture manifest containing immutable old
forward scenes and separate time-varying puff stress scenes at non-grid-aligned
locations. Include changing/noisy winds, missing data, pulse/ramp emissions, null,
dust, calm, external and multiple sources. Report every case including abstentions,
misses, region sizes and computation times. Separate measurement-first-signal,
received-evidence-first-signal and first localized-region times on a declared replay
time grid; neither is true operational detection latency. No optimized cherry-picked
"accuracy" denominator; no universal improvement claim. Regression gates concern
contracts/safety; comparative results can be mixed and are published unchanged.

## Acceptance gates
Baseline source hash unchanged; all existing pure/browser tests pass. Additional
proof: posterior mass sum, cell-area priors, nuisance marginalization, response lag,
strict options, duplicate/order/timezone idempotency, no future/unreceived evidence,
no truth injection, low-data abstention, no calibrated confidence claims, same-input
comparison, export provenance, worker late-response guard, mobile, failed basemap,
benchmark integrity and exact deployment SHA/assets. CI never commits source.

## Primary method references (inspiration, not integrated software)
- https://www.arl.noaa.gov/hysplit/hysplit-inverse-modeling/ — time-varying source terms and observation/model uncertainties.
- https://hysplit2.arl.noaa.gov/hysplitusersguide/S337.htm — source/receptor transfer coefficients.
- https://research.fs.usda.gov/firelab/products/dataandtools/windninja — terrain-dependent winds, deferred to V2B.

## Numerical specification and development-suite result
The generalized Gaussian likelihood is a *power likelihood*, not an assertion that
repeated readings are independent: time-support weights cap a station at 10 effective
samples in the 20-minute window. Correlated PM/CO use rho=0.4. Default sigma adds
sensor (8 ug/m3, .06 ppm), baseline (5 ug/m3, .04 ppm), and model (15 ug/m3, .09 ppm)
variances. Noise parameters are not estimated from fire-contaminated data. Known
responseLagSec shifts the observation's receptor time, not its received time.

An amplitude has half-normal priors at scales 80/250/800, averaged equally. Its
one-dimensional integral is evaluated analytically using a normal CDF approximation
with asymptotic negative-tail handling; numerical tests cover symmetry and unit evidence with no data.
Shapes are constant (prior .4), stopping/starting-late/growing/declining (.15 each),
with two periods split halfway from candidate release start to the observation cutoff.
Onsets have equal prior mass in 120-second bins; five wind members have equal prior
mass; PM/CO ratios .004/.0065/.009 have equal mass. Source strength units are relative,
not physical emission estimates. Reduced best-fit residual >1 abstains heuristically.
These are declared design assumptions, not parameters calibrated in Doi Suthep.

The fixed 13-case / 39-snapshot suite is used during development, NOT an untouched
statistical holdout. The first implementation using coarse discrete amplitude levels
produced spatial aliasing; it was replaced by continuous positive amplitude integration.
The complete final suite (including misses) is generated as qa/v2a-benchmark.json and
published at data/v2a-benchmark.json. It is versioned with the deployed commit. In the
local run the baseline covered all sources in 11/33 fire snapshots; V2A in 6/33. V2A
regions are smaller but miss more often, so promotion is explicitly BLOCKED and the
baseline stays default. This exposes model misspecification rather than claiming
smaller regions mean improved accuracy. More realistic wind/transport and independent
calibration/holdout data are required before promoting V2A. These comparisons are not
independent fire-event detection probabilities (three snapshots share each event).
