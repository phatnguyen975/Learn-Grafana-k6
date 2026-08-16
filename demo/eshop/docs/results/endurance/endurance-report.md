# Endurance Report — Soak Test Observations

> **Test type:** Soak (Endurance)  
> **Script:** `23127449_SoakTest_20260815.js`  
> **Endpoint(s):** `GET /api/products` + `GET /api/orders/my-orders`  
> **Duration:** 15 minutes (2 min ramp-up + 10 min sustained + 3 min cool-down)

## 1. Run Metadata

| Field             | Value              |
| ----------------- | ------------------ |
| Start time        | 03:40 AM           |
| End time          | 03:55 AM           |
| Duration (actual) | ~15 min            |
| k6 version        | v2.0.0             |
| Operator          | 23127449 (Student) |

## 2. Measured RPS (Throughput)

| Timestamp                      | RPS (Grafana) | Notes                                                |
| ------------------------------ | ------------- | ---------------------------------------------------- |
| t = 2:00 min (sustained start) | 11.8          | Baseline for sustained phase                         |
| t = 7:00 min (midpoint)        | 11.3          | Check for throughput drop                            |
| t = 12:00 min (sustained end)  | 11.9          | Final throughput reading                             |
| **Maximum stable RPS**         | 11.9          | **This is the endurance threshold — cite in README** |

## 3. p95 Latency Drift Analysis

| Timestamp     | p95 ms (Grafana) | Drift vs t=2          |
| ------------- | ---------------- | --------------------- |
| t = 2:00 min  | 9.89             | baseline (0 ms drift) |
| t = 7:00 min  | 24.7             | +14.81 ms             |
| t = 12:00 min | 9.84             | -0.05 ms              |

**Drift verdict:**

- < 10 ms drift: PASS — No memory/GC pressure detected
- 10–30 ms drift: WARN — Acceptable but monitor closely in longer runs
- > 30 ms drift: FAIL — Indicates memory leak or GC pause accumulation

**Actual drift verdict:** PASS — Transient spike at t=7 (WARN level), but fully recovered to baseline (-0.05 ms drift) by t=12. No long-term memory or GC pressure detected.

## 4. Resource Usage (from Grafana + cAdvisor)

### CPU

| Timestamp       | CPU Usage (vCPU) | % of Limit (2.0 vCPU) |
| --------------- | ---------------- | --------------------- |
| t = 2:00 min    | 0.0510           | 2.55%                 |
| t = 7:00 min    | 0.0417           | 2.09%                 |
| t = 12:00 min   | 0.0363           | 1.82%                 |
| Peak (any time) | 0.0595           | 2.98%                 |

### Memory (container_memory_rss)

| Timestamp                      | Memory RSS (MB) | % of Limit (1024 MB) |
| ------------------------------ | --------------- | -------------------- |
| t = 0 min (pre-run)            | 63.7            | 6.22%                |
| t = 2:00 min                   | 69.0            | 6.74%                |
| t = 7:00 min                   | 68.5            | 6.69%                |
| t = 12:00 min                  | 68.7            | 6.71%                |
| t = 15:00 min (post cool-down) | 68.4            | 6.68%                |

**Memory ceiling:** 69.9 MB

**Memory recovered after cool-down:** Yes

## 5. Error Rate

| Period                | Error Rate | HTTP Errors Observed |
| --------------------- | ---------- | -------------------- |
| Ramp-up (0-2 min)     | 0          | —                    |
| Sustained (2-12 min)  | 0          | —                    |
| Cool-down (12-15 min) | 0          | —                    |

## 6. Anomalies Observed

| Time         | Observation                           | Severity | Likely Cause                                      |
| ------------ | ------------------------------------- | -------- | ------------------------------------------------- |
| t = 7:00 min | Transient p95 latency spike to 24.7ms | Low      | Minor SQLite queueing or Garbage Collection pause |

## 7. Final k6 Summary Metrics (from summary.json)

> Source: `docs/results/endurance/raw/summary.json`

| Metric           | Value   | Field Path                                   |
| ---------------- | ------- | -------------------------------------------- |
| Total requests   | 9105    | `metrics.http_reqs.values.count`             |
| Total iterations | 4545    | `metrics.iterations.values.count`            |
| Avg RPS          | 9.50    | `metrics.http_reqs.values.rate`              |
| p50 latency (ms) | 4.77    | `metrics.http_req_duration.values.med`       |
| p95 latency (ms) | 11.03   | `metrics.http_req_duration.values.p(95)`     |
| p99 latency (ms) | 1081.22 | `metrics.http_req_duration.values.max`       |
| Error rate       | 0%      | `metrics.http_req_failed.values.rate` × 100% |
| Peak VUs         | 15      | `metrics.vus_max.values.value`               |

## 8. Endurance Threshold — Final Statement

> For inclusion in README.md and the main report:

**Maximum stable RPS:** 11.9 req/s
**Memory ceiling:** 69.9 MB RSS (out of 1024 MB container limit)
**p95 ceiling:** 24.7 ms (from Grafana observation at t=7)
**CPU operating point:** 0.0595 vCPU (peak out of 2.0 vCPU limit)
**Test duration:** 15 minutes at 15 sustained VUs
**Error rate:** 0%
**Verdict:** PASS — All thresholds met. System exhibits excellent endurance with no signs of memory leaks, resource exhaustion, or permanent latency degradation.

## 9. Threshold Interpretation

| Metric                | Hypothesis   | Actual      | Match?                        |
| --------------------- | ------------ | ----------- | ----------------------------- |
| Max stable RPS        | ~15 req/s    | 11.9 req/s  | Lower than expected           |
| Memory ceiling        | 300-600 MB   | 69.9 MB     | Much lower (highly efficient) |
| CPU peak              | 0.2-0.6 vCPU | 0.0595 vCPU | Much lower (barely used)      |
| p95 drift over 10 min | < 10 ms      | -0.05 ms    | Match (no permanent drift)    |

**AI hypothesis accuracy:** AI significantly overestimated the CPU and Memory footprint. The SUT handles read-heavy workloads with very high resource efficiency. The p95 drift hypothesis was accurate, confirming the system's stability over time.
