# Phase Commentary Guide

> Read this file during Step 2 when writing the phase commentary section of `analysis.md`. Present only the section matching the current `test_type`. Commentary must be grounded in actual observed values — never generic filler text.

## What Phase Commentary Is

Phase commentary interprets the behaviour of the system at each stage of the test. It translates raw numbers into a narrative that a non-expert reader can understand.

**Format for each stage:**

```
### Stage N — {stage_name} ({duration}, {target_vus} VUs)

**Observed:** [specific metric values during this stage]
**Interpretation:** [what these values indicate about system behaviour]
**Concern / Positive note:** [if any threshold was approached or crossed, or if behaviour was notably good]
```

Use specific values (e.g. "p95 climbed from 120 ms to 310 ms during ramp-up") rather than vague descriptions ("performance degraded during ramp-up").

## Load Test — What to Note Per Stage

### Ramp-Up Stage

- How quickly did p95 climb as VUs increased? Linear climb = proportional scaling. Non-linear jump = bottleneck hit early.
- Did the error rate remain at 0% throughout ramp-up? Any errors during ramp-up at low VU counts is a concern.
- Did CPU (if observable from run-log.md observations) react proportionally?

### Plateau Stage _(most important)_

- Did p95 stabilise or continue climbing? Stabilisation = system found a sustainable operating point.
- What was the settled p95? Compare to `perf-config.json slo.p95_threshold_ms`. Express the margin: "p95 settled at 230 ms — 46 ms below the 276 ms threshold (83% of budget used)."
- Was the error rate consistently below 1%? Note the exact rate.
- Were all k6 `check()` assertions passing at 100%? If not, note the failing check name and count.

### Ramp-Down Stage

- Did p95 return toward baseline levels? Expected: yes. If not, the system may still be under stress despite lower VU count.
- Did memory recover (if noted in run-log observations)?

## Stress Test — What to Note Per Stage

### Each Staircase Step

- State the VU count for the step and the measured p95 and error rate at that step.
- Compute the degradation ratio: `p95_at_step / baseline_p95`. E.g. "At 30 VUs: p95 = 450 ms (5.3× baseline)."
- Note whether the error rate first appeared at this step.

### Abort Point

- State the exact VU count at which `abortOnFail` triggered.
- State which threshold was breached (p95 or error rate) and by how much.
- This is the system's **breaking point** — the most important finding of a stress test.
- Note: if `abortOnFail` did NOT trigger (test completed all stages without abort), state this and note whether thresholds were breached or not.

### Post-Abort Recovery (ramp-down)

- Did the system recover after VUs dropped? "Recovery" = error rate returned to < 1% at 0 VUs.
- If no recovery: note this as a potential bug candidate.

## Spike Test — What to Note Per Stage

### Pre-Spike Baseline Phase

- State the baseline p95 and error rate before the spike. This is the reference point for recovery assessment.

### Spike Ramp-Up Phase

- How quickly did error rate increase as VUs spiked? Immediate jump to > 50% = no burst capacity. Gradual increase = some queue buffering.
- Note peak error rate during the spike hold.
- Note peak p95 during the spike hold.

### Recovery Phase _(most important)_

- State the recovery time: time from VU drop to error rate < 1%.
- If recovery time exceeded 2 minutes, flag this as a potential bug candidate.
- If the system never fully recovered (error rate stayed > 1% at baseline VU level), flag as a confirmed performance bug.
- Did memory return to pre-spike levels (if noted in run-log observations)?

## Soak Test — What to Note Per Stage

### Warm-Up (first 2 minutes of plateau)

- State the initial p95 after warm-up. This is the start-of-test reference.
- Note initial memory reading if available from run-log observations.

### Plateau (core observation window)

- State the p95 trend: stable, slowly increasing, or sharply increasing.
- If increasing: state the rate of increase per minute if calculable from soak-endurance-report values.
- Note any error rate appearance — any errors during the plateau of a soak test are a concern.
- Note memory trend from run-log observations: stable, growing slowly, growing rapidly.

### End Window

- State the final p95 and compare to the start-of-test reference.
- State the drift (from `soak-endurance-report.md`) and its classification: stable / mild drift / significant degradation.
- State the degradation point if one was observed.

### After Ramp-Down

- Did memory return to near-zero after VUs reached 0? If not, note as a potential bug candidate.

## General Writing Rules

1. **Every value is cited.** "p95 = 310 ms (source: `summary.json → metrics.http_req_duration.values["p(95)"]`)" — not bare numbers.
2. **Compare to baseline and SLO explicitly.** "310 ms is 3.6× the baseline p95 of 85 ms and 12% above the 276 ms SLO threshold."
3. **One paragraph per stage minimum.** Do not collapse multiple stages into a single paragraph.
4. **Use the run-log observations.** If the human noted a specific anomaly during the run, incorporate it into the commentary for the relevant stage.
5. **Distinguish observed from inferred.** "CPU was observed at 94% (from run-log)" vs "CPU saturation likely caused the latency increase (inferred)."
