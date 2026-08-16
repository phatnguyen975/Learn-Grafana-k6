# SLO Benchmarks Reference

> Use this file during scenario design (Step 2) to anchor preliminary SLO targets in real-world industry data before the baseline run is available. All ranges below are sourced from publicly available performance engineering references (Google SRE Book, Apdex standard, k6 documentation, AWS well-architected).

## How to Use This File

1. Classify your endpoint using the **Operation Class** table.
2. Identify your **Hardware Tier** from the environment spec.
3. Look up the corresponding **p95 reference range**.
4. State the range and your reasoning in `scenario-design.md` as the preliminary SLO.
5. After the baseline run, replace the preliminary SLO with a formula-derived value (see `references/slo-derivation.md`).

The preliminary SLO is a placeholder to enable discussion at Human Gate 1. It is not a final threshold.

## Operation Class Taxonomy

| Class              | Characteristics                                         | Typical Examples                               |
| ------------------ | ------------------------------------------------------- | ---------------------------------------------- |
| **Read-Simple**    | Single-table SELECT, no joins, result cached or indexed | `GET /users/:id`, `GET /products/:id`          |
| **Read-Complex**   | Multi-table JOIN, aggregation, or unindexed filter      | `GET /orders/:id` (with items), `GET /reports` |
| **Write-Simple**   | Single INSERT or UPDATE, no cascades                    | `POST /cart`, `PUT /profile`                   |
| **Write-Complex**  | Multi-step transaction, cascaded writes                 | `POST /checkout`, `POST /orders`               |
| **Auth-Intensive** | Password hashing (bcrypt/argon2), token signing         | `POST /register`, `POST /login`                |
| **Mixed**          | Combines read + write in one request                    | `POST /checkout` (read stock → write order)    |
| **Public/Static**  | No DB call, returns static or cached content            | `GET /health`, `GET /config`                   |

## Hardware Tier Classification

Classify the SUT environment using the **weaker** of the two dimensions (host or container limit).

| Tier       | Host CPU  | Host RAM | Container CPU | Container RAM |
| ---------- | --------- | -------- | ------------- | ------------- |
| **Micro**  | ≤ 2 cores | ≤ 4 GB   | ≤ 0.5 CPU     | ≤ 512 MB      |
| **Small**  | 4 cores   | 8 GB     | ≤ 1 CPU       | ≤ 1 GB        |
| **Medium** | 8 cores   | 16 GB    | ≤ 2 CPU       | ≤ 2 GB        |
| **Large**  | 16+ cores | 32+ GB   | > 2 CPU       | > 2 GB        |

## p95 Latency Reference Ranges

These ranges assume a **Node.js + relational DB** backend under **low-to-moderate load** (< 50 concurrent users). They are reasonable starting points; actual baselines will differ.

| Operation Class | Micro      | Small      | Medium     | Large     |
| --------------- | ---------- | ---------- | ---------- | --------- |
| Public/Static   | 5–20 ms    | 5–15 ms    | 5–10 ms    | < 10 ms   |
| Read-Simple     | 20–80 ms   | 15–60 ms   | 10–40 ms   | 10–30 ms  |
| Read-Complex    | 80–300 ms  | 60–200 ms  | 40–150 ms  | 30–100 ms |
| Write-Simple    | 50–150 ms  | 40–120 ms  | 30–80 ms   | 20–60 ms  |
| Write-Complex   | 150–500 ms | 100–350 ms | 80–250 ms  | 60–180 ms |
| Auth-Intensive  | 100–400 ms | 80–300 ms  | 60–200 ms  | 50–150 ms |
| Mixed           | 200–600 ms | 150–450 ms | 100–300 ms | 80–200 ms |

> **SQLite note:** SQLite serialises writes and does not support concurrent write transactions. For write-heavy or mixed endpoints backed by SQLite, use the upper half of the applicable range as the preliminary estimate, regardless of hardware tier. SQLite is appropriate for development/test SUTs only.

## Error Rate References

| Test Type | Acceptable Error Rate (p95 threshold not yet breached) | Threshold to abort |
| --------- | ------------------------------------------------------ | ------------------ |
| Load      | < 1%                                                   | > 5%               |
| Stress    | < 5% (system is being pushed)                          | > 10%              |
| Spike     | < 5% during spike phase                                | > 20%              |
| Soak      | < 1%                                                   | > 3%               |

**Sources:** Google SRE Book ch. 4 (error budget), k6 Cloud docs on test types.

## Apdex Thresholds (supplementary)

The **Apdex** (Application Performance Index) standard defines:

- **Satisfied** response: ≤ T ms
- **Tolerating** response: > T ms and ≤ 4T ms
- **Frustrated** response: > 4T ms

For a typical T = 200 ms (API endpoint, interactive):

- Satisfied: ≤ 200 ms
- Tolerating: 200–800 ms
- Frustrated: > 800 ms

If you are unsure of a preliminary target, starting with T = 200 ms for interactive REST APIs is a widely accepted default. Adjust down for public/static, up for auth-intensive or write-complex endpoints.

## Sources

- Google SRE Book — Chapter 4: Service Level Objectives. https://sre.google/sre-book/service-level-objectives/
- Apdex Alliance — Apdex Technical Specification v1.1. https://www.apdex.org/
- k6 documentation — Test types. https://grafana.com/docs/k6/latest/testing-guides/test-types/
- AWS Well-Architected Framework — Performance Efficiency Pillar. https://docs.aws.amazon.com/wellarchitected/latest/performance-efficiency-pillar/welcome.html
- Martin Fowler — Patterns of Enterprise Application Architecture (latency classification).
