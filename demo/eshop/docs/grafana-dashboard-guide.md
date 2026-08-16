# Grafana Dashboard Reading Guide — EShop Performance Dashboard

> **Purpose:** How to read each panel, what information it provides, and when to focus on it during performance testing.

## Dashboard Layout Overview

```
┌─────────────────────────────────────────────────────────────┐
│ Row 1 — Node.js Process Metrics                             │
├──────────────────────┬──────────────────────────────────────┤
│ [2] CPU Usage        │ [3] Memory Usage                     │
├──────────────────────┼──────────────────────────────────────┤
│ [4] Event Loop Lag   │ [5] Active Handles & GC Duration     │
├─────────────────────────────────────────────────────────────┤
│ [6] Process Snapshot (4 stat cards — full width)            │
├─────────────────────────────────────────────────────────────┤
│ Row 2 — Application HTTP Metrics                            │
├──────────────────────┬──────────────────────────────────────┤
│ [11] Request Rate    │ [12] Error Rate %                    │
├──────────────────────┴──────────────────────────────────────┤
│ [13] Latency Percentiles (p50/p95/p99) │ [14] Latency Stats │
├─────────────────────────────────────────────────────────────┤
│ [15] Latency by Route (full width)                          │
└─────────────────────────────────────────────────────────────┘
```

## Row 1 — Node.js Process Metrics

**Source:** `prom-client` — metrics collected directly from the Node.js process inside the backend container.

### Panel [2] — Process CPU Usage (cores/s)

**What it shows:**

- `CPU usage (cores)` — total CPU cores consumed per second by the Node.js process.
- `CPU user` — CPU time spent in user space (application code, JS execution).
- `CPU system` — CPU time spent in kernel space (file I/O, network syscalls).

**How to read:**

- Value of `1.0` = 1 full core being used. Since the container is limited to 2 cores, max is `2.0`.
- `CPU user` dominates → JS/application-level work (bcrypt, JSON parsing, business logic).
- `CPU system` spikes → heavy I/O (SQLite reads/writes, network).

**When to focus:**

- **Stress test:** Watch this climb with each VU staircase step. When it plateaus near `2.0` and error rate spikes → CPU is the bottleneck.
- **Load test:** Should remain stable under normal VU count. Unexpected spikes at low VU = inefficient code path.
- **Spike test:** Should return to baseline quickly after VU drops. Slow recovery = CPU-bound recovery work.

### Panel [3] — Memory Usage

**What it shows:**

- `RSS (total RAM)` — total physical memory used by the process (heap + external + stack + OS overhead).
- `Heap Used` — V8 heap memory currently in use (JS objects, closures, strings).
- `Heap Total` — total heap size V8 has allocated (grows as needed, shrinks after GC).
- `External (Buffers)` — memory used by Node.js Buffers and TypedArrays (outside V8 heap, e.g. SQLite data, network buffers).

**How to read:**

- Normal idle state: RSS ~50–120MB, Heap Used ~30–80MB.
- `Heap Used` rising continuously without ever dropping → **memory leak**.
- `Heap Used` near `Heap Total` → GC pressure — V8 is struggling to free memory.
- `External` growing → Buffer/stream data accumulating (possible leak in network or DB layer).

**When to focus:**

- **Soak test (most important):** Monitor over 10–15 minutes. A steady upward trend in `Heap Used` with no GC drops = confirmed memory leak.
- **Spike test:** After VU drops to 0, `RSS` and `Heap Used` should return close to baseline within 1–2 minutes. If they remain elevated → retained objects not being garbage collected.
- **Stress test:** Watch for OOM — if `RSS` approaches the container memory limit (1GB), the process will be killed.

### Panel [4] — Event Loop Lag (ms)

**What it shows:**

- `Event Loop Lag (ms)` — how long the Node.js event loop is delayed beyond its scheduled tick interval.
- `Event Loop Lag p99 (ms)` — worst-case lag (99th percentile) in the measurement window.

**How to read:**

- `0–10ms`: Healthy — event loop running freely.
- `10–50ms`: Acceptable under moderate load.
- `50–100ms`: Warning — some blocking operations or heavy CPU work.
- `> 100ms`: Critical — event loop is significantly blocked. All async I/O (incoming requests, DB queries, timers) is delayed.

