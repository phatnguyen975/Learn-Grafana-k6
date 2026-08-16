---
name: perf-report
description: >
  Analyses k6 test output files to produce a structured performance report:
  parses raw metrics, compares against SLO thresholds and baseline, generates
  performance recommendations with evidence-backed basis, records human corrections
  to AI misreadings, analyses bug candidates with root-cause hypotheses, and
  appends an executive summary with a final PASS/FAIL/DEGRADED verdict. Trigger
  this skill whenever the user wants to analyse performance test results, produce
  a report, identify misinterpretations in AI metric analysis, classify
  performance recommendations as feasible or hallucinated, or identify and
  document bug candidates from test observations.
---

# perf-report — Results Analysis & Performance Report

## Overview

`perf-report` is the analysis and reporting stage of the performance test workflow. It reads the raw output files from a completed test run, parses key metrics, compares them against the approved SLO thresholds and baseline measurements, and produces three structured output documents: an **analysis report** with recommendations, a **misinterpretations document** recording human corrections to AI misreadings, and a **bug candidates document** with evidence-backed root-cause hypotheses.

A final executive summary is appended to the analysis report after both human review gates are complete, consolidating the verdict, key findings, confirmed bugs, and actionable recommendations.

### What it produces

| Artifact                       | Purpose                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------ |
| `report/analysis.md`           | Metrics table, pass/fail, phase commentary, recommendations, executive summary |
| `report/misinterpretations.md` | Human-corrected AI misreadings + recommendation verdicts                       |
| `report/bug-candidates.md`     | Bug candidates with root-cause hypotheses + human verdicts                     |

## When to Use

- A test run has completed and all expected output files exist in `raw_output_dir`.
- `run-log.md` has been written and contains human observations from the run.
- `baseline-result.md` and `perf-config.json` are available for comparison.
- You need to produce the analysis content required for Task 2 of the assignment (AI analysis + human misinterpretation critique).

## When NOT to Use

- The test run has not completed or output files are missing — collect evidence first.
- The `run-log.md` is absent or empty — human observations are required inputs.
- You only want to re-run the test — this skill does not execute tests.
- You need to compare results across multiple groups — produce individual reports first, then synthesise manually.

## Inputs

| Input                  | Type      | Required  | Description                                                                                             |
| ---------------------- | --------- | --------- | ------------------------------------------------------------------------------------------------------- |
| `raw_output_dir`       | dir path  | Yes       | `docs/results/{group}/run/raw/` — contains `summary.json`, optionally `raw-output.json` or `stdout.txt` |
| `run_log_path`         | file path | Yes       | `docs/results/{group}/run/run-log.md`                                                                   |
| `baseline_result_path` | file path | Yes       | `docs/results/{group}/spec/baseline-result.md`                                                          |
| `test_plan_path`       | file path | Yes       | `docs/results/{group}/plan/test-plan.md`                                                                |
| `perf_config_path`     | file path | Yes       | `docs/results/{group}/perf-config.json`                                                                 |
| `review_notes_path`    | file path | Yes       | `docs/results/{group}/build/review-notes.md`                                                            |
| `soak_report_path`     | file path | Soak only | `docs/results/{group}/run/soak-endurance-report.md`                                                     |
| `group_name`           | string    | Yes       | Short slug for the endpoint group                                                                       |
| `test_type`            | string    | Yes       | One of: `load` / `stress` / `spike` / `soak`                                                            |
| `output_dir`           | string    | Yes       | `docs/results/{group}/report/`                                                                          |

## Outputs

| File                           | Template                                                                         | Notes                                                     |
| ------------------------------ | -------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `report/analysis.md`           | [`assets/analysis.template.md`](assets/analysis.template.md)                     | Written in Step 2; Executive Summary appended in Step 5   |
| `report/misinterpretations.md` | [`assets/misinterpretations.template.md`](assets/misinterpretations.template.md) | Written in Step 3 after Human Gate 1                      |
| `report/bug-candidates.md`     | [`assets/bug-candidates.template.md`](assets/bug-candidates.template.md)         | Written in Step 4; human verdict added after Human Gate 2 |

## Core Principles

