# Soak Test JSON Analysis Methodology

> Read this file during Step 5 when parsing `soak-output.json` to produce the endurance report. It describes how to extract metrics from the k6 JSON event stream and what calculations to perform.

## k6 JSON Event Stream Format

The `--out json` flag produces a **newline-delimited JSON** file (JSON Lines / NDJSON). Each line is one JSON object representing a single data point event.

**Relevant event structure:**

```json
{
  "type": "Point",
  "metric": "http_req_duration",
  "data": {
    "time": "2024-01-15T10:23:45.123456789Z",
    "value": 234.5,
    "tags": {
      "status": "200",
      "group": "",
      "name": "http://localhost:3000/api/orders/1"
    }
  }
}
```

**Relevant metric names:**

| Metric              | What it measures                                               |
| ------------------- | -------------------------------------------------------------- |
| `http_req_duration` | Response time per request (ms)                                 |
| `http_req_failed`   | 1 if request failed (non-2xx or network error), 0 if succeeded |
| `http_reqs`         | Request count (one event per request, value = 1)               |
| `vus`               | Current active VU count at this point in time                  |

Filter events by: `"type": "Point"` and the target `"metric"` name.

## Parsing Strategy

The `soak-output.json` file may be large (100 MB+). Do not attempt to load the entire file into memory at once. Process it line by line.

**Recommended approach for AI analysis:**

1. Read the file line by line (or in chunks).
2. Parse each line as JSON and filter for `"type": "Point"`.
3. Separate events into time windows (see below).
4. Compute aggregate statistics per window.

If the file is too large to process directly, use the `scripts/parse-soak.js` script in the skill's `scripts/` directory — it performs the windowed analysis and outputs the required metrics as JSON.

## Time Window Definitions

The soak test has three meaningful windows:

| Window       | Definition                                         | Purpose                                         |
| ------------ | -------------------------------------------------- | ----------------------------------------------- |
| Warm-up      | First 2 minutes of the plateau stage               | Exclude from analysis (JIT, connection warm-up) |
| Start window | Minutes 3–4 of the plateau                         | Reference p95 for drift comparison              |
| End window   | Last 2 minutes of the plateau                      | End p95 for drift comparison                    |
| Full plateau | All events between ramp-up end and ramp-down start | Used for max_stable_rps                         |

**Determining window boundaries from the event stream:**

The `vus` metric shows when the ramp-up ends (VU count stabilises) and when ramp-down begins (VU count starts decreasing). Use these timestamps to define the plateau window.

```
plateau_start_time = time of last vus event where value is still increasing
plateau_end_time   = time of first vus event where value is decreasing from peak
```

## Calculations

### max_stable_rps

```
max_stable_rps = count(http_reqs events in full plateau window) / plateau_duration_seconds
```

Round to 2 decimal places. State the plateau duration used.

### p95_at_start_ms

```
start_window_durations = all http_req_duration values where event.data.time ∈ [plateau_start + 2min, plateau_start + 4min]
p95_at_start_ms = percentile(start_window_durations, 95)
```

### p95_at_end_ms

```
end_window_durations = all http_req_duration values where event.data.time ∈ [plateau_end - 2min, plateau_end]
p95_at_end_ms = percentile(end_window_durations, 95)
```

### p95_drift_ms

```
p95_drift_ms = p95_at_end_ms - p95_at_start_ms
```

Positive drift = latency increased over time (potential degradation signal).
Negative drift = latency improved over time (warm cache, JIT optimisation).

**Interpretation:**

- `drift < 10 ms` — stable, no meaningful degradation.
- `10 ms ≤ drift < 50 ms` — mild drift, monitor in subsequent runs.
- `drift ≥ 50 ms` — significant degradation, investigate cause.

### error_rate_at_end

```
end_window_failures = count(http_req_failed events in end window where value = 1)
end_window_requests = count(http_req_failed events in end window)
error_rate_at_end   = end_window_failures / end_window_requests
```

Express as a percentage (e.g. 0.12%).

## Fields Requiring Human Input

The following fields **cannot** be derived from the k6 JSON stream. They require external monitoring data. Mark them `[HUMAN: ...]` in the report:

| Field               | Source                                                      |
| ------------------- | ----------------------------------------------------------- |
| `memory_ceiling_mb` | Grafana Memory Usage panel — peak value during plateau      |
| `degradation_point` | Visual observation of Grafana p95 trend panel — minute mark |

Do not substitute a proxy metric (e.g. using p99 latency to infer memory). These fields must either be filled by the human or marked as "not measured".

## Handling Missing or Corrupt Data

| Situation                              | Action                                                                                                        |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| File is empty                          | Report: "soak-output.json is empty — k6 may not have written JSON output. Verify `--out json` flag was used." |
| File contains unparseable lines        | Skip corrupt lines; note the count of skipped lines in the report.                                            |
| Plateau window is very short (< 4 min) | Note that start and end windows may overlap; use the first and last quartile of plateau events instead.       |
| No `vus` metric events found           | Use test duration and stage config from `perf-config.json` to estimate window boundaries.                     |

## Sources

- k6 docs — JSON output format: https://grafana.com/docs/k6/latest/results-output/real-time/json/
- k6 docs — Metrics reference: https://grafana.com/docs/k6/latest/using-k6/metrics/reference/
- Percentile calculation: standard nearest-rank method.
