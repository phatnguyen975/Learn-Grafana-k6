# AGENTS.md — Performance Testing Workspace

> This file is the persistent AI memory for this project. It is read automatically by Antigravity CLI (and compatible agents such as Claude Code, Cursor, and Codex CLI) at the start of every session. All AI agents operating in this workspace must follow the rules and conventions defined here without requiring the human to repeat them.

## 1. Project Overview

This workspace implements a **performance testing workflow** against a local e-commerce SUT (System Under Test). The workflow covers four test types — Load, Stress, Spike, and Soak — using k6 as the test runner, with structured artefact output at every stage.

The goal is to produce a reproducible, evidence-backed performance test report with human-verified AI analysis and confirmed bug candidates.

## 2. SUT (System Under Test)

| Component    | Technology                  | Default URL             |
| ------------ | --------------------------- | ----------------------- |
| Backend API  | Node.js + Express + SQLite  | `http://localhost:3000` |
| Frontend Web | React + Vite + Tailwind CSS | `http://localhost:5173` |
| Admin Panel  | React + Vite + Tailwind CSS | `http://localhost:5174` |

### Default Accounts

| Role      | Email             | Password    |
| --------- | ----------------- | ----------- |
| Admin     | `admin@eshop.com` | `Admin123!` |
| Test user | `test@eshop.com`  | `Test1234!` |

### SUT Constraints (Always Applicable)

Every agent must be aware of the following before generating any script or recommendation:

- **SQLite serialises writes.** SQLite does not support concurrent write transactions. Any endpoint that writes to the DB (POST, PUT, DELETE) will experience queue-based latency spikes under concurrent load — this is expected behaviour, not a bug, unless it occurs at or below `normal_vus`.
- **Account lockout (FR-02).** Three consecutive failed login attempts lock an account for 30 seconds. Any script that generates login failures (wrong credentials, 401s) risks triggering lockout and invalidating subsequent test iterations.
- **JWT token TTL.** The API spec does not document TTL explicitly — assume 1 hour. For soak tests longer than 45 minutes, implement token refresh logic or use Strategy 3 (pre-generated tokens in CSV).
- **`POST /api/register` requires unique email and strong password.** Password rules: ≥ 8 characters, at least one uppercase letter, one number, one special character. Stress test CSV emails must use the uniqueness pattern: `perf_{unix_timestamp}_{zero_padded_index}@stress.test`
- **SUT is a learning/demo application.** It is not designed for production-scale load. VU counts should be calibrated to the hardware tier; aggressive load can exhaust SQLite connection pools and render the SUT unresponsive until restarted.

## 3. Infrastructure & Tooling

### Runtime Environment

| Tool           | Location                | Notes                                    |
| -------------- | ----------------------- | ---------------------------------------- |
| k6             | WSL (Ubuntu)            | All `k6 run` commands execute inside WSL |
| Node.js        | WSL (Ubuntu)            | All `node` commands execute inside WSL   |
| Docker Desktop | Windows host            | SUT backend + monitoring stack run here  |
| Grafana        | `http://localhost:3001` | Dashboard for real-time metrics          |
| Prometheus     | `http://localhost:9090` | Metrics scraping backend                 |
| cAdvisor       | `http://localhost:8080` | Container resource monitoring            |

### Network Note

From WSL, the Docker host is accessible at `localhost:{port}` via Docker Desktop port forwarding. If `localhost` is unreachable, fallback to `host.docker.internal:{port}`.

Do not hard-code IP addresses. Always use the hostname from `perf-config.json → environment.base_url`.

### k6 Version

```bash
k6 version   # verify before every session that starts script generation
```

Minimum supported: **v0.43.0** (required for `handleSummary()`). `--summary-export` was deprecated in v0.43 and **removed in v0.54**. Never use it. Always use `handleSummary(data)` inside the script for structured output export.

## 4. Endpoint Groups & Test Assignments

| Group slug      | Endpoint                        | HTTP Method | Test Type | Auth Required      |
| --------------- | ------------------------------- | ----------- | --------- | ------------------ |
| `read-heavy`    | `/api/orders/:id`               | GET         | Load      | Yes — Bearer token |
| `auth-heavy`    | `/api/register`                 | POST        | Stress    | No                 |
| `transactional` | `/api/cart`                     | POST        | Spike     | Yes — Bearer token |
| `soak`          | TBD after 3 main tests complete | —           | Soak      | TBD                |