1. **Cite the source for every number.** Every metric value in the analysis must reference the exact file and field it was read from. "p95 = 234 ms (source: `raw/summary.json → metrics.http_req_duration.values.p(95)`)" — not just "p95 = 234 ms".
2. **AI lists; human classifies.** Recommendations are generated by AI with evidence basis. Feasible / Hallucinated / Partially feasible classification belongs to the human. AI records the human's verdict — never pre-classifies its own output.
3. **Bug hypotheses require evidence.** Every root-cause hypothesis must be grounded in a specific metric, timestamp, or pattern from the output files. Unsupported speculation must not appear.
4. **Separate what was measured from what was inferred.** The metrics table shows measured values. Phase commentary and recommendations involve inference. Keep them in separate sections so human reviewers can challenge each independently.
5. **The executive summary is written last.** It consolidates information from both human gates and must not be pre-written before those gates close.
6. **Reusability over SUT specificity.** Analysis criteria and bug detection thresholds are expressed as general rules, not as constants specific to any single SUT. Where the SUT's characteristics affect interpretation (e.g. SQLite serialised writes), state the reasoning so it can be adjusted for a different SUT.

## Analysis Process

> Read reference files only when you reach the step that requires them.

### Step 1 — Read and Parse Raw Output

Read all available files from `raw_output_dir`. Identify which files are present:

- `summary.json` — always present; primary source for aggregated metrics.
- `raw-output.json` — present for stress and soak tests; source for per-request event data.
- `stdout.txt` — present for spike tests; source for real-time progress and terminal summary.

Read `perf_config_path` and extract: `baseline.*`, `slo.*`, `workload.*`, `endpoint.*`.  
Read `baseline_result_path` for the baseline p50/p95/p99/error_rate/rps.  
Read `test_plan_path` for the approved stage table, threshold values, and abort conditions.  
Read `run_log_path` for human observations, timestamps, and any anomalies noted during the run.  
If `test_type` is `soak`, read `soak_report_path` as the primary source for endurance metrics.

Parse from `summary.json`. Refer to [`references/metric-parsing.md`](references/metric-parsing.md) for the exact field paths within the k6 summary JSON structure.

Extract and record:

- `http_req_duration`: `p(50)`, `p(95)`, `p(99)`, `min`, `max`, `avg`
- `http_req_failed`: `rate` (as a decimal, e.g. 0.023 = 2.3%)
- `http_reqs`: `rate` (RPS)
- `vus_max`: peak VU count reached
- `iterations`: total iteration count
- `iteration_duration`: `p(95)`

### Step 2 — Write `analysis.md`

Write `report/analysis.md` using [`assets/analysis.template.md`](assets/analysis.template.md).

The document must contain all of the following sections:

**a) Metrics Table** — actual measured values vs SLO thresholds vs baseline. Every value must cite its source field.

**b) SLO Pass/Fail Summary** — one row per threshold, explicit PASS or FAIL verdict per threshold.

**c) Phase Commentary** — observations for each test stage. Refer to [`references/phase-commentary-guide.md`](references/phase-commentary-guide.md) for what to note per test type and how to characterise each phase.

**d) Key Finding** — one paragraph: the single most important result of this test run (breaking point for stress, recovery time for spike, drift classification for soak, sustained performance verdict for load).

**e) Performance Recommendations** — minimum 3 recommendations. Each must follow the exact structure below. Do **not** classify feasible/hallucinated at this stage.

```
### Recommendation N: {Short Title}

**Basis:** {metric name} = {value} indicates {specific problem or pattern}.
  Source: {file} → {field path}

**Proposed action:** {concrete description of what to change or investigate}

**Expected impact:** {what improvement would be measurable and how}
```

Recommendations must be grounded in the actual measured data. Do not generate generic performance advice that does not trace to a specific metric value from this run.

**Mandatory self-review — Analysis Completeness Checklist:**

Before presenting `analysis.md` to the human, verify:

- [ ] Every metric value in the table has a cited source field.
- [ ] The SLO pass/fail table has one row per threshold in `perf-config.json slo.*`.
- [ ] Phase commentary covers every stage in the test plan stage table.
- [ ] Key finding is a single specific statement — not a list.
- [ ] Every recommendation has a `Basis` citing a specific metric value and its source.
- [ ] No recommendation is pre-classified as feasible or hallucinated.
- [ ] No metric value was recalled from memory — all values were read from files.
- [ ] All output is in English.

**[HUMAN GATE 1]** — Present `report/analysis.md`.

Human will:

1. Identify any values the AI read incorrectly (wrong number, wrong unit, wrong metric name).
2. Classify each recommendation: Feasible / Hallucinated / Partially feasible, with a reason.

AI records the human's feedback and proceeds to Step 3.

### Step 3 — Write `misinterpretations.md`

Using the human's corrections from Gate 1, write `report/misinterpretations.md` using [`assets/misinterpretations.template.md`](assets/misinterpretations.template.md).

