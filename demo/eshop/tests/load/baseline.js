import http from "k6/http";
import { check } from "k6";
import { textSummary } from "https://jslib.k6.io/k6-summary/0.0.2/index.js";
import { BASE_URL, DEFAULT_HEADERS } from "../config/env.js";

export const options = {
  vus: 1,
  duration: "2m",
};

// Setup phase: Authenticate, then seed an order via /api/checkout
export function setup() {
  const loginUrl = `${BASE_URL}/api/login`;
  const loginPayload = JSON.stringify({
    email: __ENV.LOGIN_EMAIL || "test@eshop.com",
    password: __ENV.LOGIN_PASSWORD || "Test1234!",
  });

  // 1. Đăng nhập để lấy token
  const loginRes = http.post(loginUrl, loginPayload, {
    headers: DEFAULT_HEADERS,
  });
  const token = loginRes.json("token");
  if (!token) {
    throw new Error(
      `setup(): login failed with status ${loginRes.status}: ${loginRes.body}`,
    );
  }

  // 2. Gọi Checkout API để seed 1 đơn hàng
  const checkoutUrl = `${BASE_URL}/api/checkout`;
  const checkoutPayload = JSON.stringify({
    total_amount: 500000,
    shipping_address: "123 Test Street",
  });
  const checkoutParams = {
    headers: {
      ...DEFAULT_HEADERS,
      Authorization: `Bearer ${token}`,
    },
  };

  const checkoutRes = http.post(checkoutUrl, checkoutPayload, checkoutParams);
  const orderId = checkoutRes.json("orderId");
  if (!orderId) {
    throw new Error(
      `setup(): checkout (seeding) failed with status ${checkoutRes.status}: ${checkoutRes.body}`,
    );
  }

  console.log(`[setup] Seeded order ID: ${orderId}`);
  return { token, orderId };
}

// Default VU function: Main test loop executing GET /api/orders/:id
export default function (data) {
  const url = `${BASE_URL}/api/orders/${data.orderId}`;
  const params = {
    headers: {
      Authorization: `Bearer ${data.token}`,
      ...DEFAULT_HEADERS,
    },
    tags: { endpoint: "/api/orders/:id", test_type: "baseline" },
  };

  const res = http.get(url, params);

  // In ra lần lặp đầu tiên để kiểm tra (tránh log quá nhiều trong 2 phút)
  if (__ITER === 0) {
    console.log(
      `[VU] GET /api/orders/${data.orderId} response:`,
      JSON.stringify(res.json()),
    );
  }

  check(res, {
    "status is 200": (r) => r.status === 200,
    "response has expected field 'id'": (r) => r.json("id") !== undefined,
  });
}

// Teardown phase: Cancel the seeded order
export function teardown(data) {
  if (!data || !data.orderId) return;

  const cancelUrl = `${BASE_URL}/api/orders/${data.orderId}/cancel`;
  const cancelParams = {
    headers: {
      ...DEFAULT_HEADERS,
      Authorization: `Bearer ${data.token}`,
    },
  };

  const res = http.put(cancelUrl, null, cancelParams);
  if (res.status === 200) {
    console.log(`[teardown] Successfully canceled order ID: ${data.orderId}`);
  } else {
    console.log(
      `[teardown] Failed to cancel order. Status: ${res.status}. Body: ${res.body}`,
    );
  }
}

export function handleSummary(data) {
  return {
    "docs/results/read-heavy/spec/baseline-summary.json": JSON.stringify(data, null, 2),
    stdout: textSummary(data, { indent: " ", enableColors: true }),
  };
}