The soak test endpoint is selected after reviewing results from the three main tests. Prefer the endpoint showing the highest p95 drift or memory pressure during its primary test.

## 5. Auth Strategy (Resolved)

| Group                   | Strategy            | Rationale                                     |
| ----------------------- | ------------------- | --------------------------------------------- |
| `read-heavy` (Load)     | Per-VU cached token | Response is user-session-specific (my orders) |
| `auth-heavy` (Stress)   | No auth             | `POST /api/register` is a public endpoint     |
| `transactional` (Spike) | Per-VU cached token | Cart is user-session-specific                 |

**Per-VU cached token implementation rules (applies to `read-heavy` and `transactional`):**

- Login once per VU at `__ITER === 0`.
- Wrap login call in `group('login', () => {...})` — excludes login latency from endpoint metrics.
- Throw on null token rather than proceeding with a broken session.
- Source credentials from the CSV file via `SharedArray`.

## 6. File Naming Conventions

### Test Script Files

```
{StudentID}_{ScenarioType}_{YYYYMMDD}.js
```

| `test_type` value | `{ScenarioType}` in filename |
| ----------------- | ---------------------------- |
| `load`            | `LoadTest`                   |
| `stress`          | `StressTest`                 |
| `spike`           | `SpikeTest`                  |
| `soak`            | `SoakTest`                   |

Example: `23127449_LoadTest_20260812.js`

### `perf-config.json` — Per-Group State File

Each group has its own `perf-config.json` at `docs/results/{group}/perf-config.json`. Always read the config for the **current group** — do not mix configs across groups.

## 7. Directory Structure

```
{project_root}/
├── AGENTS.md                                  ← this file
├── docs/
│   ├── srs.md                                 ← System Requirements Specification
│   └── api-spec.md                            ← API Specification
├── tests/
│   └── config/
│       ├── env.js                             ← BASE_URL, DEFAULT_HEADERS
│       ├── thresholds.js                      ← SLO threshold values
│       └── stages.js                          ← Stage definitions
└── docs/results/
    └── {group}/                               ← one folder per endpoint group
        ├── perf-config.json                   ← per-group state (baseline, SLOs, workload)
        ├── spec/
        │   ├── scenario-design.md
        │   ├── baseline.js
        │   ├── baseline-summary.json
        │   └── baseline-result.md
        ├── plan/
        │   ├── test-plan.md
        │   ├── auth-strategy.md
        │   └── data/
        │       ├── csv-schema.md
        │       ├── seed-data.js
        │       ├── generate-data.js
        │       └── {group}.csv
        ├── build/
        │   ├── sanity-{group}.js
        │   ├── sanity-result.md
        │   ├── {StudentID}_{ScenarioType}_{YYYYMMDD}.js
        │   └── review-notes.md
        ├── run/
        │   ├── run-log.md
        │   ├── soak-endurance-report.md       ← soak only
        │   ├── raw/
        │   │   ├── summary.json
        │   │   ├── raw-output.json            ← stress / soak only
        │   │   └── stdout.txt                 ← spike only
        │   ├── html-report/
        │   │   └── summary.html              ← load only
        │   └── screenshots/
        └── report/
            ├── analysis.md
            ├── misinterpretations.md
            └── bug-candidates.md
```

## 8. Workflow — Skills & Human Gates

The workflow executes sequentially. Each skill produces artefacts consumed by the next. **Human Gates (HG) are mandatory** — AI must pause and wait for explicit human approval before proceeding past each gate. Do not continue if the human has not confirmed.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  perf-spec  [HG×2]                                                          │
│  Endpoint analysis → scenario design → baseline script → baseline run →     │
│  derived SLOs → update perf-config.json                                     │
│                                                                             │
│  HG1: Approve scenario-design.md + preliminary perf-config.json             │
│  HG2: Approve baseline.js before k6-runner executes it                      │
└────────────────────────────┬────────────────────────────────────────────────┘
                             │ Artefacts: perf-config.json (baseline.* + slo.*)
                             │            spec/baseline-result.md
                             ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  perf-plan  [HG×2]                                                          │
│  Workload model → auth strategy → CSV schema → seed data → generate CSV     │
│                                                                             │
│  HG1: Approve test-plan.md + auth-strategy.md                               │
│  HG2: Approve csv-schema.md before any script is created                    │
└────────────────────────────┬────────────────────────────────────────────────┘
                             │ Artefacts: test-plan.md, auth-strategy.md
                             │            plan/data/{group}.csv
                             │            perf-config.json (workload.*)
                             ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  perf-build  [HG×2]                                                         │