**Why this matters more than CPU%:**
Node.js is single-threaded. Even at 50% CPU, if one operation blocks the event loop (e.g. synchronous file read, heavy JSON.parse, bcrypt without worker), all other requests wait. Event loop lag directly measures this.

**When to focus:**

- **Stress test:** Lag should increase as VU count increases. A sudden jump to `> 100ms` at a specific VU batchstep identifies the breaking point more precisely than error rate alone.
- **Load test:** If p99 lag is `> 50ms` at normal VU count → baseline optimization needed before proceeding.
- **Spike test:** After spike, lag should drop back within 1–2 seconds. Slow recovery = queued work not draining.

### Panel [5] — Active Handles & GC Duration

**What it shows:**

- `Active Handles` — number of active I/O handles (TCP connections, file descriptors, timers) the Node.js process currently holds open.
- `GC Duration (ms/s)` — total milliseconds spent in garbage collection per second.

**How to read:**

- `Active Handles` should scale proportionally with VU count and drop when VUs drop. If it keeps growing after VUs drop → **connection leak** (connections not being properly closed/released).
- `GC Duration` of `5–20ms/s` is normal. Spikes to `> 50ms/s` = GC is consuming significant CPU time, which also blocks the event loop briefly.

**When to focus:**

- **Soak test:** If `Active Handles` grows steadily over 15 minutes even at constant VU → connection/resource leak.
- **Stress test:** High `GC Duration` at peak VU is expected; monitor whether it stays high after VU drops (lingering heap pressure).
- **Spike test:** `Active Handles` should drop quickly when VUs return to baseline.

### Panel [6] — Process Snapshot (stat cards)

**What it shows:**
Four large-text stat cards showing current values:

- `RSS (MB)` — total RAM in use right now.
- `Heap Used (MB)` — V8 heap in use right now.
- `Event Loop Lag (ms)` — current event loop lag.
- `Active Handles` — current number of open handles.

**Color thresholds:**

| Metric              | Green | Yellow  | Red   |
| ------------------- | ----- | ------- | ----- |
| RSS (MB)            | < 500 | 500–900 | > 900 |
| Heap Used (MB)      | < 400 | 400–800 | > 800 |
| Event Loop Lag (ms) | < 50  | 50–100  | > 100 |

**When to focus:**

- Quick glance during demo — colored backgrounds make critical state immediately visible without reading graphs.
- Use as reference point when taking screenshots for evidence: capture this panel alongside the timeseries panels.

## Row 2 — Application HTTP Metrics

**Source:** `prom-client` HTTP middleware in `server.js` — tracks every request going through the backend.

### Panel [11] — Request Rate (RPS)

**What it shows:**

- `Total RPS` — total requests per second across all endpoints.
- Per-route breakdown — individual lines for each route (e.g. `/api/orders/:id`, `/api/cart`, `/api/register`).

**How to read:**

- Correlate with k6 VU count: if k6 reports 100 VUs at 1 req/s each → expect ~100 RPS on this panel. Large gap = requests being dropped or queued.
- `/metrics` route is excluded from the breakdown to avoid noise.

**When to focus:**

- **All tests:** Verify backend is actually receiving the load k6 is sending. If RPS is much lower than expected → network issue, backend crash, or connection refusal.
- **Stress test:** RPS plateaus or drops while VU count keeps rising → backend is saturated.
- **Spike test:** Watch RPS spike sharply then recover — confirms backend processed the spike traffic.

### Panel [12] — Error Rate %

**What it shows:**

- `5xx Error Rate %` — percentage of server-side errors (backend failures, crashes, timeouts).
- `4xx Error Rate %` — percentage of client-side errors (auth failures, validation errors, not found).

**How to read:**

- `5xx` is the primary SLO metric. Threshold: `< 1%` for load/soak, `< 5%` for stress/spike.
- `4xx` spike during stress test with `POST /api/register` → likely hitting a validation edge case, not a performance issue.
- Both spiking together → possible the backend is returning generic error responses under load.

**Color thresholds (5xx):**

- Green: `< 1%`
- Yellow: `1–5%`
- Red: `> 5%`

