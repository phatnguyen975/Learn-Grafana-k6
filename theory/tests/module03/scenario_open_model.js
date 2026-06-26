import http from "k6/http";
import { check } from "k6";

export const options = {
  scenarios: {
    steady_traffic: {
      executor: "constant-arrival-rate",
      // Our goal: 20 requests per second
      rate: 20,
      timeUnit: "1s",
      duration: "30s",
      // We must pre-allocate VUs that k6 can use to sustain the rate
      preAllocatedVUs: 20,
      // If the server slows down, k6 is allowed to spin up to 100 VUs to keep hitting 20 RPS
      maxVUs: 100,
    },
  },
};

export default function () {
  const res = http.get("https://httpbin.org/get");
  check(res, { "status is 200": (r) => r.status === 200 });
  // Notice: NO sleep() here. In an Open Model, k6 controls the pacing, not the VU logic.
}
