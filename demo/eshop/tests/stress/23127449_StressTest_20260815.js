import http from "k6/http";
import { check, sleep } from "k6";
import exec from "k6/execution";
import { SharedArray } from "k6/data";
import papaparse from "https://jslib.k6.io/papaparse/5.1.1/index.js";
import { textSummary } from "https://jslib.k6.io/k6-summary/0.0.2/index.js";
import { htmlReport } from "https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const DEFAULT_HEADERS = { "Content-Type": "application/json" };

export const options = {
  stages: [
    { duration: "2m", target: 10 },
    { duration: "2m", target: 15 },
    { duration: "2m", target: 25 },
    { duration: "2m", target: 40 },
    { duration: "2m", target: 60 },
    { duration: "2m", target: 90 },
    { duration: "2m", target: 130 },
    { duration: "1m", target: 0 },
  ],
  thresholds: {
    http_req_duration: [
      `p(95)<${__ENV.P95_THRESHOLD || 200}`,
      {
        threshold: `p(95)<200`,
        abortOnFail: true,
        delayAbortEval: "30s",
      },
    ],
    http_req_failed: [
      `rate<${__ENV.ERROR_RATE_THRESHOLD || 0.05}`,
      {
        threshold: `rate<0.10`,
        abortOnFail: true,
        delayAbortEval: "30s",
      },
    ],
  },
};

// Load CSV data using SharedArray
const data = new SharedArray("dataset-name", function () {
  return papaparse.parse(open("./auth-heavy.csv"), { header: true }).data;
});

export default function () {
  // Get a globally unique row per iteration
  const row = data[exec.scenario.iterationInTest % data.length];

  const payload = JSON.stringify({
    name: row.name,
    email: row.email,
    password: row.password,
  });

  // Main register request
  const res = http.post(`${BASE_URL}/api/register`, payload, {
    headers: DEFAULT_HEADERS,
    tags: { endpoint: "/api/register", test_type: "stress" },
  });

  // Verify response
  check(res, {
    "status is 200 or 201": (r) => r.status === 200 || r.status === 201,
    "response has a body": (r) => r.body && r.body.length > 0,
    "response time < 2000ms": (r) => r.timings.duration < 2000,
  });

  // Randomised think time between 0.5s and 1.0s
  sleep(Math.random() * 0.5 + 0.5);
}

export function teardown() {
  // TEARDOWN NOTE: this test created N user records via POST /api/register.
  console.log(
    "Teardown: no API available for cleanup — manual DB cleanup required.",
  );
}

export function handleSummary(data) {
  return {
    "docs/results/auth-heavy/run/html-report/summary.html": htmlReport(data, {
      title: "23127449 — Stress Test — POST /api/register",
    }),
    "docs/results/auth-heavy/run/raw/summary.json": JSON.stringify(
      data,
      null,
      2,
    ),
    stdout: textSummary(data, { indent: " ", enableColors: true }),
  };
}