For each **misreading** identified by the human:

- State what AI claimed.
- State the correct value from the source file (include file name and field path).
- State the error category: unit confusion / metric name mismatch / wrong aggregation / wrong time window / other.

For each **recommendation**, record the human's verdict and reasoning:

- Recommendation title.
- Human verdict: Feasible / Hallucinated / Partially feasible.
- Human's reason (transcribe exactly — do not paraphrase or soften).

If the human found no misreadings, state this explicitly: "No misreadings identified by human reviewer." Do not leave the section empty.

### Step 4 — Analyse Bug Candidates

Read `run_log_path` for observed anomalies. Read `report/analysis.md` for threshold violations. If `test_type` is `stress` or `spike`, also read the abort condition outcome from Step 1 notes.

Refer to [`references/bug-criteria.md`](references/bug-criteria.md) for the exact criteria that qualify a behaviour as a bug candidate (as opposed to expected degradation under load).

For each behaviour that meets the criteria, write a bug candidate entry following the exact structure in [`assets/bug-candidates.template.md`](assets/bug-candidates.template.md):

- **Title** — short descriptive name.
- **Observed behaviour** — specific metric, value, and timestamp or phase.
- **Expected behaviour** — based on SLO and baseline values.
- **Root-cause hypothesis** — a specific, evidence-grounded explanation. Must reference a metric or pattern. Must not be speculation without a basis.
- **Evidence** — exact source: file name + field path, or Grafana panel + timestamp.
- **Severity** — High / Medium / Low per the definitions in `references/bug-criteria.md`.

If no behaviours meet the bug criteria, state this explicitly.

Write `report/bug-candidates.md`. Do not add a "Human verdict" column yet — that is filled at Gate 2.

**[HUMAN GATE 2]** — Present `report/bug-candidates.md`.

Human will:

1. Assign a verdict to each candidate: Bug confirmed / False positive / Need more data.
2. For "Bug confirmed": human logs the issue to GitHub Issues manually and provides the issue URL.
3. For "False positive": human provides the reason.

AI updates `report/bug-candidates.md` by adding the human verdict column to each entry.

### Step 5 — Append Executive Summary to `analysis.md`

After both gates are closed, append the "Executive Summary" section to `report/analysis.md` using the template in [`assets/analysis.template.md`](assets/analysis.template.md) (Executive Summary section).

The summary must include:

- **Overall verdict**: PASS / FAIL / DEGRADED (per definitions in [`references/verdict-criteria.md`](references/verdict-criteria.md)).
- **Top 3 findings**: the three most significant results from the test, in order of importance.
- **Confirmed bugs**: count and GitHub Issue URLs (from Gate 2 outcomes). If none: "No bugs confirmed."
- **Actionable recommendations**: only those classified Feasible or Partially feasible at Gate 1.
- **Cross-reference links**: relative paths to `misinterpretations.md` and `bug-candidates.md`.

## Anti-Patterns

- **Reading metric values from memory.** k6 metric names and JSON field paths are non-obvious. Always read from the file using the paths in `references/metric-parsing.md`. Memory-recalled values are the primary source of misreadings.
- **Pre-classifying recommendations as feasible or hallucinated.** Classification is the human's task at Gate 1. AI generating pre-classified recommendations defeats the purpose of the misinterpretation exercise.
- **Writing the executive summary before both gates close.** The summary must reflect the human's verdicts from both gates. Writing it before Gate 1 or Gate 2 produces a summary that does not match the final record.
- **Generating recommendations not grounded in measured data.** Generic advice ("add caching", "scale horizontally") that does not trace to a specific metric value from this run is hallucination by definition.
- **Omitting the source citation for a metric value.** Without a source citation, the human reviewer cannot verify the value — which is the primary mechanism for catching misreadings.
- **Proposing root-cause hypotheses without evidence.** A hypothesis like "probably a memory leak" without citing a specific metric trend is speculation. Every hypothesis must have an evidence field that points to a concrete observation.
- **Leaving `[HUMAN: ...]` markers in final documents.** Any placeholder that requires human input must be filled before the document is considered complete.

## Best Practices

