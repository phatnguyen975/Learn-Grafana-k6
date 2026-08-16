# SLO Derivation Rules

> Read this file during Step 5 to compute final SLO thresholds from baseline measurements. These rules replace the preliminary estimates written during Step 2.

## Principle

SLOs derived from a baseline measurement are more trustworthy than industry benchmarks because they reflect the actual SUT characteristics (hardware, DB engine, framework overhead, network topology). The multiplier-based approach below is the standard used in production performance engineering to express "acceptable degradation under load."

Source methodology: Google SRE Book Chapter 4 (error budgets and SLO setting), k6 testing guides (https://grafana.com/docs/k6/latest/testing-guides/test-types/).

## p95 Latency Threshold

### Formula

```
p95_threshold_ms = baseline_p95_ms × multiplier
```

### Multiplier by Test Type

| Test Type | Multiplier | Rationale                                                             |
| --------- | ---------- | --------------------------------------------------------------------- |
| `load`    | 2×         | Moderate concurrent load should not double the baseline response time |
| `soak`    | 2×         | Sustained load at normal levels — same expectation as load            |
| `spike`   | 3×         | System is absorbing a sudden burst; some degradation is expected      |
| `stress`  | 3×         | System is operating beyond normal capacity; higher tolerance needed   |

### Adjustment Rules

Apply these adjustments before finalising the threshold. If more than one applies, use the adjustment that results in the **higher** threshold (more lenient) and state why.

| Condition                   | Adjustment                     | Reason                                                                         |
| --------------------------- | ------------------------------ | ------------------------------------------------------------------------------ |
| `baseline_p95_ms > 300 ms`  | Cap multiplier at 1.5× instead | A 3× multiplier on a 400 ms baseline = 1200 ms, which would be unacceptable UX |
| SQLite backend detected     | Add 50 ms flat buffer          | SQLite write serialisation causes latency spikes under any concurrency         |
| `container_cpu_limit ≤ 0.5` | Add 30% to computed threshold  | CPU-constrained environments show higher latency variance                      |
| Auth-intensive endpoint     | Add 100 ms flat buffer         | bcrypt/argon2 cost is CPU-bound and degrades faster under load                 |

### Worked Example

```
baseline_p95_ms = 85 ms
test_type = load → multiplier = 2×
SUT uses SQLite → add 50 ms buffer

p95_threshold_ms = (85 × 2) + 50 = 220 ms
```

State the formula in `perf-config.json → slo.notes`:

```
"notes": "p95_threshold = (baseline_p95 × 2) + 50ms SQLite buffer. baseline_p95 = 85ms."
```

## Error Rate Threshold

| Test Type | Threshold | Source                                                             |
| --------- | --------- | ------------------------------------------------------------------ |
| `load`    | 1%        | Google SRE error budget baseline for interactive services          |
| `soak`    | 1%        | Same expectation as load — persistent errors indicate a leak       |
| `spike`   | 5%        | Spike-phase errors are expected; full recovery must follow         |
| `stress`  | 5%        | Errors indicate approaching capacity limit — not necessarily a bug |

These are not derived from the baseline (error rate in a 1-VU baseline should be 0%). They are fixed thresholds based on industry practice. If the baseline itself shows > 0% errors, **do not proceed** — fix the script or test data first.

## normal_vus Estimate (preliminary)

This value is used by workload planning as a starting point for the plateau VU count. It is an estimate, not a commitment.

```
normal_vus = floor(target_rps / baseline_rps_per_vu)
```

Where:

- `baseline_rps_per_vu` = RPS measured in the baseline (1 VU, no think time)
- `target_rps` = a reasonable throughput target for the SUT

If `target_rps` is not specified by the human, use a conservative default:

- Micro/Small hardware tier: 10–20 RPS
- Medium tier: 30–50 RPS
- Large tier: 80–150 RPS

Record this as `workload.normal_vus` in `perf-config.json` with a note that it is an estimate to be refined during workload model design.

## What to Do When Baseline Results Are Anomalous

| Anomaly                                   | Likely Cause                                                | Action                                                                                          |
| ----------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `p95_ms` is extremely high (> 2000 ms)    | Server cold start, JIT warm-up, first-query SQLite overhead | Re-run baseline; if still high, note it and use the result as-is                                |
| Error rate > 0%                           | Incorrect auth, wrong endpoint path, data not seeded        | Fix the root cause, re-run; do not derive SLOs from a failed baseline                           |
| `p95_ms` variance across iterations > 50% | Non-deterministic response times (cache misses, GC pauses)  | Note the variance in `baseline-result.md`; use the **higher** p95 for SLO derivation            |
| RPS < 1                                   | Extremely slow endpoint or sleep() left in script           | Investigate the endpoint handler; check that no `sleep()` was accidentally included in baseline |

Document all anomalies in `baseline-result.md` under the "Anomalies" section.

## Summary: Fields to Update in `perf-config.json`

After completing this step, the following fields must all be non-null:

```json
{
  "baseline": {
    "p50_ms": <measured>,
    "p95_ms": <measured>,
    "p99_ms": <measured>,
    "error_rate": <measured>,
    "rps": <measured>,
    "run_duration_seconds": 120
  },
  "slo": {
    "p95_threshold_ms": <derived>,
    "error_rate_threshold": <from table above>,
    "notes": "<formula string>"
  },
  "workload": {
    "normal_vus": <estimated>,
    "peak_vus": null,
    "stages": []
  }
}
```

`workload.peak_vus` and `workload.stages` remain `null` — they are set during workload planning.
