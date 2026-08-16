---
name: perf-spec
description: >
  Analyzes a target REST API endpoint to produce a performance test specification:
  scenario design, preliminary SLOs, a baseline k6 script, and data-driven SLO
  thresholds derived from an actual baseline run. Trigger this skill whenever the
  user wants to start performance testing a new endpoint or endpoint group, needs
  to establish a baseline before writing load/stress/spike/soak test scripts,
  says things like "set up perf spec", "run baseline", "define SLOs", "analyze
  endpoint for performance testing", or asks what thresholds to use for a test.
  Always use this skill before building any load test script against a new endpoint.
---

# perf-spec — Endpoint Analysis & Performance Specification

## Overview

`perf-spec` is the **entry point** for any performance test workflow. It reads a System Requirements Specification (SRS) and an API specification for a given endpoint, produces a well-reasoned scenario design and preliminary SLO targets, generates a minimal k6 baseline script, runs it, and then derives real, data-backed SLO thresholds from the measured results.

Everything this skill produces is stored under a per-group output directory so that downstream tooling can pick up the artifacts without re-running analysis.

### What it produces

| Artifact                     | Purpose                                                                |
| ---------------------------- | ---------------------------------------------------------------------- |
| `perf-config.json`           | Single source of truth for env, endpoint, baseline numbers, and SLOs   |
| `spec/scenario-design.md`    | Human-readable rationale for the chosen test type and preliminary SLOs |
| `spec/baseline.js`           | Minimal k6 script (1 VU, 2 min) for measuring cold-start performance   |
| `spec/baseline-summary.json` | Raw JSON exported by `handleSummary()`                                 |
| `spec/baseline-result.md`    | Parsed metrics table + analyst commentary                              |

## When to Use

- Starting performance testing on an **endpoint or endpoint group you have not tested before**.
- Re-establishing a baseline after **significant code changes** to the SUT.
- Needing data-backed SLO values before designing workload models.
- Any situation where the question "what latency / error-rate threshold is reasonable?" is unanswered.

## When NOT to Use

- The endpoint already has a current `perf-config.json` with valid `baseline.*` and `slo.*` values and no significant SUT changes have occurred — skip straight to workload design.
- You only need to re-run a previously built test script (the baseline is still valid).
- The goal is to analyse results from a completed test run, not to establish a new specification.

## Inputs

| Input              | Type      | Required | Description                                                                                  |
| ------------------ | --------- | -------- | -------------------------------------------------------------------------------------------- |
| `srs_path`         | file path | Yes      | Path to the System Requirements Specification                                                |
| `api_spec_path`    | file path | Yes      | Path to the API specification document                                                       |
| `student_id`       | string    | Yes      | Identifier written into file metadata                                                        |
| `group_name`       | string    | Yes      | Short slug for the endpoint group (e.g. `read-heavy`)                                        |
| `endpoint_path`    | string    | Yes      | API path (e.g. `/api/orders/:id`). HTTP method is inferred from the API spec.                |
| `test_type`        | string    | Yes      | One of: `load` / `stress` / `spike` / `soak`                                                 |
| `environment_spec` | object    | Yes      | `{ os, host_cpu_cores, host_ram_gb, container_cpu_limit, container_memory_limit, base_url }` |
| `output_dir`       | string    | Yes      | Root output directory, e.g. `docs/results/read-heavy/`                                       |

## Outputs

All paths are relative to `output_dir`.

| File                         | Template                                                                   | Notes                                             |
| ---------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------- |
| `perf-config.json`           | [`assets/perf-config.template.json`](assets/perf-config.template.json)     | Created in Step 1, updated in Step 5              |
| `spec/scenario-design.md`    | [`assets/scenario-design.template.md`](assets/scenario-design.template.md) | Written in Step 2                                 |
| `spec/baseline.js`           | —                                                                          | Generated by `script-writer` subagent             |
| `spec/baseline-summary.json` | —                                                                          | Written by `handleSummary()` inside `baseline.js` |
| `spec/baseline-result.md`    | [`assets/baseline-result.template.md`](assets/baseline-result.template.md) | Written in Step 4                                 |

## Core Principles

1. **Data before decisions.** Never set a threshold by guessing. Every SLO value must trace back to a measured baseline number or an explicitly stated industry reference.
2. **Justify every number.** If a preliminary SLO is stated before the baseline run, explain the reasoning (endpoint type, hardware class, SUT characteristics). After the run, replace it with the formula-derived value and re-justify.
3. **One VU, no thresholds, no stages for baselines.** The baseline script must be the simplest valid request against the endpoint — any complexity masks the true cold-start cost.
4. **Reusability over specificity.** This skill works for any SUT. Never hard-code SUT-specific knowledge in the skill instructions — derive everything from the provided `srs_path`, `api_spec_path`, and `environment_spec`.
5. **Separate concerns.** `perf-config.json` is machine-readable state. `scenario-design.md` and `baseline-result.md` are human-readable rationale. Keep them consistent.

