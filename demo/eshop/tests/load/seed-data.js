import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const SEED_COUNT = 50;
const OUTPUT_FILE = path.join(__dirname, "seed-state.json");

async function main() {
  console.log(`=== Starting Data Seeding (${SEED_COUNT} users & orders) ===`);
  console.log(`Target Base URL: ${BASE_URL}`);

  const runTimestamp = Date.now();
  const seedResults = [];

  for (let i = 0; i < SEED_COUNT; i++) {
    const userIndex = String(i + 1).padStart(2, "0");
    const email = `perf_${runTimestamp}_${userIndex}@test.local`;
    const password = "Test1234!";
    const name = `Perf User ${userIndex}`;

    try {
      // 1. Register User
      const regRes = await fetch(`${BASE_URL}/api/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      if (!regRes.ok) {
        const errText = await regRes.text();
        throw new Error(
          `Register failed for ${email} (${regRes.status}): ${errText}`,
        );
      }

      // 2. Login User to get JWT token
      const loginRes = await fetch(`${BASE_URL}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!loginRes.ok) {
        const errText = await loginRes.text();
        throw new Error(
          `Login failed for ${email} (${loginRes.status}): ${errText}`,
        );
      }
      const loginData = await loginRes.json();
      const token = loginData.token;
      if (!token) {
        throw new Error(`No token returned in login response for ${email}`);
      }

      // 3. Checkout to create 1 order
      const checkoutRes = await fetch(`${BASE_URL}/api/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          total_amount: 100000,
          shipping_address: "123 Test Street, Test City",
        }),
      });
      if (!checkoutRes.ok) {
        const errText = await checkoutRes.text();
        throw new Error(
          `Checkout failed for ${email} (${checkoutRes.status}): ${errText}`,
        );
      }
      const checkoutData = await checkoutRes.json();
      const orderId =
        checkoutData.orderId || checkoutData.id || checkoutData.order_id;
      if (!orderId) {
        throw new Error(
          `No orderId returned in checkout response for ${email}`,
        );
      }

      seedResults.push({
        email,
        password,
        order_id: orderId,
      });

      console.log(
        `[${userIndex}/${SEED_COUNT}] Created user ${email} with order_id ${orderId}`,
      );
    } catch (err) {
      console.error(`[ERROR] Failed at index ${userIndex}: ${err.message}`);
      process.exit(1);
    }
  }

  // Ensure target directory exists
  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(seedResults, null, 2), "utf-8");

  console.log("\n=== Seeding Summary ===");
  console.log(`Total users & orders created: ${seedResults.length}`);
  console.log(`State saved to: ${OUTPUT_FILE}`);
  console.log("Sample record:", seedResults[0]);
}

main().catch((err) => {
  console.error("[FATAL ERROR]", err);
  process.exit(1);
});