│  Sanity script → sanity run (k6-runner) → sanity verdict →                  │
│  full test script → tests/config/ files                                     │
│                                                                             │
│  HG1: Approve sanity-result.md + sanity-{group}.js after PASS verdict       │
│  HG2: Human reviews full script → review-notes.md → corrections applied     │
└────────────────────────────┬────────────────────────────────────────────────┘
                             │ Artefacts: build/{StudentID}_{Type}_{YYYYMMDD}.js
                             │            tests/config/{env,thresholds,stages}.js
                             │            build/review-notes.md
                             ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  perf-run  [HG×2]                                                           │
│  Pre-run checklist → run command → human runs manually (screen recording) → │
│  evidence collection → run-log.md                                           │
│  + soak-endurance-report.md (soak only)                                     │
│                                                                             │
│  HG1: Human confirms pre-run checklist before receiving run command         │
│  HG2: (Soak only) Human fills [HUMAN:...] fields in endurance report        │
└────────────────────────────┬────────────────────────────────────────────────┘
                             │ Artefacts: run/run-log.md
                             │            run/raw/summary.json
                             │            run/raw/{raw-output | stdout}.*
                             │            run/html-report/summary.html (load)
                             │            run/soak-endurance-report.md (soak)
                             ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  perf-report  [HG×2]                                                        │
│  Parse metrics → analysis.md + recommendations →                            │
│  human corrections → misinterpretations.md →                                │
│  bug candidates → bug-candidates.md → executive summary                     │
│                                                                             │
│  HG1: Human identifies AI misreadings + classifies recommendations          │
│  HG2: Human assigns Bug/False positive verdicts on bug-candidates.md        │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Human Gate Behaviour Rules

- AI must **explicitly state "Awaiting your approval — please confirm before I continue"** at every HG.
- AI must **not proceed** past a gate unless the human has replied with explicit approval or a list of corrections.
- If the human provides corrections at a gate, AI applies all corrections and presents the updated artefact before re-requesting approval. It does not proceed after corrections without re-confirmation.
- Approvals from previous sessions do not carry forward. If a conversation is resumed, AI must re-confirm the current state of artefacts before assuming any gate was cleared.

## 9. Subagent Roster

| Subagent        | File                                        | Command used      | When invoked                                                                                  |
| --------------- | ------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------- |
| `script-writer` | `.agents/agents/script-writer/agent.md`     | (file write only) | perf-spec (baseline.js), perf-plan (seed/generate scripts), perf-build (sanity + full script) |
| `k6-runner`     | `.agents/agents/k6-runner/agent.md`         | `k6 run ...`      | perf-spec (baseline run), perf-build (sanity run)                                             |
| `node-runner`   | `.agents/agents/node-runner/node-runner.md` | `node ...`        | perf-plan (seed-data.js, generate-data.js), perf-report (parse-soak.js)                       |

### Subagent Invocation Rules

1. **Provide a complete spec before invoking any subagent.** Every subagent requires a fully specified brief — partial specs result in refusal or incorrect output.
2. **Do not chain subagents automatically.** If `script-writer` produces a script that must be run, present the script to the human at the next Human Gate before invoking `k6-runner` or `node-runner`.
3. **Human must run k6 for evidence-collection runs.** `k6-runner` is for sanity and baseline runs only. Full load/stress/spike/soak runs require the human to execute the command manually for screen recording.
4. **Subagents do not retry.** If a subagent reports failure, the calling skill analyses the error and decides the fix before re-invoking.

## 10. Skill Locations

| Skill         | SKILL.md path                         |
| ------------- | ------------------------------------- |
| `perf-spec`   | `.agents/skills/perf-spec/SKILL.md`   |
| `perf-plan`   | `.agents/skills/perf-plan/SKILL.md`   |
| `perf-build`  | `.agents/skills/perf-build/SKILL.md`  |
| `perf-run`    | `.agents/skills/perf-run/SKILL.md`    |
| `perf-report` | `.agents/skills/perf-report/SKILL.md` |

Always read the full SKILL.md before executing any step of the skill. When a SKILL.md links to a references/ file, read that file at the step that requires it — do not pre-load all reference files at once.

## 11. Reference Documents

These documents describe the SUT and must be read before generating any test design, script, or recommendation that depends on SUT behaviour.

