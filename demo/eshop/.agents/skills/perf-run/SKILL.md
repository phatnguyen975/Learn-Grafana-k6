---
name: perf-run
description: >
  Orchestrates the execution phase of a k6 performance test: generates a pre-run
  readiness checklist, provides the exact run command for the test type, gives
  real-time observation guidance during the run, collects evidence after completion,
  writes a structured run log, and (for soak tests) produces an endurance analysis
  report. Trigger this skill whenever the user wants to run a performance test, needs
  the k6 run command for a specific test type, wants to know what to watch during a
  test, needs to document evidence, or asks about soak endurance threshold analysis.
  Always use this skill after a test script has been approved and before analysing results.
---

# perf-run — Test Execution & Evidence Collection

## Overview

`perf-run` bridges the gap between an approved test script and a complete set of evidence-backed results. It does not execute the test itself — that must be done by the human operator to enable simultaneous screen recording with a resource monitor in frame. Instead, the skill acts as an execution coordinator: it verifies readiness, provides the exact run command, guides real-time observation, and ensures all required evidence files are collected and documented before the session closes.

For soak tests, the skill additionally performs automated analysis of the JSON output stream to populate an endurance report — separating what the machine can compute from what requires human observation of external monitoring tools.

### What it produces

| Artifact                       | Purpose                                                 |
| ------------------------------ | ------------------------------------------------------- |
| `run/run-log.md`               | Exact command, timestamps, observations, file inventory |
| `run/raw/summary.json`         | `handleSummary()` export from k6 (all test types)       |
| `run/raw/raw-output.json`      | k6 JSON event stream (stress / soak)                    |
| `run/raw/stdout.txt`           | Captured terminal output (spike)                        |
| `run/html-report/summary.html` | HTML report (load)                                      |
| `run/soak-endurance-report.md` | Endurance analysis (soak only)                          |

## When to Use

- A k6 test script has been approved and is ready to run.
- You need the correct run command and output flags for a specific test type.
- You need a structured checklist to verify the environment is ready before starting.
- You need guidance on what to observe and record during the test.
- You need a `run-log.md` that documents the run for audit and reporting purposes.
- You need a soak endurance report derived from the `soak-output.json` stream.

## When NOT to Use

- The test script does not exist or has not been approved yet.
- You want to analyse completed results — that is a separate concern.
- You need to re-run a script that already has complete evidence — reuse the existing run log and add a new entry rather than starting from scratch.

## Inputs

| Input              | Type      | Required | Description                                            |
| ------------------ | --------- | -------- | ------------------------------------------------------ |
| `script_path`      | file path | Yes      | Full path to the approved k6 test script               |
| `perf_config_path` | file path | Yes      | Path to `perf-config.json`                             |
| `group_name`       | string    | Yes      | Short slug for the endpoint group                      |
| `test_type`        | string    | Yes      | One of: `load` / `stress` / `spike` / `soak`           |
| `output_dir`       | string    | Yes      | Run output directory, e.g. `docs/results/{group}/run/` |
| `csv_data_path`    | string    | Yes      | Path to the CSV test data file                         |

## Outputs

All paths relative to `output_dir` unless noted.

| File                       | Template                                                                               | Written by               | Notes                |
| -------------------------- | -------------------------------------------------------------------------------------- | ------------------------ | -------------------- |
| `run-log.md`               | [`assets/run-log.template.md`](assets/run-log.template.md)                             | AI (Step 4)              | All test types       |
| `raw/summary.json`         | —                                                                                      | k6 via `handleSummary()` | All test types       |
| `raw/raw-output.json`      | —                                                                                      | k6 `--out json`          | Stress and soak only |
| `raw/stdout.txt`           | —                                                                                      | Shell `tee`              | Spike only           |
| `html-report/summary.html` | —                                                                                      | k6-reporter              | Load only            |
| `soak-endurance-report.md` | [`assets/soak-endurance-report.template.md`](assets/soak-endurance-report.template.md) | AI (Step 5)              | Soak only            |

> **Key constraint:** The human must run the k6 command directly — not through any subagent — so that screen recording software can capture both the terminal output and the resource monitor (Task Manager / htop / Activity Monitor) in the same frame. This is a non-negotiable evidence requirement. AI provides the command; human executes it.

## Core Principles

1. **Human runs, AI coordinates.** The test command is executed by the human operator — never by a subagent — to enable simultaneous recording of tool + resource monitor in the same frame.
2. **Evidence is collected before the session closes.** Screenshots, raw files, and the run log must all be confirmed present before the skill is considered complete. Incomplete evidence cannot be reconstructed after the fact.
3. **AI computes what it can; human fills what requires visual observation.** In the soak endurance report, AI derives metrics calculable from the JSON stream. Fields that require Grafana panel readings or visual observation are explicitly marked `[HUMAN: ...]` — never invented.
4. **The run log is the audit trail.** Every run must produce a `run-log.md` with the exact command used, timestamps, and an observation summary. Vague or missing logs undermine the reproducibility of results.
5. **Observations are test-type specific.** What matters to watch during a load test is different from a stress or spike test. The observation guide must be tailored to the `test_type` — generic guidance is insufficient.

