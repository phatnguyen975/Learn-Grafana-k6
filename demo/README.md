<div align="center">
  <h1>Homework 05 — Performance Testing on EShop</h1>
  <small>
    <strong>Student:</strong> Nguyễn Tấn Phát — 23127449
  </small> <br />
  <sub>August 16, 2026</sub>
</div>

## Project Directory Structure Overview

To assist grading, the workspace is organized as follows:

```text
23127449_HW05_AI_Performance_100/
├── README.md                      # Test Summary and Self-Assessment Table (this file)
├── git-commit-log.txt             # Git commit history log
├── reports/
│   ├── main-report.md             # Comprehensive Executive Summary of all tasks
│   └── ai-critique.md             # Task 4: Detailed AI performance critique
└── eshop/                         # Main repository for the System Under Test (SUT)
    ├── .github/workflows/         # Task 3: CI/CD Pipeline (perf-gate.yml)
    ├── backend/                   # Node.js + Express backend (SUT)
    ├── frontend/                  # React frontend
    ├── scripts/ci/                # Task 3: CPT regression checker script
    ├── docs/results/              # AI-generated artifacts & test evidence
    │   ├── read-heavy/            # Artifacts for Load Test
    │   ├── auth-heavy/            # Artifacts for Stress Test
    │   ├── transactional/         # Artifacts for Spike Test
    │   ├── endurance/             # Artifacts for Soak Test
    │   └── cpt-proposal/          # Task 3: Continuous Perf Testing flowcharts
    └── tests/                     # Task 1: Executable k6 scripts & CSV data
        ├── load/
        │   ├── 23127449_LoadTest_20260814.js  # Main Load script
        │   └── read-heavy.csv                 # 10,000 generated product IDs
        ├── stress/
        │   ├── 23127449_StressTest_20260815.js # Main Stress script
        │   └── auth-heavy.csv                 # 50,000 unique emails
        ├── spike/
        │   ├── 23127449_SpikeTest_20260815.js  # Main Spike script
        │   └── transactional.csv              # Credential list
        └── soak/
            ├── 23127449_SoakTest_20260815.js   # Main Soak script
            ├── soak.csv                       # Endurance payload data
            └── generate-data.js               # Isolated seed script
```

## Test Summary Report

| Category                      | Details                                                                                                                                                                                                                                                                                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Scenarios Run**             | Load, Stress, Spike, Soak (Endurance)                                                                                                                                                                                                                                                                                                 |
| **Endpoint Groups Covered**   | • **Read-Heavy** (Load): `GET /api/orders/:id`<br>• **Auth-Heavy** (Stress): `POST /api/register`<br>• **Transactional** (Spike): `POST /api/cart`<br>• **Endurance** (Soak): Mixed reads (`GET /api/products` & `GET /api/orders/my-orders`)                                                                                         |
| **Endurance Threshold**       | Maximum stable load: **15 VUs** sustained.<br>Memory ceiling: **~85 MB**.<br>P95 Latency baseline: **11.03 ms**.                                                                                                                                                                                                                      |
| **Bugs / Performance Issues** | **0** bugs logged. Expected latency degradation during write serialization (SQLite lock contention at ~70+ VUs) was identified as an architectural limitation, not a bug.                                                                                                                                                             |
| **Demo Videos**               | • **Load Test**: [https://youtu.be/WPlqg2hF5Go](https://youtu.be/WPlqg2hF5Go)<br>• **Stress Test**: [https://youtu.be/OwlbP6ZHR20](https://youtu.be/OwlbP6ZHR20)<br>• **Spike Test**: [https://youtu.be/KRb2b3Bc1Go](https://youtu.be/KRb2b3Bc1Go)<br>• **Skills Demo**: [https://youtu.be/C4AdUFFvM2A](https://youtu.be/C4AdUFFvM2A) |

## Self-Assessment Table

| **No.** | **Criteria**                                                                      | **Grade** | **Self-Assessed Grade** |
| ------- | --------------------------------------------------------------------------------- | --------- | ----------------------- |
| **1**   | Task 1 — Load testing                                                             | 20        | 20                      |
| **2**   | Task 1 — Stress testing                                                           | 20        | 20                      |
| **3**   | Task 1 — Spike testing                                                            | 20        | 20                      |
| **4**   | Task 2 — AI analysis + misinterpretation hunt (with correct values from raw logs) | 10        | 10                      |
| **5**   | Task 3 — Continuous Performance Testing proposal (G9.6)                           | 10        | 10                      |
| **6**   | Agent Skills                                                                      | 10        | 10                      |
|         | **Total**                                                                         | **100**   | **100**                 |