| Document                          | Path                                    | Read when                              |
| --------------------------------- | --------------------------------------- | -------------------------------------- |
| System Requirements Specification | `docs/srs.md`                           | perf-spec Step 2, perf-plan Step 1     |
| API Specification                 | `docs/api-spec.md`                      | perf-spec Step 1–3, perf-plan Step 1–4 |
| Per-group config                  | `docs/results/{group}/perf-config.json` | All skills — read before any step      |

## 12. Output Format Rules (Global)

These rules apply to every script, artefact, and output file produced in this workspace.

| Rule                                      | Detail                                                                                           |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **Language**                              | All output files, comments, log messages, check names, and report content must be in **English** |
| **No `--summary-export`**                 | Use `handleSummary()` in every k6 script                                                         |
| **No hardcoded config in staged scripts** | `BASE_URL`, thresholds, and stages imported from `tests/config/`                                 |
| **SharedArray for CSV**                   | Never use bare `open()` for CSV in VU scope                                                      |
| **Teardown mandatory**                    | Every full test script must implement `teardown()` or document why it cannot                     |
| **No AI pre-classification**              | AI never classifies its own recommendations as Feasible/Hallucinated — that is the human's gate  |
| **Cite metric sources**                   | Every metric value in analysis documents must cite the exact file and field path                 |
| **No invented values**                    | Fields requiring human observation are marked `[HUMAN: ...]` — never filled with estimates       |

## 13. Anti-Cheat & Evidence Requirements

The following evidence items are mandatory for the assignment and cannot be AI-generated or substituted:

| Item                  | Requirement                                                                                                  | Verified by         |
| --------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------- |
| Demo video            | Screen recording showing k6 terminal + resource monitor in same frame, narrated in Vietnamese by the student | TAs                 |
| Hardware report       | `screenfetch` (Linux/macOS) or `dxdiag` (Windows) output — hostname must match previous assignments          | TAs cross-check     |
| Raw log files         | Full `summary.json` and raw output files (not just summary screenshots)                                      | TAs inspect content |
| Test script filenames | Must match `{StudentID}_{ScenarioType}_{YYYYMMDD}.js` convention                                             | TAs verify directly |

AI must not generate content for these items on behalf of the student. If asked to do so, AI must decline and explain which items require human production.

## 14. Session Start Checklist

At the start of any new session or conversation, AI must:

1. **Re-read this file** — do not assume prior session context is retained.
2. **Identify the current group and stage** — ask the human which group (`read-heavy` / `auth-heavy` / `transactional` / `soak`) and which skill step they are resuming.
3. **Read `docs/results/{group}/perf-config.json`** — determine which fields are populated and which are still null to confirm the current progress state.
4. **Confirm which Human Gates have been cleared** in the current skill before proceeding. Do not assume a gate was cleared because artefacts exist — a file may exist from a previous aborted session.
5. **Do not proceed past any uncleared gate** until the human explicitly confirms.

## 15. Common Error Patterns to Avoid

These are the most frequently observed AI errors in this workflow. Every agent must actively guard against them.

| Error                                                          | Impact                                                           | Prevention                                                                  |
| -------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Reading `http_req_failed.values.rate` as a percentage          | Reports "2% error rate" when value is 0.002 (0.2%) or vice versa | Always multiply `rate` by 100 when reporting as %; cite field path          |
| Using `vus.values.value` as peak VU count                      | Reports 0 as peak VUs after ramp-down                            | Use `vus_max.values.value`                                                  |
| Confusing `iteration_duration` with `http_req_duration`        | Reports think-time-inclusive latency as endpoint latency         | Check metric name before quoting                                            |
| Hardcoding `BASE_URL` in a staged script                       | Script breaks when SUT moves to a different port                 | Always import from `tests/config/env.js`                                    |
| Writing the executive summary before both Human Gates close    | Summary does not reflect human verdicts                          | Step 5 of perf-report explicitly follows Gate 2                             |
| Recommending Redis / horizontal scaling for the SUT            | SUT is SQLite + single-process Node.js; these are infeasible     | State SUT constraints before generating recommendations                     |
| Running full test via `k6-runner` instead of instructing human | No screen recording evidence produced                            | Full evidence runs always go to human; `k6-runner` for sanity/baseline only |
| Using `--summary-export` flag                                  | Deprecated in v0.43, removed in v0.54 — produces no output       | Use `handleSummary()` always                                                |
