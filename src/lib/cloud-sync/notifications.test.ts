import test from "node:test";
import assert from "node:assert/strict";
import { deliverSyncAlert } from "./notifications";

const alert = {
  status: "FAILED" as const,
  provider: "AWS",
  accountName: "Production",
  errorCode: "SYNC_EXECUTION_FAILED",
  attemptCount: 3,
  importedRows: 0,
  rejectedRows: 2,
  duplicateRows: 0
};

test("delivers Slack and Resend alerts without exposing raw error messages", async () => {
  const requests: Array<{ url: string; body: string }> = [];
  const fetcher: typeof fetch = async (input, init) => {
    requests.push({ url: String(input), body: String(init?.body ?? "") });
    return new Response("{}", { status: 200 });
  };
  const result = await deliverSyncAlert(alert, fetcher, {
    SLACK_SYNC_ALERT_WEBHOOK_URL: "https://hooks.slack.com/services/T000/B000/secret",
    RESEND_API_KEY: "test-key",
    SYNC_ALERT_EMAIL_FROM: "alerts@example.com",
    SYNC_ALERT_EMAIL_TO: "ops@example.com, finops@example.com"
  });
  assert.deepEqual(result, { attempted: 2, delivered: 2 });
  assert.equal(requests.length, 2);
  assert.ok(requests.every((request) => request.body.includes("SYNC_EXECUTION_FAILED")));
  assert.ok(requests.every((request) => !request.body.includes("secret provider response")));
  assert.ok(requests.some((request) => request.url === "https://api.resend.com/emails"));
});

test("ignores unsafe Slack webhook hosts and malformed email recipients", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls += 1;
    return new Response("{}", { status: 200 });
  };
  const result = await deliverSyncAlert(alert, fetcher, {
    SLACK_SYNC_ALERT_WEBHOOK_URL: "https://attacker.example/webhook",
    RESEND_API_KEY: "test-key",
    SYNC_ALERT_EMAIL_FROM: "alerts@example.com",
    SYNC_ALERT_EMAIL_TO: "not-an-email"
  });
  assert.deepEqual(result, { attempted: 0, delivered: 0 });
  assert.equal(calls, 0);
});

test("notification provider failures are reported but do not throw", async () => {
  const fetcher: typeof fetch = async () => new Response("nope", { status: 503 });
  const result = await deliverSyncAlert(alert, fetcher, {
    SLACK_SYNC_ALERT_WEBHOOK_URL: "https://hooks.slack.com/services/T000/B000/secret"
  });
  assert.deepEqual(result, { attempted: 1, delivered: 0 });
});
