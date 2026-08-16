import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const ADMIN_EMAIL = "admin@eshop.com";
const ADMIN_PASS = "Admin123!";

const TOTAL_USERS = 115;
const TOTAL_PRODUCTS = 5;
const OUTPUT_FILE = path.join(__dirname, "seed-state.json");

async function main() {
  console.log(
    `=== Starting Data Seeding (${TOTAL_USERS} users, ${TOTAL_PRODUCTS} products) ===`,
  );
  console.log(`Target Base URL: ${BASE_URL}`);

  let adminToken = "";
  try {
    const loginRes = await fetch(`${BASE_URL}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASS }),
    });
    if (!loginRes.ok) {
      throw new Error(`Admin login failed: ${await loginRes.text()}`);
    }
    const loginData = await loginRes.json();
    adminToken = loginData.token;
    console.log("Admin login successful.");
  } catch (err) {
    console.error("[ERROR] Failed to login as Admin:", err.message);
    process.exit(1);
  }

  const seededProducts = [];
  for (let i = 1; i <= TOTAL_PRODUCTS; i++) {
    try {
      const payload = {
        name: `Sản phẩm Test ${i}`,
        price: 100000 + i * 10000,
        description: `Mô tả sản phẩm test ${i}`,
        imageUrl: "http://example.com/image.jpg",
        category_id: 1,
      };
      const res = await fetch(`${BASE_URL}/api/products`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        throw new Error(`Product creation failed: ${await res.text()}`);
      }
      const data = await res.json();
      // Assume API returns the created product ID
      seededProducts.push({
        id: data.id || i, // fallback just in case
        name: payload.name,
        price: payload.price,
      });
      console.log(`Created product: ${payload.name}`);
    } catch (err) {
      console.error(`[ERROR] Failed to create product ${i}:`, err.message);
      process.exit(1);
    }
  }

  const runTimestamp = Date.now();
  const seedResults = [];

  for (let i = 1; i <= TOTAL_USERS; i++) {
    const paddedIndex = i.toString().padStart(3, "0");
    const email = `perf_cart_${runTimestamp}_${paddedIndex}@spike.test`;
    const password = "Test1234!";
    const name = `Perf User ${paddedIndex}`;

    try {
      const regRes = await fetch(`${BASE_URL}/api/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      if (!regRes.ok) {
        throw new Error(`Register failed for ${email}: ${await regRes.text()}`);
      }

      const product = seededProducts[i % seededProducts.length];

      seedResults.push({
        email,
        password,
        product_id: product.id,
        product_name: product.name,
        price: product.price,
        quantity: 1
      });
      console.log(`[${paddedIndex}/${TOTAL_USERS}] Created user ${email}`);
    } catch (err) {
      console.error(`[ERROR] Failed at index ${paddedIndex}: ${err.message}`);
      process.exit(1);
    }
  }

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(seedResults, null, 2), "utf-8");

  console.log("\n=== Seeding Summary ===");
  console.log(`Total users created: ${seedResults.length}`);
  console.log(`State saved to: ${OUTPUT_FILE}`);
}

main().catch((err) => {
  console.error("[FATAL ERROR]", err);
  process.exit(1);
});