**When to focus:**

- **Stress test:** This is the primary break indicator. Watch for the step at which 5xx crosses 5% → that VU count is the system breaking point.
- **Spike test:** 5xx should spike during the VU surge then recover. Measure time from spike peak back to `< 1%` = recovery time.
- **Load test:** Should stay near 0% throughout. Any 5xx at normal load = bug, not just performance issue.

### Panel [13] — Latency Percentiles (p50 / p95 / p99)

**What it shows:**

- `p50` (median) — 50% of requests complete faster than this. Representative of typical user experience.
- `p95` (orange, thicker line) — 95% of requests complete faster than this. **Primary SLO threshold.**
- `p99` (red) — 99% of requests complete faster. Captures worst-case tail latency.

**How to read:**

- Gap between p50 and p99 indicates latency distribution spread. A large gap = some requests are significantly slower (outliers), often caused by SQLite lock contention or GC pauses.
- Steady upward drift over time at constant VU (soak test) = **latency degradation** — the system is slowly getting worse.
- p95 crossing the SLO threshold line = official SLO violation.

**When to focus:**

- **Load test:** p95 should stay below the SLO threshold (`baseline_p95 × 2`) throughout the plateau phase.
- **Stress test:** Watch p95 climb with each VU step. Record the VU count where p95 first crosses `3× baseline`.
- **Soak test:** Plot p95 at minute 1 vs minute 15. If p95 at end is significantly higher → latency degradation confirmed. Note the minute where drift started.
- **Spike test:** After VU drops, p95 should return to near-baseline within 1–2 minutes.

### Panel [14] — Latency Stats (Current)

**What it shows:**
Three stat cards with current (last 1 minute) values:

- `p50 (ms)` — current median latency.
- `p95 (ms)` — current p95 latency (SLO reference).
- `p99 (ms)` — current worst-case latency.

**Color thresholds:**

- Green: `< 300ms`
- Yellow: `300ms–1000ms`
- Red: `> 1000ms`

**When to focus:**

- Quick reference during demo without scrolling through the timeseries.
- Screenshot this alongside Panel [13] for evidence: shows both trend and current value.
- If cards show "No data yet" → no traffic has been sent to the backend yet. Send at least one request first.

### Panel [15] — Latency by Route

**What it shows:**

- p95 latency for each individual route, plotted as separate lines on the same chart.

**How to read:**

- All routes should track roughly together under uniform load.
- One route significantly higher than others → that route is the bottleneck (inefficient query, missing index, heavy processing).
- During a test targeting a single endpoint, only one line will be active — this confirms you are hitting the right endpoint.

**When to focus:**

- **Load test:** Confirm only the target route (`/api/orders/:id`) shows activity.
- **Multi-endpoint tests (if applicable):** Compare route performance to identify worst performer.
- **Post-test analysis:** Screenshot for the report to show per-route breakdown.

## Quick Reference: Which Panels to Watch Per Test Type

| Test Type       | Primary panels                                      | Secondary panels                       |
| --------------- | --------------------------------------------------- | -------------------------------------- |
| **Load test**   | [13] Latency p95, [12] Error Rate                   | [11] RPS, [6] Snapshot                 |
| **Stress test** | [12] Error Rate 5xx, [2] CPU, [4] Event Loop Lag    | [13] Latency, [11] RPS                 |
| **Spike test**  | [12] Error Rate (recovery), [13] Latency (recovery) | [3] Memory, [5] Active Handles         |
| **Soak test**   | [3] Memory (heap trend), [4] Event Loop Lag drift   | [13] Latency drift, [5] Active Handles |

## Screenshot Checklist (for test evidence)

For each test run, capture at minimum:

- [ ] Full dashboard screenshot showing the entire test timeline (after test ends, set time range to cover full duration).
- [ ] Zoomed screenshot of Panel [12] (Error Rate) showing the key moment (break point / spike / SLO violation).
- [ ] Zoomed screenshot of Panel [13] (Latency) showing p95 trend.
- [ ] Panel [6] (Process Snapshot) at peak load — shows RSS, Heap, Event Loop Lag at worst point.
- [ ] For soak test: Panel [3] (Memory) showing the full 15-minute trend.
