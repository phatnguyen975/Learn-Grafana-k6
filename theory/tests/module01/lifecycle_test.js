import http from "k6/http";
import { sleep } from "k6";

// 1. INIT STAGE
// Loading configurations or defining constants.
const BASE_URL = "https://test.k6.io";
console.log("INIT: Loading script and configuring VUs...");

export const options = {
  vus: 2, // 2 Virtual Users
  iterations: 4, // Total 4 iterations shared across VUs
};

// 2. SETUP STAGE
export function setup() {
  console.log("SETUP: Preparing test data... (Runs once)");
  // Simulate fetching a configuration or initial state
  const targetEndpoint = "/contacts.php";
  return { endpoint: targetEndpoint }; // Passed to default and teardown
}

// 3. VU STAGE
export default function(data) {
  console.log(`VU LOGIC: Requesting ${BASE_URL}${data.endpoint}`);

  // Perform the actual test action
  http.get(`${BASE_URL}${data.endpoint}`);

  // Best Practice: Always include think time to simulate real users
  sleep(1);
}

// 4. TEARDOWN STAGE
export function teardown(data) {
  console.log(
    `TEARDOWN: Cleaning up resources for ${data.endpoint}... (Runs once)`,
  );
}
