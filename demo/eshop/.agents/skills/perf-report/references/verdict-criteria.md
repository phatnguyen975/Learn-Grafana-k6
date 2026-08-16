# Overall Verdict Criteria

> Read this file during Step 5 when assigning the overall PASS / FAIL / DEGRADED verdict for the executive summary. Apply the criteria in order — FAIL takes precedence over DEGRADED, which takes precedence over PASS.

## Verdict Definitions

### FAIL

The system did not meet one or more approved SLO thresholds for the test type.

**Condition:** Any of the following:

- `metrics.http_req_duration.thresholds["p(95)<N"].ok === false` in `summary.json`.
- `metrics.http_req_failed.thresholds["rate<N"].ok === false` in `summary.json`.
- k6 exit code 99 on a load or soak test without `abortOnFail` configured (the thresholds were breached at test end).

**Note for stress tests:** `abortOnFail` triggering at a high VU count does NOT make the verdict FAIL — it is the designed behaviour. The verdict for a stress test that triggered `abortOnFail` at the expected breaking point is DEGRADED (system was pushed beyond capacity as intended) or PASS (all stages below the threshold passed). Only use FAIL for a stress test if the threshold was breached at or below `normal_vus`.

### DEGRADED

All SLO thresholds passed, but one or more concerning patterns were observed that indicate the system is approaching its limits or showing early degradation signals.

**Condition:** All thresholds passed AND at least one of:

- At least one confirmed bug candidate (from Gate 2 verdicts).
- p95 at plateau/end window used > 80% of the SLO threshold budget. (`p95_measured / slo_p95_threshold_ms > 0.80`)
- For soak tests: `p95_drift_ms ≥ 10 ms` (mild drift classification).
- For spike tests: recovery time > 60 seconds (even if eventual recovery occurred).
- Error rate was measurably above 0% at or below `normal_vus` (even if below the 1% threshold).

### PASS

All SLO thresholds passed and no DEGRADED conditions were met.

**Condition:** All thresholds passed AND none of the DEGRADED conditions above apply.

## Tie-Breaking Rules

If two conditions conflict (e.g. one threshold passed, one failed):

- FAIL takes precedence over DEGRADED.
- DEGRADED takes precedence over PASS.
- If threshold outcomes conflict between test stages (e.g. passed at normal load, failed at stress load during a multi-scenario run), apply the verdict to the worst-case stage.

## How to Express the Verdict

In the executive summary, state the verdict with a one-sentence justification:

**PASS example:**

```
Overall verdict: PASS
All SLO thresholds passed. p95 settled at 230 ms (83% of the 276 ms threshold budget).
Error rate was 0.0% throughout the plateau. No bug candidates confirmed.
```

**DEGRADED example:**

```
Overall verdict: DEGRADED
All SLO thresholds passed. However, p95 consumed 91% of the threshold budget at plateau,
and 1 bug candidate was confirmed (memory non-recovery after ramp-down — see GitHub Issue #12).
```

**FAIL example:**

```
Overall verdict: FAIL
The p95 threshold (< 276 ms) was breached: measured p95 = 412 ms at the plateau
(149% of budget). The `http_req_duration` threshold outcome was `ok: false`
(source: summary.json → metrics.http_req_duration.thresholds).
```

## Verdict for Each Test Type — Common Patterns

| Test type | Typical PASS pattern                                                            | Typical DEGRADED pattern                          | Typical FAIL pattern                                               |
| --------- | ------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------ |
| Load      | Stable plateau, all thresholds green, no drift                                  | p95 > 80% of budget, or mild error rate           | Any threshold breached                                             |
| Stress    | `abortOnFail` triggered at expected high VU count, no errors below `normal_vus` | `abortOnFail` triggered lower than expected       | Threshold breached at or below `normal_vus`                        |
| Spike     | Recovery < 60s, error rate 0% at baseline                                       | Recovery 60–120s, or memory did not fully recover | No recovery after 120s, or threshold breached at baseline VU level |
| Soak      | Stable p95 drift (< 10ms), 0% error rate, memory stable                         | Mild drift (10–50ms), or memory slowly growing    | Threshold breached, or drift ≥ 50ms                                |
