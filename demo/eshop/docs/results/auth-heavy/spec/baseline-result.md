# Baseline Result: Auth-Heavy (POST /api/register)

## Baseline Metrics

- **Test Duration:** 120 seconds
- **Virtual Users:** 1
- **RPS:** 44.36 req/s
- **p50 Latency:** 19.82 ms
- **p95 Latency:** 31.75 ms
- **Error Rate:** 0%
- **Checks Passed:** 100% (11366 / 11366)

## Derived SLOs (Stress Test)

- **p95 Threshold:** 200 ms
- **Error Rate Threshold:** 5%

**Derivation Notes:** Based on the `slo-derivation.md` rules for a Stress test:

- `p95_threshold_ms = baseline_p95_ms * multiplier`
- The baseline `p95` is `31.75 ms`.
- For a `stress` test, the multiplier is `3x`.
- Since this is an `Auth-intensive` endpoint (password hashing), we apply an adjustment of adding a 100 ms flat buffer. (Note: Although there is also a 50 ms buffer for SQLite, we use the larger adjustment).
- Formula: `(31.75 * 3) + 100 = 195.25 ms`. Rounded to **200 ms**.
- The `Error Rate Threshold` for a stress test is fixed at 5%, as the system is expected to be pushed to its limits but should still maintain reasonable reliability.

## Workload Estimate

- **normal_vus:** 10
- **Reasoning:** According to the `perf-spec` instructions, for SQLite SUTs, write queue saturation typically occurs around 10–20 concurrent writes. Therefore, we set `normal_vus = 10` as a solid starting point for our stress test workload model.

## Anomalies

- None. The baseline executed cleanly with 0% errors and very stable response times.
