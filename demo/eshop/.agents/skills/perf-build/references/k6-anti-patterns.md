# k6 Anti-Patterns

> Read this file before generating the full test script (Step 4). Each entry states the anti-pattern, why it is harmful, and the correct alternative.

## AP-01 — Hardcoding `BASE_URL`, thresholds, or stages in the script body

**Anti-pattern:**

```javascript
export const options = {
  stages: [
    { duration: "2m", target: 10 }, // hardcoded
  ],
  thresholds: {
    http_req_duration: ["p(95)<300"], // hardcoded
  },
};
const BASE_URL = "http://localhost:3000"; // hardcoded
```

**Why harmful:** Any change to the SUT environment, threshold, or workload requires editing the script — a process that introduces bugs and makes version control noisy. Config values in scripts also make it impossible to override at runtime without modifying code.

**Correct alternative:** Import from `tests/config/env.js`, `tests/config/thresholds.js`, `tests/config/stages.js`. Values can then be overridden with `k6 run -e VAR=value` at runtime.

## AP-02 — Using `open()` for CSV data outside `SharedArray`

**Anti-pattern:**

```javascript
const data = JSON.parse(open("./data.csv")); // parsed in global scope, not SharedArray

export default function () {
  const row = data[__VU % data.length];
}
```

**Why harmful:** `open()` is supported in global scope but when combined with heavy parsing (e.g. papaparse) and many VUs, the file is re-parsed for each VU initialisation. More critically, calling `open()` inside the VU function (a common mistake) re-reads the file on every iteration, exhausting file descriptors and significantly degrading performance.

**Correct alternative:** Wrap in `SharedArray` — the callback runs once and the result is shared read-only across all VUs. See `references/k6-best-practices.md` section 1.

## AP-03 — Logging response body on every iteration in a full test script

**Anti-pattern:**

```javascript
export default function () {
  const res = http.get(`${BASE_URL}/api/orders/${id}`);
  console.log(JSON.stringify(res.json())); // logs on every iteration × every VU
}
```

**Why harmful:** At 50 VUs × 100 iterations, this produces 5,000 log lines. k6 processes log output synchronously — excessive logging degrades k6's own performance and can cause artificially elevated response times in the metrics.

**Correct alternative:** `console.log` belongs in the sanity script only. In the full script, log only on failure:

```javascript
if (!check(res, { "status 200": (r) => r.status === 200 })) {
  console.error(
    `[VU ${__VU}] Unexpected: ${res.status} — ${res.body.substring(0, 200)}`,
  );
}
```

## AP-04 — Using `--summary-export` flag

**Anti-pattern:**

```bash
k6 run --summary-export=summary.json script.js
```

**Why harmful:** `--summary-export` was deprecated in k6 v0.43.0 and removed in k6 v0.54.0. Using it with a modern k6 version either silently does nothing or produces an error.

**Correct alternative:** Use `handleSummary(data)` inside the script:

```javascript
export function handleSummary(data) {
  return { "run/raw/summary.json": JSON.stringify(data, null, 2) };
}
```

## AP-05 — Logging in on every iteration

**Anti-pattern:**

```javascript
export default function () {
  // Login every iteration
  const loginRes = http.post(`${BASE_URL}/api/login`, credentials);
  const token = loginRes.json("token");
  // ... main request
}
```

**Why harmful:** Every iteration triggers a login request. At 50 VUs × 100 iterations, this generates 5,000 login requests against an endpoint that is not the target. The auth endpoint becomes a bottleneck, and its latency inflates the `http_req_duration` metric if the login is not grouped separately.

**Correct alternative:** Cache the token per VU using `if (__ITER === 0)`. See `references/k6-best-practices.md` section 2.

## AP-06 — Omitting `teardown()`

**Anti-pattern:**

```javascript
// No teardown() function
export default function () {
  http.post(`${BASE_URL}/api/register`, newUser); // creates a user record every iteration
}
```

**Why harmful:** A stress test with 100 VUs × 500 iterations creates 50,000 user records. The next run fails with duplicate email errors for every single iteration — making the test results indistinguishable from a performance failure. The DB also grows unboundedly.

**Correct alternative:** Implement `teardown()`. If no delete API exists, add a comment with the manual cleanup command. See `references/k6-best-practices.md` section 5.

## AP-07 — Using `let` for module-scope variables that should be `const`

**Anti-pattern:**

```javascript
let BASE_URL = 'http://localhost:3000';
let stages = [...];
```

**Why harmful:** `let` in module scope signals mutability. k6's VU isolation means each VU gets its own copy of module-level variables — but using `let` where `const` is correct is a code quality issue that makes the script harder to reason about and can lead to unintended mutation bugs.

**Correct alternative:** Use `const` for all module-scope values that do not change. Reserve `let` for VU-level variables that are explicitly mutated (e.g. `cachedToken`).

## AP-08 — Using `abortOnFail` without `delayAbortEval`

**Anti-pattern:**

```javascript
thresholds: {
  http_req_failed: [{ threshold: 'rate<0.10', abortOnFail: true }],
}
```

**Why harmful:** k6 evaluates thresholds continuously. On the very first request (iteration 0), if that request happens to be slow, `http_req_failed rate` may briefly spike above the threshold before enough data exists to compute a meaningful rate. The test aborts immediately with 0 useful data.

**Correct alternative:** Always pair `abortOnFail: true` with `delayAbortEval: '30s'`. This gives the system 30 seconds of warm-up before the abort condition is evaluated.

## AP-09 — Not tagging the login request with `group()`

**Anti-pattern:**

```javascript
export default function () {
  // Login not tagged — its latency merges with endpoint metrics
  const loginRes = http.post(`${BASE_URL}/api/login`, creds);
  const token = loginRes.json("token");

  http.get(`${BASE_URL}/api/orders/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}
```

**Why harmful:** k6 aggregates all `http.post`, `http.get`, etc. calls into a single `http_req_duration` metric by default. Without grouping, login latency is included in the reported p95 for the target endpoint — making it appear slower than it actually is.

**Correct alternative:** Wrap login in `group('login', () => { ... })`. The group name appears as a tag in metrics and in the JSON output, allowing Grafana and analysis tools to filter it out. See `references/k6-best-practices.md` section 8.

## AP-10 — `sleep(0)` as a placeholder

**Anti-pattern:**

```javascript
sleep(0); // placeholder — "will set proper think time later"
```

**Why harmful:** `sleep(0)` does nothing. A VU with `sleep(0)` sends requests as fast as the server responds — typically 5–20× higher RPS than a real user. This makes the test load model unrealistic and produces results that cannot be reproduced in production.

**Correct alternative:** Set the think time value from the approved test plan. If the test plan says think time is 0 (e.g. during a spike phase), document this explicitly with a comment explaining why zero think time is intentional for that phase.

## Sources

- k6 docs — Common pitfalls: https://grafana.com/docs/k6/latest/testing-guides/running-large-tests/
- k6 community — Performance testing anti-patterns: https://community.grafana.com/t/anti-patterns/
- k6 docs — SharedArray: https://grafana.com/docs/k6/latest/javascript-api/k6-data/sharedarray/
- k6 docs — Thresholds (abortOnFail): https://grafana.com/docs/k6/latest/using-k6/thresholds/#abort-a-test-when-a-threshold-is-crossed
