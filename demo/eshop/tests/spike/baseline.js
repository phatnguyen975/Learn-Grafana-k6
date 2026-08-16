import http from "k6/http";
import { check, sleep } from "k6";
import { textSummary } from "https://jslib.k6.io/k6-summary/0.0.2/index.js";

import { BASE_URL, DEFAULT_HEADERS } from "../config/env.js";
import { login } from "../lib/auth.js";

export const options = {
  vus: 1,
  duration: "2m",
};

// Test credentials
const TEST_EMAIL = "test@eshop.com";
const TEST_PASSWORD = "Test1234!";

let cachedToken = null;

export default function () {
  // Login once per VU and cache the token
  if (__ITER === 0) {
    cachedToken = login(BASE_URL, TEST_EMAIL, TEST_PASSWORD);
  }

  const url = `${BASE_URL}/api/cart`;
  const payload = JSON.stringify({
    id: 1,
    name: "Sản phẩm A",
    price: 100000,
    quantity: 2,
  });

  const params = {
    headers: Object.assign({}, DEFAULT_HEADERS, {
      Authorization: `Bearer ${cachedToken}`,
    }),
    tags: { endpoint: "/api/cart", test_type: "baseline" },
  };

  const res = http.post(url, payload, params);

  const ok = check(res, {
    "status is 200": (r) => r.status === 200,
    "response has no error": (r) => !r.json("error"),
  });

  if (!ok) {
    console.error(
      `[VU ${__VU}][ITER ${__ITER}] Unexpected status ${res.status}: ${res.body.substring(0, 200)}`,
    );
  }

  // Log the first response body for human inspection to verify it works
  if (__ITER === 0) {
    console.log(`First request baseline response body: ${res.body}`);
  }

  // Minimal think time for baseline to measure pure response time without overwhelming the server
  sleep(1);
}

// When executing with `k6 run tests/spike/baseline.js` from the project root,
// k6 resolves this output path relative to the current working directory (the root).
export function handleSummary(data) {
  return {
    "docs/results/transactional/spec/baseline-summary.json": JSON.stringify(
      data,
      null,
      2,
    ),
    stdout: textSummary(data, { indent: " ", enableColors: true }),
  };
}
