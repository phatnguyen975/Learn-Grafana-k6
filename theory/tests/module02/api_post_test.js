import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  vus: 5,
  duration: "5s",
};

export default function () {
  const url = "https://httpbin.org/post";
  const uniqueId = `${Date.now()}_${__VU}_${__ITER}`;

  const payload = JSON.stringify({
    username: `user_${uniqueId}`,
    first_name: "Test",
    last_name: "User",
    email: `user_${uniqueId}@example.com`,
  });

  const params = {
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  };

  // Execute the POST request
  const res = http.post(url, payload, params);

  // Validate the response with safe JSON parsing
  check(res, {
    "status is 200 OK": (r) => r.status === 200,
    "payload was received correctly": (r) => {
      if (r.status === 200) {
        try {
          // Safe parse: prevents script crash if response body is malformed
          const body = JSON.parse(r.body);
          return body.json.username === `user_${uniqueId}`;
        } catch (e) {
          return false; // Fail the check gracefully if parsing fails
        }
      }
      return false;
    },
  });

  sleep(1);
}
