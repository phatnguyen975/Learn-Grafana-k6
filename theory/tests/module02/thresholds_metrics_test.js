import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Rate } from "k6/metrics";

// Define Custom Metrics outside the VU function (Init stage)
const loginDuration = new Trend("custom_login_duration");
const loginErrorRate = new Rate("custom_login_error_rate");

export const options = {
  vus: 10,
  duration: "10s",
  thresholds: {
    // Built-in metric threshold: 95% of ALL requests must be below 500ms
    http_req_duration: ["p(95)<500"],
    // Built-in metric threshold: Error rate must be strictly less than 1%
    http_req_failed: ["rate<0.01"],
    // Custom metric threshold: The specific login action must be fast
    custom_login_duration: ["p(95)<600", "p(99)<1000"],
    // Abort test entirely if the custom error rate exceeds 5% immediately
    custom_login_error_rate: [
      { threshold: "rate<0.05", abortOnFail: true, delayAbortEval: "2s" },
    ],
  },
};

export default function() {
  const url = "https://test-api.k6.io/public/crocodiles/1/";
  const res = http.get(url);

  const success = check(res, {
    "status is 200": (r) => r.status === 200,
  });

  // Record data into custom metrics
  loginDuration.add(res.timings.duration);
  loginErrorRate.add(!success);

  sleep(1);
}
