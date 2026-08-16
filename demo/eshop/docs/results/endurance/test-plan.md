# Endurance / Soak Test Plan — EShop SUT

> **Document type:** Test Plan  
> **Test type:** Soak (Endurance)  
> **Student ID:** 23127449  
> **Date:** 2026-08-15  
> **Script filename:** `23127449_SoakTest_20260815.js`

## 1. Purpose & Background

This soak test is the **fourth and final test** in the HW05 performance testing sequence. Its purpose is to **empirically determine the hardware endurance threshold** — specifically, the maximum stable RPS and memory ceiling — for the EShop SUT running in a container with 2 vCPU / 1 GB RAM limits.

### Why a Soak Test Is Needed After Load/Stress/Spike

| Observation from prior tests                                                                                            | Implication for Soak                                                                   |
| ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Load test (GET /api/orders/:id): p95 = 8.6 ms at 20 VUs — highly stable                                                 | Proves the DB layer can sustain reads; good soak candidate baseline                    |
| Stress test (POST /api/register): p95 breached 200 ms SLO at ~70-75 VUs; aborted — SQLite write serialization confirmed | Short-duration pressure revealed; soak explores whether this pattern worsens over time |
| Spike test (POST /api/cart): p95 = 5.75 ms overall but single-request max = 922 ms — high tail variance                 | Max outlier suggests transient lock contention; soak tests whether this accumulates    |

**Root cause of concern:** SQLite has no connection pool and serialises all writes. Under sustained
load, any endpoint that generates periodic writes may exhibit _p95 latency drift_ — a gradual
increase over minutes even at constant VU levels. A soak test detects this.

### Rationale for Endpoint Selection

**Target: Mixed read workload — `GET /api/products` (primary) + `GET /api/orders/my-orders` (secondary)**

| Criterion                    | Justification                                                                                                                                                    |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Realistic e-commerce pattern | Product browsing is the highest-frequency operation in any real shop; order history is frequently polled by authenticated users                                  |
| No unique write data needed  | Pure GET endpoints; no risk of CSV data exhaustion or DB bloat during 10-15 min run                                                                              |
| JWT validity                 | Token TTL = 1 hour; 15-minute test is well within one token lifetime                                                                                             |
| Memory drift detection       | SQLite keeps frequently-queried data in its page cache; sustained read load reveals whether Node.js heap grows unchecked                                         |
| Auth pressure avoidance      | Using the read-heavy credential pool (20 seeded users) avoids triggering account lockout (FR-02: 3 failed attempts = 30s lockout)                                |
| Baseline comparability       | `GET /api/products` is unauthenticated for listing; `GET /api/orders/my-orders` is authenticated — combining both tests the full auth stack under prolonged load |

> **Selection from AGENTS.md rule:** "Prefer the endpoint showing the highest p95 drift or memory pressure during its primary test." The stress test (`POST /api/register`) showed the highest p95 drift but cannot be reused in a soak test because it requires unique email per request — which would exhaust pre-generated CSV data and introduce unrelated failures. The mixed read workload is the correct soak candidate: it targets the auth + DB read stack under continuous pressure without data exhaustion risk.

## 2. Scope

| Item               | Value                                                        |
| ------------------ | ------------------------------------------------------------ |
| Primary endpoint   | `GET /api/products` (no auth required)                       |
| Secondary endpoint | `GET /api/orders/my-orders` (Bearer token required)          |
| Base URL           | `http://localhost:3000`                                      |
| Test duration      | 15 minutes total                                             |
| Auth strategy      | Per-VU cached token (login once at `__ITER === 0`)           |
| Data source        | Use newly generated `tests/soak/soak.csv` (20 seeded users for soak test) |

## 3. Workload Model

### VU Calibration Rationale

The load test confirmed stability at **20 VUs** against a read endpoint (p95 = 8.6 ms). The soak test must sustain a level that:

1. Is **above normal baseline VUs** to stress the system meaningfully
2. Is **below the breaking point** seen in the stress test (70-75 VUs)
3. Is **stable enough** to distinguish gradual drift from transient spikes

**Chosen sustained VU level: 15 VUs**

This is 75% of the load test peak and well below the stress test breaking point. It represents a realistic "busy but not overloaded" production state — exactly what a soak test should simulate.

### Stage Design

```
Phase 0 — Warm-up ramp:   0 -> 15 VUs over 2 minutes
Phase 1 — Sustained load: 15 VUs flat for 10 minutes  <- primary observation window
Phase 2 — Cool-down ramp: 15 -> 0 VUs over 3 minutes  <- observe memory release
```

