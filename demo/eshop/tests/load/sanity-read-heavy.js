import http from "k6/http";
import { check, group } from "k6";
import { SharedArray } from "k6/data";
import papaparse from "https://jslib.k6.io/papaparse/5.1.1/index.js";
import { textSummary } from "https://jslib.k6.io/k6-summary/0.0.2/index.js";

// Base URL configuration (hardcoded for sanity script)
const BASE_URL = "http://localhost:3000";

// k6 options: Sanity execution with 1 VU and 1 iteration
export const options = {
  vus: 1,
  iterations: 1,
};

// Load CSV dataset using SharedArray (read-heavy dataset containing email, password, order_id)
const data = new SharedArray("read-heavy-dataset", function () {
  return papaparse.parse(open("./read-heavy.csv"), { header: true })
    .data;
});

// VU-local cached token for Per-VU authentication strategy
let cachedToken = null;

export default function () {
  // Access row 0 directly for sanity 1-iteration verification
  const row = data[0];

  // Strategy 2: Per-VU cached token (login on first iteration)
  if (__ITER === 0) {
    console.log(`Debug Row: ${JSON.stringify(row)}`);
    group("login", () => {
      const loginPayload = JSON.stringify({
        email: row.email,
        password: row.password,
      });
      const loginParams = {
        headers: { "Content-Type": "application/json" },
      };

      const res = http.post(`${BASE_URL}/api/login`, loginPayload, loginParams);
      check(res, {
        "login: status 200": (r) => r.status === 200,
      });

      cachedToken = res.json("token");
      if (!cachedToken) {
        throw new Error(
          `VU ${__VU}: login failed with status ${res.status}: ${res.body}`,
        );
      }
    });
  }

  // Target request: GET /api/orders/:id
  const url = `${BASE_URL}/api/orders/${row.order_id}`;
  const params = {
    headers: {
      Authorization: `Bearer ${cachedToken}`,
      "Content-Type": "application/json",
    },
    tags: { endpoint: "/api/orders/:id", test_type: "sanity" },
  };

  const response = http.get(url, params);

  // Print response body to stdout for human inspection
  console.log(JSON.stringify(response.json()));

  // Sanity assertions
  check(response, {
    "status is 200": (r) => r.status === 200,
    "response has order id": (r) => r.json("id") !== undefined,
    "response time < 2000ms": (r) => r.timings.duration < 2000,
  });
}

// Teardown phase: Clean up test state (if applicable)
export function teardown() {
  // TEARDOWN NOTE: No delete API available.
  // Records read: Order details for GET /api/orders/:id
  // Manual cleanup required: N/A (read-only request)
  console.log("Teardown: manual cleanup required — see comment above.");
}

// Custom summary handler: Output results to JSON file and stdout
export function handleSummary(summaryData) {
  return {
    "docs/results/read-heavy/build/sanity-result.json": JSON.stringify(summaryData, null, 2),
    stdout: textSummary(summaryData, { indent: " ", enableColors: true }),
  };
}
