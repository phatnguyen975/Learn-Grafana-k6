# Test Plan — read-heavy

> **Date:** 2026-08-14  
> **Endpoint:** `GET /api/orders/:id`  
> **Test Type:** load

## 1. Baseline Reference

| Metric                   | Value        |
| ------------------------ | ------------ |
| Baseline p50             | 1.07 ms      |
| Baseline p95             | 3.19 ms      |
| Baseline RPS (1 VU)      | 614.55 req/s |
| SLO p95 threshold        | < 100 ms     |
| SLO error rate threshold | < 0.1%       |

## 2. Workload Model

### VU Derivation

| Parameter            | Value        | Calculation                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Target RPS           | 10–20 req/s  | Micro hardware tier target range is 10–20 RPS per industry standard.                                                                                                                                                                                                                                                                                                                                                                                |
| baseline_rps_per_vu  | 614.55 req/s | Measured directly from baseline run (1 VU, 2 min, no think time)                                                                                                                                                                                                                                                                                                                                                                                    |
| normal_vus (adopted) | **20**       | A single VU running at max speed without think time does not model real user sessions. We target 20 concurrent "My Orders" viewers to properly simulate real-world e-commerce traffic. With a 1–2 second think time per VU, each VU produces ~0.66 RPS. 20 VUs will produce ~13.2 RPS, which fits perfectly into the target 10–20 RPS bound for this tier. This ensures the system is adequately exercised without violating the load test profile. |
| peak_vus             | N/A          | Load tests do not define a peak VU — the plateau is the target. Peak VUs are only derived for stress and spike tests.                                                                                                                                                                                                                                                                                                                               |

> **Note on think-time impact:** With `sleep(random × 1 + 1)` (average 1.5 s), each VU generates approximately `1000 / (3.19 + 1500) ≈ 0.66 RPS`. At 20 VUs, the expected plateau RPS is **~13.2 RPS** — a sustainable and highly realistic load for a SQLite-backed SUT.

### Stage Table

| Stage # | Name      | Target VUs | Duration | Goal                                                  |
| ------- | --------- | ---------- | -------- | ----------------------------------------------------- |
| 1       | Ramp-up   | 0 → 20     | 2 min    | Gradually introduce 20 VUs; observe initial latency   |
| 2       | Plateau   | 20         | 6 min    | Sustain 20 concurrent users; measure steady-state p95 |
| 3       | Ramp-down | 20 → 0     | 2 min    | Gracefully scale down; observe tail latency behaviour |

**Total duration:** 10 minutes

### Think Time

**Value:** 1–2 seconds (randomised)  
**k6 expression:** `sleep(Math.random() * 1 + 1)`

**Reasoning:** `GET /api/orders/:id` is accessed by a user reading their order detail screen. A 1–2 second pause models the time between interactions. Without it, 20 VUs would generate ~12,000 RPS, transforming this into an extreme throughput test instead of a realistic concurrency load test.

## 3. Threshold Configuration

| k6 Threshold              | Value   | Source                                         |
| ------------------------- | ------- | ---------------------------------------------- |
| `http_req_duration p(95)` | < 100   | Best-practice UX budget for internal read APIs |
| `http_req_failed rate`    | < 0.001 | Best-practice 99.9% availability target        |

## 4. Request Payload

**Method:** `GET /api/orders/:id`

**Headers:**

```
Content-Type: application/json
Authorization: Bearer <token>   ← required; obtained via per-VU cached login
```

**URL Parameters:**

| Parameter | Type    | Source                | Notes                                                                                         |
| --------- | ------- | --------------------- | --------------------------------------------------------------------------------------------- |
| `:id`     | integer | CSV column `order_id` | Must be an order that belongs to the authenticated user (same row in CSV). Enforced by FR-11. |

## 5. Auth Strategy

**Selected strategy:** Strategy 2 — Per-VU Cached Token

**Reasoning:** Each VU must authenticate as a distinct user and request only that user's order IDs. Sharing a single token across VUs would mean all VUs query the exact same database row, violating realistic testing patterns. Each VU logs in once at iteration 0, caches the token, and uses its dedicated `(email, password, order_id)` triplet from the CSV.

_Full analysis: `plan/auth-strategy.md`_

## 6. CSV Schema Summary

**File:** `tests/load/read-heavy.csv`

| Column     | Type    | Required | Description                                        |
| ---------- | ------- | -------- | -------------------------------------------------- |
| `email`    | string  | Yes      | Login email for this VU's test account             |
| `password` | string  | Yes      | Login password for this VU's test account          |
| `order_id` | integer | Yes      | ID of an order belonging to this VU's user account |

**Required row count:** 50 rows  
**Calculation method:** To safely support 20 VUs without reusing rows and to provide ample headroom for multiple test reruns without hitting the account lockout policy.

## 7. Output Configuration

| Output Type  | Configuration                                                           | Purpose                                           |
| ------------ | ----------------------------------------------------------------------- | ------------------------------------------------- |
| HTML report  | `handleSummary()` → `tests/load/summary.html` (via k6-reporter library) | Visual summary for report submission              |
| JSON summary | `handleSummary()` → `tests/load/summary.json`                           | Machine-readable metrics for perf-report analysis |

## 8. Known Constraints & Mitigations

| Constraint                                                                      | Mitigation                                                                                                   |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| SQLite serialises write transactions — concurrent reads may queue behind writes | Test is read-only; isolated from write-heavy tests. Close admin panel sessions before running.               |
| Account lockout after 3 consecutive failed logins (30 s)                        | CSV credentials generated programmatically via seed script — no manual entry, no typos.                      |
| JWT TTL assumed ~1 hour                                                         | Load test duration is 10 min — well within 1-hour TTL. No token refresh logic required.                      |
| Order ownership: each VU must use its own (user, order) pair                    | CSV must contain matching user credentials and order IDs in each row. Seed script must create both together. |
