# CSV Schema — read-heavy

> **Date:** 2026-08-14  
> **Endpoint:** `GET /api/orders/:id`  
> **Test Type:** load

## 1. Schema Definition

To support the Per-VU Cached Token auth strategy for the 20 VU Load Test, the CSV data must contain valid credentials and a matching order ID for each row.

| Column Name | Data Type | Required | Notes                                                                                  |
| ----------- | --------- | -------- | -------------------------------------------------------------------------------------- |
| `email`     | string    | Yes      | Must be a registered user in the database. Format: `user_N@eshop.com`.                 |
| `password`  | string    | Yes      | Must match the user's password. We will use a standard password for all test accounts. |
| `order_id`  | integer   | Yes      | Must be the ID of an order that is owned by the user defined in the `email` column.    |

## 2. Row Count Requirement

**Target rows:** 50 rows

**Calculation:**

- Target Load Test VUs: 20
- Formula: `rows ≥ peak_vus * 2` (to provide safe headroom and allow multiple test iterations without overlapping state issues).
- Therefore, we will generate 50 rows. This means creating 50 distinct test users, and placing 1 order for each user.

## 3. Seed Strategy

Since the required data involves relational integrity (an order belonging to a specific user), manually crafting this CSV is impossible. We will write two Node.js scripts:

1. `seed-data.js`: Connects to the local API to register 50 users, log them in, and create 1 order with 3 line-items for each user. The results are saved to `seed-state.json`.
2. `generate-data.js`: Reads `seed-state.json` and outputs `read-heavy.csv` in the exact schema defined above.

## 4. Example Data

```csv
email,password,order_id
user_1718000001@eshop.com,Test1234!,101
user_1718000002@eshop.com,Test1234!,102
user_1718000003@eshop.com,Test1234!,103
```
