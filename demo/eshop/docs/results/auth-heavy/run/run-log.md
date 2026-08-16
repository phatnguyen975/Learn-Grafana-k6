# Run Log — auth-heavy (Stress)

**Date/Time:** 2026-08-15T14:51:40+07:00

## 1. Pre-Run Checklist Confirmation

- **SUT Backend:** Confirmed running and DB clean.
- **Test Data:** 54,000 unique records available.
- **Monitoring:** Grafana dashboard ready.
- **Recording:** Screen recording active during test run.

## 2. Real-Time Observations

- **Breaking Point:** Test aborted automatically by k6 at ~11 minutes into the run.
- **VU Count at Abort:** Approximately 70-75 VUs (during the ramp-up from 60 to 90 VUs).
- **Triggered Threshold:** `p(95) < 200` ms was breached.
- **Error Rate:** Remained at 0% throughout the test; no HTTP 5xx errors were thrown.
- **Resource Metrics:**
  - **CPU:** Remained below container limits (did not saturate).
  - **Memory:** Remained stable and below limits.
- **Recovery:** Not applicable / Aborted mid-test.

## 3. Notes for Analysis

- The fact that CPU and Memory were stable while Latency spiked indicates a queueing or locking bottleneck rather than a resource exhaustion bottleneck. Given the endpoint is `POST /api/register` (a write-heavy operation on SQLite), this is highly indicative of SQLite write serialization causing request queueing.