| Stage     | Duration   | Target VUs | Purpose                                                   |
| --------- | ---------- | ---------- | --------------------------------------------------------- |
| Ramp-up   | 2 min      | 0 -> 15    | Gradual connection establishment; avoids cold-start spike |
| Sustained | 10 min     | 15 (flat)  | **Primary endurance measurement window**                  |
| Cool-down | 3 min      | 15 -> 0    | Observe latency and memory recovery after load            |
| **Total** | **15 min** | —          | Within assignment requirement (10-15 min)                 |

### Think Time

Each VU sleeps **1–3 seconds** (uniform random) between full iterations. This:

- Prevents pure-hammering that would make results unrealistic
- Models realistic user "browsing pause" behaviour
- Keeps effective RPS at approximately **3–5 iterations/s per VU**

### Iteration Workflow Per VU

```
Iteration:
  1. GET /api/products          (no auth header)
  2. GET /api/orders/my-orders  (Authorization: Bearer <token>)
  3. sleep(random 1-3 seconds)
```

### Expected RPS at Steady State

```
Assumptions:
  - avg GET /api/products response = ~5 ms (from baseline observations)
  - avg GET /api/orders/my-orders response = ~8 ms (from load test: avg = 4.2 ms, p95 = 8.6 ms)
  - avg think time = 2 seconds (midpoint of 1-3s range)
  - 2 HTTP requests per iteration

Effective iteration time = 5ms + 8ms + 2000ms ≈ 2.013 s
Iterations per second at 15 VUs = 15 / 2.013 ≈ 7.5 iter/s
HTTP requests per second = 7.5 * 2 = ~15 req/s
```

> **Predicted endurance threshold:** ~15 req/s sustained at 15 VUs with p95 < 100 ms

## 4. SLO / Pass Criteria

| Metric                              | Threshold                    | Rationale                                          |
| ----------------------------------- | ---------------------------- | -------------------------------------------------- |
| `http_req_duration` p95 (products)  | < 50 ms                      | GET /api/products has no auth overhead             |
| `http_req_duration` p95 (orders)    | < 100 ms                     | Aligned with load test SLO                         |
| `http_req_failed` rate              | < 1%                         | Zero tolerance for sustained read errors           |
| p95 drift (manual Grafana read)     | ≤ 30 ms increase over 10 min | Beyond this signals memory/GC pressure             |
| Container memory (Grafana cAdvisor) | < 800 MB                     | 80% of 1 GB container limit = warning threshold    |
| Container CPU                       | < 1.5 vCPU                   | 75% of 2.0 vCPU limit = comfortable operating zone |

## 5. Auth Strategy

| Parameter         | Value                                                                 |
| ----------------- | --------------------------------------------------------------------- |
| Strategy          | Per-VU cached token                                                   |
| Login endpoint    | `POST /api/login`                                                     |
| Login trigger     | `__ITER === 0` (once per VU lifetime)                                 |
| Credential source | `tests/load/read-heavy.csv` via SharedArray                           |
| Token TTL         | Assumed 1 hour (from AGENTS.md)                                       |
| Token refresh     | Not required (test = 15 min < 45-min refresh threshold per AGENTS.md) |
| Lockout risk      | None — login uses correct credentials only                            |

## 6. Metrics to Observe and Record During Run

### 6.1 Grafana Real-Time Panels to Watch

| Metric                         | Source Panel               | What to Watch For                                       |
| ------------------------------ | -------------------------- | ------------------------------------------------------- |
| HTTP Request Rate (req/s)      | k6 → http_reqs rate        | Should be stable ~15 req/s; note any drops              |
| p95 latency trend (line chart) | k6 → http_req_duration p95 | Should be flat; upward drift = memory/GC issue          |
| p99 latency                    | k6 → http_req_duration p99 | Occasional spikes acceptable; persistent rise = concern |
| Error rate                     | k6 → http_req_failed rate  | Must remain at 0%; any increase = immediate action      |
| Container CPU                  | cAdvisor → cpu_usage_total | Note peak; if > 1.8 vCPU, SUT is saturating             |
| Container memory RSS           | cAdvisor → memory_rss      | Record at t=2, t=7, t=12 min; rising = memory leak      |
| Active VUs                     | k6 → vus                   | Confirm flat at 15 during sustained phase               |

### 6.2 Mandatory Data Points to Record Manually

