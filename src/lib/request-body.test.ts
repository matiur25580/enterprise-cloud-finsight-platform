import test from "node:test";
import assert from "node:assert/strict";
import { readLimitedJson } from "./request-body";

test("parses valid JSON within the byte limit", async () => {
  const request = new Request("https://example.test/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "user@example.com" })
  });
  const result = await readLimitedJson(request);
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.value, { email: "user@example.com" });
});

test("rejects oversized content-length before parsing", async () => {
  const request = new Request("https://example.test/register", {
    method: "POST",
    headers: { "content-length": "9000" },
    body: "{}"
  });
  const result = await readLimitedJson(request, 8192);
  assert.deepEqual(result, { ok: false, reason: "too_large" });
});

test("rejects oversized chunked bodies without content-length", async () => {
  const request = new Request("https://example.test/register", {
    method: "POST",
    body: "x".repeat(9000)
  });
  const result = await readLimitedJson(request, 8192);
  assert.deepEqual(result, { ok: false, reason: "too_large" });
});

test("rejects malformed JSON", async () => {
  const request = new Request("https://example.test/register", {
    method: "POST",
    body: "{not-json"
  });
  const result = await readLimitedJson(request);
  assert.deepEqual(result, { ok: false, reason: "invalid_json" });
});

test("rejects invalid UTF-8 instead of silently replacing bytes", async () => {
  const request = new Request("https://example.test/register", {
    method: "POST",
    body: new Uint8Array([0x7b, 0xff, 0x7d])
  });
  const result = await readLimitedJson(request);
  assert.deepEqual(result, { ok: false, reason: "invalid_json" });
});