## Design Process

> For detailed guidance on each sub-topic, read the reference files listed. Do not skip them — they contain decision criteria that cannot be compressed into bullet points.

### Step 1 — Initialise `perf-config.json`

Create the output directory tree. Populate `perf-config.json` using the template at [`assets/perf-config.template.json`](assets/perf-config.template.json):

- Fill `metadata` from inputs (`student_id`, `group_name`, `test_type`, current timestamp).
- Fill `environment` from `environment_spec`; run `k6 version` and `node --version` to fill the version fields.
- Fill `endpoint.path` from `endpoint_path`. Read `api_spec_path` to determine `method`, `requires_auth`, and `payload_schema`.
- Leave `baseline.*`, `slo.*`, and `workload.*` as `null` — these are filled in later steps.

### Step 2 — Analyse Endpoint & Draft Scenario Design

Read `srs_path` and `api_spec_path` in full.

For the target endpoint, determine:

- **Operation class** — read, write, auth-intensive, transactional, mixed.
- **Database involvement** — does the handler execute queries? Likely N+1? Writes or reads?
- **Auth requirement** — does the endpoint require a token? What flow does obtaining it involve?
- **Business rules** — any rate limiting, concurrency constraints, or locking described in the SRS?
- **Expected load profile** — which test type (`test_type` input) fits this endpoint and why?

For preliminary SLO targets, consult [`references/slo-benchmarks.md`](references/slo-benchmarks.md) to find the appropriate reference range for the endpoint's operation class and hardware tier. State the preliminary target and explain the reasoning — do not just state a number.

Write `spec/scenario-design.md` using [`assets/scenario-design.template.md`](assets/scenario-design.template.md).

**[HUMAN GATE 1]** — Present `perf-config.json` and `spec/scenario-design.md` to the human. Pause and wait for approval or change requests before proceeding.

### Step 3 — Generate Baseline Script

Delegate to the **`script-writer`** subagent. Provide it with:

- Endpoint method, path, `base_url`, `requires_auth`, `payload_schema` (from `perf-config.json`).
- Auth handling requirements if the endpoint needs a token — see [`references/auth-patterns.md`](references/auth-patterns.md) for the correct k6 pattern to use.
- Output path: `spec/baseline.js`.

The baseline script **must**:

- Use `options: { vus: 1, duration: '2m' }` — no stages, no thresholds.
- Include `check()` assertions for status code and at least one required response field.
- Implement the correct auth flow if `requires_auth` is `true`.
- Export results via `handleSummary(data)` writing to `spec/baseline-summary.json`. Do **not** use the deprecated `--summary-export` flag.
- `console.log` the full response body for human inspection.

Present the generated script content to the human before running.

**[HUMAN GATE 2]** — Wait for human approval of `spec/baseline.js` before executing.

### Step 4 — Run Baseline & Parse Results

Delegate to the **`k6-runner`** subagent:

```
k6 run {output_dir}/spec/baseline.js
```

After the run completes, read `spec/baseline-summary.json`. Extract:

- `http_req_duration` → `p(50)`, `p(95)`, `p(99)`
- `http_req_failed` → error rate
- `http_reqs` → rate (RPS)

Write `spec/baseline-result.md` using [`assets/baseline-result.template.md`](assets/baseline-result.template.md). Include the raw JSON as an appendix (inline code block or file reference).

### Step 5 — Derive SLOs & Update `perf-config.json`

Using the measured baseline values, apply the SLO derivation rules from [`references/slo-derivation.md`](references/slo-derivation.md) to compute thresholds.

Update `perf-config.json`:

- Fill `baseline.*` from the parsed Step 4 values.
- Fill `slo.*` with the computed thresholds and a `notes` string that states the formula used.

Add a summary of the derived thresholds at the bottom of `spec/baseline-result.md`.

**Mandatory self-review — Specification Quality Checklist:** Before presenting to the human, verify every item in the checklist below:

- [ ] `perf-config.json` has no `null` values except `workload.*` (those come later).
- [ ] `scenario-design.md` states the operation class, DB involvement, auth requirement, and business rule constraints — none are omitted.
- [ ] Preliminary SLOs in `scenario-design.md` cite a reference source or reasoning — no bare numbers.
- [ ] `baseline.js` has `vus: 1`, `duration: '2m'`, no stages, no thresholds.
- [ ] `baseline.js` uses `handleSummary()` — not `--summary-export`.
- [ ] `baseline-summary.json` exists and is non-empty after the run.
- [ ] `baseline-result.md` contains the metrics table with actual measured values.
- [ ] Derived SLO thresholds are formula-driven (not copy-pasted from preliminary estimates) and the formula is stated in the `notes` field.
- [ ] All output files are in English.

Present the completed output set and the checklist results to the human.

## Anti-Patterns

