/**
 * 23127449_SoakTest_20260815.js
 * ============================================================
 * Soak (Endurance) Test — EShop SUT
 * Target endpoints: GET /api/products (no auth)
 *                   GET /api/orders/my-orders (Bearer token)
 *
 * Hardware profile: 2 vCPU / 1 GB RAM container
 * Workload: 15 VUs sustained for 15 minutes
 *   - 2 min ramp-up
 *   - 10 min sustained flat
 *   - 3 min cool-down
 *
 * Auth strategy: Per-VU cached token (login once at __ITER === 0)
 * Data source:   tests/load/read-heavy.csv (reused seeded users)
 * Output:
 *   docs/results/endurance/raw/summary.json
 * ============================================================
 */

import http from "k6/http";
import { check, sleep, group } from "k6";
import { SharedArray } from "k6/data";
import papaparse from "https://jslib.k6.io/papaparse/5.1.1/index.js";
import { textSummary } from "https://jslib.k6.io/k6-summary/0.0.2/index.js";

// ─── Stage Design ─────────────────────────────────────────────────────────────
// Phase 0: Ramp-up   — 0 → 15 VUs over 2 minutes
// Phase 1: Sustained — 15 VUs flat for 10 minutes (primary measurement window)
// Phase 2: Cool-down — 15 → 0 VUs over 3 minutes
// Total: 15 minutes

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const DEFAULT_HEADERS = { "Content-Type": "application/json" };

const SOAK_STAGES = [
  { duration: "2m", target: 15 }, // ramp-up: gradual connection establishment
  { duration: "10m", target: 15 }, // sustained: primary endurance window
  { duration: "3m", target: 0 }, // cool-down: observe memory/latency recovery
];

// ─── SLO Thresholds ───────────────────────────────────────────────────────────
// p95 < 100ms: aligned with load test SLO for read endpoints
// error rate < 1%: zero tolerance for sustained read failures
export const options = {
  stages: SOAK_STAGES,
  thresholds: {
    // Overall p95 across both endpoints must stay below 100ms
    http_req_duration: ["p(95)<100"],
    // Error rate must stay below 1%
    http_req_failed: ["rate<0.01"],
    // Tagged thresholds: products endpoint (no auth, faster)
    "http_req_duration{endpoint:products}": ["p(95)<50"],
    // Tagged thresholds: orders endpoint (auth'd, slightly slower)
    "http_req_duration{endpoint:orders-my-orders}": ["p(95)<100"],
  },
  // Tag all requests with test metadata for Grafana filtering
  tags: {
    test_type: "soak",
    student_id: "23127449",
  },
};

// ─── Test Data ────────────────────────────────────────────────────────────────
// Reuse the soak CSV which contains 20 seeded users with valid credentials
// SharedArray loads the CSV once and shares it across all VUs (memory-efficient)
const credentials = new SharedArray("soak-credentials", function () {
  return papaparse.parse(open("./soak.csv"), { header: true }).data;
});

// ─── Per-VU State ─────────────────────────────────────────────────────────────
// cachedToken is per-VU (not shared) — each VU logs in once and reuses its token
let cachedToken = null;

// ─── Default Function (VU loop) ───────────────────────────────────────────────
export default function () {
  // ── Step 1: Login once per VU (at first iteration only) ─────────────────────
  if (__ITER === 0) {
    const row = credentials[__VU % credentials.length];

    group("login", () => {
      const loginRes = http.post(
        `${BASE_URL}/api/login`,
        JSON.stringify({ email: row.email, password: row.password }),
        { headers: DEFAULT_HEADERS },
      );

      check(loginRes, {
        "login: status 200": (r) => r.status === 200,
        "login: has token": (r) => r.json("token") !== null,
      });

      cachedToken = loginRes.json("token");

      if (!cachedToken) {
        throw new Error(
          `[VU ${__VU}] Login failed — status ${loginRes.status}: ${loginRes.body.substring(0, 200)}`,
        );
      }
    });

    // Brief pause after login before starting the main workload
    // This prevents a thundering herd of logins at t=0
    sleep(0.5);
  }

  // ── Step 2: GET /api/products (unauthenticated read) ─────────────────────────
  // This is the highest-frequency operation in a real e-commerce app
  const productsRes = http.get(`${BASE_URL}/api/products`, {
    headers: DEFAULT_HEADERS,
    tags: { endpoint: "products" },
  });

  check(productsRes, {
    "products: status 200": (r) => r.status === 200,
    "products: response is array": (r) => {
      try {
        const body = r.json();
        return Array.isArray(body);
      } catch {
        return false;
      }
    },
    "products: response time < 2000ms": (r) => r.timings.duration < 2000,
  });

  if (productsRes.status !== 200) {
    console.error(
      `[VU ${__VU} ITER ${__ITER}] products: unexpected status ${productsRes.status} — ${productsRes.body.substring(0, 200)}`,
    );
  }

  // Small pause between the two requests within one iteration
  // Simulates a user reading the product list before checking orders
  sleep(0.3 + Math.random() * 0.4); // 300-700ms between requests

  // ── Step 3: GET /api/orders/my-orders (authenticated read) ────────────────────
  // Tests the full auth middleware stack + DB join query under sustained load
  const ordersRes = http.get(`${BASE_URL}/api/orders/my-orders`, {
    headers: Object.assign({}, DEFAULT_HEADERS, {
      Authorization: `Bearer ${cachedToken}`,
    }),
    tags: { endpoint: "orders-my-orders" },
  });

  check(ordersRes, {
    "orders/my-orders: status 200": (r) => r.status === 200,
    "orders/my-orders: response is array": (r) => {
      try {
        const body = r.json();
        return Array.isArray(body);
      } catch {
        return false;
      }
    },
    "orders/my-orders: response time < 2000ms": (r) =>
      r.timings.duration < 2000,
  });

  if (ordersRes.status !== 200) {
    console.error(
      `[VU ${__VU} ITER ${__ITER}] orders/my-orders: unexpected status ${ordersRes.status} — ${ordersRes.body.substring(0, 200)}`,
    );
  }

  // ── Step 4: Think time (user "processing" pause) ─────────────────────────────
  // Random 1-3 seconds — models a realistic browsing pause
  // This prevents artificially high RPS and makes the soak pattern realistic
  sleep(1 + Math.random() * 2);
}

// ─── Teardown ─────────────────────────────────────────────────────────────────
export function teardown(data) {
  // TEARDOWN NOTE: This soak test is entirely read-only.
  // No data was created, modified, or deleted during test execution.
  // No cleanup is required.
  console.log(
    "Teardown: soak test is read-only — no cleanup required. All tokens expire naturally within 1 hour.",
  );
}

// ─── handleSummary ────────────────────────────────────────────────────────────
export function handleSummary(summaryData) {
  return {
    // Structured JSON summary for AI analysis and reporting
    "docs/results/endurance/raw/summary.json": JSON.stringify(
      summaryData,
      null,
      2,
    ),
    // Human-readable terminal output with colors
    stdout: textSummary(summaryData, { indent: "  ", enableColors: true }),
  };
}
