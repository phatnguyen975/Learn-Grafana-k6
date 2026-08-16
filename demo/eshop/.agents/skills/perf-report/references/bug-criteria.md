# Bug Candidate Criteria

> Read this file during Step 4 when identifying bug candidates. A bug candidate is a behaviour that is anomalous and potentially indicative of a defect — not simply expected degradation under load. Only behaviours that meet one or more of the criteria below qualify.

## The Distinction: Expected Degradation vs Bug Candidate

| Expected degradation                                    | Bug candidate                                                            |
| ------------------------------------------------------- | ------------------------------------------------------------------------ |
| p95 increases under high load                           | p95 > 3× baseline at or below `normal_vus`                               |
| Errors appear when load exceeds `abortOnFail` threshold | Error rate > 0% when load is at or below `normal_vus`                    |
| Memory increases during test                            | Memory does not recover after VUs reach 0                                |
| Latency increases during spike                          | System does not recover to < 1% error rate within 2 minutes of spike end |
| Stress test hits breaking point                         | System requires restart to recover after stress test                     |

## Qualifying Criteria

A behaviour qualifies as a bug candidate if it meets **at least one** of the following:

### Criterion 1 — Error Rate at Normal Load

**Condition:** `http_req_failed.values.rate > 0.01` (1%) when VU count ≤ `perf-config.json workload.normal_vus`.

**Why it qualifies:** At normal load the system should be well within capacity. Errors at or below the normal operating VU count are not load-induced; they indicate a functional or configuration defect.

**Evidence to cite:** `summary.json → metrics.http_req_failed.values.rate`, compared against `perf-config.json → workload.normal_vus`.

### Criterion 2 — Memory Non-Recovery

**Condition:** After VUs reach 0 (ramp-down complete), memory usage remains significantly elevated — does not return toward the pre-test baseline within 5 minutes.

**Why it qualifies:** Memory that does not release after load subsides indicates a leak — objects or connections that are not being garbage-collected or closed.

**Evidence to cite:** Run-log observation noting memory reading at end of ramp-down. Note: this field requires the human to have recorded a post-ramp-down memory reading. If not recorded, mark the candidate as "Need more data."

### Criterion 3 — Disproportionate Latency at Normal Load

**Condition:** `p95 > baseline_p95 × 3` when VU count ≤ `normal_vus`.

**Why it qualifies:** A 3× latency increase at normal load is not proportional to the load increase. It suggests a bottleneck (lock contention, connection pool exhaustion, inefficient query plan) that activates even at expected operating conditions.

**Evidence to cite:** `summary.json → metrics.http_req_duration.values["p(95)"]` vs `perf-config.json → baseline.p95_ms` vs stage table VU counts in `test-plan.md`.

### Criterion 4 — Spike Non-Recovery

**Condition:** Error rate does not drop below 1% within 2 minutes after VU count returns to the pre-spike level (or to 0).

**Why it qualifies:** A well-designed system should shed load gracefully when traffic subsides. Sustained errors after load drops indicate that the system entered a degraded state that requires external intervention (connection reset, cache flush, restart) to clear.

**Evidence to cite:** Run-log observation of recovery timestamp vs VU-drop timestamp (recovery time > 120 seconds).

### Criterion 5 — Unexpected k6 Exit Code 99 Without `abortOnFail`

**Condition:** k6 exits with code 99 but no `abortOnFail` threshold was configured (load or soak test types).

**Why it qualifies:** Exit code 99 on a test without `abortOnFail` means one or more thresholds were breached at the end of the test. On a load or soak test (which are designed to be within normal operating parameters), a threshold breach is unexpected.

**Evidence to cite:** Run-log `exit_code` field. Test plan to confirm `abortOnFail` was not configured.

## Severity Classification

| Severity   | Definition                                                                                                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **High**   | The system fails under normal operating conditions (Criterion 1 or 3 at `normal_vus`), or does not recover after a spike (Criterion 4), or exits unexpectedly on a load test (Criterion 5). |
| **Medium** | The system degrades disproportionately under moderate overload but recovers; or memory non-recovery is observed but the system remains functional.                                          |
| **Low**    | Marginal threshold breach; behaviour is on the boundary of a criterion; or the issue is only observable under extreme load well above `normal_vus`.                                         |

## Root-Cause Hypothesis Guidelines

A root-cause hypothesis must be **specific and evidence-grounded**. It must identify a plausible mechanism, not just restate the observed symptom.

**Acceptable format:**

```
Hypothesis: The p95 spike at 20 VUs may indicate write-lock contention in the
database layer. SQLite serialises all write transactions; with 20 concurrent VUs
all issuing POST /api/cart, each write must wait for the previous lock to release.
Evidence: p95 = 890 ms (summary.json) at 20 VUs vs baseline p95 = 85 ms
(baseline-result.md). Ratio = 10.5× — disproportionate for a 20× VU increase,
consistent with lock queuing rather than linear degradation.
```

**Unacceptable format:**

```
Hypothesis: Probably a memory leak or database issue.
```

If a plausible mechanism cannot be identified from the available evidence, write:

```
Hypothesis: Insufficient data to identify root cause. The observed behaviour
(p95 = Xms at Y VUs) meets Criterion N but the available metrics do not isolate
the cause. Recommended investigation: enable query logging and compare DB wait
times at normal vs elevated load.
```

## What Does NOT Qualify as a Bug Candidate

- p95 increasing above the SLO threshold during a stress test when VU count exceeds `normal_vus`. This is expected — the stress test is designed to exceed capacity.
- Error rate > 1% during the spike hold phase when VU count is at `peak_vus`. Expected under extreme burst load.
- Latency increasing proportionally with VU count. Expected linear degradation.
- `abortOnFail` triggering on a stress test at high VU counts. This is the intended mechanism.

Document these as "Expected degradation — does not qualify as bug candidate" if they were observed and might otherwise be mistaken for bugs.
