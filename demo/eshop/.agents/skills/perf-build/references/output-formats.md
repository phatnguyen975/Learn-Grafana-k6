# Output Formats by Test Type

> Read this file during Step 4 when implementing `handleSummary()` and deciding on the `--out` flag for each test type. Each test type uses a different output format to satisfy the requirement for distinct report views across test runs.

## Why Different Formats per Test Type

Using the same output format for every test type wastes the opportunity to demonstrate different k6 output capabilities and makes the report collection uniform rather than purposeful. Each format suits a different analysis need:

- **HTML report** → best for human-readable summary with visual charts (load test)
- **JSON stream** → best for machine-parseable per-request data (stress/soak analysis)
- **stdout capture (CSV + tee)** → best for terminal-visible real-time progress (spike)

## Load Test — HTML Report via k6-reporter

**Output:** A single `summary.html` file with charts, threshold pass/fail indicators, and a metrics table.

**Source:** `benc-uk/k6-reporter` — https://github.com/benc-uk/k6-reporter

**`handleSummary()` pattern:**

```javascript
import { htmlReport } from "https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js";
import { textSummary } from "https://jslib.k6.io/k6-summary/0.0.2/index.js";

export function handleSummary(data) {
  return {
    "docs/results/{group}/run/html-report/summary.html": htmlReport(data, {
      title: "{StudentID} — Load Test — {method} {endpoint_path}",
    }),
    "docs/results/{group}/run/raw/summary.json": JSON.stringify(data, null, 2),
    stdout: textSummary(data, { indent: " ", enableColors: true }),
  };
}
```

**Run command:**

```bash
k6 run docs/results/{group}/build/{script}.js
```

**Notes:**

- The HTML report requires an internet connection to load the k6-reporter bundle from GitHub raw content. If the environment is air-gapped, download the bundle locally first.
- `summary.json` is also exported for programmatic analysis.
- Always include `stdout` so the terminal shows the standard summary table during the run.

## Stress Test — JSON Raw Event Stream

**Output:** A newline-delimited JSON file where each line is a k6 data point (request, metric sample, etc.).

**`handleSummary()` pattern:**

```javascript
import { textSummary } from "https://jslib.k6.io/k6-summary/0.0.2/index.js";

export function handleSummary(data) {
  return {
    "docs/results/{group}/run/raw/summary.json": JSON.stringify(data, null, 2),
    stdout: textSummary(data, { indent: " ", enableColors: true }),
  };
}
```

**Run command:**

```bash
k6 run \
  --out json=docs/results/{group}/run/raw/raw-output.json \
  docs/results/{group}/build/{script}.js
```

**Notes:**

- `--out json` produces a separate stream of per-request events in addition to `handleSummary()`.
- The raw JSON stream is used for AI analysis in the report step — it contains per-request timestamps, response times, and tags that the summary JSON does not include.
- The file can be large (100 MB+ for long stress tests). This is expected.
- Example line in the JSON stream:
  ```json
  {
    "type": "Point",
    "data": {
      "time": "2024-01-15T10:23:45.123Z",
      "value": 234.5,
      "tags": { "endpoint": "get-order", "status": "200" }
    },
    "metric": "http_req_duration"
  }
  ```

## Spike Test — stdout Capture (tee)

**Output:** A plain text file containing the full k6 terminal output, including real-time progress lines and the final summary table.

**`handleSummary()` pattern:**

```javascript
import { textSummary } from "https://jslib.k6.io/k6-summary/0.0.2/index.js";

export function handleSummary(data) {
  return {
    "docs/results/{group}/run/raw/summary.json": JSON.stringify(data, null, 2),
    stdout: textSummary(data, { indent: " ", enableColors: true }),
  };
}
```

**Run command:**

```bash
k6 run docs/results/{group}/build/{script}.js 2>&1 | tee docs/results/{group}/run/raw/stdout.txt
```

**Notes:**

- `2>&1` merges stderr (where k6 progress lines appear) into stdout.
- `tee` writes to file while still displaying in the terminal — the human can watch progress in real time.
- The `stdout.txt` file is the "console summary" report view.
- `summary.json` is exported separately via `handleSummary()` for structured analysis.

## Soak Test — JSON Raw Event Stream (same as Stress)

**Output:** JSON event stream + summary JSON. The stream is used to compute latency drift between early and late test phases.

**`handleSummary()` pattern:**

```javascript
import { textSummary } from "https://jslib.k6.io/k6-summary/0.0.2/index.js";

export function handleSummary(data) {
  return {
    "docs/results/{group}/run/raw/summary.json": JSON.stringify(data, null, 2),
    stdout: textSummary(data, { indent: " ", enableColors: true }),
  };
}
```

**Run command:**

```bash
k6 run \
  --out json=docs/results/{group}/run/raw/soak-output.json \
  docs/results/{group}/build/{script}.js
```

**Notes:**

- The soak JSON stream is the primary input for endurance analysis (p95 at start vs end, error rate trend). Ensure the output path is `soak-output.json` to distinguish it from stress test output.
- Memory usage over time cannot be measured by k6 — it requires external monitoring (e.g. cAdvisor / Prometheus). Note this explicitly in `test-plan.md` and `run-log.md`.

## Summary Table

| Test Type | Primary Output Format     | Run Flag                      | handleSummary() output                   |
| --------- | ------------------------- | ----------------------------- | ---------------------------------------- |
| Load      | HTML report (k6-reporter) | _(none)_                      | `summary.html` + `summary.json` + stdout |
| Stress    | JSON raw event stream     | `--out json=raw-output.json`  | `summary.json` + stdout                  |
| Spike     | stdout capture (tee)      | _(tee to file)_               | `summary.json` + stdout                  |
| Soak      | JSON raw event stream     | `--out json=soak-output.json` | `summary.json` + stdout                  |

## Sources

- benc-uk/k6-reporter: https://github.com/benc-uk/k6-reporter
- k6 docs — handleSummary: https://grafana.com/docs/k6/latest/results-output/end-of-test/custom-summary/
- k6 docs — Output plugins (--out): https://grafana.com/docs/k6/latest/results-output/real-time/
- k6 docs — JSON output format: https://grafana.com/docs/k6/latest/results-output/real-time/json/
