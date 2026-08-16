# k6 Summary JSON — Metric Field Paths

> Read this file during Step 1 when parsing `summary.json`. Never recall metric values or field paths from memory — always read from the file using the exact paths listed below.

## Top-Level Structure of `summary.json`

The `handleSummary(data)` callback receives a `data` object. When serialised to JSON, its top-level keys are:

```json
{
  "root_group": { ... },
  "metrics": {
    "http_req_duration": { ... },
    "http_req_failed": { ... },
    "http_reqs": { ... },
    "vus": { ... },
    "vus_max": { ... },
    "iterations": { ... },
    "iteration_duration": { ... },
    "data_received": { ... },
    "data_sent": { ... }
  },
  "state": {
    "testRunDurationMs": ...,
    "isStdOutTTY": ...,
    "isStdErrTTY": ...
  }
}
```

`metrics` is the primary section. Each metric has a `type` and a `values` sub-object.

## Critical Field Paths

### `http_req_duration` — Response Time (ms)

```
metrics.http_req_duration.type          → "trend"
metrics.http_req_duration.values.avg   → average response time (ms)
metrics.http_req_duration.values.min   → minimum response time (ms)
metrics.http_req_duration.values.med   → median / p50 (ms)
metrics.http_req_duration.values.max   → maximum response time (ms)
metrics.http_req_duration.values["p(90)"]  → 90th percentile (ms)
metrics.http_req_duration.values["p(95)"]  → 95th percentile (ms)  ← primary SLO metric
metrics.http_req_duration.values["p(99)"]  → 99th percentile (ms)
```

> **Important:** The key is the string `"p(95)"` — including parentheses. In JavaScript dot notation this requires bracket notation: `data.metrics.http_req_duration.values["p(95)"]`. When reading the raw JSON file, the key appears as `"p(95)"` in the object.

### `http_req_failed` — Error Rate

```
metrics.http_req_failed.type           → "rate"
metrics.http_req_failed.values.rate    → fraction of failed requests (0.0 – 1.0)
metrics.http_req_failed.values.passes  → count of successful requests
metrics.http_req_failed.values.fails   → count of failed requests
```

> **Unit:** `rate` is a decimal fraction, NOT a percentage. `rate = 0.023` means 2.3% error rate. Always multiply by 100 when reporting as a percentage. This is the most common unit confusion error in AI metric analysis.

### `http_reqs` — Request Throughput (RPS)

```
metrics.http_reqs.type                 → "counter"
metrics.http_reqs.values.count         → total request count
metrics.http_reqs.values.rate          → requests per second (RPS)
```

### `vus` — Virtual Users (instantaneous)

```
metrics.vus.type                       → "gauge"
metrics.vus.values.value               → VU count at the END of the test
metrics.vus.values.min                 → minimum VU count during test
metrics.vus.values.max                 → maximum VU count during test
```

> **Do not use `vus.values.value` as "peak VUs".** Use `vus_max` for peak VU count.

### `vus_max` — Peak Virtual Users

```
metrics.vus_max.type                   → "gauge"
metrics.vus_max.values.value           → highest VU count reached during the test
```

### `iterations` — Iteration Count and Rate

```
metrics.iterations.type                → "counter"
metrics.iterations.values.count        → total completed iterations
metrics.iterations.values.rate         → iterations per second
```

### `iteration_duration` — Time Per Full Iteration

```
metrics.iteration_duration.type        → "trend"
metrics.iteration_duration.values["p(95)"]  → 95th percentile of full iteration time (ms)
```

> `iteration_duration` includes think time (`sleep()`). It is NOT the same as `http_req_duration`. Do not conflate them.

### `data_received` / `data_sent` — Bandwidth

```
metrics.data_received.values.count     → total bytes received
metrics.data_received.values.rate      → bytes per second received
metrics.data_sent.values.count         → total bytes sent
metrics.data_sent.values.rate          → bytes per second sent
```

## Threshold Outcomes

k6 records whether each threshold passed or failed in the metric's `thresholds` sub-object:

```json
"http_req_duration": {
  "type": "trend",
  "contains": "time",
  "values": { ... },
  "thresholds": {
    "p(95)<500": {
      "ok": true      ← true = threshold passed, false = threshold failed
    }
  }
}
```

Field path:

```
metrics.http_req_duration.thresholds["p(95)<500"].ok   → true / false
```

Use this field for the SLO Pass/Fail table — do not recompute by comparing the value against the threshold manually (rounding differences can cause false failures).

## Metrics Not in `summary.json`

The following are **not** available in the `summary.json` aggregate. They require reading from the `--out json` raw event stream (`raw-output.json` / `soak-output.json`):

| Metric                               | Why it needs the raw stream                                                                   |
| ------------------------------------ | --------------------------------------------------------------------------------------------- |
| p95 for a specific time window       | Aggregate summary covers the whole test; time-windowed percentiles need per-event data        |
| Per-request timestamps               | Not in summary; each event line in the raw stream has a `data.time` field                     |
| VU count at a specific point in time | `vus` in summary is the end-of-test gauge; use `vus` events in the raw stream for time series |
| Error rate during a specific phase   | Requires filtering raw events by time window                                                  |

## Common Misreading Errors

| Error                                                   | Example                                                                         | Correct Reading                               |
| ------------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------- |
| Treating `rate` as percentage                           | "error rate is 0.02" (stated as 2% but sometimes misread as 0.02%)              | `rate = 0.02` → 2.0%                          |
| Confusing `med` with `avg`                              | Reporting median as average                                                     | `med` = p50 / median; `avg` = arithmetic mean |
| Confusing `iteration_duration` with `http_req_duration` | Reporting 2500ms response time when it's actually the full iteration with sleep | Check metric name before reporting            |
| Using `vus.values.value` as peak VU count               | Reporting 0 VUs as peak (end-of-test gauge is 0 after ramp-down)                | Use `vus_max.values.value`                    |
| Misreading threshold key format                         | Looking for `"p95"` instead of `"p(95)"`                                        | Key is always `"p(95)"` with parentheses      |
| Reading count instead of rate for RPS                   | Reporting `http_reqs.values.count = 12450` as "12450 RPS"                       | RPS is `http_reqs.values.rate`                |

## Sources

- k6 docs — Metrics reference: https://grafana.com/docs/k6/latest/using-k6/metrics/reference/
- k6 docs — handleSummary data structure: https://grafana.com/docs/k6/latest/results-output/end-of-test/custom-summary/#summary-data-reference
- k6 docs — Thresholds outcome: https://grafana.com/docs/k6/latest/using-k6/thresholds/
