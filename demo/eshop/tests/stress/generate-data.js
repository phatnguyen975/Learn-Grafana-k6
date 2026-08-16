import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROW_COUNT = 54000;
const OUTPUT_FILE = path.join(__dirname, "auth-heavy.csv");

async function main() {
  try {
    const timestamp = Date.now();
    const rows = [];

    // Generate data
    for (let i = 1; i <= ROW_COUNT; i++) {
      const paddedIndex = i.toString().padStart(6, "0");
      rows.push({
        name: `Perf User ${i}`,
        email: `perf_${timestamp}_${paddedIndex}@stress.test`,
        password: "StressTest123!",
      });
    }

    // Validation: null values check
    const hasNulls = rows.some((r) =>
      Object.values(r).some((v) => v == null || v === ""),
    );
    if (hasNulls) {
      console.error("[ERROR] CSV contains null values");
      process.exit(1);
    }

    // Validation: duplicates on unique-required fields
    const emails = rows.map((r) => r.email);
    const unique = new Set(emails);
    if (unique.size !== emails.length) {
      console.error("[ERROR] Duplicate emails found");
      process.exit(1);
    }

    // Validation: row count matches expected
    if (rows.length !== ROW_COUNT) {
      console.error(
        `[ERROR] Expected ${ROW_COUNT} rows, but generated ${rows.length}`,
      );
      process.exit(1);
    }

    // Write CSV via writeStream
    const writeStream = fs.createWriteStream(OUTPUT_FILE, { encoding: "utf8" });
    writeStream.write("name,email,password\n");

    for (const row of rows) {
      writeStream.write(`${row.name},${row.email},${row.password}\n`);
    }

    writeStream.end();

    // Wait for the stream to finish writing
    await new Promise((resolve, reject) => {
      writeStream.on("finish", resolve);
      writeStream.on("error", reject);
    });

    // Summary stdout
    console.log(`\n=== Summary ===`);
    console.log(`Records created: ${rows.length}`);
    console.log(`Output file: ${OUTPUT_FILE} (${rows.length} rows)`);
    console.log(`First 3 rows:`);
    console.log(rows.slice(0, 3));
  } catch (err) {
    console.error(`[ERROR] ${err.message}`);
    process.exit(1);
  }
}

main();
