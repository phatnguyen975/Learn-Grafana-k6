import http from "k6/http";
import { check } from "k6";
import { textSummary } from "https://jslib.k6.io/k6-summary/0.0.2/index.js";
import { BASE_URL } from "../config/env.js";

// Baseline cold-start performance measurement for the Auth-Heavy (register) endpoint.
export const options = {
  vus: 1,
  duration: "2m",
};

export default function () {
  const url = `${BASE_URL}/api/register`;
  const payload = JSON.stringify({
    name: "Test User",
    email: `perf_baseline_${Date.now()}_${__VU}_${__ITER}@stress.test`,
    password: "Password123!",
  });

  const params = {
    headers: {
      "Content-Type": "application/json",
    },
    tags: {
      endpoint: "/api/register",
      test_type: "baseline",
    },
  };

  const res = http.post(url, payload, params);

  check(res, {
    "status is 200": (r) => r.status === 200,
    "response has message": (r) => r.json("message") !== undefined,
  });

  console.log(JSON.stringify(res.json()));

  // No think time (sleep) specified for baseline single_vu.
}

export function teardown() {
  // TEARDOWN NOTE: No API available — document manually.
  // Records created: test user registrations.
  // Pattern: email LIKE 'perf_baseline_%@stress.test'
  // Manual cleanup required: Delete user directly from DB.
  console.log("Teardown: manual cleanup required — see comment above.");
}

export function handleSummary(data) {
  return {
    "docs/results/auth-heavy/spec/baseline-summary.json": JSON.stringify(
      data,
      null,
      2,
    ),
    stdout: textSummary(data, { indent: " ", enableColors: true }),
  };
}