## Execution Process

> Read reference files only when you reach the step that requires them.

### Step 1 — Generate Pre-Run Readiness Checklist

Read `perf_config_path` to extract `environment.*`, `endpoint.*`, and `workload.*`.

Produce the readiness checklist appropriate for the SUT environment described in `perf-config.json`. Refer to [`references/pre-run-checklist.md`](references/pre-run-checklist.md) for the full checklist template and how to adapt it to the detected environment.

The checklist must confirm:

- SUT backend is accessible (provide the exact `curl` health-check command using `base_url`).
- Required monitoring infrastructure is running (Grafana, Prometheus/cAdvisor, or equivalent — based on what `perf-config.json environment` describes).
- Screen recording software is ready.
- CSV data file exists at `csv_data_path`.
- DB has been seeded if the test type requires pre-existing records (read and write-dependent endpoints).
- Output directories exist (create them if not: `mkdir -p {output_dir}/raw {output_dir}/html-report`).

Present the checklist as a formatted list with checkboxes.

**[HUMAN GATE 1]** — Human verifies every item and confirms ready. Do not provide the run command until confirmation is received.

### Step 2 — Provide Run Command & Output Instructions

Based on `test_type`, provide the exact run command. Refer to [`references/run-commands.md`](references/run-commands.md) for the canonical command per test type, including `--out` flags and `tee` usage.

Present:

1. The exact command to copy-paste (with actual paths substituted from inputs).
2. The expected output files and their paths.
3. Approximate test duration (from `perf-config.json workload.stages` total).
4. A reminder that recording must start **before** the command is run.

### Step 3 — Real-Time Observation Guide

Based on `test_type`, provide the observation guide from [`references/observation-guide.md`](references/observation-guide.md).

The guide tells the human what to watch, what to record, and what constitutes a noteworthy event for each test type. Instruct the human to note these observations in chat during or immediately after the run — they will be written into `run-log.md`.

### Step 4 — Collect Evidence & Write Run Log

After the human reports the run is complete:

1. Verify all expected output files exist for the test type (list them by path).
2. Remind the human of required screenshots:
   - k6 terminal output (final summary visible) + resource monitor **in the same frame**.
   - Grafana dashboard showing the full test timeline (if Grafana is in use).
   - Save screenshots to `{output_dir}/screenshots/`.
3. Collect the human's observations from the conversation.
4. Write `run-log.md` using [`assets/run-log.template.md`](assets/run-log.template.md).

**Mandatory self-review — Evidence Completeness Checklist:** Before writing `run-log.md`, verify:

- [ ] Exact run command is recorded (copy from Step 2 — do not paraphrase).
- [ ] Start and end timestamps are recorded (ask human if not provided).
- [ ] All expected output files for this test type are confirmed present.
- [ ] Human observations have been collected (at least the key metrics per test type).
- [ ] Screenshot reminders have been issued and human has confirmed screenshots taken.
- [ ] For stress tests: VU count at which abort triggered (if `abortOnFail` fired).
- [ ] For spike tests: recovery time — minutes until error rate dropped below 1%.
- [ ] For soak tests: any degradation point noted (or "none observed").

### Step 5 — Soak Endurance Report _(soak test only)_

If `test_type` is `soak`, read `{output_dir}/raw/soak-output.json` and parse it.

Refer to [`references/soak-analysis.md`](references/soak-analysis.md) for the parsing methodology — how to extract p95 at start and end phases, compute drift, and calculate stable RPS from the plateau window.

Write `soak-endurance-report.md` using [`assets/soak-endurance-report.template.md`](assets/soak-endurance-report.template.md).

For every field:

- If it can be computed from the JSON stream: compute it and state the calculation.
- If it requires external monitoring data (e.g. memory from Grafana/cAdvisor): mark it `[HUMAN: <instruction>]` — never invent a value.

**[HUMAN GATE 2]** _(soak only)_ — Human fills all `[HUMAN: ...]` fields, verifies AI-computed values against their own observations, and approves the document.

## Anti-Patterns

