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
- **k6 Enhancements:** Features improved memory management per VU, native support for ES modules (`import/export`), and a more robust extension ecosystem (xk6).

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
