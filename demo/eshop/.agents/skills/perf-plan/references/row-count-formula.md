# CSV Row Count Formula

> Read this file during Step 3 when calculating the required number of CSV rows, especially for write-once endpoints (e.g. POST /register) where each iteration must consume a unique data row.

## Two Categories of Test Data Consumption

### Category A — Reusable Rows (most endpoints)

Each VU is assigned one row and reuses it across all iterations. The VU logs in with the same credentials and sends the same (or similar) request on every iteration.

**Applies to:** GET endpoints, POST endpoints that accept repeated writes from the same user (e.g. add to cart, place order), any endpoint where repeating the same data per VU is valid.

**Required rows:**

```
min_rows = peak_vus
```

Add a 10–20% buffer to allow for VU skew:

```
recommended_rows = ceil(peak_vus × 1.15)
```

**Example:**

```
peak_vus = 50
recommended_rows = ceil(50 × 1.15) = 58  →  generate 60 rows
```

### Category B — Write-Once Rows (unique-per-iteration endpoints)

Each iteration must consume a fresh, unique row — reusing a row produces a data conflict error (e.g. duplicate email on POST /register), which is not a performance failure.

**Applies to:** POST endpoints that create unique resources: account registration, unique order creation where order numbers must not repeat, any endpoint with a UNIQUE database constraint.

**Required rows formula:**

```
iterations_per_vu = floor(test_duration_seconds / (avg_response_time_seconds + think_time_seconds))
total_iterations  = peak_vus × iterations_per_vu
min_rows          = total_iterations
recommended_rows  = ceil(total_iterations × 1.30)   // 30% buffer
```

**Where:**

- `test_duration_seconds` = total test duration from the workload model (excluding ramp-down where VUs are at 0)
- `avg_response_time_seconds` = `baseline.p50_ms / 1000` from `perf-config.json` (use p50, not p95, for average throughput estimation)
- `think_time_seconds` = think time value from the approved workload model

**Example calculation (state this explicitly in csv-schema.md):**

```
test_type = stress
peak_vus = 100
test_duration_seconds = 8 × 60 = 480   (4 steps × 2 min, ignoring ramp-down)
avg_response_time_seconds = 0.12        (baseline p50 = 120ms)
think_time_seconds = 0.75               (from workload model)

iterations_per_vu = floor(480 / (0.12 + 0.75)) = floor(480 / 0.87) = floor(551.7) = 551
total_iterations  = 100 × 551 = 55,100
recommended_rows  = ceil(55,100 × 1.30) = 71,630  →  generate 72,000 rows
```

Show the full calculation in `csv-schema.md` so the human can verify and adjust.

## Uniqueness Guarantee for Write-Once Fields

For fields that must be unique across all rows (e.g. email addresses), use a **deterministic generation pattern** rather than random UUIDs. Deterministic patterns are:

- Reproducible (the same inputs produce the same output)
- Easier to audit (you can tell what row N looks like without reading the file)
- Easier to clean up (you can delete records matching the pattern)

**Recommended pattern:**

```
{prefix}_{run_timestamp}_{zero_padded_index}@{domain}
```

Example:

```
perf_1720000000_000001@test.local
perf_1720000000_000002@test.local
...
perf_1720000000_072000@test.local
```

The `run_timestamp` (Unix seconds at script start) ensures rows generated in separate runs do not collide even if the index range overlaps.

Document the pattern in `csv-schema.md` so the human can verify uniqueness and the cleanup procedure is clear.

## Validation Before Accepting the CSV

After `generate-data.js` runs, the `node-runner` output must confirm:

1. **Row count:** actual row count ≥ `recommended_rows`.
2. **No nulls:** no column contains an empty or null value.
3. **Uniqueness check for write-once fields:** if the field must be unique, the script must verify no duplicates exist (e.g. `SELECT COUNT(DISTINCT email) = COUNT(*)`-style check in memory).
4. **Sample output:** first 3 and last 3 rows are printed for visual inspection.

If any check fails, the generate script must exit with a non-zero code and a descriptive error. Do not proceed with a CSV that fails validation.
