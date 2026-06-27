<div align="center">
  <h1>Grafana k6 Theory</h1>
  <small>
    <strong>Author:</strong> Nguyễn Tấn Phát
  </small> <br />
  <sub>June 26, 2026</sub>
</div>

## Table of Contents

1. [k6 Architecture & Environment Setup](#1-k6-architecture--environment-setup)
2. [Building Robust HTTP/API Tests](#2-building-robust-httpapi-tests)
3. [Advanced Workload Modeling (Scenarios)](#3-advanced-workload-modeling-scenarios)
4. [Test Data Management & Modularity](#4-test-data-management--modularity)
5. [k6 Browser & Frontend Performance](#5-k6-browser--frontend-performance)
6. [Observability, Distributed Execution & Tracing](#6-observability-distributed-execution--tracing)
7. [Extending k6 with Go (xk6)](#7-extending-k6-with-go-xk6)

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

### 1.4. Enterprise k6 Project Structure

Unlike heavyweight frameworks, k6 projects do not strictly require complex build tools (like Maven or Gradle) to run. A plain repository tracked via git is perfectly sufficient. However, structuring your files logically is critical for maintainability when utilizing Neovim as your primary editor.

Below is the industry-standard directory structure for a scalable k6 performance testing repository:

```text
k6-performance-project/
├── src/                      // Core source code directory
│   ├── tests/                // Contains the actual executable test scripts
│   │   ├── api_register_test.js
│   │   └── scenario_mixed_workload.js
│   ├── modules/              // Reusable business logic (Page Objects / API clients)
│   │   ├── auth.js           // Functions for handling login and token extraction
│   │   └── cart.js           // Functions for cart manipulation
│   └── utils/                // Helper functions (Random data generators, formatting)
│       └── helpers.js
├── data/                     // Static test data files (loaded via SharedArray)
│   ├── users.json
│   └── products.csv
├── config/                   // Environment-specific configurations
│   ├── dev.env               // Variables for Development environment
│   └── prod.env              // Variables for Production environment
├── extensions/               // Go modules for custom xk6 binaries (if applicable)
│   └── custom-hash.go
├── package.json              // (Optional) Used ONLY if you need npm for type definitions/linting
└── README.md                 // Project documentation and execution instructions
```

### 1.5. Mastering the k6 CLI

Running tests efficiently requires mastery of the k6 Command Line Interface within your native Ubuntu shell.

- `k6 run <script.js>`: The primary command to execute a local test script.
- `k6 run --out json=test_results.json <script.js>`: Executes the script and exports the raw metric data into a JSON file for later analysis.
- `k6 run --env TARGET_ENV=prod <script.js>`: Injects environment variables directly into the script during runtime.
- `k6 inspect <script.js>`: Parses the script and outputs the exported `options` (like VUs, duration, thresholds) without actually running the test. Excellent for dry-run validations.
- `k6 archive <script.js>`: Packages the test script and all its dependencies (including local JSON/CSV data files) into a single `.tar` file. This is crucial for distributing tests across a cluster.
- `k6 version`: Displays the currently installed version and the embedded Goja runtime details.

### 1.6. Practical Exercises

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

**Execution Command:** `k6 run lifecycle_test.js`

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

**Execution Command (injecting variables via CLI):** `k6 run -e TARGET_DOMAIN=test.k6.io -e USE_HTTPS=true env_test.js`

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

#### Exercise 1: Simulating an API Login Workflow with Checks

This script demonstrates constructing a proper `POST` request with a JSON payload, setting headers, and validating the response.

**File:** `api_post_test.js`

```javascript
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
```

**Execution Command:** `k6 run api_post_test.js`

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

**Execution Command:** `k6 run thresholds_metrics_test.js`

## 3. Advanced Workload Modeling (Scenarios)

### 3.1. The Paradigm Shift: Open vs. Closed Models

To simulate realistic production traffic, k6 relies heavily on **Scenarios** and **Executors**. Before writing code, it is mandatory to understand the two foundational performance testing models. This is a critical concept for any Senior Performance Tester.

- **Closed Workload Model (VU-Driven):** You control the concurrent Virtual Users (VUs). If the target server slows down, the VUs wait longer for responses, meaning the overall Request Per Second (RPS) _drops_. This model simulates a fixed number of users interacting with a system (e.g., 50 internal employees using a dashboard).
  - _Drawback:_ It suffers from "Coordinated Omission" — the test tool inadvertently slows down when the server slows down, masking the true severity of the performance degradation.
- **Open Workload Model (Arrival-Rate Driven):** You control the _arrival rate_ of new requests (e.g., exactly 50 requests per second), regardless of how fast the server responds. If the server slows down, k6 will automatically spawn _more_ VUs in the background (utilizing lightweight Go routines) to maintain that strict 50 RPS target. This accurately simulates public internet traffic (e.g., an e-commerce flash sale where users keep clicking regardless of server lag).

### 3.2. Core Executors in k6

Executors are the engines that drive your scenarios. k6 provides several, but these four are the industry standards:

1.  **`constant-vus` (Closed):** A fixed number of VUs loop through your script for a set duration.
2.  **`ramping-vus` (Closed):** Gradually increases or decreases the number of VUs over time (perfect for Spike, Step, or Soak testing).
3.  **`constant-arrival-rate` (Open):** Maintains a strict, constant number of iterations/requests per second.
4.  **`ramping-arrival-rate` (Open):** Gradually scales the target iterations/requests per second up or down over time.

### 3.3. Advanced Scenario Configuration

Using the `scenarios` object inside `options`, you can run multiple workloads _simultaneously_ or _sequentially_ within the same script. You can map different scenarios to distinct JavaScript functions using the `exec` property. This aligns perfectly with clean, modular coding principles (similar to GoogleStyle in Java or Go), where each function has a Single Responsibility.

### 3.4. Practical Exercises

We will use `https://httpbin.org` for these exercises. Ensure you are executing these from your native Ubuntu shell to guarantee the Goja engine handles the rapid VU allocation without host OS overhead.

#### Exercise 1: The Open Model (Simulating Steady Internet Traffic)

This exercise demonstrates how to force k6 to maintain a strict throughput (Requests Per Second) regardless of server response time.

**File:** `scenario_open_model.js`

```javascript
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
```

**Execution Command:** `k6 run scenario_open_model.js`

#### Exercise 2: Multi-Scenario (The Ultimate Real-World Profile)

This is the holy grail of k6 script design. We will simulate steady background traffic (Open Model) while simultaneously injecting a sudden spike of active users (Closed Model) to see how the system handles concurrent, mixed workloads.

**File:** `scenario_mixed_workload.js`

```javascript
import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  discardResponseBodies: true, // Best practice: saves memory when you don't need to parse bodies

  scenarios: {
    // Scenario 1: Open Model (Background Traffic running for 1 minute)
    background_api_calls: {
      executor: "constant-arrival-rate",
      rate: 10,
      timeUnit: "1s",
      duration: "60s",
      preAllocatedVUs: 10,
      maxVUs: 50,
      exec: "backgroundFlow", // Maps to the specific function below
    },

    // Scenario 2: Closed Model (Spike Traffic starting after 15 seconds)
    sudden_user_spike: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "10s", target: 30 }, // Fast ramp-up to 30 VUs
        { duration: "20s", target: 30 }, // Hold for 20s
        { duration: "10s", target: 0 }, // Ramp-down
      ],
      startTime: "15s", // Delays the execution of this scenario
      exec: "spikeFlow", // Maps to the specific function below
    },
  },
};

// Isolated logic for Scenario 1
export function backgroundFlow() {
  const res = http.get("https://httpbin.org/get?source=background");
  check(res, { "background GET 200": (r) => r.status === 200 });
}

// Isolated logic for Scenario 2
export function spikeFlow() {
  const payload = JSON.stringify({ action: "urgent_login" });
  const params = { headers: { "Content-Type": "application/json" } };

  const res = http.post("https://httpbin.org/post", payload, params);
  check(res, { "spike POST 200": (r) => r.status === 200 });

  sleep(1); // Sleep is necessary in Closed models to simulate user think-time
}
```

**Execution Command:** `k6 run scenario_mixed_workload.js`

## 4. Test Data Management & Modularity

### 4.1. Data Parameterization with `SharedArray`

In real-world load testing, having VUs use hardcoded or identical data (like the same username) leads to unrealistic caching on the server or database locking errors. You need dynamic data.

- **The Problem:** If you simply load a 50MB JSON file in the `Init` stage using standard JavaScript, k6 will copy that 50MB into the memory of _every single Virtual User_. If you run 1,000 VUs, k6 will consume 50GB of RAM and crash your machine (Out of Memory - OOM).
- **The Solution: `SharedArray`:** k6 provides `k6/data`. When you load a file (JSON or CSV) via a `SharedArray`, k6 stores the data in memory exactly _once_. All VUs read from this single shared memory address, drastically reducing RAM usage.

### 4.2. Grouping Requests (`group`)

When a test script simulates a complete user journey (e.g., "Login" -> "View Dashboard" -> "Checkout"), you will make dozens of HTTP requests.

- **Purpose:** The `group()` function logically organizes multiple requests into a single transaction.
- **Metrics:** k6 automatically generates a special metric called `group_duration`. This tells you how long the _entire_ checkout process took, rather than just the individual API calls.

### 4.3. Tagging for Observability (`tags`)

Tags are key-value pairs attached to requests, checks, or custom metrics. They are essential when you export test results to Grafana/InfluxDB for visualization.

- **System Tags:** k6 automatically tags metrics with `status`, `method`, `url`, and `group`.
- **Custom Tags:** You can define custom tags at the script level, request level, or check level. For example, tagging a request with `env: 'production'` or `api_type: 'auth'` allows you to filter and isolate bottlenecks in your dashboards later.

### 4.4. State Management: Authentication & Cookies

- **Bearer Tokens (JWT):** A common pattern is to hit a login endpoint, extract the `token` from the JSON response, and inject it into the `Authorization: Bearer <token>` header of all subsequent requests.
- **Cookies:** By default, k6 VUs have their own isolated cookie jars. They automatically manage session cookies (like a real browser) across requests within the same iteration. You can also manually interact with cookies using `http.cookieJar()`.

### 4.5. Practical Exercises

To safely practice data loading and authentication without hitting server constraints, we will use a combination of local JSON data and `httpbin.org`.

#### Exercise 1: Loading Data with SharedArray and Extracting Tokens

This exercise demonstrates loading user credentials from a JSON file, simulating a login to get a token, and using that token in the next request.

**Step 1: Create the Test Data File**

Create a file named `users.json` in the same directory as your script:

```json
[
  { "username": "admin_01", "password": "secure1" },
  { "username": "user_02", "password": "secure2" },
  { "username": "guest_03", "password": "secure3" }
]
```

**Step 2: Create the Script: `data_auth_test.js`**

```javascript
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
```

**Execution Command:** `k6 run data_auth_test.js`

#### Exercise 2: Grouping and Tagging for Dashboards

This script models a multi-step user journey, logically grouped and tagged so that downstream monitoring tools can easily filter the data.

**File:** `groups_tags_test.js`

```javascript
import http from "k6/http";
import { check, group, sleep } from "k6";

export const options = {
  vus: 2,
  duration: "5s",
  // Apply a global tag to all metrics generated by this script
  tags: { test_run_id: `run_${Date.now()}`, environment: "staging" },
};

export default function () {
  // Group 1: Browsing the catalog
  group("User Journey: Browse Catalog", function () {
    // Tagging at the request level to categorize API types
    const reqParams = { tags: { api_tier: "frontend_api" } };
    const res = http.get(
      "https://httpbin.org/anything?product=shoes",
      reqParams,
    );

    check(res, { "Catalog loaded": (r) => r.status === 200 });
    sleep(1); // Think time between steps
  });

  // Group 2: Adding item to cart
  group("User Journey: Add To Cart", function () {
    const payload = JSON.stringify({ item_id: 12345, qty: 1 });
    const reqParams = {
      headers: { "Content-Type": "application/json" },
      tags: { api_tier: "backend_core" }, // Different tag for backend
    };

    const res = http.post("https://httpbin.org/post", payload, reqParams);

    // Tagging a specific check
    check(
      res,
      { "Item added": (r) => r.status === 200 },
      { check_type: "critical_business_logic" },
    );
    sleep(1);
  });
}
```

**Execution Command:** `k6 run groups_tags_test.js`

## 5. k6 Browser & Frontend Performance

### 5.1. The Architecture of k6 browser

Unlike the `k6/http` module which only handles network protocols, `k6/browser` interacts with an actual web browser (Chromium).

- **Protocol:** It communicates using the Chrome DevTools Protocol (CDP).
- **Resource Cost:** A standard API Virtual User (VU) takes about 1-5MB of RAM. A Browser VU spins up a full Chromium instance, consuming 100MB to 200MB+ of RAM. Therefore, you **cannot** run thousands of Browser VUs on a single machine.
- **Execution Model:** It relies heavily on asynchronous programming (`async/await`) because DOM interactions (clicking, waiting for elements) do not happen instantaneously.

### 5.2. Playwright-Compliant API & Locators

k6 browser adopted the API syntax of Playwright, making it highly intuitive for automation engineers.

- **Contexts & Pages:** You initialize a browser context and open a `page`.
- **Locators:** The strict, safe way to find elements. Instead of executing immediate actions, locators (`page.locator('.class')`) create a blueprint of how to find the element, which is evaluated exactly when the action (like `.click()`) is performed.
- **Auto-Waiting:** Before performing an action (like filling a text box), the k6 browser automatically waits for the element to be visible, enabled, and stable.

### 5.3. Web Vitals & Frontend Metrics

When using `k6/browser`, you do not just get network metrics. k6 automatically tracks Core Web Vitals, which reflect true user perception:

- **Largest Contentful Paint (LCP):** When the largest image or text block becomes visible.
- **First Contentful Paint (FCP):** When the first DOM element is rendered.
- **Cumulative Layout Shift (CLS):** Measures visual stability (elements jumping around).

### 5.4. Hybrid Testing (The Best Practice)

Since Browser VUs are heavy, the industry standard is **Hybrid Testing**.

- **Strategy:** You generate 95% of your load using the lightweight `k6/http` module (backend load), and run the remaining 5% using `k6/browser` (frontend check).
- **Benefit:** You stress the backend database and API to their limits while simultaneously measuring how that high backend load degrades the visual rendering time on the frontend.

### 5.5. Practical Exercises

We will use `https://test.k6.io`, which provides a safe playground with a login form (`/my_messages.php`). Ensure your scripts maintain clean, modular functions with strict 4-space indentation.

#### Exercise 1: Simulating Real User UI Interaction

This script launches a headless browser, navigates to a page, fills out a form, and verifies the DOM state, automatically collecting Web Vitals in the background.

**File:** `browser_ui_test.js`

```javascript
import { browser } from "k6/browser";
import { check } from "k6";

export const options = {
  scenarios: {
    ui_interaction: {
      executor: "constant-vus",
      vus: 1, // Keep VUs extremely low for local browser tests
      duration: "10s",
      options: {
        browser: {
          type: "chromium",
        },
      },
    },
  },
};

export default async function () {
  // 1. Initialize a new page within the browser context
  const page = browser.newPage();

  try {
    // 2. Navigate and wait for the network to be mostly idle
    await page.goto("https://test.k6.io/my_messages.php");

    // 3. Define Locators
    const loginField = page.locator('input[name="login"]');
    const passwordField = page.locator('input[name="password"]');
    const submitButton = page.locator('input[type="submit"]');
    const errorMessage = page.locator("div.error");

    // 4. Perform UI Actions (Auto-waiting is built-in)
    await loginField.type("invalid_admin");
    await passwordField.type("wrong_password");
    await submitButton.click();

    // 5. Explicitly wait for an element that signifies the page has updated
    await page.waitForSelector("div.error");

    // 6. Validate the DOM State
    const errorIsVisible = await errorMessage.isVisible();
    const errorText = await errorMessage.textContent();

    check(errorIsVisible, {
      "Error message is displayed": (v) => v === true,
      "Error text is correct": () => errorText.includes("Unauthorized"),
    });
  } finally {
    // Best Practice: Always close the page in a finally block to prevent memory leaks
    page.close();
  }
}
```

**Execution Command:** `K6_BROWSER_HEADLESS=true k6 run browser_ui_test.js`

#### Exercise 2: The Hybrid Load Profile

This script demonstrates the ultimate architecture: hitting the backend with high concurrency via HTTP, while running a single browser instance to monitor frontend degradation.

**File:** `hybrid_browser_test.js`

```javascript
import http from "k6/http";
import { browser } from "k6/browser";
import { check, sleep } from "k6";

export const options = {
  scenarios: {
    // Scenario 1: Heavy API Load (Open Model)
    api_backend_load: {
      executor: "constant-arrival-rate",
      rate: 20,
      timeUnit: "1s",
      duration: "30s",
      preAllocatedVUs: 20,
      maxVUs: 50,
      exec: "apiFlow", // Map to HTTP function
    },

    // Scenario 2: Single Browser VU for UI monitoring
    frontend_ui_monitor: {
      executor: "constant-vus",
      vus: 1,
      duration: "30s",
      options: {
        browser: { type: "chromium" },
      },
      exec: "browserFlow", // Map to Browser function
    },
  },
};

// --- Backend HTTP Logic ---
export function apiFlow() {
  const res = http.get("https://test.k6.io/");
  check(res, { "API 200 OK": (r) => r.status === 200 });
}

// --- Frontend Browser Logic ---
export async function browserFlow() {
  const page = browser.newPage();

  try {
    await page.goto("https://test.k6.io/");

    const header = page.locator("h2");
    await page.waitForSelector("h2");

    check(page, {
      "UI Header rendered": async () => await header.isVisible(),
    });

    sleep(2); // Think time between UI interactions
  } finally {
    page.close();
  }
}
```

**Execution Command:** `K6_BROWSER_HEADLESS=true k6 run hybrid_browser_test.js`

## 6. Observability, Distributed Execution & Tracing

### 6.1. The Built-in Web Dashboard

Historically, visualizing k6 results in real-time required setting up a separate stack (InfluxDB + Grafana). In k6, this is no longer necessary for local development. k6 includes a native, highly responsive Web Dashboard.

- **Mechanism:** When enabled, k6 spawns a local web server (default: port 5665) running a React-based UI that reads metrics directly from the Go engine's memory.
- **Benefits:** Zero-configuration real-time visualization of VUs, RPS, HTTP response times, and error rates. It also provides a final HTML report upon completion.

### 6.2. Metric Streaming & External Outputs

For CI/CD pipelines or enterprise-grade observability, you must persist test data beyond a single terminal session. The `k6 run --out` flag handles this.

- **File Outputs:** `json`, `csv`. Useful for local debugging or lightweight CI/CD artifact storage.
- **Real-time Streaming:** k6 can push metrics in real-time to time-series databases.
  - _Prometheus Remote Write:_ The industry standard for cloud-native environments.
  - _InfluxDB / Datadog / New Relic:_ Fully supported via built-in extensions.

### 6.3. Distributed Execution & Sharding

A single machine (even a powerful Ubuntu server) can typically generate 30,000 to 50,000 VUs before hitting CPU/Network bottlenecks. To simulate 100,000+ VUs, you must distribute the load.

- **Execution Segments:** k6 allows manual sharding of your script. You can tell Node A to run segment `0:1/2` (the first 50% of the load) and Node B to run segment `1/2:1` (the remaining 50%).
- **k6-operator (Kubernetes):** For true distributed execution, the k6 Kubernetes operator automatically spins up multiple pods, assigns segments, and aggregates the results seamlessly.

### 6.4. OpenTelemetry (OTel) Tracing Integration

If a k6 load test reports that the login API takes 5 seconds, it does not tell you _why_. Is it the database? The auth service? The cache?

- **Distributed Tracing:** k6 natively supports OpenTelemetry. It can automatically inject `traceparent` headers into outgoing HTTP requests.
- **Correlation:** When your backend services (which are also instrumented with OTel) receive this header, they link their internal spans to the k6 request. You can then open Jaeger or Grafana Tempo, paste the Trace ID from k6, and see the exact database query that caused the bottleneck.

### 6.5. Practical Exercises

We will use `https://httpbin.test.k6.io` as it safely handles high throughput and properly echoes headers (which is perfect for verifying OTel injection).

#### Exercise 1: The Zero-Config Real-Time Dashboard & Output

This exercise demonstrates how to activate the built-in UI and simultaneously save raw metric data to a JSON file for CI/CD integration.

**File:** `observability_dashboard_test.js`

```javascript
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
```

**Execution Command:** Run this in your terminal, then immediately open `http://localhost:5665` in your browser.

```bash
K6_WEB_DASHBOARD=true k6 run --out json=test_results.json observability_dashboard_test.js
```

#### Exercise 2: OpenTelemetry Trace Injection & Distributed Sharding

This script manually configures an HTTP client to inject OTel tracing headers and simulates how you would run a "shard" of a distributed test.

**File:** `distributed_tracing_test.js`

```javascript
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
```

**Execution Command (Simulating Node 1 of a 2-Node Cluster):** This command tells k6 to only execute the first 50% of the workload (Segment 0 to 0.5).

```bash
k6 run --execution-segment "0:1/2" distributed_tracing_test.js
```

## 7. Extending k6 with Go (xk6)

### 7.1. The Limitation of the JS Runtime and the Need for xk6

The JavaScript runtime embedded in k6 (Goja) is highly optimized for HTTP and WebSockets. However, it lacks native support for standard NodeJS modules (`fs`, `crypto` beyond basics, `net`) and third-party database drivers.

- **The Solution:** Grafana provides `xk6`, a command-line tool that compiles a custom k6 binary containing your custom Go code.
- **Performance:** Because the heavy lifting (like cryptography or database connections) is executed in compiled Go routines rather than interpreted JavaScript, the performance remains exceptional, allowing for massive concurrency.

### 7.2. The xk6 Ecosystem and Registry

Before writing your own extension, always check the **k6 Extension Registry** (https://k6.io/docs/extensions/). The open-source community has already built dozens of production-ready extensions:

- `xk6-sql`: For load testing PostgreSQL, MySQL, and SQLite.
- `xk6-kafka`: For producing and consuming Apache Kafka messages.
- `xk6-redis`: For interacting with Redis caches.

You can compile a binary with multiple extensions simultaneously.

### 7.3. Architecture of a Custom Extension

Building a custom extension involves creating a Go module that acts as a bridge to the JS runtime.

1. **The Go Module:** You define a standard Go `struct` and attach methods to it.
2. **The Registry:** You import `go.k6.io/k6/js/modules` and call `modules.Register()` to expose your Go struct to the JavaScript environment under a specific import path (e.g., `k6/x/my-module`).
3. **The JavaScript Bridge:** Goja automatically translates Go data types to JavaScript primitives (e.g., Go `string` to JS `String`, Go `[]byte` to JS `ArrayBuffer`).

### 7.4. Practical Exercise: Building a Custom Go Extension

To demonstrate the full lifecycle without requiring external databases, we will build a custom Go extension that performs a computationally heavy string manipulation (simulating a proprietary internal hashing algorithm), compile it, and call it from a JS script.

Ensure you have the Go compiler installed in your environment (`sudo apt install golang-go`).

#### Step 1: Create the Go Extension

Create a new directory for your project and initialize a Go module.

```bash
mkdir custom-k6-ext
cd custom-k6-ext
go mod init custom-k6-ext
```

Create the Go source file: `my_crypto.go`

```go
package mycrypto

import (
    "crypto/sha256"
    "encoding/hex"
    "strings"
    "go.k6.io/k6/js/modules"
)

// init is called by the Go runtime to register the module.
func init() {
    modules.Register("k6/x/mycrypto", new(MyCrypto))
}

// MyCrypto is the struct that will be exposed to JavaScript.
type MyCrypto struct{}

// GenerateCustomHash is the method we want to call from our k6 JS script.
// Notice the 4-space indentation standard.
func (m *MyCrypto) GenerateCustomHash(input string, salt string) string {
    // Simulate a proprietary hashing logic: Convert to uppercase, concat salt, then SHA256
    processedString := strings.ToUpper(input) + "_" + salt

    hash := sha256.Sum256([]byte(processedString))

    return hex.EncodeToString(hash[:])
}
```

#### Step 2: Build the Custom k6 Binary

You need the `xk6` builder tool. Install it, then command it to build a new k6 binary using your local Go module.

```bash
# Install xk6 builder
go install go.k6.io/xk6/cmd/xk6@latest

# Build the custom binary (Assuming $GOPATH/bin is in your PATH)
xk6 build --with custom-k6-ext=.
```

_Result:_ This generates an executable file named `k6` in your current directory. This is your custom, augmented k6 engine.

#### Step 3: Write the k6 JavaScript Test

Now, write the standard k6 test script that utilizes the new module.

**File:** `xk6_test.js`

```javascript
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
```

#### Step 4: Execution Command

Crucially, you must run the script using your _newly compiled local binary_, not the globally installed k6.

```bash
# Use ./k6 to ensure you are executing the custom binary in the current folder
./k6 run xk6_test.js
```
