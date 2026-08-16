# Workload Patterns Reference

> Read this file during Step 2a when designing the workload model. It provides canonical stage patterns, derivation formulas, and think-time guidance for each test type supported by this workflow.

> Apply these patterns to the actual baseline numbers from `perf-config.json`. Do not copy illustrative example values as-is — every number must be derived.

## How to Use This File

1. Identify the `test_type` from the inputs.
2. Read the corresponding section below for the canonical pattern and derivation formulas.
3. Apply the formulas to the baseline numbers extracted from `perf-config.json`.
4. Justify every resulting value in `test-plan.md`.
5. Cross-check the derived thresholds against `slo.*` in `perf-config.json` — they must match exactly.

## VU Derivation Formulas

These formulas are shared across test types. Derive `normal_vus` first, then use it as the anchor for the test-type-specific patterns.

### `normal_vus` (plateau VU count for sustained load)

```
normal_vus = ceil(target_rps / baseline_rps_per_vu)
```

Where:

- `baseline_rps_per_vu` = `baseline.rps` from `perf-config.json` (measured with 1 VU)
- `target_rps` = a reasonable throughput target for the SUT tier

**Default `target_rps` by hardware tier if not specified:**

| Tier                          | Default target_rps |
| ----------------------------- | ------------------ |
| Micro (≤ 2 cores, ≤ 4 GB RAM) | 10–20              |
| Small (4 cores, 8 GB RAM)     | 20–40              |
| Medium (8 cores, 16 GB RAM)   | 40–80              |
| Large (16+ cores, 32+ GB RAM) | 80–200             |

Use the lower bound when the endpoint is write-heavy or uses a serialising database engine (e.g. SQLite).

State the calculation explicitly:

```
normal_vus = ceil(20 / 5.2) = ceil(3.85) = 4  →  round up to 5 for safety margin
```

### `peak_vus` (for stress and spike tests)

```
stress peak_vus  = normal_vus × (1.5 ^ steps)     (derived incrementally)
spike  peak_vus  = normal_vus × spike_ratio         (minimum ratio: 3)
```

The spike ratio should reflect the scenario being modelled (e.g. a flash sale causing 5× normal traffic). If no specific scenario is provided, use 3× as the default minimum.

## Pattern 1: Load Test

**Goal:** Verify the system handles expected normal traffic without degradation.

**Shape:** Trapezoid — ramp-up → plateau → ramp-down.

### Stage Pattern

| Stage     | Target VUs       | Duration        | Goal                             |
| --------- | ---------------- | --------------- | -------------------------------- |
| Ramp-up   | 0 → `normal_vus` | 10–20% of total | Gradually introduce load         |
| Plateau   | `normal_vus`     | 60–70% of total | Sustain and measure steady state |
| Ramp-down | `normal_vus` → 0 | 10–20% of total | Observe graceful scale-down      |

**Total recommended duration:** 8–12 minutes.

### Think Time

- **1–2 seconds** between iterations.
- Rationale: simulates a human user pausing between actions (clicking, reading). Without think time, a single VU generates far more RPS than a real user would, skewing the load model.
- Use `sleep(Math.random() * 1 + 1)` for 1–2s random jitter — deterministic sleep creates unrealistic synchronisation spikes.

### k6 `options` template

```javascript
export const options = {
  stages: [
    { duration: "2m", target: NORMAL_VUS }, // ramp-up
    { duration: "6m", target: NORMAL_VUS }, // plateau
    { duration: "2m", target: 0 }, // ramp-down
  ],
  thresholds: {
    http_req_duration: [`p(95)<${P95_THRESHOLD}`],
    http_req_failed: [`rate<${ERROR_THRESHOLD}`],
  },
};
```

## Pattern 2: Stress Test

**Goal:** Find the system's breaking point — the VU count at which error rate or latency exceeds acceptable thresholds.

**Shape:** Staircase — repeated steps of increasing load with hold periods to observe steady-state at each level.

### Stage Pattern

Start at `normal_vus`. Increase by 50% per step. Hold each step for 2 minutes to allow the system to stabilise before measuring.

| Stage     | Target VUs          | Duration | Goal                                  |
| --------- | ------------------- | -------- | ------------------------------------- |
| Step 1    | `normal_vus`        | 2 min    | Confirm baseline under load           |
| Step 2    | `normal_vus × 1.5`  | 2 min    | Moderate overload                     |
| Step 3    | `normal_vus × 2.25` | 2 min    | Significant overload                  |
| Step N    | ...                 | 2 min    | Continue until `abortOnFail` triggers |
| Ramp-down | Step N → 0          | 1 min    | Observe recovery                      |

**`abortOnFail` condition:** Stop the test when the system is clearly broken, not just stressed. Recommended trigger: `http_req_failed rate > 0.10` (10% errors) or `http_req_duration p(95) > baseline_p95 × 3`.

