# Auth Strategy Reference for k6 Test Plans

> Read this file during Step 2b (auth strategy selection) and Step 3 (CSV schema design). It describes three k6 authentication strategies, their trade-offs, and their CSV implications. Use the decision flowchart to select a strategy, then justify the choice against the other two.

## The Three Strategies

### Strategy 1 — `setup()` Shared Token

**Mechanism:** A single login is performed inside the k6 `setup()` function before the VU lifecycle begins. The token is returned from `setup()` and passed as `data` to every VU. All VUs share the same token.

**k6 pseudocode:**

```javascript
export function setup() {
  const res = http.post(
    `${BASE_URL}/api/login`,
    JSON.stringify({ email, password }),
    headers,
  );
  return { token: res.json("token") };
}

export default function (data) {
  const headers = { Authorization: `Bearer ${data.token}` };
  // ... test request
}
```

| Dimension                | Assessment                                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Login burden on endpoint | None — login is outside the measured stages                                                                 |
| Session scope            | All VUs share one session / one user's data                                                                 |
| Token expiry risk        | Low — token is fresh at test start                                                                          |
| Realism                  | Low for session-specific endpoints; adequate for endpoints where user identity does not affect the response |
| CSV columns needed       | No credential columns required                                                                              |

### Strategy 2 — Per-VU Cached Token

**Mechanism:** Each VU logs in exactly once — on its first iteration (`__ITER === 0`) — and caches the token in a VU-level variable. The token is reused for all subsequent iterations of that VU. Login requests are tagged with `group('login', ...)` to exclude them from the primary endpoint metrics.

**k6 pseudocode:**

```javascript
import { SharedArray } from "k6/data";

const users = new SharedArray("users", () => {
  return JSON.parse(open("./data/users.csv"));
});

let cachedToken = null;

export default function () {
  const user = users[__VU % users.length];

  if (__ITER === 0) {
    group("login", () => {
      const res = http.post(
        `${BASE_URL}/api/login`,
        JSON.stringify({ email: user.email, password: user.password }),
        headers,
      );
      check(res, { "login ok": (r) => r.status === 200 });
      cachedToken = res.json("token");
      if (!cachedToken) throw new Error(`VU ${__VU}: login failed`);
    });
  }

  const authHeaders = { Authorization: `Bearer ${cachedToken}` };
  // ... test request using user.{data_field}
}
```

| Dimension                | Assessment                                                                       |
| ------------------------ | -------------------------------------------------------------------------------- |
| Login burden on endpoint | Burst of login requests during VU warm-up phase; mitigated by `group()` tagging  |
| Session scope            | Each VU has its own session and user identity                                    |
| Token expiry risk        | Low — token is obtained at test start; risk increases for soak tests > token TTL |
| Realism                  | High — accurately models N concurrent users each with their own session          |
| CSV columns needed       | `email`, `password` (credentials) + any data-specific columns (IDs, payloads)    |

### Strategy 3 — Pre-Generated Token in CSV

**Mechanism:** Tokens are generated before the test run (via a pre-test login script) and stored directly in the CSV alongside other test data. VUs read a token from the CSV and use it immediately — no login request occurs during the test.

**k6 pseudocode:**

```javascript
const rows = new SharedArray(
  "data",
  () => papaparse.parse(open("./data/data.csv"), { header: true }).data,
);

export default function () {
  const row = rows[__VU % rows.length];
  const authHeaders = { Authorization: `Bearer ${row.token}` };
  // ... test request
}
```

| Dimension                | Assessment                                                                                                                                |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Login burden on endpoint | None — no login requests during the test                                                                                                  |
| Session scope            | Each VU has its own session if CSV has unique tokens per row                                                                              |
| Token expiry risk        | **High** — tokens generated before the test may expire if the JWT TTL is shorter than the time between CSV generation and test completion |
| Realism                  | Moderate — session isolation is realistic but login latency is absent from the test                                                       |
| CSV columns needed       | `token` column (plus any data-specific columns)                                                                                           |

## Decision Flowchart

```
Does the endpoint require authentication?
├── No → No auth strategy needed. Skip to CSV schema design.
└── Yes ↓
Is the response content specific to the authenticated user? (i.e. would 100 VUs sharing one token all see the same data, making the test unrealistic?)
├── No → Strategy 1 (setup() shared token) is sufficient. All VUs query the same resource; identity does not affect the test.
└── Yes ↓
Is the JWT TTL well-understood and longer than the test duration? Can tokens be reliably pre-generated without login rate-limit risk?
├── Yes (TTL long, environment allows pre-gen) → Strategy 3 is viable.
│   Evaluate: does the absence of login latency distort the test goal?
│   If yes → Strategy 2. If no → Strategy 3.
└── No → Strategy 2 (per-VU cached token) is the default choice.
```

## CSV Implications by Strategy

| Strategy   | Required columns                          | Notes                                                     |
| ---------- | ----------------------------------------- | --------------------------------------------------------- |
| Strategy 1 | No credential columns needed              | CSV contains only request data fields                     |
| Strategy 2 | `email`, `password` + request data fields | One row per VU; VU reuses the same row for all iterations |
| Strategy 3 | `token` + request data fields             | Tokens must be generated fresh before each test run       |

## Implementation Notes for Strategy 2 (Per-VU Cached Token)

These notes apply when Strategy 2 is selected. Include them as constraints in the brief given to `script-writer`.

1. **Use `SharedArray` for CSV loading.** This avoids redundant parsing across VUs and is the k6-recommended pattern for large datasets.
   ```javascript
   const users = new SharedArray(
     "users",
     () => papaparse.parse(open("./data/{group}.csv"), { header: true }).data,
   );
   ```
2. **Login once per VU, not per iteration.** Guard with `if (__ITER === 0)`.
3. **Tag login with `group('login', ...)`** to exclude login metrics from the primary endpoint's `http_req_duration` measurements.
4. **Handle login failure explicitly.** If login returns a non-200 status, throw an error rather than proceeding with a null token — a null token will produce 401 errors on every subsequent request, invalidating the results.
5. **Check token expiry for long tests.** If `test_type` is `soak` and the test duration approaches or exceeds the JWT TTL, consider adding a token refresh mechanism or switching to Strategy 3 with freshly generated tokens.

## Sources

- k6 documentation — `setup()` and `teardown()`: https://grafana.com/docs/k6/latest/using-k6/test-lifecycle/
- k6 documentation — `SharedArray`: https://grafana.com/docs/k6/latest/javascript-api/k6-data/sharedarray/
- k6 documentation — `group()`: https://grafana.com/docs/k6/latest/javascript-api/k6/group/
- k6 community — Auth patterns discussion: https://community.grafana.com/t/authentication-in-k6/
