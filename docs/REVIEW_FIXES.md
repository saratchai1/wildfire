# Review fixes R1–R5 — evidence integrity, 2026-09-25

Accepted: fix the five reproduced bugs on e612a37, preserve ten stations/N1,
forward smoke kernels, two primary views, and the observation-only worker boundary.
No field-accuracy claim, new hardware, terrain solver or production incident store.

## Decisions and acceptance
- R1: retain the existing illustrative 30-second minimum evidence duration and
  90-second maximum observation gap. Accumulate a continuous positive interval,
  regardless of sampling cadence. Invalid/below-threshold rows and larger gaps
  break continuity. Both channels high before persistence => PENDING, not dust.
  Cadences 5/10/15/20/30/60 s and jitter must confirm by the first sample after 30 s.
- R2: sensor freshness, current anomaly and historical incident evidence are
  distinct. An invalid/latest missing sample never deletes valid past evidence.
  Retain recent support for 20 minutes independently of current health; older
  incidents remain explicitly historical within the packet, and are latched in
  the browser session until new dataset/rewind. Never auto-confirm/close a fire.
  Historical localization is labeled with supporting-data time; obsolete area
  summaries are timestamped and never drawn as a new current estimate.
- R3: retain actual timestamped event onset/confirmation/end, channel peaks and
  quiet boundaries while thinning in 120-second bins. Weight representatives by
  temporal support (and stations equally) so added event points are not treated
  as a longer event. Require each recent supporting station to retain positive
  observations in the solver. Missing readings are not negative evidence.
- R4: fixed-site UI rejects domain center/radius or registry mismatch before
  mutating active input, output or acknowledgement. Engine can remain generic.
- R5: canonical prepare() normalizes epoch/ISO time and deduplicates records;
  chart and solver consume the same validated ordering/quality. Equivalent
  timezone encodings must produce identical paths and inference.

## Release gates
Add pure and browser counterexamples for all five findings, unchanged original
regressions, desktop/mobile and real-worker proof in Actions. Source files remain
immutable in CI; commits made through authorized GitHub connector, not by a bot
workflow. PR merge only after checks; deployment must verify exact main commit,
model version and live asset hashes. Retain unknown/stale/uncalibrated semantics.