- **Providing the run command before the pre-run checklist is confirmed.** Running against an unready environment (DB not seeded, monitoring not started, recording not running) produces evidence that cannot be used.
- **Inventing observation values.** If the human did not report a degradation point or a specific memory reading, mark it `[HUMAN: ...]` — do not fill in a plausible-sounding number.
- **Telling the human to "run via k6-runner subagent".** The human must run the command manually. Subagent execution produces no screen recording evidence.
- **Writing `run-log.md` before confirming all output files exist.** A log that references files which were not actually produced is misleading and will cause downstream analysis failures.
- **Using a generic observation guide regardless of test type.** Spike tests require watching recovery time; soak tests require watching latency drift. Generic guidance causes the human to miss the critical observations for their specific test.
- **Skipping Human Gate 2 for soak tests because "the AI numbers look correct".** Memory readings and visual degradation signals cannot be computed from the JSON stream. They require the human to read from external monitoring. This gate is mandatory.

## Best Practices

- Always `mkdir -p` the output directories in Step 1 before providing the run command — a missing directory causes k6 to fail silently on some operating systems.
- Provide the `curl` health-check command with the actual `base_url` from `perf-config.json` — do not use a generic `localhost` placeholder.
- For stress tests, remind the human to keep the Grafana "VU count" panel and "error rate" panel visible simultaneously — the VU count at which error rate exceeds the threshold is the key finding.
- For spike tests, remind the human to note the timestamp when the spike drops and the timestamp when error rate recovers to below 1% — these two timestamps define the recovery time.
- Include the hardware spec (from `perf-config.json environment`) in `run-log.md` — results without hardware context cannot be compared across machines.
- When writing `run-log.md`, use the exact command string from Step 2 — do not reconstruct it from memory or paraphrase it.

## Process Quality Checklist

**Pre-Run**

- [ ] `perf-config.json` was read and environment details extracted.
- [ ] Pre-run checklist was adapted to the actual environment (not a generic template).
- [ ] Exact `curl` health-check command uses `base_url` from `perf-config.json`.
- [ ] Human Gate 1 confirmed before run command was provided.
- [ ] Output directories were confirmed or created before providing the command.

**Run Command**

- [ ] `references/run-commands.md` was read before providing the command.
- [ ] Command uses actual file paths (not placeholder `{group}` strings).
- [ ] Recording reminder was issued before the command.
- [ ] Expected output files and approximate duration were stated.

**Observation**

- [ ] `references/observation-guide.md` was read and the test-type-specific guide was provided.
- [ ] Human's observations were collected from the conversation after the run.

**Evidence & Run Log**

- [ ] All expected output files confirmed present before writing `run-log.md`.
- [ ] Screenshot reminders issued and confirmed.
- [ ] Evidence Completeness Checklist completed before writing `run-log.md`.
- [ ] `run-log.md` contains: exact command, start/end timestamps, hardware spec, observations, file inventory.
- [ ] No values invented — all `[HUMAN: ...]` fields are correctly marked where applicable.

**Soak Only**

- [ ] `references/soak-analysis.md` was read before parsing `soak-output.json`.
- [ ] All computable fields are derived with stated calculation.
- [ ] All fields requiring external monitoring are marked `[HUMAN: ...]`.
- [ ] Human Gate 2 presented and approved before document is finalised.

**General**

- [ ] No other skill names referenced in any output file.
- [ ] All output files written in English.

## Common Rationalizations to Reject

- _"I'll provide the run command now and the human can check the environment later."_ → An unready environment — backend not running, DB not seeded, recording not started — means the run produces invalid or unrecordable evidence. The gate exists precisely to prevent this.
- _"I'll fill in the memory ceiling from the p99 latency trend — it's a reasonable proxy."_ → Memory consumption and latency are correlated but not the same metric. Invented memory values are fabrication. Mark it `[HUMAN: read from Grafana Memory panel]`.
- _"The human is busy — I'll write the run log with approximate timestamps."_ → Approximate timestamps undermine the audit trail. Ask the human for the actual start and end times before writing the log.
- _"I'll use the k6-runner subagent to execute the test — it's faster."_ → Subagent execution cannot simultaneously record the terminal and a resource monitor in the same frame. The human must run the command manually. This is a hard constraint for evidence validity.
- _"The soak analysis looks complete — I'll skip Human Gate 2."_ → Fields requiring Grafana panel readings cannot be filled by AI. Skipping the gate produces a report with missing or invented data, which invalidates the endurance analysis.

## Reference Files

Read these files when you reach the step that requires them.

| File                                                                 | Read When                                   |
| -------------------------------------------------------------------- | ------------------------------------------- |
| [`references/pre-run-checklist.md`](references/pre-run-checklist.md) | Step 1 — generating the readiness checklist |
| [`references/run-commands.md`](references/run-commands.md)           | Step 2 — providing the run command          |
| [`references/observation-guide.md`](references/observation-guide.md) | Step 3 — generating the observation guide   |
| [`references/soak-analysis.md`](references/soak-analysis.md)         | Step 5 — parsing soak JSON output           |
