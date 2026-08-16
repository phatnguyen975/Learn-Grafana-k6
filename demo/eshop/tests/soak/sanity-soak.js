/**
 * sanity-soak.js
 * ============================================================
 * Sanity check script for the soak test endpoints.
 * Runs 1 VU x 1 iteration to verify:
 *   1. GET /api/products returns 200 with an array body
 *   2. Login succeeds and token is valid
 *   3. GET /api/orders/my-orders returns 200 with an array body
 *
 * Run before the full soak test to confirm SUT is healthy.
 * Usage:
 *   k6 run tests/soak/sanity-soak.js
 * ============================================================
 */

import http from "k6/http";
import { check, sleep, group } from "k6";
import { SharedArray } from "k6/data";
import papaparse from "https://jslib.k6.io/papaparse/5.1.1/index.js";
import { textSummary } from "https://jslib.k6.io/k6-summary/0.0.2/index.js";

import { BASE_URL, DEFAULT_HEADERS } from "../config/env.js";

export const options = {
  vus: 1,
  iterations: 1,
  thresholds: {
    http_req_duration: ["p(95)<2000"],
    http_req_failed: ["rate<0.01"],
    checks: ["rate==1"], // ALL checks must pass for sanity to be PASS
  },
};

const credentials = new SharedArray("sanity-credentials", function () {
  return papaparse.parse(open("./soak.csv"), { header: true }).data;
});

export default function () {
  const row = credentials[0]; // Use first row for sanity check
  let token = null;

  // ── Step 1: Login ──────────────────────────────────────────────────────────
  group("sanity: login", () => {
    console.log(`Sanity: logging in as ${row.email}`);
    const loginRes = http.post(
      `${BASE_URL}/api/login`,
      JSON.stringify({ email: row.email, password: row.password }),
      { headers: DEFAULT_HEADERS },
    );

    const loginOk = check(loginRes, {
      "login: status 200": (r) => r.status === 200,
      "login: has token": (r) => r.json("token") !== null && r.json("token") !== undefined,
    });

    if (!loginOk) {
      console.error(
        `SANITY FAIL — login: status=${loginRes.status} body=${loginRes.body.substring(0, 300)}`,
      );
    } else {
      token = loginRes.json("token");
      console.log(`Sanity: login OK, token acquired (first 20 chars): ${token.substring(0, 20)}...`);
    }
  });

  sleep(0.5);

  // ── Step 2: GET /api/products ──────────────────────────────────────────────
  group("sanity: GET /api/products", () => {
    const res = http.get(`${BASE_URL}/api/products`, {
      headers: DEFAULT_HEADERS,
      tags: { endpoint: "products" },
    });

    const ok = check(res, {
      "products: status 200": (r) => r.status === 200,
      "products: body is non-empty array": (r) => {
        try {
          const body = r.json();
          return Array.isArray(body) && body.length > 0;
        } catch {
          return false;
        }
      },
      "products: response time < 2000ms": (r) => r.timings.duration < 2000,
    });

    if (!ok) {
      console.error(
        `SANITY FAIL — products: status=${res.status} body=${res.body.substring(0, 300)}`,
      );
    } else {
      const products = res.json();
      console.log(
        `Sanity: GET /api/products OK — ${products.length} products returned, duration=${res.timings.duration.toFixed(1)}ms`,
      );
    }
  });

  sleep(0.5);

  // ── Step 3: GET /api/orders/my-orders ─────────────────────────────────────
  group("sanity: GET /api/orders/my-orders", () => {
    if (!token) {
      console.error("SANITY SKIP — orders/my-orders: no token (login failed)");
      return;
    }

    const res = http.get(`${BASE_URL}/api/orders/my-orders`, {
      headers: Object.assign({}, DEFAULT_HEADERS, {
        Authorization: `Bearer ${token}`,
      }),
      tags: { endpoint: "orders-my-orders" },
    });

    const ok = check(res, {
      "orders/my-orders: status 200": (r) => r.status === 200,
      "orders/my-orders: body is array": (r) => {
        try {
          return Array.isArray(r.json());
        } catch {
          return false;
        }
      },
      "orders/my-orders: response time < 2000ms": (r) => r.timings.duration < 2000,
    });

    if (!ok) {
      console.error(
        `SANITY FAIL — orders/my-orders: status=${res.status} body=${res.body.substring(0, 300)}`,
      );
    } else {
      console.log(
        `Sanity: GET /api/orders/my-orders OK — duration=${res.timings.duration.toFixed(1)}ms`,
      );
    }
  });
}

export function teardown() {
  console.log("Sanity teardown: no cleanup required (read-only sanity check).");
}

export function handleSummary(summaryData) {
  const checksPassed = summaryData.metrics.checks?.values?.passes || 0;
  const checksFailed = summaryData.metrics.checks?.values?.fails || 0;
  const verdict = checksFailed === 0 ? "✅ SANITY PASS" : "❌ SANITY FAIL";
  console.log(`\n${verdict} — ${checksPassed} checks passed, ${checksFailed} failed\n`);

  return {
    stdout: textSummary(summaryData, { indent: "  ", enableColors: true }),
  };
}
