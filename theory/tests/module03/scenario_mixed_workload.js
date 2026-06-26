import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  discardResponseBodies: true, // Best practice: saves memory when you don't need to parse bodies

  scenarios: {
    // Scenario 1: Open Model (Background Traffic running for 1 minute)
    background_api_calls: {
      executor: "constant-arrival-rate",
      rate: 10,
      timeUnit: "1s",
      duration: "60s",
      preAllocatedVUs: 10,
      maxVUs: 50,
      exec: "backgroundFlow", // Maps to the specific function below
    },

    // Scenario 2: Closed Model (Spike Traffic starting after 15 seconds)
    sudden_user_spike: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "10s", target: 30 }, // Fast ramp-up to 30 VUs
        { duration: "20s", target: 30 }, // Hold for 20s
        { duration: "10s", target: 0 }, // Ramp-down
      ],
      startTime: "15s", // Delays the execution of this scenario
      exec: "spikeFlow", // Maps to the specific function below
    },
  },
};

// Isolated logic for Scenario 1
export function backgroundFlow() {
  const res = http.get("https://httpbin.org/get?source=background");
  check(res, { "background GET 200": (r) => r.status === 200 });
}

// Isolated logic for Scenario 2
export function spikeFlow() {
  const payload = JSON.stringify({ action: "urgent_login" });
  const params = { headers: { "Content-Type": "application/json" } };

  const res = http.post("https://httpbin.org/post", payload, params);
  check(res, { "spike POST 200": (r) => r.status === 200 });

  sleep(1); // Sleep is necessary in Closed models to simulate user think-time
}
