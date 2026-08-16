# k6 Best Practices

> Read this file before generating any k6 script. It documents the correct patterns for the most common k6 scripting concerns. Sources: k6 official documentation (https://grafana.com/docs/k6/latest/)

## 1. CSV Data Loading — `SharedArray`

**Why:** `open()` called directly in VU scope re-reads the file on every iteration of every VU. At 50+ VUs this exhausts file descriptors and degrades k6 performance. `SharedArray` reads and parses the file once during the init phase and shares the result across all VUs via a read-only view.

**Correct pattern:**

```javascript
import { SharedArray } from "k6/data";
import papaparse from "https://jslib.k6.io/papaparse/5.1.1/index.js";

const data = new SharedArray("test-data", function () {
  return papaparse.parse(open("./plan/data/{group}.csv"), { header: true })
    .data;
});

export default function () {
  const row = data[__VU % data.length]; // round-robin by VU index
  // use row.email, row.order_id, etc.
}
```

**Notes:**

- The callback function inside `SharedArray` runs once in the init phase.
- `__VU` is the 1-based VU index — modulo distributes rows evenly.
- For write-once endpoints (e.g. register), use `data[(__VU - 1) * maxIter + __ITER]` to ensure each iteration gets a unique row. Document this index calculation.

## 2. Auth — Per-VU Cached Token

**Why:** Logging in on every iteration floods the auth endpoint with requests, distorting both the auth endpoint's metrics and the target endpoint's load model. Caching the token per VU is the standard k6 pattern for stateful session auth.

**Correct pattern:**

```javascript
let cachedToken = null; // VU-level variable, not shared across VUs

export default function () {
  if (__ITER === 0) {
    group("login", () => {
      const loginRes = http.post(
        `${BASE_URL}/api/login`,
        JSON.stringify({ email: row.email, password: row.password }),
        { headers: { "Content-Type": "application/json" } },
      );
      check(loginRes, { "login: status 200": (r) => r.status === 200 });
      cachedToken = loginRes.json("token");
      if (!cachedToken) {
        throw new Error(`VU ${__VU}: login failed — status ${loginRes.status}`);
      }
    });
  }

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${cachedToken}`,
  };
  // ... main request
}
```

**Notes:**

- `let cachedToken = null` declared at module scope — this is VU-level because k6 runs each VU in an isolated JS runtime.
- `group('login', ...)` is mandatory — it tags login requests separately so they do not appear in the `http_req_duration` metrics for the target endpoint.
- `__ITER === 0` guard prevents login on every iteration.
- Throw on null token rather than proceeding — a null token produces 401 on every subsequent request, making the test results meaningless.

## 3. Auth — `setup()` Shared Token

**When to use:** Endpoint response is not user-session-specific (same data for any valid token). `setup()` login runs before VU stages begin and does not appear in metrics.

**Correct pattern:**

```javascript
export function setup() {
  const res = http.post(
    `${BASE_URL}/api/login`,
    JSON.stringify({
      email: __ENV.LOGIN_EMAIL,
      password: __ENV.LOGIN_PASSWORD,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
  check(res, { "setup login: status 200": (r) => r.status === 200 });
  const token = res.json("token");
  if (!token) throw new Error(`setup() login failed: ${res.status}`);
  return { token };
}

export default function (data) {
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${data.token}`,
  };
  // ... main request
}
```

**Notes:**

- Credentials in `__ENV` — never hardcoded.
- `data` is the return value of `setup()`, passed to every VU function.
- All VUs share the same token — not appropriate for session-specific endpoints.

## 4. `handleSummary()` — Structured Output Export

**Why:** `--summary-export` is deprecated in k6 v0.43+ and removed in v0.54+. `handleSummary()` is the current supported mechanism.

**Minimum correct pattern:**

```javascript
export function handleSummary(data) {
  return {
    "docs/results/{group}/run/raw/summary.json": JSON.stringify(data, null, 2),
    stdout: textSummary(data, { indent: " ", enableColors: true }),
  };
}
```

**Import for `textSummary`:**

```javascript
import { textSummary } from "https://jslib.k6.io/k6-summary/0.0.2/index.js";
```

**Notes:**

- The object keys are output file paths (relative to the working directory where k6 is run).
- `stdout` key prints the standard summary table to the terminal.
- Always `JSON.stringify(data, null, 2)` — bare `data` produces `[object Object]`.

## 5. `teardown()` — Test Data Cleanup

**Why:** Tests that create records (users, orders, cart items) leave data in the DB. Subsequent runs may fail due to unique constraint violations or inflated row counts.

**Pattern:**

```javascript
export function teardown(data) {
  // data = return value of setup(), or empty object if no setup()
  // TEARDOWN NOTE: this test created N user records via POST /api/register.
  // Cleanup: call DELETE /api/admin/users/:id for each created user ID.
  // If the admin token is unavailable, records must be removed manually.
  for (const userId of data.createdUserIds || []) {
    http.del(`${BASE_URL}/api/admin/users/${userId}`, null, {
      headers: adminHeaders,
    });
  }
}
```

**If no delete API exists:**

```javascript
export function teardown() {
  // TEARDOWN NOTE: No delete API is available for records created by this test.
  // Test data created: POST /api/register — N user records with email pattern perf_*@test.local
  // Manual cleanup required: DELETE FROM users WHERE email LIKE 'perf_%@test.local';
  console.log(
    "Teardown: no API available for cleanup — manual DB cleanup required.",
  );
}
```

## 6. `check()` — Assertion Best Practices

```javascript
const ok = check(response, {
  "status is 200": (r) => r.status === 200,
  "response has expected field": (r) => r.json("fieldName") !== undefined,
  "response time < 2000ms": (r) => r.timings.duration < 2000,
});

if (!ok) {
  // In sanity scripts: log failure detail
  console.error(`Check failed: ${response.status} — ${response.body}`);
}
```

**Notes:**

- Check names are the metric labels in the k6 output — make them descriptive.
- `check()` returns `true` if all assertions pass — use the return value in sanity scripts.
- `check()` does not abort the test — use thresholds with `abortOnFail` for that.

## 7. `sleep()` — Think Time

**Why:** Without sleep, a single VU generates as many requests per second as the server can respond to — far more than a real user would. Think time simulates realistic pacing.

```javascript
import { sleep } from "k6";

// Randomised think time (recommended)
sleep(Math.random() * 1 + 1); // 1–2 seconds

// Fixed think time (only when the test plan explicitly requires deterministic pacing)
sleep(1.5);
```

**Notes:**

- Use randomised sleep to prevent all VUs from sending requests simultaneously (synchronisation spikes), which produces unrealistic burst patterns.
- Think time goes at the **end** of the VU function body, after the main request.
- In the spike phase of a spike test, think time may be 0 — document this explicitly.

## 8. `group()` and `tags` — Metric Separation

```javascript
// Tag main request for Grafana filtering
const response = http.get(`${BASE_URL}/api/orders/${row.order_id}`, {
  headers,
  tags: { endpoint: "get-order", test_type: "load" },
});

// Group login separately so it does not pollute endpoint metrics
group("login", () => {
  // login request here
});
```

**Why tags matter:** Tags allow filtering by endpoint in Grafana and in the `--out json` stream, which is essential when multiple endpoints are called in one script (e.g. login + target).

## 9. `abortOnFail` with `delayAbortEval`

```javascript
thresholds: {
  http_req_duration: [{
    threshold: 'p(95)<500',
    abortOnFail: true,
    delayAbortEval: '30s',   // wait 30s before evaluating — prevents premature abort
  }],
  http_req_failed: [{
    threshold: 'rate<0.10',
    abortOnFail: true,
    delayAbortEval: '30s',
  }],
}
```

**Notes:**

- `delayAbortEval` is mandatory when using `abortOnFail`. Without it, a single slow response on the first request triggers abort before enough data is collected.
- Use for `stress` and `spike` tests only — load and soak tests should run to completion.

## 10. `tests/config/` Import Pattern

```javascript
// tests/config/env.js
export const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
export const DEFAULT_HEADERS = { "Content-Type": "application/json" };

// tests/config/thresholds.js
export const thresholds = {
  http_req_duration: [`p(95)<${__ENV.P95_THRESHOLD || 500}`],
  http_req_failed: [`rate<${__ENV.ERROR_RATE || 0.01}`],
};

// tests/config/stages.js
export const stages = [
  { duration: "2m", target: 10 },
  { duration: "6m", target: 10 },
  { duration: "2m", target: 0 },
];

// In the test script:
import { BASE_URL, DEFAULT_HEADERS } from "../../tests/config/env.js";
import { thresholds } from "../../tests/config/thresholds.js";
import { stages } from "../../tests/config/stages.js";

export const options = { stages, thresholds };
```

**Notes:**

- Relative import paths depend on where the script is located. Adjust `../../` accordingly.
- `__ENV.VAR_NAME` allows runtime override without editing the config file.

## Sources

- k6 docs — SharedArray: https://grafana.com/docs/k6/latest/javascript-api/k6-data/sharedarray/
- k6 docs — Test lifecycle (setup/teardown): https://grafana.com/docs/k6/latest/using-k6/test-lifecycle/
- k6 docs — handleSummary: https://grafana.com/docs/k6/latest/results-output/end-of-test/custom-summary/
- k6 docs — Thresholds: https://grafana.com/docs/k6/latest/using-k6/thresholds/
- k6 docs — group(): https://grafana.com/docs/k6/latest/javascript-api/k6/group/
- k6 docs — Tags and groups: https://grafana.com/docs/k6/latest/using-k6/tags-and-groups/
- k6 docs — Options reference: https://grafana.com/docs/k6/latest/using-k6/k6-options/reference/
