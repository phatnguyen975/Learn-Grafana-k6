import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  vus: 5,
  duration: "5s",
};

export default function() {
  const url = "https://test-api.k6.io/user/register/";

  // 1. Prepare Payload
  // Using random data to avoid uniqueness constraints on the dummy server
  const payload = JSON.stringify({
    username: `testuser_${__VU}_${__ITER}`,
    first_name: "Test",
    last_name: "User",
    email: `testuser_${__VU}_${__ITER}@example.com`,
    password: "password123",
  });

  // 2. Prepare Headers
  const params = {
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  };

  // 3. Execute POST Request
  const res = http.post(url, payload, params);

  // 4. Validate Response (Does not halt execution on failure)
  check(res, {
    "status is 201 Created": (r) => r.status === 201,
    "has valid response body": (r) => r.body.length > 0,
  });

  sleep(1);
}
