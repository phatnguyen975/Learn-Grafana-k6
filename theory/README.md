<div align="center">
  <h1>Grafana k6 Theory</h1>
  <small>
    <strong>Author:</strong> Nguyễn Tấn Phát
  </small> <br />
  <sub>June 26, 2026</sub>
</div>

## 1. k6 Architecture & Environment Setup

### 1.1. k6 Architecture: The Engine Under the Hood

Understanding how k6 works internally is crucial for writing high-performance tests. k6 is not a NodeJS application; it is a compiled Go binary that embeds a JavaScript runtime (Goja).

- **Go Backend:** Handles the heavy lifting. It manages network connections, concurrency (goroutines), and metric aggregation. This allows k6 to simulate tens of thousands of concurrent users (VUs) on a single machine with minimal resource consumption.
- **JavaScript Runtime (ES6+):** Scripts are written in modern JavaScript. However, since it runs on Goja, NodeJS native modules (like `fs`, `path`, or `os`) are **not** supported natively. k6 provides its own built-in APIs for these purposes.
- **k6 Enhancements:** Features improved memory management per VU, native support for ES modules (`import/export`), and a more robust extension ecosystem (`xk6`).

### 1.2. Environment Setup (Linux/Ubuntu Environment)

For the most stable and performant execution, running k6 within a native Linux environment (such as Ubuntu) is highly recommended. Ensure your terminal is utilizing a native shell (e.g., `/bin/bash` or `/bin/zsh`) rather than a Windows-based shell wrapper, as this prevents CLI argument parsing issues and command recognition errors during execution.

**Installation via APT (Debian/Ubuntu):**

```bash
curl -fsSL https://dl.k6.io/key.gpg | sudo gpg --dearmor -o /usr/share/keyrings/k6-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list

sudo apt-get update
sudo apt-get install k6
```

**Installation via Homebrew (MacOS):**

```bash
brew install k6
```

**Installation via Chocolatey (Windows):**

```bash
choco install k6
```

### 1.3. The Test Lifecycle

This is the most critical concept in k6. A test script goes through four distinct stages. Placing code in the wrong stage can lead to massive memory leaks or logical errors.

1. **Init Code (Runs ONCE per VU/Node):**
   - Located completely outside of any function.
   - **Purpose:** Importing modules, loading local files (JSON/CSV), defining global variables, and configuring options.
   - **Restriction:** You cannot make HTTP requests here.
2. **Setup Code (Runs exactly ONCE before the test starts):**
   - Located in `export function setup()`.
   - **Purpose:** Preparing the test environment (e.g., creating a test user, retrieving an authentication token). It returns data that is passed to the VU code.
3. **VU Code (Runs repeatedly for the duration of the test):**
   - Located in `export default function(data)`.
   - **Purpose:** The actual user journey (HTTP requests, logic, sleep). VUs execute this function continuously until the test duration ends.
4. **Teardown Code (Runs exactly ONCE after the test ends):**
   - Located in `export function teardown(data)`.
   - **Purpose:** Cleaning up the environment (e.g., deleting the test user created in `setup`).

### 1.4. Practical Exercises (Best Practices)

We will use `https://test.k6.io`, a public domain maintained by Grafana specifically for testing k6 scripts safely.

#### Exercise 1: Mastering the Test Lifecycle

This exercise demonstrates data passing between the 4 lifecycle stages.

**Create file: `lifecycle_test.js`**

```javascript
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
export default function (data) {
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
```

**Run command:** `k6 run lifecycle_test.js`

#### Exercise 2: Environment Variables for Reusability

Hardcoding values is a bad practice. This exercise shows how to use Environment Variables to make scripts dynamic.

**Create file: `env_test.js`**