### Think Time

- **0.5–1 second** — shorter than load test because the goal is to find the breaking point, not simulate realistic user pacing.

### k6 `options` template

```javascript
export const options = {
  stages: [
    { duration: "2m", target: STEP1_VUS },
    { duration: "2m", target: STEP2_VUS },
    { duration: "2m", target: STEP3_VUS },
    { duration: "1m", target: 0 },
  ],
  thresholds: {
    http_req_duration: [
      {
        threshold: `p(95)<${P95_THRESHOLD}`,
        abortOnFail: true,
        delayAbortEval: "30s",
      },
    ],
    http_req_failed: [
      {
        threshold: `rate<0.10`,
        abortOnFail: true,
        delayAbortEval: "30s",
      },
    ],
  },
};
```

`delayAbortEval: '30s'` prevents premature abort on transient spikes — the condition must persist for 30 seconds before the test is stopped.

## Pattern 3: Spike Test

**Goal:** Verify the system survives a sudden, extreme traffic burst and recovers within an acceptable time.

**Shape:** Low baseline → instantaneous spike → drop → observe recovery. Optionally repeated 2–3 times to test consistency.

### Stage Pattern

| Stage                | Target VUs           | Duration  | Goal                                       |
| -------------------- | -------------------- | --------- | ------------------------------------------ |
| Pre-spike baseline   | `normal_vus × 0.2`   | 1 min     | Establish pre-spike reference              |
| Spike ramp-up        | → `peak_vus`         | 15–30 sec | Simulate sudden traffic burst              |
| Spike hold           | `peak_vus`           | 1–2 min   | Sustain peak to measure error rate         |
| Drop                 | → `normal_vus × 0.2` | 15–30 sec | Simulate traffic subsiding                 |
| Recovery observation | `normal_vus × 0.2`   | 2–3 min   | Measure time to recover to < 1% error rate |

The ramp-up to spike must be short (< 30 seconds) — a slow ramp-up is a load test, not a spike test.

### Think Time

- **0–0.5 seconds** during the spike phase — the burst represents users hitting the system simultaneously.
- **0.5–1 second** during baseline and recovery phases.

### Recovery Time Measurement

Log the timestamp when `http_req_failed rate` drops below 1% after the spike drop. This is the key metric for spike tests. Ensure `handleSummary()` captures enough resolution to calculate this — use `--out json` in addition to `handleSummary()` if per-request timestamps are needed.

## Pattern 4: Soak Test

**Goal:** Detect performance degradation over time — memory leaks, connection pool exhaustion, slow DB index degradation.

**Shape:** Quick ramp-up to a sustainable plateau held for an extended duration.

### Stage Pattern

| Stage     | Target VUs     | Duration  | Goal                                            |
| --------- | -------------- | --------- | ----------------------------------------------- |
| Ramp-up   | 0 → `soak_vus` | 2 min     | Reach steady state quickly                      |
| Plateau   | `soak_vus`     | 10–15 min | Observe latency and error rate trends over time |
| Ramp-down | `soak_vus` → 0 | 1 min     | Observe graceful scale-down                     |

```
soak_vus = ceil(normal_vus × 0.65)
```

Use 60–70% of `normal_vus` — the goal is a sustainable load that the system can handle for a long duration, not a load that stresses it.

### Think Time

- **1–2 seconds** — same as load test. The soak is essentially a long load test.

### Key Metrics to Track

- Memory usage trend over time (requires external monitoring, e.g. cAdvisor/Prometheus — note in `test-plan.md` that this is captured externally, not by k6).
- Latency drift: compare p95 in the first 2 minutes vs the last 2 minutes. Increase > 20% indicates degradation.
- Error rate trend: should remain flat. Any upward trend indicates a leak or exhaustion.

## Threshold Cross-Reference

Thresholds in `test-plan.md` must match `slo.*` in `perf-config.json` exactly. If you discover a discrepancy, update `perf-config.json` — it is the source of truth.

| Field in perf-config.json  | Corresponding k6 threshold       |
| -------------------------- | -------------------------------- |
| `slo.p95_threshold_ms`     | `http_req_duration: ['p(95)<N']` |
| `slo.error_rate_threshold` | `http_req_failed: ['rate<N']`    |

## Sources

- k6 documentation — Test types: https://grafana.com/docs/k6/latest/testing-guides/test-types/
- k6 documentation — Options reference: https://grafana.com/docs/k6/latest/using-k6/k6-options/reference/
- k6 documentation — Thresholds: https://grafana.com/docs/k6/latest/using-k6/thresholds/
- Gatling — Load testing concepts (think time, ramp patterns): https://gatling.io/docs/gatling/guides/
- Google SRE Book — Chapter 4 (SLO and error budget reasoning): https://sre.google/sre-book/service-level-objectives/
