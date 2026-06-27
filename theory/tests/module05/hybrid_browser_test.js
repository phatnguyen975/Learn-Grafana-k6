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