```javascript
import http from "k6/http";
import { sleep } from "k6";

// Read from environment variable, fallback to default if not provided
const DOMAIN = __ENV.TARGET_DOMAIN || "test.k6.io";
const PROTOCOL = __ENV.USE_HTTPS === "true" ? "https" : "http";

export const options = {
  vus: 1,
  duration: "3s",
};

export default function () {
  const url = `${PROTOCOL}://${DOMAIN}`;
  console.log(`Sending GET request to: ${url}`);

  http.get(url);
  sleep(1);
}
```

**Run command (injecting variables via CLI):** `k6 run -e TARGET_DOMAIN=test.k6.io -e USE_HTTPS=true env_test.js`

## 2. Building Robust HTTP/API Tests

### 2.1. The `k6/http` Module: Crafting Requests

At the core of API performance testing is the ability to accurately simulate client requests. k6 handles this via the `k6/http` module, which supports all standard HTTP methods.

- **HTTP Methods:** `http.get()`, `http.post()`, `http.put()`, `http.del()`, `http.patch()`, and `http.options()`.
- **Headers & Parameters:** Modern APIs require strict header definitions (e.g., `Content-Type`, `Authorization`). You pass these as the third argument in methods like `POST` or `PUT`, or the second argument in `GET`.
- **Payloads:** Data sent in `POST` or `PUT` requests must be properly formatted. Use `JSON.stringify()` for `application/json` payloads, or pass a raw object for `application/x-www-form-urlencoded`.
- **Batched Requests:** k6 allows concurrent request execution using `http.batch()`. This is useful for simulating parallel resource loading (e.g., fetching multiple images simultaneously) rather than sequential blocking requests.

### 2.2. Validating Responses with `check`

Sending a request is only half the job. We must verify the server responds correctly under load.

- **The `check()` Function:** Unlike assertions in unit testing tools (which halt the script if they fail), k6 `check()` evaluates conditions and records the pass/fail rate **without** stopping the Virtual User execution.
- **Common Validations:** Validating HTTP status codes (`res.status === 200`), checking response time (`res.timings.duration < 500`), and verifying response body content (`res.body.includes('success')`).

### 2.3. Defining SLOs with `thresholds`

Thresholds are the automated pass/fail criteria for your load test. They are crucial for integrating k6 into CI/CD pipelines.

- **Mechanism:** If the performance metrics do not meet the defined thresholds, k6 will exit with a non-zero code, failing the CI/CD build.
- **Syntax:** Defined in the `options` object. You specify a metric and a condition string (e.g., `'http_req_duration': ['p(95)<500']`).
- **Abort on Fail:** You can configure thresholds to immediately abort the test if an error rate spikes unexpectedly, saving compute resources.

### 2.4. Performance Metrics (Built-in vs. Custom)

k6 automatically collects several built-in metrics, but you can also define custom ones to track specific business logic.

- **Built-in Metrics:** `http_req_duration` (total time), `http_req_failed` (error rate), `http_reqs` (total requests/RPS), `vus` (active VUs), `iterations`.
- **Custom Metrics:** Imported from `k6/metrics`.
  - `Trend`: Calculates statistics (min, max, average, percentiles) for a series of values.
  - `Rate`: Tracks the percentage of non-zero values (useful for tracking custom error rates).
  - `Counter`: Sums values over time.
  - `Gauge`: Stores the latest value (e.g., active server connections).

### 2.5. Practical Exercises

We will continue using `https://test-api.k6.io`, a dummy API provided by Grafana. To ensure smooth execution, ensure you are running these commands in your native Ubuntu shell environment.

#### Exercise 1: Simulating an API Login Workflow with Checks

This script demonstrates constructing a proper `POST` request with a JSON payload, setting headers, and validating the response.

**File:** `api_login_test.js`

```javascript
import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  vus: 5,
  duration: "5s",
};

export default function () {
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
```

**Run command:** `k6 run api_login_test.js`

#### Exercise 2: Defining CI/CD Gates with Custom Metrics and Thresholds

This script introduces custom metrics to isolate the measurement of a specific API endpoint and applies thresholds to automate pass/fail decisions.

**File:** `thresholds_metrics_test.js`

```javascript
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

export default function () {
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
```

**Run command:** `k6 run thresholds_metrics_test.js`
