import http from "k6/http";
import { check } from "k6";
import { randomString } from "k6/crypto";

export const options = {
  vus: 5,
  duration: "10s",
};

// Helper function to generate a dummy W3C traceparent header
// Format: 00-{trace-id}-{parent-id}-{flags}
function generateTraceparent() {
  const traceId = randomString(32, "hex");
  const spanId = randomString(16, "hex");
  return `00-${traceId}-${spanId}-01`;
}

export default function () {
  const currentTraceId = generateTraceparent();

  // Injecting the trace header. In a real environment with the k6 OTel module,
  // this can be done automatically, but manual injection ensures compatibility with any backend.
  const params = {
    headers: {
      traceparent: currentTraceId,
      "Content-Type": "application/json",
    },
  };

  // httpbin echoes our headers back, allowing us to verify the injection
  const res = http.get("https://httpbin.test.k6.io/headers", params);

  check(res, {
    "status is 200": (r) => r.status === 200,
    "traceparent injected": (r) =>
      r.json("headers.Traceparent") === currentTraceId,
  });
}
