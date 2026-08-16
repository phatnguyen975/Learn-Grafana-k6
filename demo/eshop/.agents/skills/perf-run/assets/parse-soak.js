#!/usr/bin/env node
/**
 * scripts/parse-soak.js
 *
 * Parses a k6 JSON event stream (--out json output) from a soak test and
 * computes the endurance metrics required for soak-endurance-report.md.
 *
 * Usage:
 *   node parse-soak.js <soak-output.json> [--start-window-min=3] [--end-window-min=2]
 *
 * Arguments:
 *   <soak-output.json>        Path to the k6 JSON event stream file (required)
 *   --start-window-min=N      Minutes from plateau start to use as the start window (default: 2)
 *   --end-window-min=N        Minutes from plateau end to use as the end window (default: 2)
 *
 * Output:
 *   Prints a JSON object to stdout with all computable endurance metrics.
 *   Fields that require human input are output as null with a note.
 *
 * Requirements:
 *   Node.js >= 16 (uses readline for line-by-line streaming, no npm deps)
 */

"use strict";

const fs = require("fs");
const readline = require("readline");
const path = require("path");

// ─── Argument Parsing ─────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const inputFile = args.find((a) => !a.startsWith("--"));
const startWindowMin = parseFloat(
  (args.find((a) => a.startsWith("--start-window-min=")) || "").split("=")[1] ||
    "2",
);
const endWindowMin = parseFloat(
  (args.find((a) => a.startsWith("--end-window-min=")) || "").split("=")[1] ||
    "2",
);

if (!inputFile) {
  console.error(
    "Usage: node parse-soak.js <soak-output.json> [--start-window-min=N] [--end-window-min=N]",
  );
  process.exit(1);
}

if (!fs.existsSync(inputFile)) {
  console.error(`Error: File not found: ${inputFile}`);
  process.exit(1);
}

// ─── Data Collection ──────────────────────────────────────────────────────────

const durations = []; // { time: Date, value: number }
const failures = []; // { time: Date, value: number }  (1 = failed, 0 = ok)
const vuSamples = []; // { time: Date, value: number }

let lineCount = 0;
let skipCount = 0;

const rl = readline.createInterface({
  input: fs.createReadStream(inputFile),
  crlfDelay: Infinity,
});

rl.on("line", (line) => {
  lineCount++;
  if (!line.trim()) return;
  let event;
  try {
    event = JSON.parse(line);
  } catch {
    skipCount++;
    return;
  }

  if (event.type !== "Point") return;

  const time = new Date(event.data.time);
  const value = event.data.value;

  switch (event.metric) {
    case "http_req_duration":
      durations.push({ time, value });
      break;
    case "http_req_failed":
      failures.push({ time, value });
      break;
    case "vus":
      vuSamples.push({ time, value });
      break;
  }
});

rl.on("close", () => {
  if (durations.length === 0) {
    console.error(
      "No http_req_duration events found. Verify --out json was used and the file is not empty.",
    );
    process.exit(1);
  }

  // ─── Determine Plateau Boundaries ──────────────────────────────────────────

  let plateauStart = null;
  let plateauEnd = null;

  if (vuSamples.length > 1) {
    // Find where VU count stabilises (ramp-up ends)
    let maxVu = 0;
    let maxVuTime = null;
    for (const s of vuSamples) {
      if (s.value > maxVu) {
        maxVu = s.value;
        maxVuTime = s.time;
      }
    }

    // Plateau start = first time VU count is at max
    plateauStart = vuSamples.find((s) => s.value === maxVu)?.time || null;

    // Plateau end = last time VU count is at max (before ramp-down)
    const atMax = vuSamples.filter((s) => s.value === maxVu);
    plateauEnd = atMax[atMax.length - 1]?.time || null;
  }

  // Fallback: use first and last duration event times
  if (!plateauStart) plateauStart = durations[0].time;
  if (!plateauEnd) plateauEnd = durations[durations.length - 1].time;

  const plateauDurationMs = plateauEnd - plateauStart;
  const plateauDurationS = plateauDurationMs / 1000;

  // ─── Window Definitions ────────────────────────────────────────────────────

  const warmupEndMs = plateauStart.getTime() + 2 * 60 * 1000;
  const startWindowEnd = new Date(
    plateauStart.getTime() + (2 + startWindowMin) * 60 * 1000,
  );
  const endWindowStart = new Date(
    plateauEnd.getTime() - endWindowMin * 60 * 1000,
  );

  const inStartWindow = (d) =>
    d.time >= new Date(warmupEndMs) && d.time <= startWindowEnd;
  const inEndWindow = (d) => d.time >= endWindowStart && d.time <= plateauEnd;
  const inPlateau = (d) => d.time >= plateauStart && d.time <= plateauEnd;

  // ─── Metric Calculations ───────────────────────────────────────────────────

  function percentile(values, p) {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return Math.round(sorted[Math.max(0, idx)] * 100) / 100;
  }

  const startDurations = durations.filter(inStartWindow).map((d) => d.value);
  const endDurations = durations.filter(inEndWindow).map((d) => d.value);
  const plateauCount = durations.filter(inPlateau).length;

  const p95Start = percentile(startDurations, 95);
  const p95End = percentile(endDurations, 95);
  const drift =
    p95Start !== null && p95End !== null
      ? Math.round((p95End - p95Start) * 100) / 100
      : null;

  const endFail = failures.filter(inEndWindow);
  const endFailCount = endFail.filter((f) => f.value === 1).length;
  const endErrorRate =
    endFail.length > 0
      ? Math.round((endFailCount / endFail.length) * 10000) / 100
      : 0;

  const maxStableRps =
    plateauDurationS > 0
      ? Math.round((plateauCount / plateauDurationS) * 100) / 100
      : null;

  // ─── Output ────────────────────────────────────────────────────────────────

  const result = {
    source_file: path.resolve(inputFile),
    lines_parsed: lineCount,
    lines_skipped: skipCount,
    plateau: {
      start: plateauStart.toISOString(),
      end: plateauEnd.toISOString(),
      duration_seconds: Math.round(plateauDurationS),
    },
    windows: {
      start_window: {
        from: new Date(warmupEndMs).toISOString(),
        to: startWindowEnd.toISOString(),
        request_count: startDurations.length,
      },
      end_window: {
        from: endWindowStart.toISOString(),
        to: plateauEnd.toISOString(),
        request_count: endDurations.length,
      },
    },
    metrics: {
      max_stable_rps: maxStableRps,
      p95_at_start_ms: p95Start,
      p95_at_end_ms: p95End,
      p95_drift_ms: drift,
      error_rate_at_end_pct: endErrorRate,
      plateau_request_count: plateauCount,
    },
    human_required: {
      memory_ceiling_mb: null,
      degradation_point: null,
      note: "Fill these fields from Grafana Memory Usage panel and p95 trend panel.",
    },
  };

  console.log(JSON.stringify(result, null, 2));

  if (skipCount > 0) {
    process.stderr.write(
      `Warning: ${skipCount} unparseable lines were skipped.\n`,
    );
  }
});
