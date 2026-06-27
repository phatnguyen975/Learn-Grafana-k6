import http from "k6/http";
import { check, sleep } from "k6";
import { SharedArray } from "k6/data";

// 1. INIT STAGE: Load data into a SharedArray (Memory Efficient)
const users = new SharedArray("test users", function () {
  // open() is a k6 built-in function to read local files
  const fileContent = open("./users.json");
  return JSON.parse(fileContent);
});

export const options = {
  vus: 3,
  iterations: 6, // 6 total iterations shared across 3 VUs
};

export default function () {
  // 2. Pick a random user from the SharedArray
  const randomUser = users[Math.floor(Math.random() * users.length)];

  // --- STEP A: SIMULATE LOGIN ---
  const loginUrl = "https://httpbin.org/post";
  const loginPayload = JSON.stringify({
    user: randomUser.username,
    pass: randomUser.password,
  });
  const loginParams = { headers: { "Content-Type": "application/json" } };

  const loginRes = http.post(loginUrl, loginPayload, loginParams);

  // Simulate token extraction (httpbin echoes our payload back in the 'json' field)
  let fakeAuthToken = "";
  if (loginRes.status === 200) {
    const responseBody = JSON.parse(loginRes.body);
    // Pretend the server generated a token based on the username
    fakeAuthToken = `TOKEN_FOR_${responseBody.json.user}`;
  }

  // --- STEP B: USE TOKEN IN SUBSEQUENT REQUEST ---
  const profileUrl = "https://httpbin.org/bearer"; // Endpoint that expects a Bearer token
  const profileParams = {
    headers: {
      Authorization: `Bearer ${fakeAuthToken}`,
      Accept: "application/json",
    },
  };

  const profileRes = http.get(profileUrl, profileParams);

  check(profileRes, {
    "Profile fetch successful (200)": (r) => r.status === 200,
    "Token was authenticated": (r) => r.body.includes('authenticated": true'),
  });

  sleep(1);
}
