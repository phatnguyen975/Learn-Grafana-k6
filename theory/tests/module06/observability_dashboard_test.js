import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  scenarios: {
    ramp_traffic: {
      executor: "ramping-arrival-rate",
      startRate: 5,
      timeUnit: "1s",
      preAllocatedVUs: 10,
      maxVUs: 50,
      stages: [
        { target: 20, duration: "15s" }, // Ramp up
        { target: 20, duration: "30s" }, // Hold
        { target: 0, duration: "15s" }, // Ramp down
      ],
    },
  },
};

export default function () {
  const res = http.get("https://httpbin.test.k6.io/get");
  check(res, {
    "status is 200": (r) => r.status === 200,
  });
}
