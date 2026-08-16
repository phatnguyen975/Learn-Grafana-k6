# Skill Execution Guide

> This document explains how to invoke each skill in the performance testing workflow, what inputs to provide, what to expect at each Human Gate, and how to handle common situations. Read this before starting any skill for the first time.

## Prerequisites

Before invoking any skill, ensure the following are in place:

```
□ AGENTS.md is at the project root — Antigravity reads it automatically.
□ docs/srs.md and docs/api-spec.md exist and are populated.
□ SUT backend is running: curl -s http://localhost:3000/api/products → should return JSON.
□ k6 is installed in WSL: k6 version → should return vX.Y.Z.
□ Node.js ≥ 18 is installed in WSL: node --version → should return v18+.
□ Docker Desktop is running (SUT + Grafana stack).
```

## How to Invoke a Skill

Skills are invoked by typing the skill trigger phrase in the Antigravity (or compatible agent) chat. The agent reads `AGENTS.md` and the relevant `SKILL.md` automatically.

**General invocation pattern:**

```
/skill-name  <or>  use perf-spec  <or>  run perf-spec skill
```

Followed immediately by the input block. You do not need to paste the SKILL.md content — the agent finds it via `.agents/skills/{skill-name}/SKILL.md`.

**Input format:** Provide inputs as a markdown code block or a clearly labelled list. The agent reads all inputs before starting Step 1.

## Skill 1 — `perf-spec`

### Purpose

Analyse the endpoint, run a 1-VU baseline, derive SLOs. Must be the first skill run for any new group.

### When to invoke

- Starting performance testing on a new endpoint group for the first time.
- Re-baselining after significant SUT code changes.

### How to invoke

```
/perf-spec
  srs_path:            docs/srs.md
  api_spec_path:       docs/api-spec.md
  student_id:          23127449
  group_name:          read-heavy
  endpoint_path:       /api/orders/:id
  test_type:           load
  environment_spec:
    os:                  Ubuntu 22.04 (WSL2)
    host_cpu_cores:      8
    host_ram_gb:         16
    container_cpu_limit: 1.0
    container_memory_limit: 512m
    base_url:            http://localhost:3000
  output_dir:          docs/results/read-heavy/
```

### What the agent does (no action needed from you)

1. Creates `docs/results/read-heavy/` directory tree.
2. Creates `perf-config.json` from template with your inputs.
3. Reads `srs.md` and `api-spec.md` in full.
4. Writes `spec/scenario-design.md` with endpoint analysis and preliminary SLOs.

### Human Gate 1 — Review Scenario Design

The agent pauses and presents:

- `spec/scenario-design.md`
- `perf-config.json` (partial — baseline fields still null)

**You must review:**

- Is the operation class correct? (e.g. Read-Complex vs Read-Simple)
- Are preliminary SLO targets plausible for your hardware?
- Are all business rule constraints from the SRS captured?

**Reply options:**

```
Approved.
```

or

```
Corrections:
- Section 3: p95 preliminary target should be 300ms, not 200ms — this endpoint does a 3-table JOIN.
- Section 5: Missing account lockout constraint from FR-02.
```

The agent applies corrections and re-presents before proceeding.

### Human Gate 2 — Review Baseline Script

The agent presents `spec/baseline.js` for inspection before running.

**You must verify:**

- Is the endpoint path correct? (`/api/orders/:id` — not a typo)
- Is auth implemented correctly? (should use `setup()` or per-VU pattern per the strategy)
- Is `handleSummary()` writing to the correct path?
- Are `check()` assertions testing the right fields?

**Reply options:**

```
Approved. Run it.
```

or

```
Fix line 14: the check should assert r.json('id') !== undefined, not r.json('orderId').
```

After approval, the agent invokes `k6-runner` to run the baseline (2 min, 1 VU).

### After baseline completes

The agent presents:

- `spec/baseline-result.md` (parsed metrics table)
- Derived SLO thresholds with formulas
- Updated `perf-config.json` with all `baseline.*` and `slo.*` fields filled