- Parse `summary.json` first for all aggregated metrics. Only read `raw-output.json` when per-request granularity is needed (e.g. calculating p95 for a specific time window in a soak analysis).
- When the human provides a correction at Gate 1, cross-check whether the same error appears in any other section of `analysis.md` — a unit confusion in one place often affects multiple values.
- State the SUT's known constraints when generating recommendations. If the SUT uses SQLite, note this when suggesting DB-level optimisations — it allows the human to judge feasibility more accurately.
- For recommendations that are architecture-level changes (caching layer, horizontal scaling, load balancer), note explicitly that these require infrastructure changes beyond the current SUT configuration. This gives the human the context to classify them as Hallucinated if the SUT does not support them.
- Record the human's verdict reasoning verbatim in `misinterpretations.md`. Paraphrasing the human's rationale introduces inaccuracy — use their exact words.
- Use specific time windows when describing phase behaviour. "p95 during the plateau phase (minutes 2–8)" is more useful than "p95 was high during the test".

## Process Quality Checklist

**Input Reading**

- [ ] `summary.json` was read and field paths were confirmed using `references/metric-parsing.md`.
- [ ] `perf-config.json` `baseline.*` and `slo.*` were extracted before writing the metrics table.
- [ ] `run_log_path` was read for human observations and anomaly notes.
- [ ] `test_plan_path` was read for the approved stage table and threshold values.
- [ ] For soak: `soak_report_path` was used as the primary endurance metrics source.

**analysis.md**

- [ ] Every metric value has a cited source field.
- [ ] SLO pass/fail table covers all thresholds in `perf-config.json slo.*`.
- [ ] Phase commentary addresses every stage in the stage table.
- [ ] Key finding is a single specific statement.
- [ ] Every recommendation has a Basis citing a specific metric value and source.
- [ ] No recommendations are pre-classified.
- [ ] Analysis Completeness Checklist completed before presenting at Gate 1.
- [ ] Human Gate 1 presented and corrections/verdicts received.

**misinterpretations.md**

- [ ] Every misreading identified by the human is recorded with: AI claim, correct value + source, error category.
- [ ] Every recommendation has a human verdict and verbatim reason.
- [ ] If no misreadings: explicitly stated.

**bug-candidates.md**

- [ ] `references/bug-criteria.md` was read before identifying candidates.
- [ ] Every candidate has: Title, Observed behaviour, Expected behaviour, Root-cause hypothesis, Evidence, Severity.
- [ ] Every hypothesis cites a specific metric or pattern — no unsupported speculation.
- [ ] If no candidates meet criteria: explicitly stated.
- [ ] Human Gate 2 presented; verdicts received; human verdict column added.
- [ ] GitHub Issue URLs recorded for confirmed bugs.

**Executive Summary**

- [ ] Written after both gates closed.
- [ ] Verdict is PASS / FAIL / DEGRADED per `references/verdict-criteria.md`.
- [ ] Only Feasible/Partially feasible recommendations included.
- [ ] Cross-reference links to `misinterpretations.md` and `bug-candidates.md` are correct.

**General**

- [ ] No other skill names referenced in any output file.
- [ ] All output files written in English.
- [ ] No `[HUMAN: ...]` placeholders remain in finalised documents.

## Common Rationalizations to Reject

- _"I'll recall the p95 value from earlier in the conversation — I don't need to re-read the file."_ → Values recalled from conversation context are the most common source of misreadings. Always read from the file.
- _"This recommendation is obviously feasible — I'll mark it so to save time."_ → Classification is the human's gate. Pre-classifying removes the human's ability to exercise judgment and undermines the misinterpretation exercise.
- _"The executive summary is mostly ready — I'll write it after Gate 1 and update it if Gate 2 changes anything."_ → The summary must reflect both gates. Writing it partially before Gate 2 risks producing a summary that does not match the final bug-candidates verdicts.
- _"There are no bugs — the thresholds all passed."_ → Threshold compliance and bug absence are not equivalent. Check the bug criteria in `references/bug-criteria.md` — some bug patterns manifest even when aggregate thresholds pass (e.g. memory not recovering after VUs reach 0).
- _"The root-cause hypothesis is reasonable — I don't need to cite evidence."_ → A reasonable hypothesis without evidence is indistinguishable from speculation. Every hypothesis must have a specific evidence field.

## Reference Files

Read these files when you reach the step that requires them.

| File                                                                           | Read When                           |
| ------------------------------------------------------------------------------ | ----------------------------------- |
| [`references/metric-parsing.md`](references/metric-parsing.md)                 | Step 1 — parsing `summary.json`     |
| [`references/phase-commentary-guide.md`](references/phase-commentary-guide.md) | Step 2 — writing phase commentary   |
| [`references/bug-criteria.md`](references/bug-criteria.md)                     | Step 4 — identifying bug candidates |
| [`references/verdict-criteria.md`](references/verdict-criteria.md)             | Step 5 — assigning overall verdict  |
