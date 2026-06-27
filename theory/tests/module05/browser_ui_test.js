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
