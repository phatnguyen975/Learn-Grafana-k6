# Real-Time Observation Guide

> Read this file during Step 3 to produce the test-type-specific observation guide. Present only the section matching the current `test_type`. Do not present all sections. Instruct the human to note their observations in the conversation during or immediately after the run — they will be recorded in `run-log.md`.

## What to Watch: Load Test

**Goal of observation:** Confirm the system maintains stable, predictable performance under sustained normal load. Look for early signs of resource exhaustion or degradation.

**During the ramp-up phase:**

- Watch CPU usage: does it climb proportionally with VU count? A non-linear jump may indicate CPU bottleneck.
- Watch memory: initial allocation is expected; a steep climb is a concern.
- Watch p95 latency in Grafana/k6 terminal: should be rising toward but not exceeding the SLO threshold (`perf-config.json slo.p95_threshold_ms`).

**During the plateau phase (most important window):**

- p95 latency: should stabilise within the SLO threshold. Note the settled value.
- Error rate: target < 1%. Any error rate > 0% should be noted with the timestamp.
- CPU utilisation: note the steady-state CPU%. A value > 80% under normal load is a risk indicator for higher-load tests.
- Memory: should plateau (not climb continuously). A slow, continuous climb during a fixed-load plateau suggests a memory leak.

**During the ramp-down phase:**

- p95 should return toward baseline levels.
- Memory should decrease as VUs release connections.

**Key observations to record:**

- Steady-state p95 at plateau (numeric value in ms).
- Steady-state error rate at plateau.
- Peak CPU% observed.
- Peak memory observed (if monitoring tool shows it).
- Any anomalies (sudden latency spike, error burst, unexpected 5xx responses).
- Whether all k6 check assertions passed.

## What to Watch: Stress Test

**Goal of observation:** Identify the VU count at which the system's error rate or
latency exceeds the defined thresholds and `abortOnFail` triggers.

**During each staircase step:**

- Watch the step transition: as VU count increases, does latency jump immediately or lag behind? A lag suggests request queuing.
- Watch error rate: note the first step where errors appear (even 1–2%).
- Note the VU count when the error rate first exceeds the threshold.
- Watch CPU: does it hit 100% at any step? CPU saturation is often the first limiter on CPU-intensive endpoints (auth, complex queries).

**When `abortOnFail` triggers:**

- Note: the VU count at the time of abort, the threshold that was breached (p95 or error rate), and the timestamp.
- This VU count is the system's **breaking point** — the key finding of the stress test.
- k6 exits with code 99. This is expected, not an error.

**During ramp-down (after abort):**

- Does the system recover? Error rate should drop quickly as VU count decreases.
- If the system does not recover (error rate stays high at 0 VUs), the SUT may need a restart — note this and investigate after the run.

**Key observations to record:**

- VU count at which error rate first exceeded 0%.
- VU count at which `abortOnFail` triggered.
- Which threshold triggered the abort (p95 or error rate).
- Peak CPU% and peak memory at time of abort.
- Whether the system recovered after ramp-down.

## What to Watch: Spike Test

**Goal of observation:** Confirm the system survives the spike burst and recovers to acceptable error levels within a reasonable time after VUs drop.

**Pre-spike baseline phase:**

- Note the baseline p95 and error rate before the spike begins — this is the reference.

**During the spike ramp-up:**

- How quickly does the error rate jump? An immediate jump to 50%+ indicates the system cannot absorb the burst at all.
- Watch CPU: does it saturate instantly? A gradual response suggests buffering; an instant saturate suggests no queue capacity.

**During the spike hold:**

- Note the peak error rate during the spike. Is it bounded (e.g. 30%) or total failure (100%)?
- Note the peak p95 during the spike.

**After VUs drop (recovery phase — most critical observation):**

- Note the timestamp when VUs return to the pre-spike level.
- Watch until error rate drops below 1%. Note the timestamp when this happens.
- **Recovery time = timestamp(error rate < 1%) − timestamp(VU drop)**. This is the primary metric.
- Watch memory: does it return to pre-spike level, or does it stay elevated?

**Key observations to record:**

- Peak error rate during spike (%).
- Peak p95 during spike (ms).
- Timestamp when VUs dropped.
- Timestamp when error rate recovered below 1%.
- Recovery time (calculated from above two timestamps).
- Memory behaviour post-spike (recovered / elevated / still growing).

## What to Watch: Soak Test

**Goal of observation:** Detect gradual degradation — memory leaks, connection pool exhaustion, index bloat — that only manifests over extended sustained load.

**First 2 minutes (warm-up window):**

- Note p95 and error rate immediately after the plateau begins. This is the **start-of-test baseline** for drift comparison.
- Note initial memory usage.

**Mid-test (continuous monitoring):**

- Memory: is it growing steadily, or has it plateaued? A plateau is healthy; a continuous slow growth is a memory leak indicator.
- p95: watch for a trend (gradually increasing over time vs stable). Even a slow drift (e.g. +5 ms every 2 minutes) compounds over a long test.
- Error rate: should be flat at near-zero. An upward trend suggests connection pool exhaustion or queue build-up.

**Last 2 minutes (end-of-test window):**

- Note p95 and error rate at the end. The AI will compute the drift from the JSON stream, but the human should confirm visually in Grafana.
- Note the peak memory value from the Grafana Memory Usage panel.

**Degradation point (if observed):**

- Note the minute mark at which p95 started climbing noticeably, or error rate first appeared. Record as "degradation observed at minute X" or "none observed".

**Key observations to record:**

- Memory trend (growing / plateaued / stable).
- Peak memory from Grafana panel (MB or GB — specify units).
- Degradation point (minute mark or "none observed").
- p95 at start of plateau (approx).
- p95 at end of plateau (approx).
- Any anomalies (sudden spike, brief error burst, 5xx response).