No gate here — review the baseline result and proceed to `perf-plan` when ready.

## Skill 2 — `perf-plan`

### Purpose

Design the workload model, select auth strategy, design CSV schema, generate test data.

### When to invoke

After `perf-spec` is complete and `perf-config.json` has non-null `baseline.*` and `slo.*` values.

### How to invoke

```
/perf-plan
  perf_config_path:       docs/results/read-heavy/perf-config.json
  scenario_design_path:   docs/results/read-heavy/spec/scenario-design.md
  api_spec_path:          docs/api-spec.md
  srs_path:               docs/srs.md
  group_name:             read-heavy
  test_type:              load
  output_dir:             docs/results/read-heavy/
```

### What the agent does (no action needed from you)

1. Reads all input files.
2. Derives `normal_vus` and `peak_vus` from baseline RPS.
3. Designs the stage table for `load` test type.
4. Evaluates all three auth strategies for this endpoint.
5. Writes `plan/test-plan.md` and `plan/auth-strategy.md`.

### Human Gate 1 — Review Workload Model & Auth Strategy

The agent pauses and presents both documents.

**You must verify in `test-plan.md`:**

- Does the VU derivation formula make sense? (`normal_vus = ceil(target_rps / baseline_rps)`)
- Do stage durations add up to a reasonable total? (Load test: 8–12 minutes total)
- Do threshold values exactly match `perf-config.json slo.*`?
- Is think time reasonable for this endpoint type?

**You must verify in `auth-strategy.md`:**

- Were all three strategies evaluated?
- Is the rejection reasoning for the other two strategies sound?
- Does the chosen strategy match what you decided in `AGENTS.md §5`?

**Reply options:**

```
Approved.
```

or

```
test-plan.md corrections:
- normal_vus should be 8, not 5. Target RPS for our hardware should be 40, not 25.
- Stage 2 duration too short — extend plateau from 4m to 6m.

auth-strategy.md: approved.
```

### Human Gate 2 — Review CSV Schema

The agent presents `plan/data/csv-schema.md`.

**You must verify:**

- Are column names correct and match what the script will use?
- Is the row count calculation shown with the actual formula?
- For write-once endpoints (register): is the uniqueness pattern specified?
- Are example rows realistic (not placeholder text)?

**Reply options:**

```
Approved.
```

or

```
Row count seems too low. The calculation uses peak_vus=10 but test-plan shows peak 15. Recalculate with peak_vus=15.
```

### After Gate 2 approval

The agent:

1. Presents `plan/data/seed-data.js` for your review before running.
2. You approve → agent invokes `node-runner` to seed the DB.
3. Agent presents `plan/data/generate-data.js` for your review before running.
4. You approve → agent invokes `node-runner` to generate the CSV.
5. Agent verifies the CSV (row count, no nulls, 3 sample rows) and presents results.

**Important:** Each script is presented for human review before execution. Do not skip these micro-approvals — a bug in `seed-data.js` can corrupt your DB state.

## Skill 3 — `perf-build`

### Purpose

Generate the sanity script, verify it runs cleanly, then build the full test script.

### When to invoke

After `perf-plan` is complete: `plan/test-plan.md`, `plan/auth-strategy.md`, and `plan/data/{group}.csv` all exist and are approved.

### How to invoke

```
/perf-build
  test_plan_path:     docs/results/read-heavy/plan/test-plan.md
  perf_config_path:   docs/results/read-heavy/perf-config.json
  csv_data_path:      docs/results/read-heavy/plan/data/read-heavy.csv
  group_name:         read-heavy
  test_type:          load
  student_id:         23127449
  output_dir:         docs/results/read-heavy/build/
```

### What the agent does (no action needed from you)

1. Reads all input files and verifies CSV header matches test plan columns.
2. Delegates to `script-writer` to generate `build/sanity-read-heavy.js`.
3. Presents the sanity script.

### Human Gate 1 — Review Sanity Script

**You must verify:**