You **must** note these exact values in the endurance report after the run:

| #   | Measurement                     | Timestamp        | Where to Find                           |
| --- | ------------------------------- | ---------------- | --------------------------------------- |
| 1   | RPS at start of sustained phase | t = 2:00 min     | Grafana k6 dashboard                    |
| 2   | RPS at end of sustained phase   | t = 12:00 min    | Grafana k6 dashboard                    |
| 3   | p95 latency at warm-up end      | t = 2:00 min     | Grafana k6 dashboard                    |
| 4   | p95 latency at midpoint         | t = 7:00 min     | Grafana k6 dashboard                    |
| 5   | p95 latency at sustained end    | t = 12:00 min    | Grafana k6 dashboard                    |
| 6   | Container memory at t=2 min     | t = 2:00 min     | cAdvisor → container_memory_rss         |
| 7   | Container memory at t=7 min     | t = 7:00 min     | cAdvisor → container_memory_rss         |
| 8   | Container memory at t=12 min    | t = 12:00 min    | cAdvisor → container_memory_rss         |
| 9   | Peak CPU usage                  | During sustained | cAdvisor                                |
| 10  | Any error events                | Continuously     | k6 terminal or Grafana error rate panel |
| 11  | Memory at cool-down end         | t = 15:00 min    | cAdvisor → verify memory released       |

### 6.3 Screenshots Required

| Screenshot                        | When to Capture        | Filename               |
| --------------------------------- | ---------------------- | ---------------------- |
| Terminal + Grafana in same frame  | During sustained phase | `run-terminal.png`     |
| Grafana full timeline (after run) | After test completes   | `grafana-timeline.png` |
| cAdvisor memory chart             | After test completes   | `cadvisor-memory.png`  |

## 7. Pre-Run Checklist

Before starting the k6 run, confirm all items below:

- [ ] **SUT backend running:** `curl http://localhost:3000/api/products` returns HTTP 200
- [ ] **Grafana accessible:** `http://localhost:3001` shows live dashboard
- [ ] **cAdvisor accessible:** `http://localhost:8080` shows container metrics
- [ ] **Prometheus scraping:** Confirm data is flowing (check last scrape time)
- [ ] **CSV file present:** `tests/soak/soak.csv` exists with >= 15 credential rows
- [ ] **Script present:** `tests/soak/23127449_SoakTest_20260815.js` exists
- [ ] **No concurrent k6 tests running:** `pgrep k6` returns nothing
- [ ] **Screen recording active:** Both k6 terminal and Grafana visible in frame
- [ ] **Docker container healthy:** `docker ps` shows backend container as "Up"
- [ ] **Output directories exist:** `docs/results/endurance/raw/` and `docs/results/endurance/screenshots/`

## 8. Run Command

```bash
# Run from project root in WSL Ubuntu
k6 run tests/soak/23127449_SoakTest_20260815.js 2>&1 | tee docs/results/endurance/raw/stdout.txt
```

`handleSummary()` inside the script will automatically write:

- `docs/results/endurance/raw/summary.json`

The `tee` command captures the full terminal output to `stdout.txt` for evidence.

## 9. Expected Endurance Threshold (Pre-Run Hypothesis)

Based on the three completed tests and the 2 vCPU / 1 GB container profile:

| Metric                | Predicted Stable Value | Basis                                      |
| --------------------- | ---------------------- | ------------------------------------------ |
| Maximum stable RPS    | ~15 req/s at 15 VUs    | Estimated from think time model            |
| Memory ceiling        | 300-600 MB RSS         | Node.js typical heap for SQLite reads      |
| CPU operating point   | 0.2-0.6 vCPU           | Read-only, no write serialization overhead |
| p95 drift over 10 min | < 10 ms                | No accumulating write state                |
| Error rate            | 0%                     | Read endpoints with valid tokens           |

> **Note:** These are AI-generated hypotheses based on prior test data and hardware profile. The empirically measured values from the actual run take precedence. Fill in `endurance-report.md` with the real numbers after the run.

## 10. Endurance Threshold Definition

For the assignment submission, the **endurance threshold** is reported as:

> "Maximum stable RPS: **[HUMAN: fill after run]** req/s  
> Memory ceiling: **[HUMAN: fill after run]** MB RSS  
> p95 ceiling: **[HUMAN: fill after run]** ms  
> Sustained for: 10 minutes at **[HUMAN: fill after run]** VUs with < 1% error rate"
