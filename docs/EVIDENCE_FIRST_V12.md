# V1.2 — Evidence first, auditable source-area sensitivity

Status: ACCEPTED implementation scope, NOT field validation. Base: 0a6ea0eaa80df51bbf4699992f517323bf70fe40.
Keep the ten station records, N1, solar kits, 2km study domain, 4km baseline search,
V1.1 evidence/thresholds/solver and V2A/V2B kernels byte-identical. Do not promote a
challenger, add cameras, claim calibration, or connect live alerts in this slice.

## Architecture / data contract
`assessment-engine.js` is a pure companion to `inverse-engine.js`.
`observe(packet)` uses canonical validated/deduplicated/time-normalized rows only.
`diagnose(packet, onProgress)` recomputes the baseline, then predeclared ablations.
No simulator/source/ignition/scene/answer enters either API. Workers accept EXACT
{id,packet} only; packet uses the same strict observation contract. No trusted
caller-provided solver report. No new station or source coordinates are guessed.
Existing inference is unchanged. Companion results are not passed back as evidence.
`assessment-worker.js` runs expensive diagnostics on request while playback is paused.
Cancellation terminates the worker. New input/model/seek/replay invalidates prior
results even when `asOf` is identical. No synchronous expensive diagnostic fallback.

## Detection, location and robustness are separate
The fast companion observes evidence BEFORE location inference completes. Watch is
SHADOW_ONLY, not a fire alarm and cannot acknowledge or create/close an incident.
Canonical current/historical alarms still come exclusively from V1.1.
Initial watch assumptions (not calibrated): paired rise dPM>=12.5ug/m3 AND dCO>=.10ppm,
or single-channel rise dPM>25ug/m3 / dCO>.20ppm for >=60s with <=90s gaps. Latest
measurement must be VALID and <=120s old. Invalid/below-threshold rows break
continuity. PENDING canonical high pairs are not classified as particulate-only.
Two simultaneous paired watch stations are MULTI_STATION_WATCH, NOT triangulation
or proof they share a source. Low-level single-channel evidence requires either
channel's stronger threshold; background is provided, never trained during an event.
Show measurement-confirmation timestamp separately from the first receiver-time
cutoff that made the supporting sequence available (late/out-of-order arrivals count).
Do not estimate ignition time, probability, calibrated confidence, or field latency.

## Frozen diagnostic protocol / heuristics
1. Recompute the unmodified V1.1 baseline from the same packet.
2. Leave out each station with valid recent concentration OR wind data, one at a time,
   removing its observations (including its wind). Keep registry/domain fixed.
   Both quiet and positive stations are included, not only the easiest cases.
3. Rotate all valid observed wind-from directions by -10 and +10 degrees; fixed
   stress assumptions, NOT measured instrument errors.
4. Quiet-evidence stress: exclude concentration constraints ONLY from stations with
   no paired positive sample in the last 20 minutes, retain their wind. This is an
   extreme stress case, NOT a plume-height/detectability calculation and never an
   automatic excuse to discard a quiet sensor. Baseline keeps ALL valid quiet data.

Compare cell-union intersection-over-union (IoU), areas and area-weighted geometric
centroid shift. A centroid is a diagnostic statistic, never a source estimate/pin.
Loss of a region, IoU<.25, area ratio outside [.5,2], or centroid shift>500m is marked
sensitive. Cutoffs are presentation heuristics; frozen before the development suite.
No-region baseline => NOT_APPLICABLE; failed/cancelled/timed-out cases => INCOMPLETE,
never stable. No averaging/voting/intersection or automatic polygon shrinking.
List critical station IDs and EVERY successful/failed trial. Quiet and wind tests
are separate from station leverage. Keep existing region on map explicitly as a
conditional hypothesis; show a sensitivity warning, never a more precise new pin.
STABLE_UNDER_TESTS is not field accuracy or calibrated probability.

## UI / deployment
Exactly two primary views remain. Officer view defaults to baseline plus V1.2
companion and cannot silently retain a lab-selected V2A result on return. Experimental
model controls and V2B link live in laboratory. Scenario and observation packet are
preserved on return. Watch/current alert/history, location, and sensitivity have
separate headings, data time, evidence station labels, reasons and export fields.
Incoming input disables prior diagnostic controls/results immediately; old map is
not presented as a fresh answer while computing. A computation failure clears old
current-result presentation. Previous incident history stays distinctly timestamped.
No diagnostic computation blocks reporting an existing signal. Operator still must
verify independently. Session-only incident memory stays non-permanent.

## Acceptance / proof
Baseline and experimental kernel + station hashes unchanged. Entire prior suite
passes, except browser navigation explicitly moved to lab before model selection.
New tests: weak paired/PM-only/CO-only/noise watch, cadence/jitter/invalid/gaps, late
reception/order/timezone/duplicate equivalence, quiet constraint inclusion, exact
region IoU, no-region/incomplete/sensitive/stable diagnostics, exclusion of all
station channels, truth rejection and no mutation; actual worker observations-only,
input races/cancel, import rejection, no alert from watch, offline map/mobile,
lab-to-officer reset and provenance exports. Explicit frozen synthetic event suite
reports watch and canonical alert times, false watch cases, diagnostic changes and
all misses/abstentions; NEVER claim better localization because this solver is unchanged.
CI reads only; source writes use authorized connector. Release requires all tests,
reviewed screenshots, exact main commit/version/asset hashes and N1 on Pages.

## Deferred / not implemented by this release
Field reference measurements, calibrated noise/thresholds/detectability, WindNinja,
3D plume validation, hardware changes, central telemetry/incident store and real
notifications. They require inputs/work separate from this software slice.