- Is `options: { vus: 1, iterations: 1 }` — no stages, no thresholds?
- Is `handleSummary()` writing to the correct path?
- Is the auth flow correct for this group?
- Are all required `check()` assertions present?

**Reply:**

```
Approved. Run the sanity.
```

The agent invokes `k6-runner`. If the sanity passes (100% checks, exit 0):

- Agent writes `build/sanity-result.md` with verdict **PASS**.
- Agent presents both the result and the sanity script for final review.

If the sanity fails:

- Agent diagnoses the error and proposes a fix.
- Agent applies fix and re-runs (max 2 retries).
- If still failing after 2 retries: agent escalates to you with a specific diagnosis.

**Do not approve the full script build until sanity passes.**

### Human Gate 2 — Review Full Test Script

The agent presents `build/23127449_LoadTest_20250815.js` (example filename).

**You must verify (use `build/review-notes.md` template to record findings):**

- Are all three `tests/config/` imports present?
- No hardcoded BASE_URL, thresholds, or stages in the script body?
- Is `sleep()` randomised and using the think-time value from test-plan.md?
- Is `teardown()` implemented?
- Does the filename match `{StudentID}_{ScenarioType}_{YYYYMMDD}.js`?
- Does a mental dry-run of 1 VU, 1 iteration complete without errors?

**Reply:**

```
Corrections (fill into review-notes.md):
- Line 34: sleep is deterministic (sleep(1.5)) — make it randomised (Math.random() * 1 + 1).
- teardown() is missing — add it. No delete API exists, so document the manual cleanup pattern.
- Check name at line 22 is too vague: "check 1" → "status is 200".
```

The agent applies all corrections and presents the updated script. You review again and reply:

```
Approved.
```

After approval the agent populates `tests/config/env.js`, `tests/config/thresholds.js`, and `tests/config/stages.js`.

## Skill 4 — `perf-run`

### Purpose

Coordinate the actual test execution: pre-run checklist, run command, observation guide, evidence collection, run log.

### When to invoke

After `perf-build` is complete: the full test script exists, is approved, and `tests/config/` files are populated.

### How to invoke

```
/perf-run
  script_path:               docs/results/read-heavy/build/23127449_LoadTest_20250815.js
  perf_config_path:          docs/results/read-heavy/perf-config.json
  group_name:                read-heavy
  test_type:                 load
  output_dir:                docs/results/read-heavy/run/
  csv_data_path:             docs/results/read-heavy/plan/data/read-heavy.csv
```

### Human Gate 1 — Confirm Pre-Run Checklist

The agent presents a checklist tailored to your environment. Work through it:

```
□ Backend running: curl -s http://localhost:3000/api/products → 200 OK      [CHECK]
□ Grafana open at http://localhost:3001 — all panels show recent data       [CHECK]
□ Screen recording software ready (OBS, QuickTime, Win+G)                   [CHECK]
□ k6 terminal + Grafana visible in same recording frame                     [CHECK]
□ CSV file exists: wc -l docs/results/read-heavy/plan/data/read-heavy.csv   [CHECK]
□ Output directories created: mkdir -p docs/results/read-heavy/run/raw      [CHECK]
```

When all items are checked, reply:

```
Checklist confirmed. Ready.
```

### Run Command (provided by agent — you execute it)

The agent provides the exact command. **Do not copy-modify it — copy-paste as-is:**

```bash
# Load test example
k6 run docs/results/read-heavy/build/23127449_LoadTest_20250815.js
```

**Start your screen recording BEFORE running this command.** The recording must show both the k6 terminal and the resource monitor (Grafana or Task Manager) in the same frame.

### During the run

The agent provides a test-type-specific observation guide. Key items to note in chat:

- **Load:** steady-state p95 at plateau, peak CPU%, any error rate
- **Stress:** VU count when errors first appeared, VU count at abort
- **Spike:** recovery time (VU drop → error rate < 1%)
- **Soak:** memory trend, degradation point (minute X or "none")

Post your observations in chat as you observe them — the agent records them in `run-log.md`.

### After the run

