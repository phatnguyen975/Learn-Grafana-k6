import http from "k6/http";
import { check } from "k6";
import { SharedArray } from "k6/data";
import papaparse from "https://jslib.k6.io/papaparse/5.1.1/index.js";
import { textSummary } from "https://jslib.k6.io/k6-summary/0.0.2/index.js";

// Configuration
const BASE_URL = "http://localhost:3000";

export const options = {
  vus: 1,
  iterations: 1,
};

// Load CSV data using SharedArray
const data = new SharedArray("auth-heavy-data", function () {
  return papaparse.parse(open("./auth-heavy.csv"), { header: true }).data;
});

export default function () {
  const row = data[0];
  const payload = JSON.stringify({
    name: row.name,
    email: row.email,
    password: row.password,
  });

  const headers = { "Content-Type": "application/json" };

  // POST /api/register request
  const res = http.post(`${BASE_URL}/api/register`, payload, {
    headers: headers,
    tags: { endpoint: "/api/register", test_type: "sanity" },
  });

  try {
    console.log(JSON.stringify(res.json()));
  } catch (e) {
    console.log("Could not parse JSON. Body:", res.body);
  }

  // Verify response
  check(res, {
    "status is 200 or 201": (r) => r.status === 200 || r.status === 201,
    "response has a body": (r) => r.body && r.body.length > 0,
    "response time < 2000ms": (r) => r.timings.duration < 2000,
  });
}

// Summary export
export function handleSummary(data) {
  return {
    "docs/results/auth-heavy/build/sanity-result.json": JSON.stringify(
      data,
      null,
      2,
    ),
    stdout: textSummary(data, { indent: " ", enableColors: true }),
  };
}
