# Auth Strategy — read-heavy

> **Date:** 2026-08-14  
> **Endpoint:** `GET /api/orders/:id`  
> **Test Type:** load

## 1. Endpoint Auth Requirement

**Requires authentication:** Yes

**Auth mechanism:** JWT Bearer token obtained via `POST /api/login` (email + password → returns `token` field). Token passed in every subsequent request as `Authorization: Bearer <token>` header.

**Session scope:** Response is **user-specific**. The endpoint enforces order ownership: `GET /api/orders/:id` only returns the order if its `user_id` matches the authenticated user's ID. This means the `(token, order_id)` pair is tightly coupled — each VU must use the credentials that own the order it is requesting.

**JWT TTL:** Not explicitly documented in the API specification. Assume 1 hour. Load test duration is 10 minutes — well within the TTL. No token refresh logic is required.

## 2. Strategy Evaluation

### Strategy 1 — `setup()` Shared Token

| Dimension         | Assessment for this endpoint                                               |
| ----------------- | -------------------------------------------------------------------------- |
| Login burden      | Minimal — 1 login before all VUs start                                     |
| Session realism   | **Low** — all VUs share one user's identity and query the exact same order |
| Token expiry risk | Low — token is fresh at test start                                         |
| CSV impact        | No credential columns needed                                               |
| **Verdict**       | ❌ **Rejected**                                                            |

**Rejected because:** If all VUs share the same token, they all request the exact same database row repeatedly. This produces a skewed result and fails to realistically simulate 20 concurrent users accessing their respective accounts.

### Strategy 2 — Per-VU Cached Token

| Dimension         | Assessment for this endpoint                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------- |
| Login burden      | 20 login requests at VU warm-up (one per VU); not measured in endpoint metrics due to `group()` tagging |
| Session realism   | **High** — each VU authenticates as a distinct user and accesses only that user's own order             |
| Token expiry risk | Low — test duration (10 min) is well under the ~1 hour JWT TTL                                          |
| CSV impact        | Requires `email`, `password`, `order_id` columns — one row per unique user/order pair                   |
| **Verdict**       | ✅ **Selected**                                                                                         |

**Selected because:** This strategy correctly models concurrent access by 20 distinct authenticated users. It accurately represents the real-world scenario of simultaneous "My Orders" viewers. The login burst at VU warm-up is excluded from the metrics via `group('login', ...)`.

### Strategy 3 — Pre-Generated Token in CSV

| Dimension         | Assessment for this endpoint                                                            |
| ----------------- | --------------------------------------------------------------------------------------- |
| Login burden      | None — no login requests during the test                                                |
| Session realism   | High if CSV contains unique tokens per row                                              |
| Token expiry risk | **Moderate** — tokens generated before the test may expire if test execution is delayed |
| CSV impact        | Requires `token`, `order_id` columns; requires pre-test script execution                |
| **Verdict**       | ❌ **Rejected**                                                                         |

**Rejected because:** It adds unnecessary operational complexity (a pre-test token generation script) just to avoid 20 login requests that are already tagged out of the metrics anyway.

## 3. Selected Strategy

**Strategy:** Strategy 2 — Per-VU Cached Token

Each VU logs in once on its first iteration, caches the JWT token in a VU-local variable, and reuses it for all subsequent iterations. This strategy ensures true user-isolation matching real-world traffic patterns.

## 4. Implementation Requirements

| Requirement            | Detail                                                                                              |
| ---------------------- | --------------------------------------------------------------------------------------------------- |
| CSV columns required   | `email`, `password`, `order_id`                                                                     |
| k6 pattern to use      | `SharedArray` to load CSV; VU index: `users[__VU % users.length]`                                   |
| Login tagging          | Login request must be inside `group('login', () => { ... })` to exclude from endpoint metrics       |
| Login failure handling | If login returns non-200 or token is null, `throw new Error(...)` — do not continue with null token |