1. Take screenshots: k6 terminal final summary + resource monitor **in same frame**.
2. Save to `docs/results/read-heavy/run/screenshots/`.
3. Report to the agent:
   ```
   Run complete. Exit code: 0. Duration: 10m 14s.
   Observations:
   - Steady-state p95 at plateau: 241ms
   - Error rate: 0%
   - Peak CPU: 34%
   - No anomalies observed.
   Screenshots saved.
   ```

The agent writes `run/run-log.md` and confirms all output files are present.

### Human Gate 2 — Soak Only

For soak tests, the agent produces `run/soak-endurance-report.md` with AI-computed fields. Fields marked `[HUMAN: ...]` require you to read values from Grafana:

```
□ memory_ceiling_mb:   Read from Grafana "Container Memory Usage" panel — peak value during plateau
□ degradation_point:   Read from Grafana p95 trend — minute mark where upward trend began ("none observed" if stable)
```

Fill these in and reply:

```
memory_ceiling_mb: 312
degradation_point: none observed

AI-computed values look correct — p95_at_start = 118ms, p95_at_end = 134ms, drift = 16ms.
Approved.
```

## Skill 5 — `perf-report`

### Purpose

Analyse test results, produce recommendations, record human corrections, identify bug candidates, and write the executive summary.

### When to invoke

After `perf-run` is complete: `run/run-log.md` exists and all output files are confirmed present.

### How to invoke

```
/perf-report
  raw_output_dir:         docs/results/read-heavy/run/raw/
  run_log_path:           docs/results/read-heavy/run/run-log.md
  baseline_result_path:   docs/results/read-heavy/spec/baseline-result.md
  test_plan_path:         docs/results/read-heavy/plan/test-plan.md
  perf_config_path:       docs/results/read-heavy/perf-config.json
  review_notes_path:      docs/results/read-heavy/build/review-notes.md
  group_name:             read-heavy
  test_type:              load
  output_dir:             docs/results/read-heavy/report/
```

For soak tests, add:

```
soak_report_path:       docs/results/read-heavy/run/soak-endurance-report.md
```

### Human Gate 1 — Review analysis.md + Classify Recommendations

The agent presents `report/analysis.md` containing:

- Metrics table (measured vs baseline vs SLO)
- SLO pass/fail summary
- Phase commentary per stage
- Key finding paragraph
- Minimum 3 performance recommendations (not yet classified)

**Your task at this gate:**

**A) Identify any AI misreadings.** Cross-check specific values against the raw files:

```bash
# Quick verification examples
cat docs/results/read-heavy/run/raw/summary.json | python3 -m json.tool | grep -A5 "http_req_duration"
cat docs/results/read-heavy/run/raw/summary.json | python3 -m json.tool | grep "http_req_failed" -A5
```

If you find a misread, report it with the correct value:

```
Misreading found:
- AI claimed p95 = 412ms. Actual value from summary.json → metrics.http_req_duration.values["p(95)"] = 241ms.
  (AI likely read p99 instead of p95.)
```

**B) Classify each recommendation:**

```
Recommendation 1 ("Add connection pooling"): Feasible — SQLite does pool connections and the current config may be under-configured.

Recommendation 2 ("Add Redis cache layer"): Hallucinated — this SUT uses SQLite with no caching infrastructure. Redis would require architectural changes not in scope.

Recommendation 3 ("Add DB index on orders.user_id"): Partially feasible — the index would help but the query plan needs verification first.
```

**Reply format:**

```
Corrections:
[list any misreadings with correct values]

Recommendation verdicts:
- Rec 1 "{title}": Feasible / Hallucinated / Partially feasible. Reason: ...
- Rec 2 "{title}": ...
- Rec 3 "{title}": ...
```

### After Gate 1

The agent writes `report/misinterpretations.md` recording your corrections and verdicts verbatim.

### Human Gate 2 — Review Bug Candidates

The agent presents `report/bug-candidates.md`. For each candidate:

**You assign a verdict:**

