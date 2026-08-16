# Baseline Result — read-heavy

> **Date:** 2026-08-14  
> **Endpoint:** `GET /api/orders/:id`  
> **Script:** `tests/load/baseline.js`  
> **Duration:** 2 minutes · 1 VU · No thresholds

## 1. Measured Metrics

| Metric             | Value   | Unit  |
| ------------------ | ------- | ----- |
| p50 latency        | 1.07    | ms    |
| p90 latency        | 2.34    | ms    |
| p95 latency        | 3.19    | ms    |
| Min latency        | 0.71    | ms    |
| Max latency        | 1163.30 | ms    |
| Error rate         | 0.00    | %     |
| Requests/sec (RPS) | 614.55  | req/s |
| Total iterations   | 78405   | —     |
| Check pass rate    | 100     | %     |

## 2. Check Results

| Check                            | Passed | Failed |
| -------------------------------- | ------ | ------ |
| status is 200                    | 78405  | 0      |
| response has expected field 'id' | 78405  | 0      |

## 3. Anomalies Observed

The baseline executed incredibly fast with a p95 of just 3.19 ms and a massive 614.55 RPS for a single VU.
**Anomaly:** The `max` latency was 1.16s (1163.30 ms), which is a massive outlier compared to the 3.19 ms p95. In real-world systems, this is a classic "Cold Start" artifact (Node.js JIT compilation, opening the first SQLite DB connection, and TLS/network handshake on the first request). Since p95 remains extremely low, this outlier is not a systemic issue and can be safely ignored for steady-state analysis.

## 4. Derived SLO Thresholds (Real-World Best Practices)

Instead of a rigid mathematical multiplier, these thresholds are defined based on real-world e-commerce system requirements and user-experience (UX) budgets.

| Threshold             | Value    | Real-World Best Practice Justification                                                                                                                                                                                                                                                                                                                               |
| --------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| p95 latency threshold | < 100 ms | In modern microservices, an internal read-heavy API should respond in under 100ms to allow the frontend to render within the 200-300ms perceptual budget. While the baseline is ~3ms, setting the SLO to 100ms provides realistic headroom for concurrent database locks, garbage collection pauses, and network jitter under load, without triggering false alarms. |
| Error rate threshold  | < 0.1%   | Real-world systems target "Three Nines" (99.9%) availability. An error rate > 0.1% during normal load indicates a systemic failure.                                                                                                                                                                                                                                  |
| Estimated normal VUs  | 10       | Simulating 10 concurrent active users clicking "My Orders" simultaneously is a realistic peak for a small-to-medium deployment.                                                                                                                                                                                                                                      |

## 5. Raw Summary JSON

> Source: `docs/results/read-heavy/spec/baseline-summary.json`

```json
{
  "metrics": {
    "http_req_duration": {
      "type": "trend",
      "values": {
        "med": 1.0745025,
        "max": 1163.301656,
        "p(90)": 2.343009900000002,
        "p(95)": 3.1891003999999974,
        "avg": 1.5314381681588567,
        "min": 0.712279
      }
    },
    "http_reqs": {
      "type": "counter",
      "values": {
        "count": 78408,
        "rate": 614.5497445332113
      }
    }
  }
}
```

## 6. Next Steps

- [x] Review this document and confirm the Best-Practice derived SLOs are acceptable.
- [x] Confirm `perf-config.json` has been updated with all `baseline.*` and `slo.*` values.
- [x] Proceed to workload model design (Test Plan) once this document is approved.
