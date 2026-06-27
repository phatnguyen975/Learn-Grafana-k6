import http from "k6/http";
import { check, sleep } from "k6";
// Import the custom Go extension using the registered path
import mycrypto from "k6/x/mycrypto";

export const options = {
  vus: 2,
  duration: "5s",
};

export default function () {
  const userId = `user_${__VU}_${__ITER}`;
  const secretSalt = "PROD_SALT_8899";

  // Call the compiled Go function natively
  const secureHash = mycrypto.GenerateCustomHash(userId, secretSalt);

  console.log(`[VU ${__VU}] Generated Hash for ${userId}: ${secureHash}`);

  // Use the hash in a standard HTTP request
  const payload = JSON.stringify({
    user: userId,
    token: secureHash,
  });

  const params = { headers: { "Content-Type": "application/json" } };
  const res = http.post("https://httpbin.test.k6.io/post", payload, params);

  check(res, {
    "status is 200": (r) => r.status === 200,
    "hash accepted": (r) => {
      const body = JSON.parse(r.body);
      return body.json.token === secureHash;
    },
  });

  sleep(1);
}
