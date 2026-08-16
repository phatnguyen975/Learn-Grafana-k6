#!/usr/bin/env node
// scripts/ci/check-regression.js
//
// Continuous Performance Gate — Regression Checker
// Usage: node scripts/ci/check-regression.js --threshold 0.20 --output regression-report.md
//
// Reads summary.json for each endpoint group, compares the measured p95 against the
// stored baseline in perf-config.json. Generates a Markdown regression report and
// exits with code 1 if any endpoint regresses beyond the threshold.

const fs   = require('fs');
const path = require('path');

// ── CLI args ────────────────────────────────────────────────────────────────
const args = process.argv;
const THRESHOLD = parseFloat(args[args.indexOf('--threshold') + 1] || 0.20);
const OUTPUT    = args[args.indexOf('--output') + 1] || 'regression-report.md';

// ── Baseline definitions ────────────────────────────────────────────────────
// These values come from perf-config.json files produced by the student's manual runs.
// Source: docs/results/{group}/perf-config.json → baseline.p95_ms
// and docs/results/endurance/endurance-report.md (soak observations)
const ENDPOINT_MAP = {
  'read-heavy': {
    endpoint:     'GET /api/orders/:id',
    baseline_p95: 8.60,   // source: summary.json metrics.http_req_duration.values["p(95)"]
  },
  'auth-heavy': {
    endpoint:     'POST /api/register',
    baseline_p95: 31.75,  // source: auth-heavy perf-config.json → baseline.p95_ms
  },
  'transactional': {
    endpoint:     'POST /api/cart',
    baseline_p95: 6.57,   // source: transactional perf-config.json → baseline.p95_ms
  },
  'endurance': {
    endpoint:     'Mixed reads (GET /api/products + GET /api/orders/my-orders)',
    baseline_p95: 11.03,  // source: endurance summary.json → p(95)
  },
};

// ── Compare each group ──────────────────────────────────────────────────────
const regressions = [];
const passes      = [];

for (const [group, meta] of Object.entries(ENDPOINT_MAP)) {
  const summaryPath = path.join('docs', 'results', group, 'run', 'raw', 'summary.json');

  if (!fs.existsSync(summaryPath)) {
    console.log(`[SKIP] No summary.json found for group: ${group} (${summaryPath})`);
    continue;
  }

  let summary;
  try {
    summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  } catch (e) {
    console.error(`[ERROR] Failed to parse ${summaryPath}: ${e.message}`);
    continue;
  }

  const currentP95 = summary?.metrics?.http_req_duration?.values?.['p(95)'];
  if (currentP95 == null) {
    console.log(`[SKIP] p(95) not found in ${summaryPath} — was summaryTrendStats configured?`);
    continue;
  }

  const trigger  = meta.baseline_p95 * (1 + THRESHOLD);
  const driftAbs = (currentP95 - meta.baseline_p95).toFixed(2);
  const driftPct = ((currentP95 - meta.baseline_p95) / meta.baseline_p95 * 100).toFixed(1);

  const entry = {
    group,
    endpoint:  meta.endpoint,
    baseline:  meta.baseline_p95,
    current:   currentP95,
    trigger,
    driftAbs,
    drift:     driftPct,
  };

  if (currentP95 > trigger) {
    regressions.push(entry);
    console.log(`[FAIL] ${group}: p95=${currentP95.toFixed(2)}ms exceeds trigger=${trigger.toFixed(2)}ms (+${driftPct}%)`);
  } else {
    passes.push(entry);
    console.log(`[PASS] ${group}: p95=${currentP95.toFixed(2)}ms within trigger=${trigger.toFixed(2)}ms (${driftPct}%)`);
  }
}

// ── Generate Markdown report ────────────────────────────────────────────────
const ts = new Date().toISOString();
let md = `## Performance Gate Report\n\n`;
md += `> **Generated:** ${ts}\n`;
md += `> **Regression threshold:** +${(THRESHOLD * 100).toFixed(0)}% p95 vs stored baseline\n`;
md += `> **Rule:** \`p95_new > p95_baseline × ${(1 + THRESHOLD).toFixed(2)}\`\n\n`;

if (passes.length > 0) {
  md += `### Endpoints within threshold\n\n`;
  md += `| Endpoint | Baseline p95 | Current p95 | Abs Drift | Rel Drift | Status |\n`;
  md += `|----------|-------------|-------------|-----------|-----------|--------|\n`;
  for (const p of passes) {
    md += `| \`${p.endpoint}\` | ${p.baseline} ms | ${p.current.toFixed(2)} ms | ${p.driftAbs} ms | ${p.drift}% | PASS |\n`;
  }
  md += '\n';
}

if (regressions.length > 0) {
  md += `### REGRESSION DETECTED\n\n`;
  md += `| Endpoint | Baseline p95 | Current p95 | Trigger at | Abs Drift | Rel Drift | Status |\n`;
  md += `|----------|-------------|-------------|-----------|-----------|-----------|--------|\n`;
  for (const r of regressions) {
    md += `| \`${r.endpoint}\` | ${r.baseline} ms | ${r.current.toFixed(2)} ms | ${r.trigger.toFixed(2)} ms | **${r.driftAbs} ms** | **${r.drift}%** | FAIL |\n`;
  }
  md += `\n`;
  md += `> **Action required:** Review the commit diff against the failing endpoint's code path.\n`;
  md += `> **To override:** Post \`/perf-override <justification>\` and request a reviewer sign-off.\n`;
  md += `> **To update baseline:** Open a PR editing \`docs/results/{group}/perf-config.json\` — requires second reviewer approval.\n`;
} else {
  md += `### All performance gates passed\n\n`;
  md += `Merge is unblocked. No p95 regressions detected beyond the ${(THRESHOLD * 100).toFixed(0)}% threshold.\n`;
}

md += `\n---\n*Generated by \`scripts/ci/check-regression.js\`*\n`;

fs.writeFileSync(OUTPUT, md);
console.log(`\nReport written to: ${OUTPUT}`);

// ── Exit code ───────────────────────────────────────────────────────────────
process.exit(regressions.length > 0 ? 1 : 0);
