# Auth Patterns for k6 Baseline Scripts

> Read this file during Step 3 when `requires_auth` is `true`. It describes how to implement authentication correctly in a minimal baseline k6 script. For workload-scale auth strategy decisions (multiple VUs, token caching, CSV implications), see the auth strategy reference used during workload planning.

## Goal for a Baseline Script

A baseline script runs with **1 VU** for **2 minutes**. Its only job is to measure the raw cost of one valid request to the target endpoint. Auth must be handled, but it must not distort the measurement.

Key constraint: **Login requests must not appear in the metrics of the endpoint under test.** Use k6 `group()` to tag login calls separately, or perform login inside `setup()` so it happens outside the measured VUs entirely.

## Decision: `setup()` or Inline Login

| Situation                                                                            | Recommended approach                                              |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| Endpoint result is **not** user-session-specific (same response for any valid token) | `setup()` — login once, pass token to VU                          |
| Endpoint result **is** user-session-specific (e.g. "my orders", "my cart")           | Inline per-VU login at `__ITER === 0`, wrapped in `group('auth')` |
| No auth required                                                                     | Neither — omit entirely                                           |

For a baseline (1 VU), both approaches produce equivalent results. Prefer `setup()` for simplicity in a baseline context because there is only one VU and session specificity does not matter yet.

## Pattern A — `setup()` Login (preferred for baseline)

```javascript
import http from "k6/http";
import { check, group } from "k6";
import { sleep } from "k6";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const LOGIN_EMAIL = __ENV.LOGIN_EMAIL || "test@eshop.com";
const LOGIN_PASSWORD = __ENV.LOGIN_PASSWORD || "Test1234!";

export function setup() {
  const res = http.post(
    `${BASE_URL}/api/login`,
    JSON.stringify({
      email: LOGIN_EMAIL,
      password: LOGIN_PASSWORD,
    }),
    { headers: { "Content-Type": "application/json" } },
  );

  check(res, { "login succeeded": (r) => r.status === 200 });

  const token = res.json("token");
  if (!token) {
    throw new Error(
      `Login failed — no token returned. Status: ${res.status}, Body: ${res.body}`,
    );
  }
  return { token };
}

export default function (data) {
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${data.token}`,
  };

  const res = http.get(`${BASE_URL}/api/target-endpoint`, { headers });
  console.log(JSON.stringify(res.json()));

  check(res, {
    "status is 200": (r) => r.status === 200,
    "response has expected field": (r) => r.json("id") !== undefined,
  });
}

export function handleSummary(data) {
  return {
    "spec/baseline-summary.json": JSON.stringify(data, null, 2),
  };
}
```

**Why `setup()` is correct for a baseline:**

- Login runs once before the VU loop starts — it is not counted in `http_req_duration` metrics.
- The VU function measures only the target endpoint.
- Credentials come from environment variables — never hardcoded.

## Pattern B — Inline Per-VU Login (for session-specific endpoints)

Use this when the response content differs per user (e.g., "my orders").

```javascript
import http from "k6/http";
import { check, group } from "k6";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const LOGIN_EMAIL = __ENV.LOGIN_EMAIL || "test@eshop.com";
const LOGIN_PASSWORD = __ENV.LOGIN_PASSWORD || "Test1234!";

let cachedToken = null;

export default function () {
  // Login once per VU lifetime, not every iteration
  if (__ITER === 0) {
    group("auth", () => {
      const res = http.post(
        `${BASE_URL}/api/login`,
        JSON.stringify({
          email: LOGIN_EMAIL,
          password: LOGIN_PASSWORD,
        }),
        { headers: { "Content-Type": "application/json" } },
      );

      check(res, { "login succeeded": (r) => r.status === 200 });
      cachedToken = res.json("token");
    });
  }

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${cachedToken}`,
  };

  const res = http.get(`${BASE_URL}/api/target-endpoint`, { headers });
  console.log(JSON.stringify(res.json()));

  check(res, {
    "status is 200": (r) => r.status === 200,
    "response has expected field": (r) => r.json("id") !== undefined,
  });
}

export function handleSummary(data) {
  return {
    "spec/baseline-summary.json": JSON.stringify(data, null, 2),
  };
}
```

**Critical detail:** The `group('auth', ...)` wrapper tags the login request separately. In k6 metrics, you can then filter by group name to isolate endpoint latency from login latency. The `__ITER === 0` guard ensures login happens exactly once per VU, not on every request.

## Pattern C — No Auth Required

If `requires_auth` is `false`, omit all login logic:

```javascript
import http from "k6/http";
import { check } from "k6";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";

export default function () {
  const res = http.get(`${BASE_URL}/api/target-endpoint`);
  console.log(JSON.stringify(res.json()));

  check(res, {
    "status is 200": (r) => r.status === 200,
  });
}

export function handleSummary(data) {
  return {
    "spec/baseline-summary.json": JSON.stringify(data, null, 2),
  };
}
```

## Common Mistakes to Avoid

| Mistake                                        | Consequence                                                                                   | Fix                                               |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Login inside the VU loop without `group()`     | Login latency pollutes endpoint metrics                                                       | Wrap in `group('auth')` or move to `setup()`      |
| Hardcoded credentials                          | Credentials in source control, non-portable script                                            | Use `__ENV.VAR_NAME`                              |
| No `check()` on login response                 | Script proceeds with a `null` token and every endpoint call returns 401 — baseline is invalid | Always check login status and throw on failure    |
| Using `--summary-export` CLI flag              | Deprecated, removed in k6 v0.54+                                                              | Use `handleSummary()`                             |
| Forgetting `JSON.stringify` in `handleSummary` | Output file contains `[object Object]`                                                        | Always stringify: `JSON.stringify(data, null, 2)` |

## Determining `requires_auth` from the API Spec

Look for these signals in the API specification:

- Explicit statement: "requires `Authorization: Bearer <token>` header"
- Endpoint listed under an "authenticated" section
- Presence of user-specific data in the response schema (e.g., `user_id`, `my_orders`)
- Error response documents a `401 Unauthorized` case

If the spec is ambiguous, make a test call without a token. A `401` or `403` response confirms auth is required.
