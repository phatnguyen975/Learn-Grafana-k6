import http from "k6/http";
import { check, sleep, group } from "k6";
import { SharedArray } from "k6/data";
import papaparse from "https://jslib.k6.io/papaparse/5.1.1/index.js";
import { htmlReport } from "https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js";
import { textSummary } from "https://jslib.k6.io/k6-summary/0.0.2/index.js";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const DEFAULT_HEADERS = { "Content-Type": "application/json" };

export function login(baseUrl, email, password) {
  let token = null;
  group("login", () => {
    const res = http.post(
      `${baseUrl}/api/login`,
      JSON.stringify({ email, password }),
      { headers: { "Content-Type": "application/json" } },
    );
    check(res, { "login: status 200": (r) => r.status === 200 });
    token = res.json("token");
    if (!token) {
      throw new Error(`login failed with status ${res.status}: ${res.body}`);
    }
  });
  return token;
}

export const options = {
  stages: [
    { duration: "2m", target: 20 },
    { duration: "6m", target: 20 },
    { duration: "2m", target: 0 },
  ],
  thresholds: {
    http_req_duration: [`p(95)<${__ENV.P95_THRESHOLD || 100}`],
    http_req_failed: [`rate<${__ENV.ERROR_RATE_THRESHOLD || 0.001}`],
  },
};

const data = new SharedArray("read-heavy-dataset", function () {
  return papaparse.parse(open("./read-heavy.csv"), { header: true }).data;
});

let cachedToken = null;

export default function () {
  const row = data[__VU % data.length];

  if (__ITER === 0) {
    cachedToken = login(BASE_URL, row.email, row.password);
  }

  const url = `${BASE_URL}/api/orders/${row.order_id}`;
  const params = {
    headers: Object.assign({}, DEFAULT_HEADERS, {
      Authorization: `Bearer ${cachedToken}`,
    }),
    tags: { endpoint: "/api/orders/:id", test_type: "load" },
  };

  const res = http.get(url, params);

  const ok = check(res, {
    "status is 200": (r) => r.status === 200,
    "response has order id": (r) => r.json("id") !== undefined,
    "response time < 2000ms": (r) => r.timings.duration < 2000,
  });

  if (!ok) {
    console.error(
      `[VU ${__VU}] Unexpected: ${res.status} — ${res.body.substring(0, 200)}`,
    );
  }

  // Think time: 1-2 seconds (randomised)
  sleep(Math.random() * 1 + 1);
}

export function teardown() {
  // TEARDOWN NOTE: No delete API is available for records created by this test.
  // Test data created: N/A (read-only workload, no data created during test execution).
  // The seed data was created prior to the test.
  console.log(
    "Teardown: no API available for cleanup — manual DB cleanup required.",
  );
}

export function handleSummary(summaryData) {
  return {
    "docs/results/read-heavy/run/html-report/summary.html": htmlReport(
      summaryData,
      {
        title: "23127449 — Load Test — GET /api/orders/:id",
      },
    ),
    "docs/results/read-heavy/run/raw/summary.json": JSON.stringify(
      summaryData,
      null,
      2,
    ),
    stdout: textSummary(summaryData, { indent: " ", enableColors: true }),
  };
}