- **Bug confirmed** → log a GitHub Issue manually and provide the URL.
- **False positive** → explain why the behaviour is actually expected.
- **Need more data** → describe what additional evidence is needed.

```
Bug Candidate 1 ("Error rate at normal_vus"):
  Verdict: Bug confirmed.
  GitHub Issue: https://github.com/your-repo/issues/12

Bug Candidate 2 ("Memory non-recovery"):
  Verdict: False positive. Memory was observed recovering in Grafana 3 minutes after
  ramp-down — the run-log screenshot was taken before recovery completed.
```

After Gate 2, the agent:

1. Updates `bug-candidates.md` with your verdicts and Issue URLs.
2. Appends the Executive Summary to `report/analysis.md` (PASS/FAIL/DEGRADED verdict, top 3 findings, confirmed bugs, actionable recommendations).

## Running Multiple Groups

The workflow repeats independently for each group. Recommended order:

1. `read-heavy` (Load) — simplest auth, good starting point.
2. `auth-heavy` (Stress) — no auth, but unique email management is tricky.
3. `transactional` (Spike) — auth + write endpoint, most complex.
4. `soak` — endpoint chosen after reviewing results from 1–3.

Each group uses its own `docs/results/{group}/` directory and `perf-config.json`. Groups do not share config or CSV data.

## Resuming a Paused Workflow

If you pause mid-skill and resume in a new session:

1. Tell the agent which group and which skill step you were at:
   ```
   Resume perf-build for read-heavy. Sanity passed. I need to start the full script review (Human Gate 2).
   ```
2. The agent reads `perf-config.json` and existing artefacts to reconstruct state.
3. Confirm which gates have been cleared before proceeding:
   ```
   Gate 1 (sanity) was approved last session. Proceed to full script generation.
   ```

## Quick Reference — Input Cheatsheet

| Skill         | Key inputs                                                             | Outputs to watch                                   |
| ------------- | ---------------------------------------------------------------------- | -------------------------------------------------- |
| `perf-spec`   | `group_name`, `endpoint_path`, `test_type`, `environment_spec`         | `spec/baseline-result.md`, `perf-config.json`      |
| `perf-plan`   | `perf_config_path`, `group_name`, `test_type`                          | `plan/test-plan.md`, `plan/data/{group}.csv`       |
| `perf-build`  | `test_plan_path`, `perf_config_path`, `csv_data_path`, `student_id`    | `build/{ID}_{Type}_{Date}.js`, `tests/config/*.js` |
| `perf-run`    | `script_path`, `perf_config_path`, `group_name`, `test_type`           | `run/run-log.md`, `run/raw/summary.json`           |
| `perf-report` | `raw_output_dir`, `run_log_path`, `baseline_result_path`, `group_name` | `report/analysis.md`, `report/bug-candidates.md`   |

## Troubleshooting Common Issues

| Symptom                           | Likely cause                             | Fix                                                                            |
| --------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------ |
| Sanity fails with 401             | Auth setup wrong — null token            | Check login credentials in CSV row 0; verify login endpoint path in api-spec   |
| Sanity fails with 404             | Wrong endpoint path                      | Verify path in api-spec; check if `:id` needs a real ID from seed data         |
| `k6 run` hangs after 2 min        | k6-runner timeout too short              | Agent should set timeout = duration + 5 min; for baseline, minimum 4 min       |
| CSV null values                   | generate-data.js couldn't fetch real IDs | Verify seed-data.js ran successfully first; check API is reachable from WSL    |
| Stress test exits 99 immediately  | abortOnFail without delayAbortEval       | Add `delayAbortEval: '30s'` to threshold config                                |
| `MODULE_NOT_FOUND` in Node script | npm packages not installed               | Run `npm install` in project root; verify package.json has the dependency      |
| `--summary-export` not found      | k6 v0.54+ removed this flag              | Use `handleSummary()` — regenerate the script via perf-build                   |
| Login lockout during stress test  | 3+ failed logins in a row (FR-02)        | Verify CSV has valid credentials; check password format meets SUT requirements |
