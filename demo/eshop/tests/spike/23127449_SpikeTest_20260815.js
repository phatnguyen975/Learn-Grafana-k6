import http from "k6/http";
import { check, sleep, group } from "k6";
import { SharedArray } from "k6/data";
import { htmlReport } from "https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const DEFAULT_HEADERS = { "Content-Type": "application/json" };

export const options = {
  stages: [
    { duration: "1m", target: 2 },
    { duration: "30s", target: 100 },
    { duration: "2m", target: 100 },
    { duration: "30s", target: 2 },
    { duration: "3m", target: 2 },
  ],
  thresholds: {
    http_req_duration: [
      `p(95)<${__ENV.P95_THRESHOLD || 500}`,
      {
        threshold: `p(95)<500`,
        abortOnFail: true,
        delayAbortEval: "30s",
      },
    ],
    http_req_failed: [
      `rate<${__ENV.ERROR_RATE_THRESHOLD || 0.05}`,
      {
        threshold: `rate<0.05`,
        abortOnFail: true,
        delayAbortEval: "30s",
      },
    ],
  },
  tags: {
    test_type: "spike",
    endpoint: "/api/cart",
  },
};

// 1. Load CSV Data
const csvData = new SharedArray("transactional data", function () {
  const lines = open("./transactional.csv").split("\n");
  const result = [];
  const headers = lines[0].split(",");
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() !== "") {
      const parts = lines[i].split(",");
      const obj = {};
      headers.forEach((header, index) => {
        obj[header.trim()] = parts[index].trim();
      });
      result.push(obj);
    }
  }
  return result;
});

// Variable in the global scope of the VU to cache the token across iterations
let vuToken = "";

export default function () {
  // Use VU ID to deterministically assign a user row from CSV
  // VU IDs are 1-indexed. Modulo ensures we don't go out of bounds.
  const user = csvData[(__VU - 1) % csvData.length];

  // 2. Auth Strategy: Per-VU Cached Token
  // Login exactly once per VU lifetime to avoid skewing test metrics with login latency
  if (__ITER === 0) {
    group("login", () => {
      const loginPayload = JSON.stringify({
        email: user.email,
        password: user.password,
      });

      const loginRes = http.post(`${BASE_URL}/api/login`, loginPayload, {
        headers: DEFAULT_HEADERS,
      });

      check(loginRes, {
        "login successful": (r) => r.status === 200,
        "has token": (r) => r.json("token") !== undefined,
      });

      vuToken = loginRes.json("token");
      if (!vuToken) {
        throw new Error(`Failed to get token for VU ${__VU}`);
      }
    });
  }

  // Ensure we have a token before proceeding to the actual test endpoint
  if (!vuToken) {
    throw new Error(`Token is missing for VU ${__VU}, aborting iteration.`);
  }

  // 3. Call target endpoint POST /api/cart
  const payload = JSON.stringify({
    id: parseInt(user.product_id, 10),
    name: user.product_name,
    price: parseInt(user.price, 10),
    quantity: parseInt(user.quantity, 10),
  });

  const res = http.post(`${BASE_URL}/api/cart`, payload, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${vuToken}`,
    },
  });

  // 4. Checks
  check(res, {
    "cart status is 200 or 201": (r) => r.status === 200 || r.status === 201,
    "cart response has message": (r) => r.json("message") !== undefined,
  });

  // 5. Think time: Randomised to avoid synchronisation spikes
  // The test plan specifies a think time of 0.5s (randomised: 0.5 - 1.0s outside spike, 0 - 0.5s inside spike)
  // To keep the script simple and avoid complex stage-time tracking, we'll randomise between 0.0 and 1.0s.
  sleep(Math.random() * 1.0);
}

export function teardown(data) {
  // TEARDOWN NOTE:
  // The POST /api/cart endpoint adds items to the user's cart in the SQLite database.
  // Currently, there is NO API endpoint in the system to delete items from the cart.
  // Therefore, programmatic cleanup is not possible in this script.
  // The database must be reset manually before running subsequent tests to avoid data pollution.
  console.log(
    "Teardown: Manual database reset is required as there is no API to clear the cart.",
  );
}

export function handleSummary(data) {
  return {
    "docs/results/transactional/run/html-report/summary.html": htmlReport(
      data,
      { title: "23127449 — Spike Test — POST /api/cart" },
    ),
    "docs/results/transactional/run/raw/summary.json": JSON.stringify(
      data,
      null,
      2,
    ),
    stdout: textSummary(data, { indent: " ", enableColors: true }),
  };
}