- **Guessing SLO values without a baseline run.** Preliminary estimates are acceptable placeholders; they must be replaced with formula-derived values after Step 4.
- **Using `--summary-export` flag.** It is deprecated in modern k6 versions. Always use `handleSummary()`.
- **Running the baseline with more than 1 VU.** Concurrency in a baseline masks per-request cost and SQLite-style lock contention.
- **Hardcoding SUT-specific knowledge in the script.** `base_url`, credentials, endpoint path must come from `perf-config.json` or environment variables — never literal strings in the script body.
- **Skipping the auth analysis when `requires_auth` is `true`.** Even a baseline must make a valid authenticated request or it measures the wrong thing (401 responses).
- **Conflating scenario design with workload design.** `scenario-design.md` describes _what kind of test_ is appropriate and _why_. Exact VU counts and stage durations are workload concerns and belong in a later artifact.
- **Declaring "no business rules" without reading the SRS.** Always scan for rate limits, lockout policies, concurrency notes, and data integrity constraints before writing any script.

## Best Practices

- Read `references/slo-benchmarks.md` _before_ stating any preliminary SLO — anchoring on real-world ranges avoids implausible targets.
- Always read the full `api_spec_path` before declaring the auth requirement — some endpoints appear public but require a role-specific header.
- Keep `baseline.js` minimal and reproducible. A future re-run of the baseline should produce comparable numbers with the same configuration.
- Record the exact `k6 version` in `perf-config.json` — results are not always comparable across major versions.
- If `check()` failures exceed 0% during the baseline, fix the script or the test data before proceeding. A baseline with errors is not a valid reference point.
- Document any anomalies observed during the baseline run (high variance, unexpected 4xx, JWT expiry) in `baseline-result.md` so they are visible to whoever reads the artifact later.

## Process Quality Checklist

Use this checklist after completing all five steps to confirm the workflow was followed correctly.

**Inputs & Initialisation**

- [ ] All required inputs were provided and confirmed before starting.
- [ ] `perf-config.json` was created from the template, not written ad hoc.
- [ ] `k6 version` and `node --version` were obtained by running commands, not recalled from memory.
- [ ] HTTP method and auth requirement were read from `api_spec_path`, not assumed.

**Scenario Design**

- [ ] SRS was read in full before writing `scenario-design.md`.
- [ ] Operation class, DB involvement, auth requirement, and business rules are all addressed.
- [ ] Preliminary SLO targets cite `references/slo-benchmarks.md` or an equivalent stated reasoning.
- [ ] Human Gate 1 was presented and explicit approval received.

**Baseline Script**

- [ ] `script-writer` subagent was used to generate the script.
- [ ] Script options are `{ vus: 1, duration: '2m' }` with no stages and no thresholds.
- [ ] `handleSummary()` is used for JSON export.
- [ ] If `requires_auth` is `true`, the auth flow is implemented and `references/auth-patterns.md` was consulted.
- [ ] Human Gate 2 was presented and explicit approval received before running.

**Baseline Run & Analysis**

- [ ] `k6-runner` subagent was used to execute the script.
- [ ] `baseline-summary.json` was read after the run and values cross-checked against stdout.
- [ ] `baseline-result.md` contains: metrics table, raw JSON reference, anomaly notes, derived SLOs.
- [ ] `perf-config.json` `baseline.*` and `slo.*` fields are updated with real values.

**General**

- [ ] No other skill names are referenced in any output file.
- [ ] All output files are written in English.
- [ ] No numbers were invented — every value traces to a measurement or a cited source.

## Common Rationalizations to Reject

- _"The baseline run is optional because I already know the endpoint is fast."_ → SLOs must be data-driven. Assumptions about performance are not evidence.
- _"I'll use `--summary-export` because it's simpler."_ → This flag is deprecated and removed in recent k6 versions. `handleSummary()` is the correct approach.
- _"I can combine scenario design and workload design in one document to save time."_ → These are separate concerns with separate reviewers. Mixing them makes human review harder and the artifact less reusable.
- _"I'll hardcode the `base_url` and credentials in the baseline script because it's just a baseline."_ → Hardcoded values make the script non-portable and create credentials-in-source-code risks. Always use config or environment variables.
- _"The SRS is long — I'll skip it and just look at the API spec."_ → Business rules (rate limits, lockout, concurrency constraints) live in the SRS. Missing them leads to test designs that produce misleading results.

## Reference Files

Read these files when you reach the step that requires them. Do not pre-load all of them at once.

| File                                                           | Read When                                         |
| -------------------------------------------------------------- | ------------------------------------------------- |
| [`references/slo-benchmarks.md`](references/slo-benchmarks.md) | Step 2 — drafting preliminary SLO targets         |
| [`references/auth-patterns.md`](references/auth-patterns.md)   | Step 3 — if `requires_auth` is `true`             |
| [`references/slo-derivation.md`](references/slo-derivation.md) | Step 5 — computing final thresholds from baseline |
