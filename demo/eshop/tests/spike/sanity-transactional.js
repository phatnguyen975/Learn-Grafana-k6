import http from "k6/http";
import { check } from "k6";
import { SharedArray } from "k6/data";

// Hardcoded config for sanity script
const BASE_URL = "http://localhost:3000";

export const options = {
  vus: 1,
  iterations: 1,
};

// Load CSV data using SharedArray
const csvData = new SharedArray("transactional data", function () {
  const lines = open("./transactional.csv").split("\n");
  const result = [];
  const headers = lines[0].split(",");
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() !== "") {
      const parts = lines[i].split(",");
      const obj = {};
      headers.forEach((header, index) => {
        obj[header.trim()] = parts[index].trim();
      });
      result.push(obj);
    }
  }
  return result;
});

export default function () {
  const user = csvData[0]; // Read row index 0

  // 1. Login (Auth Strategy: Per-VU Cached Token)
  let token = "";
  const loginPayload = JSON.stringify({
    email: user.email,
    password: user.password,
  });

  const loginRes = http.post(`${BASE_URL}/api/login`, loginPayload, {
    headers: { "Content-Type": "application/json" },
  });

  check(loginRes, {
    "login status is 200": (r) => r.status === 200,
    "login returns token": (r) => r.json("token") !== undefined,
  });

  token = loginRes.json("token");
  if (!token) {
    throw new Error("Failed to obtain auth token during login");
  }

  // 2. Call target endpoint POST /api/cart
  const payload = JSON.stringify({
    id: parseInt(user.product_id, 10),
    name: user.product_name,
    price: parseInt(user.price, 10),
    quantity: parseInt(user.quantity, 10),
  });

  const res = http.post(`${BASE_URL}/api/cart`, payload, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });

  // Log response for inspection
  console.log(`Response Status: ${res.status}`);
  console.log(`Response Body: ${JSON.stringify(res.json())}`);

  // Checks
  check(res, {
    "cart status is 200 or 201": (r) => r.status === 200 || r.status === 201,
    "cart response has message": (r) => r.json("message") !== undefined,
    "response time < 2000ms": (r) => r.timings.duration < 2000,
  });
}

export function handleSummary(data) {
  return {
    "docs/results/transactional/build/sanity-result.json": JSON.stringify(
      data,
      null,
      2,
    ),
  };
}
