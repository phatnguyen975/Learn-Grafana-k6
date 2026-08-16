# Run Commands by Test Type

> Read this file during Step 2 to provide the exact run command. Substitute all placeholder values ({output_dir}, {script_path}, etc.) with actual paths before presenting to the human.

## General Rules

- **Never use `--summary-export`** — deprecated in k6 v0.43+, removed in v0.54+. All summary export is handled by `handleSummary()` inside the script.
- Always create output directories before running (covered in pre-run checklist).
- The `2>&1 | tee` pattern (spike) requires a POSIX shell. On Windows, use Git Bash, WSL, or PowerShell's `Tee-Object` equivalent — note this in the instructions.
- For multi-line commands, provide both the multi-line version (for readability) and a single-line version (for copy-paste on Windows terminals that do not handle `\`).

## Load Test

**Output format:** HTML report via `k6-reporter` + `summary.json`

```bash
k6 run {script_path}
```

**Expected output files** (written by `handleSummary()` inside the script):

```
{output_dir}/html-report/summary.html      ← HTML report with charts
{output_dir}/raw/summary.json              ← structured summary data
```

**Notes:**

- No `--out` flag needed — all output is handled by `handleSummary()` in the script.
- The HTML report requires an outbound connection to load the k6-reporter bundle from `raw.githubusercontent.com` at the end of the test. If the environment is air-gapped, the bundle must be downloaded locally beforehand.
- Approximate duration: sum all stage durations from `perf-config.json workload.stages`.

## Stress Test

**Output format:** JSON raw event stream (per-request data) + `summary.json`

```bash
# Multi-line (Linux/macOS/Git Bash)
k6 run \
  --out json={output_dir}/raw/raw-output.json \
  {script_path}

# Single-line (all platforms)
k6 run --out json={output_dir}/raw/raw-output.json {script_path}
```

**Expected output files:**

```
{output_dir}/raw/raw-output.json           ← k6 JSON event stream (per-request)
{output_dir}/raw/summary.json              ← structured summary (from handleSummary())
```

**Notes:**

- `raw-output.json` is a **newline-delimited JSON** file (JSON Lines format), not a standard JSON array. Each line is one k6 data point event.
- The file can be large (100 MB+ for long tests). This is expected and normal.
- If `abortOnFail` triggers, k6 exits with code 99. This is expected for stress tests that reach the system's breaking point — it is not an error in the script.
- Instruct the human to note the k6 terminal output when `abortOnFail` triggers — it shows which threshold was breached and at what VU count.

## Spike Test

**Output format:** stdout capture (tee) + `summary.json`

```bash
# Linux/macOS/Git Bash
k6 run {script_path} 2>&1 | tee {output_dir}/raw/stdout.txt

# PowerShell (Windows — if Git Bash is not available)
k6 run {script_path} 2>&1 | Tee-Object -FilePath {output_dir}/raw/stdout.txt
```

**Expected output files:**

```
{output_dir}/raw/stdout.txt                ← full terminal output (progress + summary)
{output_dir}/raw/summary.json              ← structured summary (from handleSummary())
```

**Notes:**

- `2>&1` merges k6's stderr (progress lines) into stdout so `tee` captures both.
- The human will see real-time progress in the terminal — the `tee` captures it simultaneously.
- `stdout.txt` is the "console summary" report view — it includes the real-time VU ramp-up/down lines as well as the final summary table.
- The key observation is the error rate during the spike phase and the time to recovery after VUs drop — instruct the human to watch for these explicitly.

## Soak Test

**Output format:** JSON raw event stream + `summary.json`

```bash
# Multi-line (Linux/macOS/Git Bash)
k6 run \
  --out json={output_dir}/raw/soak-output.json \
  {script_path}

# Single-line (all platforms)
k6 run --out json={output_dir}/raw/soak-output.json {script_path}
```

**Expected output files:**

```
{output_dir}/raw/soak-output.json          ← k6 JSON event stream (per-request)
{output_dir}/raw/summary.json              ← structured summary (from handleSummary())
```

**Notes:**

- Use `soak-output.json` (not `raw-output.json`) to distinguish it from a stress test output if both are run for the same group.
- The soak duration is typically 12–17 minutes total (ramp + plateau + ramp-down). Confirm the exact duration from `perf-config.json workload.stages` before running.
- Memory usage over time **cannot** be measured by k6 — it requires the external monitoring tool (Grafana/cAdvisor or OS-level resource monitor). Remind the human to watch and note the memory panel throughout the run.

## Approximate Duration Calculation

Before presenting the command, compute the total test duration from the stages:

```
total_duration = sum of all stage durations in perf-config.json workload.stages
```

State this clearly: _"This test will run for approximately X minutes. Start your recording now, before running the command."_

## Sources

- k6 docs — Running k6: https://grafana.com/docs/k6/latest/get-started/running-k6/
- k6 docs — Output options (--out): https://grafana.com/docs/k6/latest/results-output/real-time/
- k6 docs — JSON output format: https://grafana.com/docs/k6/latest/results-output/real-time/json/
- k6 docs — handleSummary: https://grafana.com/docs/k6/latest/results-output/end-of-test/custom-summary/
- benc-uk/k6-reporter: https://github.com/benc-uk/k6-reporter
