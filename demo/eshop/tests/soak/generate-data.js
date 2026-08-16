import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const INPUT_FILE = path.join(__dirname, "seed-state.json");
const OUTPUT_CSV = path.join(__dirname, "soak.csv");

async function main() {
  console.log("=== Generating CSV Dataset for k6 Performance Tests (Soak) ===");

  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`[ERROR] Input seed state file not found: ${INPUT_FILE}`);
    console.error("Please run seed-data.js first to generate seed-state.json.");
    process.exit(1);
  }

  const rawData = fs.readFileSync(INPUT_FILE, "utf-8");
  let records;
  try {
    records = JSON.parse(rawData);
  } catch (err) {
    console.error(
      `[ERROR] Failed to parse JSON from ${INPUT_FILE}: ${err.message}`,
    );
    process.exit(1);
  }

  // Validation 1: Check row count
  if (!Array.isArray(records) || records.length !== 20) {
    console.error(
      `[ERROR] Expected exactly 20 records, but found ${records ? records.length : 0}`,
    );
    process.exit(1);
  }

  // Validation 2: Check for null or empty values
  const hasNulls = records.some(
    (r) =>
      !r.email ||
      !r.password ||
      r.order_id === undefined ||
      r.order_id === null,
  );
  if (hasNulls) {
    console.error("[ERROR] Dataset contains null or empty fields");
    process.exit(1);
  }

  // Validation 3: Check uniqueness of email and order_id
  const emails = records.map((r) => r.email);
  const uniqueEmails = new Set(emails);
  if (uniqueEmails.size !== emails.length) {
    console.error("[ERROR] Duplicate emails detected in dataset");
    process.exit(1);
  }

  const orderIds = records.map((r) => r.order_id);
  const uniqueOrderIds = new Set(orderIds);
  if (uniqueOrderIds.size !== orderIds.length) {
    console.error("[ERROR] Duplicate order IDs detected in dataset");
    process.exit(1);
  }

  // Construct CSV content
  const headers = ["email", "password", "order_id"];
  const csvLines = [
    headers.join(","),
    ...records.map((r) => `${r.email},${r.password},${r.order_id}`),
  ];
  const csvContent = csvLines.join("\n");

  // Ensure target directory exists and write CSV
  fs.mkdirSync(path.dirname(OUTPUT_CSV), { recursive: true });
  fs.writeFileSync(OUTPUT_CSV, csvContent, "utf-8");

  console.log("\n=== CSV Generation Summary ===");
  console.log(`Output File Path: ${OUTPUT_CSV}`);
  console.log(`Total Row Count (excluding header): ${records.length}`);
  console.log("\nFirst 3 rows preview:");
  csvLines.slice(0, 4).forEach((line) => console.log(`  ${line}`));
}

main().catch((err) => {
  console.error("[FATAL ERROR]", err);
  process.exit(1);
});
