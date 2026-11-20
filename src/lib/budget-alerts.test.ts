import test from "node:test";
import assert from "node:assert/strict";
import { deliverBudgetThresholdAlert } from "./cloud-sync/notifications";

const alert = {
  budgetName: "Production",
  currency: "USD",
  budgetAmount: 1000,
  spent: 825,
  utilizationPercent: 82.5,
  thresholdPercent: 80,
  startsAt: "2026-11-01",
  endsAt: "2026-11-30"
};

test("budget alert is delivered to configured Slack and Resend channels", async () => {
  const requests: Array<{ url: string; body: string }> = [];
  const fetcher: typeof fetch = async (input, init) => {
    requests.push({ url: String(input), body: String(init?.body ?? "") });
    return new Response("{}", { status: 200 });
  };
  const result = await deliverBudgetThresholdAlert(alert, fetcher, {
    SLACK_SYNC_ALERT_WEBHOOK_URL: "https://hooks.slack.com/services/T000/B000/test",
    RESEND_API_KEY: "test-key",
    SYNC_ALERT_EMAIL_FROM: "alerts@example.com",
    SYNC_ALERT_EMAIL_TO: "ops@example.com"
  });
  assert.deepEqual(result, { attempted: 2, delivered: 2, channelResults: { SLACK: "DELIVERED", EMAIL: "DELIVERED" } });
  assert.equal(requests.length, 2);
  assert.ok(requests.every((request) => request.body.includes("82.5%")));
  assert.ok(requests.every((request) => request.body.includes("Production")));
});

test("budget alert skips untrusted webhook and invalid email recipients", async () => {
  let calls = 0;
  const result = await deliverBudgetThresholdAlert(alert, async () => {
    calls += 1;
    return new Response("{}", { status: 200 });
  }, {
    SLACK_SYNC_ALERT_WEBHOOK_URL: "https://attacker.example/hook",
    RESEND_API_KEY: "test-key",
    SYNC_ALERT_EMAIL_FROM: "alerts@example.com",
    SYNC_ALERT_EMAIL_TO: "bad-address"
  });
  assert.deepEqual(result, { attempted: 0, delivered: 0, channelResults: {} });
  assert.equal(calls, 0);
});

test("budget alert reports provider failures without throwing", async () => {
  const result = await deliverBudgetThresholdAlert(alert, async () => new Response("nope", { status: 503 }), {
    SLACK_SYNC_ALERT_WEBHOOK_URL: "https://hooks.slack.com/services/T000/B000/test"
  });
  assert.deepEqual(result, { attempted: 1, delivered: 0, channelResults: { SLACK: "FAILED" } });
});


test("budget alert retry skips channels that already accepted the original alert", async () => {
  const requested: string[] = [];
  const result = await deliverBudgetThresholdAlert(alert, async (input) => {
    requested.push(String(input));
    return new Response("{}", { status: 200 });
  }, {
    SLACK_SYNC_ALERT_WEBHOOK_URL: "https://hooks.slack.com/services/T000/B000/test",
    RESEND_API_KEY: "test-key",
    SYNC_ALERT_EMAIL_FROM: "alerts@example.com",
    SYNC_ALERT_EMAIL_TO: "ops@example.com"
  }, ["SLACK"]);
  assert.deepEqual(result, { attempted: 1, delivered: 1, channelResults: { SLACK: "SKIPPED", EMAIL: "DELIVERED" } });
  assert.deepEqual(requested, ["https://api.resend.com/emails"]);
});
