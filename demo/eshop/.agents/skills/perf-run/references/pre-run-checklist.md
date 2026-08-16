# Pre-Run Readiness Checklist

> Read this file during Step 1 to generate the environment-specific readiness checklist. Adapt each item to the actual SUT environment described in `perf-config.json`. Do not present a generic template — substitute real values (base_url, file paths, ports).

## How to Use This File

1. Read `perf-config.json environment.*` to identify the SUT stack (OS, monitoring tools, ports).
2. Read `perf-config.json endpoint.*` and `workload.*` to determine what data prerequisites apply.
3. For each checklist category below, substitute the actual values and include only the items relevant to the detected environment. Remove items that do not apply.
4. Present the final checklist as formatted checkboxes in the conversation.

## Category 1 — SUT Backend Accessibility

Always include. Substitute `{base_url}` from `perf-config.json environment.base_url`.

```
□ Backend is running and accessible:
  Run: curl -s -o /dev/null -w "%{http_code}" {base_url}/api/health (or the lightest available endpoint, e.g. GET /api/products)
  Expected: 200 OK. If not 200, do not proceed.

□ No pending migrations or schema changes on the DB.
□ DB is in a clean state (no leftover data from a previous failed test run that could cause unique-constraint errors).
```

## Category 2 — Test Data Prerequisites

Include based on `test_type` and `endpoint.requires_auth`:

**For all test types:**

```
□ CSV data file exists at: {csv_data_path}
  Verify: run `wc -l {csv_data_path}` — row count must be ≥ {required_rows from csv-schema.md}.
□ CSV header row matches the columns expected by the script.
```

**For test types that read existing DB records (load, spike — read-heavy or transactional endpoints):**

```
□ Seed data is present in the DB.
  Verify: call the read endpoint manually with one ID from the CSV — expect 200, not 404.
  Example: curl -H "Authorization: Bearer {token}" {base_url}{endpoint_path}/{sample_id}
```

**For write-once test types (stress — registration or unique-record creation):**

```
□ Email addresses / unique keys in the CSV have NOT been used in a previous run.
  (If re-running after a failed test, ensure DB was cleaned or a new CSV was generated with a fresh timestamp prefix.)
```

## Category 3 — Monitoring Infrastructure

Adapt to the environment. Common setups:

**Docker Compose with Prometheus + Grafana + cAdvisor:**

```
□ All containers are running:
  Run: docker ps --format "table {{.Names}}\t{{.Status}}"
  Expected: backend, prometheus, grafana, cadvisor all showing "Up".

□ Grafana dashboard is open in the browser: http://localhost:{grafana_port} (default: 3001 or 3000 depending on compose config)
  All panels show recent data (last 5 minutes) — not "No data".

□ Relevant panels are visible without scrolling:
  - HTTP request rate / RPS
  - p95 / p99 latency
  - Error rate
  - Container CPU usage
  - Container memory usage
```

**Local process monitoring (no Docker):**

```
□ Resource monitor is open and positioned to be visible in the recording frame:
  - Windows: Task Manager (Performance tab) or Resource Monitor
  - macOS: Activity Monitor (CPU + Memory tabs)
  - Linux: htop or top in a separate terminal window

□ Resource monitor is sorted by CPU or Memory (whichever is more relevant to the test).
```

## Category 4 — Recording Setup

Always include. Evidence validity depends on simultaneous capture.

```
□ Screen recording software is running and ready to record:
  - Options: OBS Studio, Windows Game Bar (Win+G), macOS QuickTime screen capture, or any tool that can capture the full screen.

□ The following are visible in the same recording frame (arrange windows before starting):
  - k6 terminal window (where the run command will be entered).
  - Resource monitor (Grafana dashboard, Task Manager, htop, or Activity Monitor).

□ A test recording of 10 seconds has been reviewed to confirm both windows are clearly legible. Start the actual recording BEFORE running the k6 command.
```

## Category 5 — Output Directory

Always include.

```
□ Output directories exist (create if missing):
  Run:
    mkdir -p {output_dir}/raw
    mkdir -p {output_dir}/html-report    ← load test only
    mkdir -p {output_dir}/screenshots
```

## Category 6 — k6 Installation

Include if this is the first run in this environment.

```
□ k6 is installed and on PATH:
  Run: k6 version
  Expected: k6 vX.Y.Z (go...; ...)
  Minimum supported: v0.43.0 (required for handleSummary()).
  Recommended: latest stable — https://grafana.com/docs/k6/latest/set-up/install-k6/
```

## Presenting the Checklist

Format the final checklist as a numbered section with a header:

```
## Pre-Run Readiness Checklist — {test_type} test ({group_name})

Verify every item below before confirming ready. Run commands are provided for items that can be verified automatically.

### 1. SUT Backend
□ ...

### 2. Test Data
□ ...

### 3. Monitoring
□ ...

### 4. Recording Setup
□ ...

### 5. Output Directories
□ ...

Confirm all items are checked, then reply "ready" to receive the run command.
```
